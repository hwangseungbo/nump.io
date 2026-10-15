# SageFM 어댑터 (MediPencil 음성·차트 처리 서버)

MediPencil "독립 설치 API 연동 설명서"(2026-10-14, 프로젝트 폴더 PDF) 규격 전체를 구현한 중계 서버.
SageFM LLM(165.132.220.115:5096)으로 결과를 생성하고,
녹음(WAV)은 이 서버의 faster-whisper(CPU, small 모델)로 전사한다.

지원 모드(visitType): standard(한국어 SOAP) · eng(영문, soapText+soapTextEng 동시 반환) ·
fi(핀란드어) · sheet(서술형 문서) · counselor/dictate(전사만, LLM 미사용).
SOAP 프롬프트 v2 (2026-10-15): 운영 SOAP 프롬프트 골격 병합 — 'S - Subjective' 영문 헤더
+ '*' 개조식, 완전성 체크리스트, O 오염 방지('특이사항 없음' 규칙), P 끝 경고 증상 복귀 지침,
한글(영어/약어) 병기, 환각 금지·확신 수준 유지 규칙. A/B 비교(stt-benchmark/results/prompt-A·B.txt)로 채택.
lengthInstruction 1/2/3(최소/중간/최대), useAbbreviation true/false 반영.
오류: 토큰 불일치 401, 잘못된 입력·미지원 모드 400(웹앱 재시도 없음), 처리 실패 502(웹앱이 최대 3회 재시도).
예외: counselor/dictate 의 무음 오디오는 400이 아니라 빈 transcript(200)로 응답 —
웹앱이 녹음 정지 직후 무음 조각을 보내는데 400을 주면 작업 전체가 FAILED 처리되어
차트 생성까지 막히기 때문 (2026-10-15 실사용 테스트에서 발견·수정).

```
MediPencil 앱(도커) → http://172.18.0.1:8093/process → [Whisper STT] → SageFM → SOAP JSON
```

- 실행 파일: `adapter.py` (Flask, 사용자 레벨 pip 패키지 사용)
- 설정: `adapter.env` (ACCESS_TOKEN 등, 권한 600 — 커밋 금지)
- 로그: `adapter.log` (작업 단위), `adapter.boot.log` (stdout)
- 바인딩: 172.18.0.1:8093 (도커 브리지 게이트웨이 전용 — 외부 비노출)
- 자동 시작: nump 계정 crontab `@reboot` 등록됨
- MediPencil 쪽 설정 위치: /admin/settings/integrations →
  "AI 음성·차트 처리 URL" = http://172.18.0.1:8093/process, "AI access-token" = adapter.env의 값

## 운영 명령

```bash
# 상태 확인
curl -s http://172.18.0.1:8093/health
# 재시작 (pkill -f 는 자기 셸까지 죽일 수 있어 PID 로 종료)
kill $(pgrep -f '^python3 adapter.py'); sleep 1; cd /home/nump/Basil_Nexus/medipencil/sagefm-adapter \
  && setsid nohup python3 adapter.py >> adapter.boot.log 2>&1 &
# 주의: 구 프로세스가 남아 있으면 "Port 8093 is in use" 로 새 기동이 실패함 —
# 재시작 후 health 가 UP 인지, pgrep 결과가 1개인지 꼭 확인
```

## 참고

- 첫 음성 요청 시 Whisper 모델 로드로 10~20초 추가 지연 (이후 빠름)
- 받아쓰기가 10~30초 단위로 "묶음" 갱신되는 것은 웹앱이 녹음을 30~45초
  조각으로 잘라 업로드하기 때문 (앱 클라이언트 동작 — 어댑터 전사 자체는 조각당 2~3초)
- 정확도를 높이려면 adapter.env에 `WHISPER_MODEL=large-v3-turbo` 후 재시작
  (벤치마크 결과 medium보다 빠르고 정확 — ../stt-benchmark/REPORT.md 참고)
- VAD는 threshold 0.2로 완화돼 있음 — 기본값 0.5는 실제 발화를 잘라냄(2026-10-15 벤치마크)
- SageFM GPU 공유 환경이므로 대량 동시 요청 자제
