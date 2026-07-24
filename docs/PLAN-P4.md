# Basil Nexus P4 — 통합 대시보드 실기능 구현 기획서

> 작성일: 2026-07-23 · 상태: 초안(스코프 확정 대기)
> 전제: P1(로그인/세션) + P2(역할별 접근제어/개인화) 완료. 대시보드 3종은 목업 충실 재현된 정적 화면.

## 1. 목표

정적 목업이던 의사/간호사/환자 대시보드의 각 패널을 **PostgreSQL 실데이터 기반**으로 전환하고,
역할(계정 속성)에 따라 **같은 데이터가 서로 다른 관점으로 맞물리게** 한다.

핵심 원칙:
- **하나의 사실, 세 개의 관점**: 예) 환자가 서류를 신청하면 → 환자 화면 "발급 내역", 의사 화면 "서류 요청 현황" 건수, 간호사 화면 "서류 요청 관리"가 모두 같은 `documents` 테이블에서 나온다.
- **시드는 상대 날짜**: 데모를 언제 열어도 "오늘" 일정이 보이도록 시드 데이터는 실행 시점 기준(D+0, D+7 …)으로 생성. 화면의 날짜 표기도 오늘 날짜를 동적 렌더링.
- **목업 시각 충실도 유지**: DOM 구조·CSS는 그대로 두고 내용(텍스트)만 데이터로 치환.

## 2. 페이지별 기능 전수 조사 및 판정

판정 구분: ●DB연동(읽기) ◎쓰기기능 ★LLM연동 ○정적유지(사유 명기)

### 2-1. 의사 화면 (platform/doctor/)

| 패널 | 판정 | 데이터 소스 / 동작 |
|---|---|---|
| 사이드바 프로필 (이름/진료과) | ● 완료 | users.profile (P2 기 구현) |
| 사이드바 "오늘 외래 현황" (예약/대기) | ● | appointments: 오늘·담당의=본인 (scheduled 건수 / 미완료 건수) |
| Basil Nexus AI 패널 | ★ 완료 | SageFM 프록시 (기 구현) |
| 핵심 기능 바로가기 8종 | ○ | 외부 서비스 링크(CT/MRI→Visioneer만 실링크). 각 서비스는 별도 제품 데모 |
| **나의 일정** (오늘 진료 스케줄) | ● | appointments ⨝ patients ⨝ diagnoses. 시간순, 첫 미완료 건=“진료 중”, 이후=“대기”. 날짜 헤더는 오늘 날짜 |
| **나의 서류 요청 현황** (유형별 건수) | ● | documents: status='requested' 유형별 GROUP BY |
| **진료 통계 (이번 달)** | ●+○ | 대기 환자·No-Show·총 진료 수 = appointments/encounters 집계(●). 수가 청구액·삭감액·만족도 = 정적 유지(○: 청구 데이터는 ThymeCare 제품 영역, 근거 데이터 없음) |
| **시스템 상태** | ● | 신규 `GET /api/health`: DB 연결·SageFM 업스트림 실측정, 백업/보안은 표시값 |
| 우측 환자 검색 | ◎ | `GET /api/patients?q=` 이름/ID 검색 → 아래 "최근 조회 환자" 카드 갱신 |
| **최근 조회 환자** | ● | 검색 결과 또는 기본값(가장 최근 encounter 환자): 진단·활성 처방·최근 내원일 |
| **SageFM 환자 요약** | ★ | "AI 요약 생성" 클릭 → 해당 환자의 EMR(진단/처방/바이탈/검사)을 컨텍스트로 SageFM 호출, 스트리밍 표시 |
| 수가 청구 자동 작성 | ○ | ThymeCare 데모 카드 (정적) |
| 영상 분석 결과 | ○ | Visioneer 데모 카드 (정적, 실링크) |
| 알림 배지 | ● | 미처리 서류 요청 건수 |
| "새 환자 등록" 버튼 | ○ | 관리자 기능으로 안내(추후) |

### 2-2. 간호사 화면 (platform/nurse/)

| 패널 | 판정 | 데이터 소스 / 동작 |
|---|---|---|
| 사이드바 "오늘 병동 통계" (활력징후/투약) | ● | nursing_notes: 오늘 note_type별 건수 |
| **오늘 담당 환자 (N명)** | ● | 신규 admissions(병실) ⨝ patients ⨝ diagnoses + 오늘 appointments.kind → 태그(검사 예정/투약 시간/처치 예정) |
| 오늘 일정 (라운딩/투약/회의…) | ○→● | 간호사 개인 일정. 신규 테이블 없이 시드형 고정 일정 + 오늘 날짜 동적 표기(1차), 추후 일정 테이블 확장 |
| **서류 요청 현황** | ● | documents (의사 화면과 동일 소스, 병동 전체) |
| **환자 안전 지표** | ● | 신규 safety_events: 이번 달 유형별 건수(낙상/욕창/투약 오류/감염) |
| 주요 알림 | ● | 파생 집계: 투약(오늘 투약 appointments)·검사 결과(최근 lab_results)·처치·입퇴원(퇴원 예정 admissions)·서류(requested documents) |
| **메모 / 전달 사항** | ◎ | 신규 memos. "+ 새 메모" 입력 → POST, 최근순 표시(작성자·시각) |
| **병동 현황** | ● | admissions(입원/퇴원예정) + appointments(오늘 검사/수술 kind) |
| 빠른 연락처 | ● | users(의사) profile.phone + 시드 고정 연락처 |
| 최근 기록 | ● | nursing_notes 최근 5건 (유형 + 병실) |
| AI 패널 / 알림 배지 | ★/● | 기 구현 / 주요 알림 합계 |

### 2-3. 환자 화면 (platform/patient/)

| 패널 | 판정 | 데이터 소스 / 동작 |
|---|---|---|
| 사이드바 프로필 | ● 완료 | users.profile (P2) |
| **나의 일정** (다음 예약 D-day + 예정 일정) | ● | appointments: 본인, 미래, 시간순. 첫 건 D-day 계산 |
| **최근 진료 기록** | ● | encounters ⨝ diagnoses ⨝ 의사 이름, 최근 3건 |
| **처방 약 / 복약 정보** | ● | prescriptions: active=true |
| **서류 발급 / 신청 5종 카드** | ◎ | 카드 클릭 → 확인 → `POST /api/documents` (doc_type) → 토스트 + "발급 내역" 갱신. **의사·간호사 화면 건수와 실시간 연동** |
| 나의 발급 내역 보기 | ● | documents: 본인, 상태 표시(신청됨/발급완료) |
| "진료 예약" 버튼(레일) | ◎ | 간단 예약 모달(날짜/시간/종류) → `POST /api/appointments` → 나의 일정 갱신. **의사 화면 일정과 연동** |
| 환자 기본 정보 | ● | patients (이름/생년월일/성별/연락처/이메일/주소) |
| **진료비 내역** | ● | 신규 bills: 미수납 합계 + 최근 내역 |
| **건강 정보 요약** (혈압/혈당/체중/BMI) | ● | vitals 최신 1건 + 최근 검진일(lab_results/encounters) |
| 건강 관리 팁 | ○ | 정적 (콘텐츠 영역) |
| AI 패널 / 알림 배지 | ★/● | 기 구현 / 서류 상태변경 등 파생 |

### 2-4. 관리자 화면
현행 유지(계정 생성/목록). EMR 데이터 관리는 후속 단계.

## 3. 데이터 모델 확장 (schema v2)

기존 12개 테이블 유지 + 신규 4개:

```sql
admissions (id, patient_id FK, room TEXT, ward TEXT, admitted_at, discharge_due DATE,
            status CHECK(admitted|discharge_due|discharged))   -- 간호사 병동/담당환자
memos      (id, author_id FK users, target_role TEXT, content, created_at)  -- 병동 메모/전달
bills      (id, patient_id FK, billed_at, item TEXT, amount INT, paid BOOL) -- 진료비
safety_events (id, patient_id FK NULL, event_type CHECK(낙상|욕창|투약오류|감염), occurred_at)
```

- 마이그레이션: `db/migrate-002.sql` (CREATE TABLE IF NOT EXISTS, 멱등) — DB 소유자가 basil이므로 **sudo 불필요**, `node db/migrate.js`로 적용.
- appointments.kind 값 규약: `진료|검사|투약|처치|물리치료|수술|검진` (간호사 태그·병동 현황 파생에 사용).

## 4. API 설계 (server.js 확장)

읽기는 **역할별 집계 엔드포인트 1개**로 통합(라운드트립 최소화, 화면당 fetch 1회):

| 메서드/경로 | 권한 | 내용 |
|---|---|---|
| GET /api/dashboard/doctor | doctor,admin | 오늘 일정, 외래 현황, 서류 건수, 월 통계, 최근 환자 요약 |
| GET /api/dashboard/nurse | nurse,admin | 담당 환자, 병동 현황, 안전 지표, 알림, 메모, 최근 기록, 병동 통계 |
| GET /api/dashboard/patient | patient,admin | 예약, 진료 기록, 처방, 서류 내역, 진료비, 바이탈, 기본 정보 |
| GET /api/patients?q= | doctor,nurse,admin | 이름/ID 검색 (+환자 1명 상세: 진단/처방/최근 내원) |
| POST /api/documents | patient | 서류 신청 {doc_type} |
| POST /api/appointments | patient | 예약 신청 {date,time,kind} |
| POST /api/memos | nurse,admin | 메모 작성 {content} |
| GET /api/health | 로그인 사용자 | DB ping + SageFM 업스트림 reachability(1s 타임아웃) |
| ★ /api/medgemma-chat 확장 | 로그인 사용자 | `context` 필드 허용: 환자 요약 생성 시 EMR 컨텍스트를 첫 메시지에 프리펜드 |

응답은 패널 단위 키로 구성된 JSON. 모든 엔드포인트는 세션 검사 + 역할 검사(guard 재사용).

## 5. 역할 간 데이터 맞물림 시나리오 (검증 시나리오이기도 함)

1. **서류 흐름**: patient1이 "진단서" 신청 → 환자 발급 내역 +1 → 의사 "서류 요청 현황" 진단서 건수 +1 → 간호사 "서류 요청 현황" +1, 알림 +1.
2. **예약 흐름**: patient1이 예약 신청 → 환자 "나의 일정"에 D-day 표시 → 해당일 의사 "나의 일정"에 행 추가 → 의사 사이드바 예약 환자 수 +1.
3. **바이탈 흐름**: 시드된 간호 기록(활력징후) → 간호사 "최근 기록"·병동 통계 → 환자 "건강 정보 요약" 최신값 → 의사 SageFM 요약 컨텍스트에 포함.
4. **입원 흐름**: admissions 시드(1205~1209호) → 간호사 담당 환자 목록·병동 현황 → 의사 일정의 동일 환자와 이름 일치.
5. **AI 요약**: 의사가 김철수 검색 → "AI 요약 생성" → SageFM이 실제 시드 EMR을 바탕으로 요약 생성(스트리밍).

## 6. 시드 데이터 설계 (db/seed-emr.js)

- 환자 6명: 홍길동(patient1 계정 연결) + 김철수/박영희/이민수/최지연/정승환(계정 없는 원내 환자, 목업 명단과 일치).
- 상대 날짜 생성: 오늘 진료 5건(09:00~11:00, doctor1), 미래 예약 3건(D+7/D+14/D+21), 과거 encounter 3건(D-56/D-99/D-135), 처방(목업과 동일: Amlodipine·Atorvastatin·비타민D), vitals·lab_results(T-score 등), documents(진단서3·소견서2·사본1·보험4 = 목업 건수), admissions 5건(1205~1209호), memos 3건, safety_events(감염 1), bills.
- 멱등: ON CONFLICT / 존재 검사 후 삽입. `node db/seed-emr.js`로 반복 실행 안전.

## 7. 구현 단계·에이전트 분담·검증

```
[A. 기획 확정] ← 본 문서 (사용자 승인)
[B-1. DB 에이전트]   migrate-002.sql + migrate.js + seed-emr.js 작성·적용·SQL 검증
[B-2. API 에이전트]  server.js 확장 (B-1 완료 후, 단독으로 server.js 수정)
[B-3. 프론트 에이전트 ×3 병렬]  doctor / nurse / patient 페이지+JS (파일 겹침 없음)
     - 각 페이지에 dashboard 렌더 JS 추가 (기존 auth.js/ai.js 패턴, ?v= 캐시버스팅)
     - shell.css 추가가 필요하면 별도 role별 <style> 또는 지정 구획만 수정(충돌 방지)
[B-4. 검증 에이전트]  테스트 포트(8090)에 새 server.js 기동 → 계정 4종 로그인 → API 전건 curl 검증
     + 시나리오 1~5 재현 (서류신청→건수 증가 등 상태 변화 검증)
[C. 최종 검증(Claude 본인)]  코드 리뷰 + 8090 재검증 + sync-public + 사용자 재시작 안내
[D. 커밋/푸시]  P1+P2(미커밋분) → P4 순서로 커밋 분리
```

리스크·메모:
- nump-web 재시작은 sudo 필요(사용자 터미널). 개발·검증은 8090 포트 별도 인스턴스로 무중단 진행.
- 목업 재현율 이슈 방지: 프론트 에이전트에게 "DOM 구조·클래스 변경 금지, textContent/행 반복 생성만 허용" 제약 부여.
- 이번 단계에서 P3(페르소나)는 제외 — chat_messages 적재 훅만 준비되면 후속 진행.

## 8. 정적 유지 목록 (의도적 제외)

- 수가 청구 자동 작성 / 진료 통계의 청구액·삭감액·만족도 (ThymeCare 제품 데모 영역)
- 영상 분석 결과 카드 (Visioneer 링크)
- 핵심 기능/간호 업무/주요 서비스 바로가기 카드의 미구현 링크(#)
- 건강 관리 팁, FAQ, 고객센터, 이용약관 등 콘텐츠성 요소
- 사이드바 좌측 내비게이션(대시보드 외 메뉴) — 별도 페이지 필요, 후속 단계
