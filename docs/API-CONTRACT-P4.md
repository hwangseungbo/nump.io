# P4 API 계약서 (구현 에이전트 공용 스펙)

모든 에이전트는 이 문서를 단일 기준으로 삼는다. 여기 정의된 JSON 키/형식을 임의로 바꾸지 말 것.

## 0. 공통 규약

- 인증: 쿠키 `bn_session`. 미로그인 → 401 `{"error":"unauthorized"}`. 역할 불일치 → 403 `{"error":"forbidden"}` (admin은 모든 role API 허용).
- 날짜 표기(서버가 포맷해서 내려줌): `"YYYY.MM.DD"`, 요일 포함 시 `"YYYY.MM.DD (금)"`, 의사 일정 헤더는 `"YYYY년 M월 D일 (금)"`. 시간 `"HH:MM"`.
- 나이: birth_date 기준 만나이(정수).
- 환자 표시 ID(pid): `"ID " + YYYYMMDD(patients.created_at) + "-" + patients.id 3자리 0패딩` (예: `ID 20260722-002`).
- 금액: 정수(원). 클라이언트가 `toLocaleString()+"원"` 렌더링.
- doc_type 통일 enum: `진단서 | 소견서 | 의무기록 사본 | 검사결과서 | 처방전 | 보험서류 | 기타` (환자 화면 "진료기록 사본" 카드 = `의무기록 사본`).
- appointments.kind enum: `진료 | 검사 | 투약 | 처치 | 물리치료 | 수술 | 검진`.
- nursing_notes.note_type enum: `활력징후 | 투약 | 처치 | 간호기록`.
- 프론트 공통: fetch 실패(404/500/네트워크) 시 **정적 목업 내용을 그대로 유지**하고 console.warn만 남긴다(구서버 градация). DOM 구조·기존 클래스 변경 금지, 컨테이너에 id 부여와 행 재생성(기존 행과 동일 마크업)만 허용. 페이지 고유 스타일은 해당 페이지 `<head>` 내 `<style>`에만 추가.

## 1. GET /api/dashboard/doctor  (doctor, admin)

```json
{
  "todayLabel": "2026년 7월 24일 (금)",
  "sidebar": { "scheduled": 5, "waiting": 4 },
  "schedule": [
    { "time": "09:00", "name": "김철수", "sex": "M", "age": 45,
      "dx": "고혈압·골다공증", "status": "now" }
  ],
  "docRequests": [ { "type": "진단서", "count": 3 } ],
  "monthStats": { "waiting": 5, "noShow": 1, "encounters": 256 },
  "recentPatient": { "...": "patientDetail (아래 §4)" },
  "alertCount": 10
}
```
- schedule: 오늘, doctor_id=본인, 시간순. status: 첫 `scheduled` 건=`now`, 이후 `scheduled`=`wait`, `done`=`done`. dx는 해당 환자 diagnoses name을 `·`로 join.
- sidebar.scheduled: 오늘 예약 총건수, waiting: 오늘 미완료(scheduled) 건수.
- docRequests: status='requested' GROUP BY doc_type, enum 순서 고정, count>0만.
- monthStats: 이번 달 기준. waiting=오늘 미완료, noShow=이번 달 no_show, encounters=이번 달 encounters 수.
- recentPatient: 가장 최근 encounter의 환자 상세.
- alertCount: requested documents 총건수.

## 2. GET /api/dashboard/nurse  (nurse, admin)

```json
{
  "todayLabel": "2026.07.24 (금)",
  "sidebar": { "vitals": 8, "meds": 6 },
  "patientCount": 12,
  "patients": [
    { "initial": "김", "name": "김철수", "sex": "M", "age": 45, "room": "1205호",
      "dx": "고혈압, 골다공증", "tag": "검사 예정", "tagClass": "t-test", "time": "09:30" }
  ],
  "docRequests": [ { "type": "진단서", "count": 3 } ],
  "safety": { "fall": 0, "sore": 0, "medError": 0, "infection": 1 },
  "alerts": { "med": 3, "lab": 4, "care": 2, "admission": 2, "docs": 10 },
  "memos": [ { "time": "09:15", "text": "김철수 환자 혈압 체크 후 보고", "author": "홍길동 원장" } ],
  "ward": { "inpatients": 24, "dischargeDue": 2, "testsToday": 8, "surgeriesToday": 1 },
  "contacts": [ { "initial": "홍", "name": "홍길동 의사 (담당)", "phone": "010-1234-5678" } ],
  "recentNotes": [ { "label": "환자 활력징후 기록", "room": "1205호" } ],
  "alertCount": 21
}
```
- sidebar: nursing_notes 오늘 note_type 활력징후/투약 건수.
- patientCount: admissions(status='admitted') AND ward=본인 profile.ward 건수. patients: 그중 병실번호순 상위 5명. tag: 그 환자의 오늘 appointments.kind 최우선 1건 매핑 — 검사→(검사 예정,t-test), 투약→(투약 시간,t-med), 처치→(처치 예정,t-care), 그 외/없음→null(태그 미표시). time: 해당 예약 시간.
- safety: 이번 달 safety_events 유형별. alerts: med=오늘 kind=투약 예약수, lab=최근 7일 lab_results 수, care=오늘 kind=처치 예약수, admission=discharge_due가 오늘~내일 admissions 수, docs=requested documents 수. alertCount=합계.
- memos: 최근 3건(author=users.name+' '+역할한글). ward.inpatients=admitted 전체, dischargeDue, testsToday=오늘 kind=검사, surgeriesToday=오늘 kind=수술.
- contacts: role=doctor users → {initial:성, name:"이름 의사 (담당)", phone:profile.phone||'-'} + 고정 2행(주치의 당직 02-123-1111, 수간호사 010-9876-5432)은 서버가 배열에 포함해 반환.
- recentNotes: nursing_notes 최근 5건, label="환자 "+note_type+" 기록"(활력징후→"환자 활력징후 기록", 투약→"환자 투약 후 기록", 처치→"환자 처치 기록", 간호기록→"환자 간호 기록 작성"), room=해당 환자 admissions.room.
- 오늘 일정 패널(라운딩 등)은 정적 유지, 날짜 헤더만 todayLabel로 갱신.

## 3. GET /api/dashboard/patient  (patient, admin)

```json
{
  "profile": { "name": "홍길동", "birth": "1980.05.15", "age": 46, "sexLabel": "남",
               "phone": "010-1234-5678", "email": "honggd@example.com", "address": "…" },
  "nextAppt": { "dateLabel": "2026.07.31 (금) 10:00", "meta": "가정의학과 / 홍길동 원장", "dday": 7 },
  "upcoming": [ { "date": "2026.08.07 (금)", "time": "09:00", "label": "혈액검사" } ],
  "encounters": [ { "date": "2026.05.28", "department": "가정의학과", "dx": "감기, 고지혈증", "doctor": "홍길동 원장" } ],
  "meds": [ { "name": "Amlodipine 5mg", "dosage": "1일 1회, 아침 식후" } ],
  "docs": [ { "type": "진단서", "date": "2026.07.24", "status": "requested", "statusLabel": "신청됨" } ],
  "bills": { "unpaid": 0, "rows": [ { "date": "2026.07.23", "item": "외래 진료비", "amount": 25400 } ] },
  "health": { "bp": "120 / 80", "glucose": 98, "weight": 72, "bmi": 23.6, "bmiLabel": "정상", "lastCheck": "2026.06.15" },
  "alertCount": 2
}
```
- nextAppt: 미래 첫 예약(없으면 null → 패널 정적 유지). dday=일수. upcoming: 그다음 3건, label=kind 그대로(단 '진료'는 "정기 진료"로 표기).
- encounters: 최근 3건 (dx=그 encounter의 diagnoses join ", "). meds: active prescriptions. docs: 본인 documents 최근 5건(statusLabel: requested→신청됨, issued→발급완료, rejected→반려).
- bills: unpaid=미납 합계, rows 최근 3건. health: 최신 vitals 1건(bmiLabel: <18.5 저체중, <23 정상, <25 과체중, ≥25 비만), lastCheck=최근 lab_results.tested_at 또는 encounter 날짜.
- alertCount: requested 상태 본인 서류 수 + 7일 내 예약 수.

## 4. GET /api/patients?q=…  (doctor, nurse, admin)

`{"results":[ patientDetail, … ]}` — 이름 부분일치(ILIKE) 또는 pid 숫자 일치, 최대 5명.

patientDetail:
```json
{ "id": 2, "name": "김철수", "sex": "M", "age": 45, "pid": "ID 20260722-002",
  "dx": "고혈압, 골다공증", "rx": "Amlodipine 5mg 외 1종", "lastVisit": "2026.07.24",
  "memo": "DEXA 검사 결과 상담 예정",
  "emr": {
    "diagnoses": [ { "name": "고혈압", "code": "I10", "date": "2025.11.02" } ],
    "prescriptions": [ { "drug": "Amlodipine 5mg", "dosage": "1일 1회, 아침 식후", "active": true } ],
    "vitals": [ { "date": "2026.07.20", "systolic": 125, "diastolic": 80, "glucose": 98, "weight": 72, "bmi": 23.6 } ],
    "labs": [ { "date": "2026.06.15", "test": "DEXA T-score", "value": "-2.6", "ref": "≥ -1.0", "flag": "L" } ]
  } }
```
- rx: 활성 처방 첫 약 + (n-1 있으면 `" 외 n종"`). memo: 최근 encounter.note (없으면 ""). vitals 최근 3, labs 최근 5.

## 5. 쓰기 API

- `POST /api/documents` (patient) body `{"doc_type":"진단서"}` → 201 `{"ok":true,"doc":{"type","date","status":"requested","statusLabel":"신청됨"}}`. enum 외 400.
- `POST /api/appointments` (patient) body `{"date":"2026-08-05","time":"10:30","kind":"진료"}` → 201 `{"ok":true}`. 과거·형식오류 400. doctor_id=role=doctor 첫 사용자, department=그 의사 profile.department.
- `POST /api/memos` (nurse, admin) body `{"content":"…"}` → 201 `{"ok":true,"memo":{"time":"HH:MM","text","author"}}`. 빈 내용 400.

## 6. GET /api/health  (로그인 사용자)

`{"db":true,"llm":true,"backup":"정상","security":"안전"}` — db: `SELECT 1` 성공 여부. llm: 165.132.220.115:5096 TCP 연결(타임아웃 1초) 성공 여부. 실패 시 false → 프론트는 해당 항목 "점검 필요" + 값 색상만 붉게(페이지 내 스타일).

## 7. AI 환자 요약 (의사 화면, 프론트 구현)

- "SageFM 환자 요약" 카드에 "AI 요약 생성" 버튼 추가(기존 마크업 유지, 버튼은 summary-foot 영역).
- 클릭 → 현재 표시 중인 환자의 patientDetail.emr을 텍스트로 직렬화해 `/api/medgemma-chat`에 `{session_id:"bn-sum-"+랜덤, message: 프롬프트+데이터}` 전송, SSE 스트리밍(`d.delta ?? d.content`)을 카드 본문에 marked+DOMPurify로 렌더, 완료 후 KaTeX typeset (ai.js 패턴 참조, ai.js 수정 금지).
- 프롬프트: "다음 환자의 EMR 데이터를 근거로 주치의용 요약을 한국어 불릿 4~5개로 작성. 수치 변화와 다음 진료 권고 포함." + JSON 직렬화 데이터.

## 8. 시드 보장 사항 (db/seed-emr.js가 만들어 두는 것)

- 환자 24명 admitted (내과 병동 12명: 1205~1216호 — 상세 5명은 김철수/박영희/이민수/최지연/정승환 1205~1209호, 홍길동(patient1)은 외래 환자로 입원 없음).
- 오늘~D+27 매일: doctor1 외래 예약 5건(09:00~11:00, 상세 5명, kind 진료/검사/투약/처치 혼합), 검사 8건·수술 1건 분배.
- patient1(홍길동): 미래 예약 D+7 10:00 진료, D+14 09:00 검사(혈액검사), D+21 14:00 물리치료. 과거 encounter 3건(가정의학과 감기·고지혈증 / 정형외과 허리 통증 / 내과 고혈압) + 진단·처방(Amlodipine 5mg, Atorvastatin 10mg, 비타민D 1000IU 활성) + vitals(120/80, 98, 72kg, 23.6) + bills(외래 진료비 25,400원 paid).
- documents: 진단서3·소견서2·의무기록 사본1·보험서류4 requested (원내 환자 명의).
- 이번 달 encounters ~250건(통계용, 결정적 타임스탬프), no_show 1건.
- memos 3건, safety_events 감염 1건, lab_results(김철수 DEXA T-score -2.6 등), nursing_notes 오늘 활력징후·투약 다수.
- 멱등: 자연키 존재 검사 후 삽입(중복 없이 재실행 가능, 사용자 생성 데이터 보존).
