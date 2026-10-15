# CPU 서버용 STT(ASR) 모델 후보 10선 — 최신순

조사일 2026-10-15. 조건: 한국어 지원 · 상업적 사용 가능 라이선스 · CPU 전용 서버(GPU 없음, 80코어)
감안해 파라미터 ≤ 4B. 현재 운영: faster-whisper `small`(244M).

| # | 모델 (Hugging Face ID) | 공개 | 크기 | 한국어 | 라이선스 | 비고 |
|---|---|---|---|---|---|---|
| 1 | nvidia/nemotron-3.5-asr-streaming-0.6b | 2026-06 | 0.6B | ✓ (CER 7.1~8.3%) | OpenMDW-1.1 (상용 명시) | 스트리밍 특화 FastConformer+RNN-T, GGUF·C++ 런타임(NeMo-Speech.cpp) 제공 |
| 2 | CohereLabs/cohere-transcribe-03-2026 | 2026-03 | 2B | ✓ (14개 언어) | Apache-2.0 | RTFx 525(GPU 기준), 언어 자동감지 없음(ko 고정 지정 — 우리 용도엔 무관), GGUF 변환본 존재 |
| 3 | mistralai/Voxtral-Mini-4B-Realtime-2602 | 2026-02 | 4B | ✓ (13개 언어) | Apache-2.0 | <500ms 실시간 설계. 단 권장 GPU 16GB — CPU엔 가장 무거운 후보 |
| 4 | Qwen/Qwen3-ASR-1.7B | 2026-01 | 1.7B | ✓ (30개 언어+22방언) | Apache-2.0 | 오픈소스 ASR 중 최상위 정확도(자체 벤치). transformers/vLLM(`pip install qwen-asr`) |
| 5 | **TeamUNIVA/qwen3_asr_1.7b_ko** | 2026 | 1.7B | ✓✓ 한국어 특화 | Apache-2.0 | Qwen3-ASR-1.7B를 한국어로 SFT+RL 4단계 파인튜닝. 한국어 CER 6.86→**4.83%**, KsponSpeech 8.65→5.94% — **한국어 정확도 최유력** |
| 6 | Qwen/Qwen3-ASR-0.6B | 2026-01 | 0.6B | ✓ | Apache-2.0 | 1.7B의 효율형. 정확도/속도 균형 |
| 7 | FunAudioLLM/Fun-ASR-MLT-Nano-2512 | 2025-12 | 0.8B | ✓ (31개 언어) | Apache-2.0 | 알리바바 FunASR 팀. llama.cpp GGUF CPU 단일 바이너리 빌드 제공 |
| 8 | DataoceanAI/dolphin-small | 2025-03 | 372M | ✓ (동양 40개 언어, 칭화대 공동) | Apache-2.0 | 동양어 특화. 작고 빠른 CTC/어텐션 구조 |
| 9 | openai/whisper-large-v3-turbo | 2024-10 | 809M | ✓ (우수) | MIT 계열 (상용 가능) | **현 faster-whisper 스택에서 모델명만 교체하면 됨(코드 변경 0)**. CT2 변환본 존재 |
| 10 | FunAudioLLM/SenseVoiceSmall | 2024-07 | ~234M | ✓ (zh/yue/en/ja/ko) | FunASR 모델 라이선스 (상용 허용, 출처표기 조건) | whisper-large 대비 15배 속도 주장, llama.cpp CPU 빌드 있음 — **속도 최우선 픽** |

## 제외한 것들과 이유

- **Supertonic(Supertone)** — TTS(음성 합성) 모델. STT 아님 (66M, 한국어 TTS로는 훌륭)
- microsoft/VibeVoice-ASR(9B)·Phi-4-multimodal(6B) — CPU엔 과대
- facebook/seamless-m4t-v2-large — CC-BY-NC 비상용 라이선스
- NVIDIA Parakeet/Canary, Kyutai STT, Moonshine — 한국어 미지원

## 운영 관점 요약

- **코드 변경 없이 즉시**: whisper `medium`(769M) 또는 `large-v3-turbo` — adapter.env 한 줄
- **한국어 정확도 최우선**: TeamUNIVA qwen3_asr_1.7b_ko — 어댑터에 추론 코드 추가 필요,
  CPU int8 기준 속도 실측 필요 (80코어라 가능권)
- **속도 최우선**: SenseVoiceSmall 또는 nemotron-0.6b GGUF
- 의학용어(암로디핀, 당화혈색소 등)는 어떤 범용 모델도 완벽하지 않음 —
  모델 교체와 별개로 어댑터 단 용어 교정 사전(hotwords/후처리) 병행 권장
