# MediPencil(MintNote) 연동 산출물 — 스냅샷

mintnote.nump.io 로 서비스 중인 MediPencil 독립 설치와 SageFM 어댑터 연동 작업의
문서·코드 스냅샷. **실제 운영 원본은 이 PC의 `/home/nump/Basil_Nexus/medipencil/`**
이며, 이 폴더는 백업·공유용 사본이다 (운영 파일 수정 후 여기로 다시 복사해 커밋).

## 구성

- `sagefm-adapter/` — MediPencil ↔ SageFM 중계 서버 (Flask).
  faster-whisper(CPU, large-v3-turbo) 전사 + SageFM 차트 생성.
  SOAP 프롬프트 v2(2026-10-15) 적용. 설정은 `adapter.env`(비공개, 레포 제외) —
  키 목록은 `adapter.env.example` 참고.
- `stt-benchmark/` — STT 모델 6종 CPU 벤치마크 (REPORT.md에 결론),
  차트 프롬프트 A/B 비교 원본(results/prompt-A·B.txt) 포함.
- `test-dialogues.md` — 받아쓰기·차트 테스트용 가상 진료 대화 6종 + 채점 포인트.
- `stt-model-candidates.md` — CPU 서버용 최신 STT 모델 후보 10선 조사(2026-10-15).
- `patches/README.md` — 받아쓰기 조각 단축 로컬 패치 기록 (적용 해제됨; WAR 바이너리는
  벤더 자산이라 레포 제외).
- `caddy-mintnote.snippet` — mintnote.nump.io 리버스 프록시 설정.

## 레포에 올리지 않는 것

- `adapter.env` (접근 토큰), 음성 녹음 파일(개인 음성), MediPencil 설치 패키지·WAR(벤더 자산)
