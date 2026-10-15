#!/usr/bin/env python3
"""STT 벤치마크 러너 — 같은 음성(chunk-a/b, 75.7s)을 엔진별로 전사해 results/에 저장.

사용:  python3 run_bench.py <engine>
엔진:  fw-small | fw-medium | fw-turbo | sensevoice | qwen-0.6b | qwen-1.7b-ko
측정:  모델 로드 시간 / 전사 시간 / RTF(전사시간÷오디오길이, 낮을수록 빠름)
설정:  운영 어댑터와 동일 조건을 지향 (CPU, 한국어 고정, 스레드 16)
"""
import json
import os
import sys
import time

BASE = os.path.dirname(os.path.abspath(__file__))
AUDIO = [os.path.join(BASE, 'audio', f) for f in ('chunk-a.wav', 'chunk-b.wav')]
TOTAL_SEC = 75.7
os.makedirs(os.path.join(BASE, 'results'), exist_ok=True)
os.environ.setdefault('OMP_NUM_THREADS', '16')


def run_faster_whisper(size):
    from faster_whisper import WhisperModel
    t0 = time.time()
    m = WhisperModel(size, device='cpu', compute_type='int8', cpu_threads=16)
    load_s = time.time() - t0
    texts = []
    t0 = time.time()
    for a in AUDIO:
        # 기본 VAD(threshold 0.5)는 실제 발화를 잘라냄(2026-10-15 실측) → 0.2 사용
        segs, _ = m.transcribe(a, language='ko', vad_filter=True,
                               vad_parameters={'threshold': 0.2,
                                               'min_silence_duration_ms': 500})
        texts.append(' '.join(s.text.strip() for s in segs))
    return load_s, time.time() - t0, ' '.join(texts)


def run_sensevoice():
    # SenseVoice/Qwen 은 16kHz 리샘플본 사용 (audio16/)
    audio16 = [a.replace('/audio/', '/audio16/') for a in AUDIO]
    from funasr import AutoModel
    from funasr.utils.postprocess_utils import rich_transcription_postprocess
    t0 = time.time()
    m = AutoModel(model='FunAudioLLM/SenseVoiceSmall', hub='hf', device='cpu',
                  vad_model='fsmn-vad', vad_kwargs={'max_single_segment_time': 30000},
                  disable_update=True)
    load_s = time.time() - t0
    texts = []
    t0 = time.time()
    for a in audio16:
        res = m.generate(input=a, language='ko', use_itn=True, batch_size_s=60)
        texts.append(rich_transcription_postprocess(res[0]['text']))
    return load_s, time.time() - t0, ' '.join(texts)


def run_qwen(model_id):
    import torch
    from qwen_asr import Qwen3ASRModel
    t0 = time.time()
    m = Qwen3ASRModel.from_pretrained(model_id, dtype=torch.float32, device_map='cpu')
    load_s = time.time() - t0
    texts = []
    t0 = time.time()
    for a in [p.replace('/audio/', '/audio16/') for p in AUDIO]:
        res = m.transcribe(audio=a, language='Korean')
        texts.append(res[0].text if isinstance(res, list) else res.text)
    return load_s, time.time() - t0, ' '.join(texts)


ENGINES = {
    'fw-small': ('faster-whisper small (현 운영)', lambda: run_faster_whisper('small')),
    'fw-medium': ('faster-whisper medium', lambda: run_faster_whisper('medium')),
    'fw-turbo': ('faster-whisper large-v3-turbo', lambda: run_faster_whisper('large-v3-turbo')),
    'sensevoice': ('SenseVoiceSmall (FunASR)', run_sensevoice),
    'qwen-0.6b': ('Qwen3-ASR-0.6B', lambda: run_qwen('Qwen/Qwen3-ASR-0.6B')),
    'qwen-1.7b-ko': ('TeamUNIVA qwen3_asr_1.7b_ko', lambda: run_qwen('TeamUNIVA/qwen3_asr_1.7b_ko')),
}

if __name__ == '__main__':
    name = sys.argv[1]
    label, fn = ENGINES[name]
    load_s, tr_s, text = fn()
    out = {'engine': name, 'label': label, 'load_s': round(load_s, 1),
           'transcribe_s': round(tr_s, 1), 'rtf': round(tr_s / TOTAL_SEC, 3), 'text': text}
    with open(os.path.join(BASE, 'results', name + '.json'), 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in out.items() if k != 'text'}, ensure_ascii=False))
    print('TEXT:', text)
