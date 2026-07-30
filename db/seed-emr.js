// ============================================================
// Basil Nexus — P4 EMR 시드 (docs/API-CONTRACT-P4.md §8 보장 사항)
// 사용법: node db/migrate.js 적용 후  node db/seed-emr.js
//
// 원칙:
//  - 모든 날짜는 실행 시점 기준 상대 날짜(D+0, D+7, D-56, 이번 달 1일 ...)
//  - 멱등: 자연키 존재 검사 후 없을 때만 INSERT. DELETE/UPDATE 없음
//    (재실행 안전, 사용자 생성 데이터 보존). 같은 날 재실행 시 행 수 불변.
//  - 통계용 encounters는 결정적 타임스탬프(이번 달 1~28일, 매일 09~17시 정시)
//  - users/sessions는 절대 쓰지 않는다(읽기 전용). patient1의 patients 행은
//    기존 행(user_id 연결)을 확인 후 재사용.
// ============================================================
const { Pool } = require('pg');
const cfg = require('../db.config.json');

const pool = new Pool(cfg);
const stats = {}; // { entity: { inserted, skipped } }
function tally(entity, didInsert) {
  const s = (stats[entity] ||= { inserted: 0, skipped: 0 });
  didInsert ? s.inserted++ : s.skipped++;
}

// ── 날짜 헬퍼 (전부 실행 시점 기준 상대) ─────────────────────
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
function at(dayOffset, hh = 0, mm = 0) { // 오늘 + dayOffset일 hh:mm (로컬)
  return new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + dayOffset, hh, mm, 0, 0);
}
function monthDay(day, hh = 0, mm = 0) { // 이번 달 day일 hh:mm
  return new Date(TODAY.getFullYear(), TODAY.getMonth(), day, hh, mm, 0, 0);
}
function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// 오늘 기준 만나이 age가 되도록 생년월일 역산(월일 고정 → 연도 계산)
function birthFor(age, mm, dd) {
  const passed = mm < TODAY.getMonth() + 1 || (mm === TODAY.getMonth() + 1 && dd <= TODAY.getDate());
  const y = TODAY.getFullYear() - age - (passed ? 0 : 1);
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
// 달력 날짜별 안정 회전 인덱스(실행일이 달라도 같은 달력 날짜엔 같은 배정)
function epochDay(dayOffset) { return Math.floor(at(dayOffset, 12).getTime() / 86400000); }

// ── ensure 헬퍼: 자연키 존재 검사 후 INSERT ──────────────────
async function ensure(entity, checkSql, checkParams, insertSql, insertParams) {
  const r = await pool.query(checkSql, checkParams);
  if (r.rows.length) { tally(entity, false); return r.rows[0].id; }
  const w = await pool.query(insertSql, insertParams);
  tally(entity, true);
  return w.rows[0] ? w.rows[0].id : null;
}

const ensurePatient = (name, birth, sex, phone, address) => ensure('patients',
  `SELECT id FROM patients WHERE name=$1 AND user_id IS NULL`, [name],
  `INSERT INTO patients (name, birth_date, sex, phone, address) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
  [name, birth, sex, phone, address]);

const ensureAdmission = (pid, room, ward, admittedAt, dischargeDue) => ensure('admissions',
  `SELECT id FROM admissions WHERE patient_id=$1 AND status='admitted'`, [pid],
  `INSERT INTO admissions (patient_id, room, ward, admitted_at, discharge_due, status)
   VALUES ($1,$2,$3,$4,$5,'admitted') RETURNING id`,
  [pid, room, ward, admittedAt, dischargeDue]);

const ensureAppt = (pid, when, doctorId, department, kind, status = 'scheduled') => ensure('appointments',
  `SELECT id FROM appointments WHERE patient_id=$1 AND scheduled_at=$2`, [pid, when],
  `INSERT INTO appointments (patient_id, doctor_id, scheduled_at, department, kind, status)
   VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
  [pid, doctorId, when, department, kind, status]);

const ensureEncounter = (pid, when, doctorId, department, cc, note) => ensure('encounters',
  `SELECT id FROM encounters WHERE patient_id=$1 AND visited_at=$2`, [pid, when],
  `INSERT INTO encounters (patient_id, doctor_id, visited_at, visit_type, department, chief_complaint, note)
   VALUES ($1,$2,$3,'outpatient',$4,$5,$6) RETURNING id`,
  [pid, doctorId, when, department, cc, note]);

const ensureDx = (pid, encId, name, code, diagnosedAt) => ensure('diagnoses',
  `SELECT id FROM diagnoses WHERE patient_id=$1 AND name=$2`, [pid, name],
  `INSERT INTO diagnoses (encounter_id, patient_id, name, code, diagnosed_at)
   VALUES ($1,$2,$3,$4,$5) RETURNING id`,
  [encId, pid, name, code, diagnosedAt]);

const ensureRx = (pid, encId, drug, dosage, startDate) => ensure('prescriptions',
  `SELECT id FROM prescriptions WHERE patient_id=$1 AND drug_name=$2`, [pid, drug],
  `INSERT INTO prescriptions (encounter_id, patient_id, drug_name, dosage, start_date, active)
   VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id`,
  [encId, pid, drug, dosage, startDate]);

const ensureVitals = (pid, measuredAt, sys, dia, glucose, weight, bmi) => ensure('vitals',
  `SELECT id FROM vitals WHERE patient_id=$1 AND systolic=$2 AND diastolic=$3
     AND glucose=$4 AND weight_kg=$5 AND bmi=$6`, [pid, sys, dia, glucose, weight, bmi],
  `INSERT INTO vitals (patient_id, measured_at, systolic, diastolic, glucose, weight_kg, bmi)
   VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
  [pid, measuredAt, sys, dia, glucose, weight, bmi]);

const ensureLab = (pid, testedAt, test, value, ref, flag) => ensure('lab_results',
  `SELECT id FROM lab_results WHERE patient_id=$1 AND test_name=$2`, [pid, test],
  `INSERT INTO lab_results (patient_id, tested_at, test_name, value, ref_range, flag)
   VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
  [pid, testedAt, test, value, ref, flag]);

const ensureDoc = (pid, docType, requestedAt) => ensure('documents',
  `SELECT id FROM documents WHERE patient_id=$1 AND doc_type=$2`, [pid, docType],
  `INSERT INTO documents (patient_id, doc_type, requested_at, status)
   VALUES ($1,$2,$3,'requested') RETURNING id`,
  [pid, docType, requestedAt]);

const ensureNote = (pid, nurseId, noteType, content, when) => ensure('nursing_notes',
  `SELECT id FROM nursing_notes WHERE patient_id=$1 AND note_type=$2 AND created_at::date=$3::date`,
  [pid, noteType, when],
  `INSERT INTO nursing_notes (patient_id, nurse_id, note_type, content, created_at)
   VALUES ($1,$2,$3,$4,$5) RETURNING id`,
  [pid, nurseId, noteType, content, when]);

const ensureMemo = (authorId, targetRole, content, when) => ensure('memos',
  `SELECT id FROM memos WHERE author_id=$1 AND content=$2`, [authorId, content],
  `INSERT INTO memos (author_id, target_role, content, created_at)
   VALUES ($1,$2,$3,$4) RETURNING id`,
  [authorId, targetRole, content, when]);

const ensureBill = (pid, billedAt, item, amount, paid) => ensure('bills',
  `SELECT id FROM bills WHERE patient_id=$1 AND item=$2 AND amount=$3`, [pid, item, amount],
  `INSERT INTO bills (patient_id, billed_at, item, amount, paid)
   VALUES ($1,$2,$3,$4,$5) RETURNING id`,
  [pid, billedAt, item, amount, paid]);

const ensureSafety = (pid, eventType, occurredAt) => ensure('safety_events',
  `SELECT id FROM safety_events WHERE event_type=$1
     AND date_trunc('month', occurred_at) = date_trunc('month', $2::timestamptz)`,
  [eventType, occurredAt],
  `INSERT INTO safety_events (patient_id, event_type, occurred_at)
   VALUES ($1,$2,$3) RETURNING id`,
  [pid, eventType, occurredAt]);

// ── 환자 명단 ────────────────────────────────────────────────
// 상세 5명(목업 명단·나이 일치, 생년월일은 나이 역산)
const DETAILED = [
  { name: '김철수', sex: 'M', age: 45, md: [3, 12], phone: '010-2001-1001', address: '서울특별시 송파구 올림픽로 12' },
  { name: '박영희', sex: 'F', age: 62, md: [9, 25], phone: '010-2001-1002', address: '서울특별시 강동구 천호대로 45' },
  { name: '이민수', sex: 'M', age: 30, md: [1, 8], phone: '010-2001-1003', address: '서울특별시 광진구 능동로 78' },
  { name: '최지연', sex: 'F', age: 55, md: [11, 30], phone: '010-2001-1004', address: '서울특별시 성동구 왕십리로 90' },
  { name: '정승환', sex: 'M', age: 47, md: [5, 19], phone: '010-2001-1005', address: '서울특별시 중랑구 망우로 33' },
];
// 추가 입원 환자 19명(내과 7 + 외과 12) — 이름은 시드 고유값(자연키)
const EXTRA_NAMES = [
  '강민준', '윤서연', '임도현', '한지우', '오세훈', '신유진', '배준서',           // 내과 1210~1216호
  '송하은', '문경호', '양수빈', '조현우', '백서현', '노태민', '유가은',           // 외과 1301~1307호
  '서동혁', '심예진', '권지훈', '남소율', '하진서',                               // 외과 1308~1312호
];
const EXTRA_DX = [
  ['당뇨병', 'E11.9'], ['폐렴', 'J18.9'], ['협심증', 'I20.9'], ['대퇴골 골절', 'S72.0'],
  ['만성 위염', 'K29.5'], ['천식', 'J45.9'], ['뇌경색 후유증', 'I69.3'],
  ['만성 신장병', 'N18.3'], ['간경변', 'K74.6'], ['심부전', 'I50.9'],
];

(async () => {
  // ── 0. 기존 계정 확인(읽기 전용) ───────────────────────────
  const users = {};
  for (const uname of ['doctor1', 'nurse1', 'patient1']) {
    const r = await pool.query(`SELECT id, name, profile FROM users WHERE username=$1`, [uname]);
    if (!r.rows.length) throw new Error(`users에 ${uname} 계정이 없습니다. 먼저 node db/seed.js 실행 필요`);
    users[uname] = r.rows[0];
  }
  const doctorId = users.doctor1.id;
  const nurseId = users.nurse1.id;
  const doctorDept = (users.doctor1.profile && users.doctor1.profile.department) || '가정의학과';

  const p1 = await pool.query(`SELECT id FROM patients WHERE user_id=$1`, [users.patient1.id]);
  if (!p1.rows.length) throw new Error('patients에 patient1(user_id 연결) 행이 없습니다. 먼저 node db/seed.js 실행 필요');
  const hongId = p1.rows[0].id; // 홍길동(외래 환자, 입원 없음)
  tally('patients', false);     // 기존 행 재사용

  // ── 1. 환자 생성 (상세 5 + 추가 19 = 입원 대상 24) ─────────
  const pid = {}; // name -> patients.id
  for (const d of DETAILED) {
    pid[d.name] = await ensurePatient(d.name, birthFor(d.age, d.md[0], d.md[1]), d.sex, d.phone, d.address);
  }
  for (let i = 0; i < EXTRA_NAMES.length; i++) {
    const name = EXTRA_NAMES[i];
    const age = 28 + ((i * 3) % 45);
    const mm = (i % 12) + 1;
    const dd = ((i * 7) % 27) + 1;
    pid[name] = await ensurePatient(name, birthFor(age, mm, dd), i % 2 ? 'F' : 'M',
      `010-2002-${String(1001 + i)}`, '서울특별시 강남구 테헤란로 2길');
  }
  const inpatientNames = [...DETAILED.map((d) => d.name), ...EXTRA_NAMES]; // 24명

  // ── 2. 입원 24건 (내과 병동 12: 1205~1216호 / 외과 병동 12: 1301~1312호) ──
  //     퇴원 예정(오늘~내일) 2건: 정승환(1209호), 하진서(1312호)
  for (let i = 0; i < inpatientNames.length; i++) {
    const name = inpatientNames[i];
    const ward = i < 12 ? '내과 병동' : '외과 병동';
    const room = i < 12 ? `${1205 + i}호` : `${1301 + (i - 12)}호`;
    const dueTomorrow = name === '정승환' || name === '하진서';
    await ensureAdmission(pid[name], room, ward, at(-(2 + (i % 7)), 10, 30),
      dateStr(at(dueTomorrow ? 1 : 5 + (i % 10))));
  }

  // ── 3. 외래 예약: 오늘~D+27 매일 doctor1 5건(09:00~11:00, 상세 5명) ──
  //     kind 혼합(진료2·검사1·투약1·처치1) — 검사 총 8건/일은 병동 검사 7건과 합산
  const DAILY = [
    { name: '김철수', hh: 9, mm: 0, kind: '진료' },
    { name: '박영희', hh: 9, mm: 30, kind: '검사' },
    { name: '이민수', hh: 10, mm: 0, kind: '투약' },
    { name: '최지연', hh: 10, mm: 30, kind: '처치' },
    { name: '정승환', hh: 11, mm: 0, kind: '진료' },
  ];
  const EXAM_SLOTS = [[11, 30], [13, 0], [13, 30], [14, 0], [14, 30], [15, 0], [15, 30]];
  for (let d = 0; d <= 27; d++) {
    for (const s of DAILY) {
      await ensureAppt(pid[s.name], at(d, s.hh, s.mm), doctorId, doctorDept, s.kind);
    }
    // 병동 배정(검사 7·수술 1) — 달력 날짜 기반 회전이라 실행일이 달라도 동일 배정
    const n = epochDay(d);
    for (let j = 0; j < EXAM_SLOTS.length; j++) {
      const p = inpatientNames[(n + j * 5) % 24];
      await ensureAppt(pid[p], at(d, EXAM_SLOTS[j][0], EXAM_SLOTS[j][1]), null, null, '검사');
    }
    await ensureAppt(pid[inpatientNames[(n * 7 + 3) % 24]], at(d, 8, 0), null, null, '수술');
  }
  // 이번 달 no-show 1건 (이번 달 1일 07:30 — 다른 시드 슬롯과 충돌 없음)
  await ensureAppt(pid['김철수'], monthDay(1, 7, 30), doctorId, doctorDept, '진료', 'no_show');

  // ── 4. patient1(홍길동) — 외래 환자 ─────────────────────────
  // 미래 예약 3건: D+7 10:00 진료 / D+14 09:00 검사(혈액검사) / D+21 14:00 물리치료
  await ensureAppt(hongId, at(7, 10, 0), doctorId, doctorDept, '진료');
  await ensureAppt(hongId, at(14, 9, 0), null, '진단검사의학과', '검사');
  await ensureAppt(hongId, at(21, 14, 0), null, '재활의학과', '물리치료');
  // 과거 encounter 3건 + 진단
  const e1 = await ensureEncounter(hongId, at(-56, 10, 0), doctorId, '가정의학과',
    '기침과 콧물', '감기 증상 대증 치료. 고지혈증 약물 지속 관리.');
  const e2 = await ensureEncounter(hongId, at(-99, 10, 0), doctorId, '정형외과',
    '허리 통증', '요추부 염좌 소견. 물리치료 권고.');
  const e3 = await ensureEncounter(hongId, at(-135, 10, 0), doctorId, '내과',
    '두통과 어지러움', '고혈압 진단. 약물 치료 시작.');
  await ensureDx(hongId, e1, '감기', 'J00', dateStr(at(-56)));
  await ensureDx(hongId, e1, '고지혈증', 'E78.5', dateStr(at(-56)));
  await ensureDx(hongId, e2, '허리 통증', 'M54.5', dateStr(at(-99)));
  await ensureDx(hongId, e3, '고혈압', 'I10', dateStr(at(-135)));
  // 활성 처방 3종 (목업과 동일)
  await ensureRx(hongId, e3, 'Amlodipine 5mg', '1일 1회, 아침 식후', dateStr(at(-135)));
  await ensureRx(hongId, e1, 'Atorvastatin 10mg', '1일 1회, 저녁 식후', dateStr(at(-56)));
  await ensureRx(hongId, e1, '비타민D 1000IU', '1일 1회, 아침 식후', dateStr(at(-56)));
  // 최신 바이탈(120/80·98·72kg·BMI 23.6) + 진료비(외래 진료비 25,400원 수납 완료)
  await ensureVitals(hongId, at(-1, 9, 0), 120, 80, 98, 72.0, 23.6);
  await ensureBill(hongId, dateStr(at(-1)), '외래 진료비', 25400, true);
  // P5 §5: 미납 진료비 1건(D-3, 혈액검사 비용 45,000원) — 자연키 환자+항목+금액, 멱등
  await ensureBill(hongId, dateStr(at(-3)), '혈액검사 비용', 45000, false);
  // 검진 이력(최근 검진일 표기용, D-39)
  await ensureLab(hongId, dateStr(at(-39)), '총콜레스테롤', '210', '< 200', 'H');
  await ensureLab(hongId, dateStr(at(-39)), 'LDL-C', '135', '< 130', 'H');

  // ── 5. 상세 5명 EMR (진단·처방·바이탈) ──────────────────────
  const EMR5 = {
    김철수: {
      dx: [['고혈압', 'I10', -264], ['골다공증', 'M81.9', -95]],
      rx: [['Amlodipine 5mg', '1일 1회, 아침 식후', -264], ['Alendronate 70mg', '주 1회, 아침 공복', -95]],
      vitals: [125, 80, 98, 72.0, 23.6],
    },
    박영희: {
      dx: [['당뇨병', 'E11.9', -420], ['고혈압', 'I10', -300]],
      rx: [['Metformin 500mg', '1일 2회, 아침·저녁 식후', -420]],
      vitals: [132, 84, 145, 58.5, 24.1],
    },
    이민수: {
      dx: [['위궤양', 'K25.9', -12]],
      rx: [['Pantoprazole 40mg', '1일 1회, 아침 식전', -12]],
      vitals: [118, 76, 92, 70.2, 22.9],
    },
    최지연: {
      dx: [['갑상선기능저하증', 'E03.9', -200]],
      rx: [['Levothyroxine 50mcg', '1일 1회, 아침 공복', -200]],
      vitals: [122, 78, 101, 55.0, 22.5],
    },
    정승환: {
      dx: [['협심증', 'I20.9', -150]],
      rx: [['Aspirin 100mg', '1일 1회, 아침 식후', -150]],
      vitals: [128, 82, 110, 78.4, 25.6],
    },
  };
  let vi = 0;
  for (const [name, emr] of Object.entries(EMR5)) {
    for (const [dxName, code, off] of emr.dx) await ensureDx(pid[name], null, dxName, code, dateStr(at(off)));
    for (const [drug, dosage, off] of emr.rx) await ensureRx(pid[name], null, drug, dosage, dateStr(at(off)));
    await ensureVitals(pid[name], at(0, 6, vi * 5), ...emr.vitals);
    vi++;
  }
  // 추가 환자: 진단 1건 + 바이탈 1건씩(검색·최근환자 카드 대비)
  for (let i = 0; i < EXTRA_NAMES.length; i++) {
    const name = EXTRA_NAMES[i];
    const [dxName, code] = EXTRA_DX[i % EXTRA_DX.length];
    await ensureDx(pid[name], null, dxName, code, dateStr(at(-(30 + i * 7))));
    await ensureVitals(pid[name], at(0, 7, i), 110 + ((i * 7) % 30), 68 + ((i * 5) % 20),
      85 + ((i * 11) % 60), 50 + ((i * 3) % 35), Math.round((20 + ((i * 13) % 80) / 10) * 10) / 10);
  }

  // ── 6. 통계용 encounters: 이번 달 1~28일 × 매일 09~17시 정시 = 252건 ──
  //     (결정적 타임스탬프 — 같은 달 재실행 시 동일 키. 환자는 추가 19명 회전)
  //     마지막 슬롯(28일 17:00)은 김철수 + 상담 메모(최근 환자 카드용)
  const CC = ['정기 진료', '복통', '발열', '어지러움', '기침', '두통', '요통', '흉통', '소화불량'];
  for (let day = 1; day <= 28; day++) {
    for (let h = 9; h <= 17; h++) {
      if (day === 28 && h === 17) {
        await ensureEncounter(pid['김철수'], monthDay(day, h, 0), doctorId, '내과',
          '골다공증 추적 관찰', 'DEXA 검사 결과 상담 예정');
      } else {
        const p = EXTRA_NAMES[((day - 1) * 9 + (h - 9)) % EXTRA_NAMES.length];
        await ensureEncounter(pid[p], monthDay(day, h, 0), doctorId, '내과', CC[(day + h) % CC.length], null);
      }
    }
  }
  // 김철수 최근 내원(오늘 08:30) — patientDetail.memo(최근 encounter.note)용
  await ensureEncounter(pid['김철수'], at(0, 8, 30), doctorId, '내과',
    '골다공증 추적 관찰', 'DEXA 검사 결과 상담 예정');

  // ── 7. documents: 진단서3·소견서2·의무기록 사본1·보험서류4 (원내 환자 명의) ──
  const DOCS = [
    ['김철수', '진단서'], ['박영희', '진단서'], ['이민수', '진단서'],
    ['최지연', '소견서'], ['정승환', '소견서'],
    ['김철수', '의무기록 사본'],
    ['박영희', '보험서류'], ['이민수', '보험서류'], ['최지연', '보험서류'], ['정승환', '보험서류'],
  ];
  for (let i = 0; i < DOCS.length; i++) {
    await ensureDoc(pid[DOCS[i][0]], DOCS[i][1], at(-(i % 3), 8, 30 + i * 3));
  }

  // ── 8. lab_results: 김철수 DEXA 등 + 최근 7일 내 4건(간호사 알림용) ──
  await ensureLab(pid['김철수'], dateStr(at(-39)), 'DEXA T-score', '-2.6', '≥ -1.0', 'L');
  await ensureLab(pid['김철수'], dateStr(at(-39)), '혈청 칼슘', '9.2', '8.6 ~ 10.2', null);
  await ensureLab(pid['박영희'], dateStr(at(-2)), 'HbA1c', '7.2', '< 5.7', 'H');
  await ensureLab(pid['이민수'], dateStr(at(-3)), 'CRP', '0.8', '< 0.5', 'H');
  await ensureLab(pid['최지연'], dateStr(at(-1)), 'TSH', '6.8', '0.4 ~ 4.0', 'H');
  await ensureLab(pid['정승환'], dateStr(at(-2)), '총콜레스테롤', '225', '< 200', 'H');

  // ── 9. nursing_notes: 오늘 활력징후 8·투약 6·처치 2·간호기록 1 ──
  const wardPatients = inpatientNames.slice(0, 12); // 내과 병동(1205~1216호)
  const roomOf = (i) => `${1205 + i}호`;
  for (let i = 0; i < 8; i++) {
    await ensureNote(pid[wardPatients[i]], nurseId, '활력징후',
      `${roomOf(i)} ${wardPatients[i]} 활력징후 측정 — 혈압·맥박·체온 정상 범위`, at(0, 6, i * 10));
  }
  for (let i = 0; i < 6; i++) {
    await ensureNote(pid[wardPatients[i]], nurseId, '투약',
      `${roomOf(i)} ${wardPatients[i]} 오전 경구 투약 시행`, at(0, 8, i * 10));
  }
  await ensureNote(pid['김철수'], nurseId, '처치', `1205호 김철수 드레싱 교체`, at(0, 10, 30));
  await ensureNote(pid['박영희'], nurseId, '처치', `1206호 박영희 수액 교체`, at(0, 10, 40));
  await ensureNote(pid['정승환'], nurseId, '간호기록', `1209호 정승환 퇴원 준비 교육 시행`, at(0, 11, 0));

  // ── 10. memos 3건 + safety_events 감염 1건(이번 달) ─────────
  await ensureMemo(doctorId, 'nurse', '김철수 환자 혈압 체크 후 보고', at(0, 9, 15));
  await ensureMemo(nurseId, 'nurse', '1207호 이민수 환자 수액 교체 완료했습니다.', at(0, 8, 40));
  await ensureMemo(nurseId, 'nurse', '1209호 정승환 환자 내일 퇴원 예정 — 퇴원 약 처방 확인 필요.', at(0, 7, 50));
  await ensureSafety(pid['임도현'], '감염', monthDay(1, 9, 30));

  // ── 결과 출력 ────────────────────────────────────────────────
  console.log(`seed-emr 완료 (기준일 ${dateStr(TODAY)})`);
  console.log('entity별 inserted / skipped(기존 재사용):');
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k.padEnd(14)} +${String(v.inserted).padStart(4)} / =${v.skipped}`);
  }
  const tables = ['patients', 'admissions', 'appointments', 'encounters', 'diagnoses',
    'prescriptions', 'vitals', 'lab_results', 'documents', 'nursing_notes',
    'memos', 'bills', 'safety_events'];
  const counts = [];
  for (const t of tables) {
    const r = await pool.query(`SELECT count(*)::int AS c FROM ${t}`);
    counts.push(`${t}=${r.rows[0].c}`);
  }
  console.log('테이블 행 수:', counts.join(' '));
  await pool.end();
})().catch((e) => { console.error('seed-emr 실패:', e.message); process.exit(1); });
