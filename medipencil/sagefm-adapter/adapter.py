#!/usr/bin/env python3
"""MediPencil ↔ SageFM 어댑터 (독립 설치 API 연동 설명서 2026-10-14 규격).

MediPencil 독립 설치 웹앱의 음성·차트 처리 요청(multipart, access-token 헤더)을 받아
SageFM LLM(SSE)으로 결과를 생성해 모드별 JSON으로 반환한다.
녹음(fileInfo, WAV)은 faster-whisper(CPU)로 전사한다.

처리 모드(visitType)와 반환 필드 — 설명서 6장:
  standard  일반 차트(한국어)   → data.soapText
  eng       영문 차트           → data.soapText + data.soapTextEng (동일 값 중복 반환)
  fi        핀란드어 차트       → data.soapText
  sheet     문서                → data.sheet
  counselor 음성 전사           → data.transcript (LLM 미사용)
  dictate   받아쓰기            → data.transcript (LLM 미사용)

오류 — 설명서 8·11장: 토큰 불일치 401, 잘못된 입력 400(웹앱이 재시도 안 함),
업스트림 실패 502(5xx → 웹앱이 최대 3회 재시도). 오류 본문에 토큰·원문을 넣지 않는다.
예외: counselor/dictate 의 무음 오디오는 400이 아니라 빈 transcript 로 200을 준다
(웹앱이 녹음 정지 직후 무음 조각을 보내는데, 400이면 작업 전체가 실패 처리됨).

실행:  python3 adapter.py   (adapter.env 에서 설정을 읽음; 외부 비노출 바인딩)
"""
import json
import logging
import os
import tempfile
import threading
import urllib.request
import uuid

from flask import Flask, jsonify, request

BASE = os.path.dirname(os.path.abspath(__file__))

# ── 설정 (adapter.env: KEY=VALUE) ──────────────────────────────
CFG = {
    'BIND_HOST': '172.18.0.1',
    'BIND_PORT': '8093',
    'ACCESS_TOKEN': '',               # 필수 — MediPencil 관리자 화면과 동일한 값
    'SAGEFM_URL': 'http://165.132.220.115:5096/api/chat',
    'SAGEFM_TIMEOUT': '240',          # 웹앱 소켓 읽기 대기 300초보다 짧게
    'WHISPER_MODEL': 'small',         # small | medium (정확도↑ 속도↓)
}
env_path = os.path.join(BASE, 'adapter.env')
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                CFG[k.strip()] = v.strip()

logging.basicConfig(
    filename=os.path.join(BASE, 'adapter.log'), level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('adapter')

app = Flask(__name__)

# ── Whisper (지연 로드, 동시 1건) ──────────────────────────────
_whisper = None
_whisper_lock = threading.Lock()

def transcribe(wav_path):
    global _whisper
    from faster_whisper import WhisperModel
    with _whisper_lock:
        if _whisper is None:
            log.info('whisper 모델 로드: %s', CFG['WHISPER_MODEL'])
            _whisper = WhisperModel(CFG['WHISPER_MODEL'], device='cpu',
                                    compute_type='int8', cpu_threads=16)
        # VAD 기본 threshold(0.5)는 조용한 마이크에서 실제 발화를 잘라냄
        # (2026-10-15 벤치마크에서 문장 통째 누락 확인) → 0.2로 완화
        segments, info = _whisper.transcribe(
            wav_path, language='ko', vad_filter=True,
            vad_parameters={'threshold': 0.2, 'min_silence_duration_ms': 500})
        text = ' '.join(s.text.strip() for s in segments).strip()
    log.info('전사 완료 (%.1fs 오디오, %d자)', info.duration, len(text))
    return text

# ── SageFM 호출 (SSE 수집) ────────────────────────────────────
def ask_sagefm(prompt):
    body = json.dumps({'session_id': 'medipencil-' + uuid.uuid4().hex[:12],
                       'message': prompt}).encode('utf-8')
    req = urllib.request.Request(CFG['SAGEFM_URL'], data=body,
                                 headers={'Content-Type': 'application/json'})
    out = []
    with urllib.request.urlopen(req, timeout=int(CFG['SAGEFM_TIMEOUT'])) as resp:
        for raw in resp:
            line = raw.decode('utf-8', 'replace').strip()
            if not line.startswith('data:'):
                continue
            payload = line[5:].strip()
            if not payload or payload == '[DONE]':
                continue
            try:
                d = json.loads(payload)
            except ValueError:
                continue
            if 'error' in d:
                raise RuntimeError('upstream error')
            out.append(d.get('delta') or d.get('content') or '')
    return ''.join(out).strip()

# ── 모드별 프롬프트 ───────────────────────────────────────────
LENGTH_MAP = {   # 설명서 4장: lengthInstruction "1" 최소 / "2" 중간 / "3" 최대(기본)
    '1': '분량은 핵심만 간결하게, 항목당 1~2줄 이내로 최소화하라.',
    '2': '분량은 중간 수준으로, 핵심과 필요한 세부만 담아라.',
    '3': '분량은 상세하게, 대화에 있는 임상 정보를 빠짐없이 담아라.',
}

# SOAP 프롬프트 v2 (2026-10-15): 운영 SOAP 프롬프트(app/prompts.py) 골격에
# 어댑터 고유 장치(환각 금지·분량/약어 파라미터·다국어)를 병합. A/B 비교로 채택.
# 진료보조정보(사적 메모) 섹션은 상대측 공식 차트 화면이라 제외.
SOAP_RULES = [
    "섹션 제목은 'S - Subjective', 'O - Objective', 'A - Assessment', 'P - Plan' 으로 쓴다.",
    "각 섹션 내용은 항목별로 줄을 바꾸어 '* ' 개조식으로 간결히 적는다. 설명적인 줄글 금지.",
    '대화에 나온 증상 설명(발병/경과·부위·정도·동반증상·악화/완화 인자·음성 ROS), '
    '관련 병력·복약·알레르기·사회력·가족력, 의사가 언급한 검사·처방·교육·추적 계획은 '
    '누락 없이 각각 별도 항목으로 적는다.',
    '대화에 없는 내용을 추측하거나 지어내지 마라. 완전성보다 이 규칙이 우선한다.',
    "대화의 확신 수준을 그대로 유지하라('가능성이 있다'를 '가능성 높음'으로 바꾸지 마라).",
    'S에는 환자가 말한 주관적 정보만, O에는 의사가 실제로 측정·관찰·진찰·검사한 '
    "객관적 소견만 적는다. 객관적 소견이 없으면 O는 '* 특이사항 없음.' 한 줄로 두고, "
    '환자 진술이나 향후 계획을 O에 넣지 마라.',
    'P의 마지막에는 대화 맥락에 맞는 경고 증상 복귀 지침을 한 항목 넣는다.',
    '진료과·내원 구분 등 배경 정보는 참고만 하고 출력에 다시 쓰지 마라.',
    '머리말·꼬리말·설명 없이 위 형식만 출력하라.',
    "첫 줄은 반드시 'S - Subjective' 로 시작해야 한다.",
]

def build_prompt(mode, text, form):
    length = LENGTH_MAP.get((form.get('lengthInstruction') or '3').strip(), LENGTH_MAP['3'])
    abbr = (form.get('useAbbreviation') or 'false').strip().lower() == 'true'
    dept = (form.get('userDept') or form.get('department') or '').strip()
    ctx = ('참고 배경 — 진료과: %s' % dept) if dept else ''

    if mode == 'sheet':
        abbr_rule = ('표준 의학 약어(HTN, DM, Hx 등)를 적절히 사용하라.' if abbr
                     else '약어 대신 정식 명칭을 사용하라.')
        rules = ['너는 의무기록 작성을 돕는 전문 의료기록사다.',
                 '아래 진료 대화(음성 인식 전사)를 서술형 진료기록 문서로 정리하라.',
                 '방문 사유, 증상 경과, 진찰·검사 소견, 진단, 치료 계획과 환자 안내 순으로 단락을 구성하라.',
                 '대화에 없는 내용을 지어내지 마라. 한국어로 작성하라.',
                 '머리말·꼬리말·설명 없이 문서 본문만 출력하라.', abbr_rule, length]
    else:
        lang_rule = {
            'standard': '섹션 제목 외 모든 내용은 한국어로 작성하라.',
            'eng': 'Write the entire note in English.',
            'fi': 'Kirjoita koko merkintä suomeksi. (섹션 제목 외 전체를 핀란드어로 작성하라.)',
        }[mode]
        if mode == 'standard':
            term_rule = ('의학 전문용어는 한글 표기 뒤 괄호로 표준 약어를 병기하라'
                         '(예: 당화혈색소(HbA1c), 고혈압(HTN)).' if abbr else
                         '의학 전문용어는 한글 표기 뒤 괄호로 영어 명칭을 병기하고'
                         '(예: 당뇨병성 말초신경병증(diabetic peripheral neuropathy)) '
                         '영어를 먼저 쓰지 마라.')
        else:
            term_rule = ('Use standard medical abbreviations (e.g., HTN, DM, Hx) '
                         'where appropriate.' if abbr else
                         'Avoid abbreviations; write medical terms in full.')
        rules = ['너는 의무기록 작성을 돕는 전문 의료기록사다.',
                 '아래 진료 대화(음성 인식 전사)를 병원용 SOAP 노트로 정리하라.',
                 lang_rule] + SOAP_RULES + [term_rule, length]
    head = '\n'.join(rules) + ('\n' + ctx if ctx else '')
    return head + '\n\n[진료 대화]\n' + text

# ── 응답 ──────────────────────────────────────────────────────
def ok(data):
    return jsonify({'status': {'code': '200', 'message': 'OK'},
                    'data': data, 'error': None})

def err(code, msg):
    # 설명서 11장: 오류 본문에 토큰·원문 미포함
    return jsonify({'status': {'code': str(code), 'message': msg},
                    'data': None, 'error': msg}), code

@app.get('/health')
def health():
    return jsonify({'status': 'UP', 'whisper_loaded': _whisper is not None})

@app.post('/process')
def process():
    if request.headers.get('access-token') != CFG['ACCESS_TOKEN']:
        log.warning('토큰 불일치 (from %s)', request.remote_addr)
        return err(401, 'invalid access token')
    form = request.form
    mode = (form.get('visitType') or 'standard').strip() or 'standard'
    if mode not in ('standard', 'eng', 'fi', 'sheet', 'counselor', 'dictate'):
        log.warning('미지원 visitType: %s', mode)
        return err(400, 'unsupported visitType')

    # 입력 선택 — 설명서 5장: sttText 우선, 없으면 fileInfo
    text = (form.get('sttText') or '').strip()
    source = 'text'
    try:
        if not text and 'fileInfo' in request.files:
            source = 'audio'
            f = request.files['fileInfo']
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                f.save(tmp.name)
                wav = tmp.name
            try:
                text = transcribe(wav)
            finally:
                os.unlink(wav)
        if not text:
            # 녹음 정지 직후 앱이 보내는 마지막 조각은 무음일 수 있다.
            # 전사 모드에서 무음 조각에 400을 주면 웹앱이 작업을 영구 실패로
            # 처리해 차트 단계로 넘어가지 못하므로, 빈 transcript 로 200을 준다.
            if source == 'audio' and mode in ('counselor', 'dictate'):
                log.info('무음 오디오 → 빈 transcript 반환 (user=%s)', form.get('userId'))
                return ok({'transcript': ''})
            return err(400, 'empty input (sttText/fileInfo)')

        log.info('작업 수신 user=%s mode=%s src=%s len=%d',
                 form.get('userId'), mode, source, len(text))

        if mode in ('counselor', 'dictate'):     # 전사 모드 — LLM 미사용
            return ok({'transcript': text})

        result = ask_sagefm(build_prompt(mode, text, form))
        if not result:
            return err(502, 'empty result from engine')
        log.info('생성 완료 mode=%s (%d자)', mode, len(result))
        if mode == 'sheet':
            return ok({'sheet': result})
        if mode == 'eng':                        # 설명서 6장: 두 필드 동시 반환
            return ok({'soapText': result, 'soapTextEng': result})
        return ok({'soapText': result})          # standard / fi
    except Exception:                            # noqa: BLE001
        log.exception('처리 실패 mode=%s src=%s', mode, source)
        return err(502, 'processing failed')     # 5xx → 웹앱이 재시도

if __name__ == '__main__':
    if not CFG['ACCESS_TOKEN']:
        raise SystemExit('adapter.env 에 ACCESS_TOKEN 을 설정하세요')
    log.info('기동: %s:%s → %s (whisper=%s)', CFG['BIND_HOST'], CFG['BIND_PORT'],
             CFG['SAGEFM_URL'], CFG['WHISPER_MODEL'])
    app.run(host=CFG['BIND_HOST'], port=int(CFG['BIND_PORT']), threaded=True)
