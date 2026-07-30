# P5 계약서 — 사이드바 내비게이션 실기능화 (뷰 전환 + 워크플로)

P4 계약(docs/API-CONTRACT-P4.md)의 공통 규약(§0: 인증/날짜/나이/pid/enum/에러 형식)을 그대로 승계한다.
DB 스키마 변경 없음. 이 문서의 JSON 키/형식이 절대 기준.

## 0. 프론트 뷰 전환 규약 (3개 역할 페이지 공통)

- 사이드바 `.nav-i`에 `data-view="이름"` 부여, href는 `#view-이름`으로 변경. **해시 라우팅**: hashchange 시 뷰 전환, 새로고침해도 뷰 유지, 해시 없으면 기본(dashboard/home).
- 의사 "영상 분석" 메뉴만 기존 외부 링크(../../visioneer/index.html) 유지.
- JS가 `<main class="main">` 안에 `#viewHost` div를 생성. 뷰 전환 = 기존 대시보드 자식들(.hello, .hello-sub, .ai-box, .block…) `display:none` 토글 + #viewHost에 해당 뷰 렌더. "대시보드/홈" 뷰 = 기존 콘텐츠 복원. `.nav-i.on` 클래스 동기화.
- 사이드바·우측 레일·푸터는 모든 뷰에서 유지.
- 뷰 공통 UI(페이지 <style>에 정의, 클래스명 통일): `.view-head`(제목 h2+부제), `.vt`(표: thead 12px muted, 행 border-bottom var(--line), hover 배경), `.pgr`(페이지네이션: ‹ 이전 | n / 전체 | 다음 ›), `.empty`(빈 상태 안내), 상태 뱃지는 기존 tag/st 클래스 재사용.
- 대시보드 패널의 "전체 보기/더 보기 ›" 링크를 대응 뷰 해시로 연결(§4 매핑).
- 쓰기 액션 성공 → 토스트 + 해당 뷰 재조회(대시보드로 돌아가면 대시보드 fetch도 갱신). 실패 → 오류 토스트.
- API 미존재/실패 시 뷰 영역에 `.empty` "데이터를 불러올 수 없습니다" 표시(기본 대시보드의 P4 정적 폴백 동작은 그대로 유지).
- 기존 P4 렌더 코드는 깨지 말 것. 스크립트 버전 `?v=2`로 승격.

## 1. 신규·확장 API (server.js)

PATCH 경로의 `:id`는 정수. 권한 위반 403, 미로그인 401, 없는 리소스 404, 검증 실패 400 — 전부 `{"error":"…"}`.

### 1-1. GET /api/patients?q=&page=1  (doctor, nurse, admin) — 확장
- q 있으면 기존 P4 §4와 동일(5명). **q 없으면** 최근 내원순 20명/page, 응답에 `"total"` 추가: `{"total":25,"results":[patientDetail…]}`.

### 1-2. GET /api/appointments  — 역할별 조회
- doctor/admin: `?date=YYYY-MM-DD`(기본 오늘) → `{"dateLabel":"2026년 7월 24일 (금)","rows":[{"id":1,"time":"09:00","name":"김철수","sex":"M","age":45,"kind":"진료","status":"scheduled","statusLabel":"대기"}]}` (본인 담당, 시간순. statusLabel: scheduled→대기, done→완료, cancelled→취소, no_show→No-Show)
- nurse: `?date=&scope=ward` → 위와 동일 + 각 행에 `"room"`(입원 시) 추가, 의사 무관 전체.
- patient: `?scope=self` → `{"upcoming":[{"id":370,"date":"2026.07.31 (금)","time":"10:00","kind":"진료","department":"가정의학과","doctor":"홍길동 원장","cancellable":true}],"past":[…최근 10]}` (past엔 cancellable 없음, statusLabel 포함)

### 1-3. PATCH /api/appointments/:id
- patient: body `{"status":"cancelled"}` — 본인 + 미래 + scheduled만. 아니면 400/403.
- nurse/doctor/admin: body `{"status":"done"}` — scheduled만. **nurse가 kind가 투약/처치/검사인 건을 done 처리하면 nursing_notes 자동 삽입**(patient_id, nurse_id=본인, note_type: 투약→투약, 처치→처치, 검사→간호기록, content "{kind} 수행 완료"). 응답 `{"ok":true}`.

### 1-4. GET /api/encounters?page=1&patient_id=
- doctor/nurse/admin: 전체(또는 patient_id 필터), 20건/page, 최신순, `visited_at <= now()` 필터 적용.
- patient: 본인만(patient_id 무시).
- 응답: `{"total":181,"page":1,"rows":[{"date":"2026.07.24","time":"08:30","patient":"김철수","department":"가정의학과","dx":"고혈압, 골다공증","doctor":"홍길동 원장","note":"DEXA 검사 결과 상담 예정"}]}` (patient 조회 시 "patient" 키 생략)

### 1-5. 환자 본인 데이터 (patient; doctor/nurse/admin은 `?patient_id=` 지정 가능)
- GET /api/lab-results → `{"rows":[{"date":"2026.06.15","test":"DEXA T-score","value":"-2.6","ref":"≥ -1.0","flag":"L"}]}` (최신순 50)
- GET /api/prescriptions → `{"rows":[{"drug":"Amlodipine 5mg","dosage":"1일 1회, 아침 식후","start":"2026.05.02","end":"","active":true}]}` (활성 우선, 최신순)
- GET /api/vitals → `{"rows":[{"date":"2026.07.23","time":"09:00","systolic":120,"diastolic":80,"glucose":98,"weight":72,"bmi":23.6}]}` (최신순 20)
- GET /api/bills → `{"unpaid":45000,"rows":[{"id":3,"date":"2026.07.21","item":"혈액검사 비용","amount":45000,"paid":false}]}` (최신순 20)
- PATCH /api/bills/:id body `{"paid":true}` — patient 본인 미납 건만 → `{"ok":true}` (데모 수납 처리)

### 1-6. 서류 워크플로
- GET /api/documents?status=requested|issued|rejected|processed|all&page=1 (processed = issued+rejected)
  - doctor/nurse/admin: 전체 → `{"total":10,"rows":[{"id":4,"patient":"김철수","type":"진단서","date":"2026.07.22","status":"requested","statusLabel":"신청됨"}]}`
  - patient: 본인 전체(patient 키 생략)
- PATCH /api/documents/:id body `{"status":"issued"}` 또는 `{"status":"rejected"}` — doctor/nurse/admin, requested 건만 → `{"ok":true}`

### 1-7. 입·퇴원 (nurse, doctor, admin)
- GET /api/admissions?ward= → `{"rows":[{"id":1,"room":"1205호","ward":"내과 병동","patient":"김철수","sex":"M","age":45,"admittedAt":"2026.07.20","dischargeDue":"2026.07.25","status":"admitted","statusLabel":"입원 중"}]}` (병실순; statusLabel: admitted→입원 중, discharged→퇴원. dischargeDue가 오늘~내일이면 statusLabel "퇴원 예정")
- POST /api/admissions body `{"patient_id":2,"room":"1210호","ward":"내과 병동","discharge_due":"2026-08-01"}`(discharge_due 선택) → 201. 이미 admitted 상태면 409.
- PATCH /api/admissions/:id body `{"status":"discharged"}` 또는 `{"discharge_due":"YYYY-MM-DD"}` → `{"ok":true}`

### 1-8. 간호 기록 (nurse, admin)
- GET /api/nursing-notes?type=&page=1 → `{"total":580,"rows":[{"date":"2026.07.24","time":"09:10","patient":"김철수","room":"1205호","type":"활력징후","content":"BP 125/80 …","nurse":"김나연"}]}` (20/page, 최신순, type 필터는 note_type enum)
- POST /api/nursing-notes body `{"patient_id":2,"note_type":"간호기록","content":"…"}` → 201 `{"ok":true}`

### 1-9. 메모 (nurse, admin)
- GET /api/memos?limit=50 → `{"rows":[{"date":"2026.07.24","time":"09:15","text":"…","author":"홍길동 의사"}]}`

### 1-10. 통계
- GET /api/stats/doctor (doctor/admin) → `{"month":"2026년 7월","encounters":253,"noShow":1,"byKind":[{"kind":"진료","count":140}],"daily":[{"day":1,"count":9}…이번 달 전일]}` (byKind: 이번 달 appointments kind별)
- GET /api/stats/nurse (nurse/admin) → `{"month":"2026년 7월","notesByType":[{"type":"활력징후","count":224}],"safety":{"fall":0,"sore":0,"medError":0,"infection":1},"admitted":24,"dischargedThisMonth":0,"doneToday":0}`

### 1-11. POST /api/me/password (전 역할)
body `{"current":"…","next":"…"}` → current 불일치 400 "현재 비밀번호가 올바르지 않습니다.", next 8자 미만 400, 성공 `{"ok":true}`.

## 2. 역할별 뷰 정의 (메뉴 data-view → 구성)

### 의사 (doctor.js)
| data-view | 메뉴 | 구성 |
|---|---|---|
| dashboard | 대시보드 | 기존 P4 콘텐츠 |
| search | 환자 검색 | 검색창 + 결과 목록(이름/pid/성별·나이/진단) → 행 클릭 시 상세(EMR 표: 진단·처방·바이탈·검사 + "AI 요약 생성" 버튼 = P4 스트리밍 로직 재사용). 초기엔 q 없이 20명 |
| schedule | 진료 일정 | 날짜 내비(◀ 오늘 ▶ + input date) + 1-2 rows 표. 상태 뱃지 |
| records | 진료 기록 | 1-4 표(환자/진료과/진단/메모) + 페이지네이션 |
| ai-summary | AI 환자 요약 | 환자 검색(1-1) + 선택 환자 EMR 요약 스트리밍(대시보드 카드의 확장판) |
| ai-doc | AI 자동 문서화 | C 안내 패널 |
| billing | 수가 청구 도우미 | C 안내 패널 (ThymeCare) |
| drug | 약물/상호작용 | 환자 선택 → 활성 처방 목록 + "AI 상호작용 검토" 버튼 → 처방 목록을 프롬프트로 LLM 스트리밍("다음 약물들의 상호작용·주의사항을 요약해줘: …") |
| docs | 서류/문서 관리 | 탭(신청됨/처리 완료) + 1-6 표 + 행별 [발급][반려] 버튼 → PATCH → 재조회 |
| stats | 통계/리포트 | 1-10: 숫자 카드(총 진료/No-Show) + kind별 표 + 일별 CSS 미니 바차트(div 높이) |
| settings | 설정 | 내 정보(이름/아이디/역할/진료과) + 비밀번호 변경 폼(1-11) |
- 핵심 기능 카드 연결: SageFM→#view-ai-summary, AI 자동 문서화→#view-ai-doc, 수가 청구→#view-billing, 약물→#view-drug, MintNote/ThymeCare/Rosemary→C 안내 뷰 없이 그대로(#) 두되 클릭 시 토스트 "외부 제품 데모 영역입니다".

### 간호사 (nurse.js)
| data-view | 메뉴 | 구성 |
|---|---|---|
| dashboard | 대시보드 | 기존 |
| search | 환자 검색 | 의사와 동일 뷰(AI 버튼 제외) |
| admission | 입·퇴원 관리 | 1-7 표 + [퇴원 처리] 버튼 + 상단 "신규 입원" 폼(환자 검색 선택+병실+병동+퇴원예정일) → POST |
| schedule | 진료 일정 | 날짜 내비 + scope=ward 표(병실 포함) |
| meds | 투약 관리 | 오늘 kind=투약 목록(1-2 ward에서 필터) + 행별 [투약 완료] → PATCH done → 자동 간호기록 안내 토스트 |
| tests | 검사/처치 관리 | 오늘 kind∈{검사,처치} 목록 + [완료 처리] 동일 패턴 |
| notes | 간호 기록 | 유형 필터 + 1-8 표 + "새 기록" 폼(환자 선택/유형/내용) → POST |
| docs | 서류 요청 관리 | 의사 docs 뷰와 동일(발급/반려) |
| memo | 공지/메모 | 1-9 전체 목록 + 작성(기존 POST /api/memos) |
| stats | 통계/리포트 | 1-10 nurse: 유형별 기록 표 + 안전지표 + 입원 현황 숫자 카드 |
| settings | 설정 | 비밀번호 변경 |
- 간호 업무 바로가기 10카드 → 대응 뷰(환자 상태 기록→notes, 투약→meds, 검사→tests, 처치→tests, 입퇴원→admission, 간호 기록→notes, 공지/메모→memo). 낙상 관리·간호 계획·교육 자료는 C 안내 뷰 `etc`(공용 안내 패널, 제목만 바꿔 표시).

### 환자 (patient.js)
| data-view | 메뉴 | 구성 |
|---|---|---|
| home | 홈 | 기존 |
| appt | 진료 예약 | 다가오는 예약 표(1-2 self, [예약 취소] → PATCH cancelled) + 지난 예약 + "새 예약" 버튼(기존 P4 모달 재사용) |
| records | 진료 기록 | 1-4 본인 표 + 페이지네이션 |
| labs | 검사 결과 | 1-5 lab-results 표 (flag L/H는 붉은/파란 강조) |
| meds | 처방 약/복약 정보 | 1-5 prescriptions 표(복용 중/종료 뱃지) |
| docs | 서류 발급/신청 | 신청 카드 5종(기존 로직 재사용) + 전체 내역 표(신청됨/발급완료/반려 뱃지) |
| bills | 수납/결제 내역 | 미납 합계 카드 + 1-5 bills 표 + 미납 행 [수납하기(데모)] → PATCH paid → 재조회 |
| health | 건강 정보 | 1-5 vitals 표 + 최근 혈압/혈당 CSS 미니 바 추이 |
| family | 가족 건강 관리 | C 안내 패널 |
| notice | 공지사항 | C: 정적 공지 2~3건(점검 안내·이용 안내 등 하드코딩) |
- 주요 서비스 바로가기 5카드 → #view-appt / #view-records / #view-labs / #view-meds / #view-docs.

## 3. C(안내 패널) 공용 형식
`.card` 안에 아이콘+제목+설명 2문장+관련 링크. 카피 예: "AI 자동 문서화는 MintNote 제품 영역입니다. 데모 영상에서 음성 기반 EMR 자동 작성을 확인해 보세요." (의사 billing→ThymeCare, 환자 family→"차기 업데이트 예정")

## 4. 대시보드 "전체 보기 ›" 링크 매핑
- 의사: 나의 일정→#view-schedule, 서류 요청→#view-docs, 최근 조회 환자 '전체 보기'→#view-search, SageFM 요약 '더 보기'→#view-ai-summary
- 간호사: 담당 환자→#view-admission, 서류→#view-docs, 메모→#view-memo, 최근 기록→#view-notes, 병동 현황→#view-admission, 주요 알림→#view-schedule
- 환자: 나의 일정→#view-appt, 진료 기록→#view-records, 복약 안내→#view-meds, 발급 내역→#view-docs, 진료비/결제→#view-bills, 건강 정보→#view-health

## 5. 시드 보강 (db/seed-emr.js)
- patient1 미납 bill 1건 추가: D-3, item "혈액검사 비용", 45,000원, paid=false (자연키: patient+item+날짜, 멱등 유지).
- 이에 따라 P4 환자 대시보드 unpaid=45000으로 변동(정상).
