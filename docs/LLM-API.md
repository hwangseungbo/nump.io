# NUMP 의료 LLM(SageFM/MedGemma) API 사용 안내

외부 도구·에이전트(예: 다른 PC의 Claude)가 NUMP 의료 LLM을 호출할 때 필요한 전체 스펙.
Basil Nexus 플랫폼의 AI 상담도 동일한 업스트림을 사용한다 (server.js `AI_UPSTREAM` / `/api/medgemma-chat` 프록시).

## 1. 엔드포인트 (둘 중 하나)

| 방식 | 주소 | 비고 |
|------|------|------|
| 직접 호출 (권장) | `POST http://165.132.220.115:5096/api/chat` | GPU 서버 직결, HTTP |
| 프록시 경유 | `POST https://nump.io/api/medgemma-chat` | HTTPS, 동일 규격으로 중계 |

외부 용도는 직접 호출을 권장한다. 프록시에는 플랫폼 전용 확장(`ctx:true` 로그인 사용자 EMR 컨텍스트
자동 첨부, `doctor_id` 진료 페르소나)이 붙어 있으며 외부 호출에는 불필요하다.

## 2. 요청 형식

```
Content-Type: application/json

{"session_id": "<대화 식별자>", "message": "<질문 텍스트>"}
```

- `session_id`가 같으면 서버가 이전 대화 맥락을 기억한다 (멀티턴).
- 새 대화를 시작하려면 새로운 고유 문자열을 쓴다 (예: `myapp-20261003-001`).

## 3. 응답 형식 — SSE 스트리밍 (text/event-stream)

```
data: {"delta": "안녕"}
data: {"delta": "하세요"}
...
```

- `data: ` 로 시작하는 이벤트의 `delta` 값을 순서대로 이어붙이면 전체 답변이다.
  (일부 백엔드 모드는 `delta` 대신 `content` 필드 — 둘 다 처리 권장)
- 오류 시: `data: {"error": "..."}`
- 답변 생성이 길면 수십 초 걸릴 수 있다 (타임아웃 120~180초 권장).

## 4. 호출 예시

```bash
curl -N -X POST http://165.132.220.115:5096/api/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-001","message":"고혈압 환자의 생활 습관 관리법을 알려줘"}'
```

## 5. 주의사항

- **인증 없음(데모 환경).** 실명·주민등록번호 등 개인정보와 민감정보는 절대 전송 금지.
- 의료 참고 정보 생성용 모델이며 답변은 진료를 대신하지 않는다 — 사용자에게 노출할 때 AI 고지 필수.
- GPU 1대 공유 환경이므로 대량·동시 호출은 자제.

## 부록 — 플랫폼 내부에서의 사용 구조

```
브라우저(챗 UI) ─POST /api/medgemma-chat→ server.js(프록시) ─HTTP→ 165.132.220.115:5096 /api/chat
```

- server.js 프록시는 `ctx:true` 요청에 역할별 EMR 컨텍스트·의사 진료 페르소나를 질문 앞에 첨부하고,
  질문·답변을 `chat_messages`에 기록한다 (AI 페르소나 자동 학습의 원천).
- 페르소나 요약 갱신(`refreshPersona`)과 시스템 상태 카드의 llm 체크(TCP 1초 프로브)도 같은 업스트림을 쓴다.
- 업스트림 주소는 server.js 상단 `AI_UPSTREAM` 상수에서 변경한다 (변경 시 응답 포맷 호환 확인 필요).
