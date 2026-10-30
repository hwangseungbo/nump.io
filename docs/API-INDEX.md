# 서비스별 API 엔드포인트 색인 (2026-10-30)

플랫폼 전체(서비스 4종)의 엔드포인트·파라미터 문서가 어디에 있는지 한눈에 보는 색인.
상세 요청/응답 JSON 형식은 각 "상세 문서"가 절대 기준이다.

| 서비스 | 베이스 | 상세 문서 |
|---|---|---|
| Basil Nexus 데모 병원 | https://nump.io/api/* | 이 문서 §1 + docs/API-CONTRACT-P4/P5/P6.md |
| 의료 LLM (SageFM) | /api/medgemma-chat 프록시 또는 직접 호출 | docs/LLM-API.md |
| MintNote(MediPencil) | https://mintnote.nump.io | 벤더 PDF + 어댑터 README (§3) |
| LavenderRx (약물 상호작용) | 협의 중 (스키마 수신 대기) | lavenderrx/README.md |

## 1. Basil Nexus 데모 병원 API (server.js, :8088)

공통 규약(상세: API-CONTRACT-P4.md §0): 쿠키 `bn_session` 인증, 미로그인 401
`{"error":"unauthorized"}`, 역할 불일치 403. **admin은 모든 역할 API 허용.**
날짜 `"YYYY.MM.DD"`, 금액 정수(원), enum 정의는 P4 §0.

### 인증·계정

| 메서드 | 경로 | 역할 | 설명 | 상세 |
|---|---|---|---|---|
| POST | /api/login | - | `{username, password}` → 세션 쿠키 | P4 |
| POST | /api/logout | 로그인 | 세션 종료 | P4 |
| GET | /api/me | 로그인 | 내 계정·프로필 | P4 |
| POST | /api/me/password | 로그인 | 비밀번호 변경 | P5 |
| POST | /api/signup | - | 환자 전용 회원가입 (role 강제 patient) | **P6** |
| PATCH | /api/patients/me | patient | 본인 연락처 수정 | P5(E⑦) |
| GET/POST | /api/admin/users | admin | 계정 목록 / 생성 `{username, password(8+), name, role, profile}` — patient면 patients 행 동반 생성 | 이 문서 |
| GET | /api/admin/personas | admin | AI 챗 페르소나 목록(user_personas) | 이 문서 |

### 대시보드·통계

| 메서드 | 경로 | 역할 | 설명 | 상세 |
|---|---|---|---|---|
| GET | /api/dashboard/doctor | doctor | 오늘 일정·서류 요청·월 통계 | P4 §1 |
| GET | /api/dashboard/nurse | nurse | 병동 워크리스트·입원 현황 | P4 |
| GET | /api/dashboard/patient | patient | 예약·복약·미납 요약 | P4 |
| GET | /api/stats/doctor | doctor | 의사 통계 | P5 |
| GET | /api/stats/nurse | nurse | 간호 통계 | P5 |
| GET | /api/health | - | 헬스체크 | - |

### 진료 기록 (조회는 3역할 공통 — 환자는 본인 것만)

| 메서드 | 경로 | 역할 | 설명 | 상세 |
|---|---|---|---|---|
| GET | /api/patients | doctor·nurse | 환자 검색/목록 | P4 |
| GET/POST | /api/appointments | 3역할 / patient·doctor | 예약 조회 / 생성 | P4·P5 |
| PATCH | /api/appointments/:id | 3역할 | 예약 상태 변경·취소 | P5 |
| GET | /api/encounters | 3역할 | 진료 기록 | P4·P5 |
| PATCH | /api/encounters/:id | doctor | 환자용 요약 작성 | P5 |
| GET | /api/prescriptions | 3역할 | 처방(약제 표기는 drug_master 한글 제품명) | P4·P5 |
| GET/POST | /api/vitals | 3역할 / nurse | 바이탈 조회 / 입력 `{patient_id, systolic, diastolic, …, glucose?}` | P4·P5 |
| GET | /api/lab-results | 3역할 | 검사 결과 | P5 |

### 서류·수납(토스 결제)

| 메서드 | 경로 | 역할 | 설명 | 상세 |
|---|---|---|---|---|
| GET/POST | /api/documents | 3역할 / patient | 서류 목록 / 신청 (doc_type enum은 P4 §0) | P4·P5 |
| GET | /api/documents/:id | 3역할 | 발급 서류 열람 | P5 |
| PATCH | /api/documents/:id | doctor·nurse | 발급 처리 | P5 |
| DELETE | /api/documents/:id | patient | 본인 신청 취소(requested만) | 이 문서 |
| GET | /api/bills | 3역할 | 수납 내역·미납 합계 | P5 |
| POST | /api/bills/:id/checkout | patient | 단건 결제 시작 → `{clientKey, orderId, amount, orderName}` (토스 결제창용) | 이 문서 |
| POST | /api/bills/checkout-all | patient | 미납 전체 합산 결제 시작 | 이 문서 |
| POST | /api/payments/confirm | patient | `{paymentKey, orderId, amount}` 금액 검증 후 토스 승인 → paid 처리 | 이 문서 |

토스 키는 payments.config.json(gitignore)의 개발자센터 "API 개별 연동" 테스트 키.
흐름: checkout → 브라우저 토스 결제창(SDK v2) → successUrl `?pay=success` 복귀 → confirm.

### 병동(입원·간호)

| 메서드 | 경로 | 역할 | 설명 | 상세 |
|---|---|---|---|---|
| GET/POST | /api/admissions | nurse·doctor | 입원 목록 / 등록 `{patient_id, ward, room, discharge_due?}` | P4·P5 |
| PATCH | /api/admissions/:id | nurse·doctor | 전실·퇴원 처리 | P5 |
| GET/POST | /api/nursing-notes | nurse | 간호기록 (note_type enum은 P4 §0) | P5 |
| GET/POST | /api/care-orders | doctor·nurse | 지시 조회(?patient_id&status) / 발행 `{patient_id, content}` | 이 문서 |
| PATCH | /api/care-orders/:id | doctor·nurse | 지시 상태 변경 `{status}` | 이 문서 |
| GET | /api/handover | nurse | 인계 요약 (?shift=) | 이 문서 |
| GET/POST | /api/memos | nurse·doctor / nurse | 스테이션 메모 | P4·P5 |

### AI 챗

| 메서드 | 경로 | 역할 | 설명 | 상세 |
|---|---|---|---|---|
| POST | /api/medgemma-chat | 로그인 | `{message, session_id, ctx?, doctor_id?}` SSE 스트리밍. ctx:true면 역할별 실데이터 컨텍스트 자동 첨부 | **LLM-API.md** |
| GET | /api/chat-doctors | 로그인 | 챗 의사 선택 목록(+환자면 matched_doctor_id) | 이 문서 |

업스트림: SageFM — 환경변수 `AI_UPSTREAM=host:port[/path]`로 교체 가능(기본 165.132.220.115:5096).

## 2. 의료 LLM 직접 호출

외부 도구/에이전트가 LLM을 직접 쓸 때의 전체 스펙(주소·파라미터·예시)은
**docs/LLM-API.md** 참조.

## 3. MintNote(MediPencil) — mintnote.nump.io

MediPencil은 벤더 제품(도커 독립 설치)이라 **제품 내부 API는 벤더 문서가 기준**:

- `MediPencil_API_연동_설명서.pdf` (프로젝트 루트, 2026-10-14) — 독립 설치 API 연동 규격
- `MediPencil_Installation_Guide.pdf` (medipencil/MediPencil_Independent_20261013/)

우리가 구현·운영하는 연동 지점은 **SageFM 어댑터** (음성→STT→SOAP 생성):

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | http://172.18.0.1:8093/process | MediPencil이 호출. access-token 인증, visitType(standard/eng/fi/sheet/counselor/dictate), WAV 전사 + SOAP JSON 반환 |
| GET | http://172.18.0.1:8093/health | 상태 확인 |

파라미터·오류 규약·운영 명령 상세: **medipencil/sagefm-adapter/README.md**
(도커 브리지 전용 바인딩이라 외부 비노출. 토큰은 adapter.env — 커밋 금지.)

## 4. LavenderRx (인드림 약물 상호작용) — 협의 중

호출 방식 확정(서버→서버 JSON POST → userId·seq 수신 → 결과 URL 새창), JSON
스키마·테스트 접속 정보 수신 대기. 현황·확정 내역: **lavenderrx/README.md**.
약제 키: 심평원 EDI 약품코드 9자리(drug_master.kd_code).
