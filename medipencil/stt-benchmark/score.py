#!/usr/bin/env python3
"""results/*.json 전사를 정답 대본과 대조해 CER·의학용어 적중률 채점.

정답 대본: 녹음자가 test-dialogues.md 시나리오 1을 낭독한 내용.
VAD 미적용 large-v3-turbo·Qwen 교차 대조로 실제 발화 범위를 확정함
(대본 중 '4주 뒤에…' 마지막 문장은 녹음이 끊겨 제외).
정규화: 공백·문장부호 제거, %/mg 표기 통일, 한글 수사→숫자 통일.
"""
import json
import os
import re

BASE = os.path.dirname(os.path.abspath(__file__))

REF = (
    '안녕하세요. 지난달 혈액검사 결과 보러 오셨죠? 요즘 혈압은 집에서 재보셨어요? '
    '네, 아침마다 재는데 보통 150에 95 정도 나와요. 어떤 날은 160까지도 올라가고요. '
    '약은 빠뜨리지 않고 드셨나요? 암로디핀 5밀리그램이랑 메트포르민 복용 중이시죠? '
    '암로디핀은 가끔 깜빡해요. 일주일에 두세 번은 빼먹는 것 같아요. '
    '당화혈색소가 7.2퍼센트로 지난번 6.8보다 올랐어요. 공복혈당도 142가 나왔고요. '
    'LDL 콜레스테롤은 138입니다. 요즘 회식이 많아서 식단 관리를 잘 못했어요. '
    '그리고 밤에 발바닥이 저릿저릿한 느낌이 있어요. '
    '양쪽 다 그런가요? 언제부터요? 네, 양쪽 다요. 한두 달 됐어요. 특히 잘 때 심해요. '
    '당뇨병성 말초신경병증 가능성이 있어서 신경전도검사를 해보는 게 좋겠습니다. '
    '혈압약은 암로디핀에 텔미사르탄 40밀리그램을 추가하고 메트포르민은 유지하면서 '
    '식이조절 다시 해보죠. 네, 알겠습니다. 술은 끊어야겠죠? '
    '절주하시고 하루 30분 걷기 운동 권해드립니다.'
)

# 의학용어·수치 체크리스트 (정규화 후 부분 문자열 매칭)
TERMS = ['당화혈색소', '암로디핀', '메트포르민', '텔미사르탄', '당뇨병성',
         '말초신경병증', '신경전도검사', '142', '138', '공복혈당',
         '식단관리', '회식', '저릿저릿', '식이조절', '150에95']

NUM_MAP = [('백오십', '150'), ('구십오', '95'), ('백육십', '160'), ('백사십이', '142'),
           ('백삼십팔', '138'), ('칠점이', '7.2'), ('육점팔', '6.8'),
           ('오밀리그램', '5밀리그램'), ('사십밀리그램', '40밀리그램'),
           ('삼십분', '30분'), ('23번은', '두세번은')]


def norm(s):
    s = s.lower().replace('%', '퍼센트').replace('mg', '밀리그램')
    s = re.sub(r'[\s\.,\?!·:;\'"()\[\]-]', '', s)
    s = s.replace('퍼센트', '%')          # 7.2퍼센트/7.2% 통일 (소수점은 위에서 제거됨)
    s = s.replace('72%', '7.2%').replace('68보다', '6.8보다')
    for a, b in NUM_MAP:
        s = s.replace(a, b)
    return s


def cer(ref, hyp):
    # 문자 단위 Levenshtein
    prev = list(range(len(hyp) + 1))
    for i, rc in enumerate(ref, 1):
        cur = [i]
        for j, hc in enumerate(hyp, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rc != hc)))
        prev = cur
    return prev[-1] / len(ref)


if __name__ == '__main__':
    ref_n = norm(REF)
    rows = []
    for f in sorted(os.listdir(os.path.join(BASE, 'results'))):
        d = json.load(open(os.path.join(BASE, 'results', f)))
        hyp_n = norm(d['text'])
        hits = [t for t in TERMS if t in hyp_n]
        misses = [t for t in TERMS if t not in hyp_n]
        rows.append({'engine': d['engine'], 'label': d['label'],
                     'cer': round(cer(ref_n, hyp_n) * 100, 1),
                     'terms': f'{len(hits)}/{len(TERMS)}', 'misses': misses,
                     'load_s': d['load_s'], 'transcribe_s': d['transcribe_s'],
                     'rtf': d['rtf']})
    rows.sort(key=lambda r: r['cer'])
    for r in rows:
        print(f"{r['engine']:<14} CER {r['cer']:>5}%  용어 {r['terms']:>5}  "
              f"RTF {r['rtf']:<6} 전사 {r['transcribe_s']}s  누락: {', '.join(r['misses']) or '-'}")
    json.dump(rows, open(os.path.join(BASE, 'scores.json'), 'w'),
              ensure_ascii=False, indent=1)
