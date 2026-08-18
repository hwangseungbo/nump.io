// ============================================================
// Basil Nexus — 데모 확장 시드 (계정 5×3 + 대량 EMR/예약 데이터)
// 사용법: node db/seed.js && node db/seed-emr.js 적용 후  node db/seed-demo2.js
//
// 내용:
//  - 의사 doctor2~5 / 간호사 nurse2~5 계정 (비번은 역할 공통: doctor1234/nurse1234)
//  - 환자 계정 patient2~5 — 기존 환자(김철수·박영희·이민수·최지연)에 연결
//  - 외래 환자 30명 추가 (진단·처방·바이탈·검사·진료비 포함)
//  - 외래 예약: 오늘~9월 말 평일, 의사 5명 × 하루 5~9건 (종류 혼합)
//  - 과거 4주 예약 이력 (done/cancelled/no_show 혼합)
//  - 과거 진료(encounters)·간호기록·서류·입퇴원 이력 확충
//
// 원칙 (seed-emr.js와 동일):
//  - 날짜는 실행 시점 기준 상대 (예약 종료일만 2026-09-30 목표, 지나면 D+56)
//  - 멱등: 자연키 존재 검사 후 없을 때만 INSERT (재실행 안전)
//  - 기존 행 UPDATE는 "미연결 환자 ← 계정 연결" 한 가지뿐
// ============================================================
const { Pool } = require('pg');
const crypto = require('crypto');
const cfg = require('../db.config.json');

const pool = new Pool(cfg);
const stats = {};
function tally(entity, didInsert) {
  const s = (stats[entity] ||= { inserted: 0, skipped: 0 });
  didInsert ? s.inserted++ : s.skipped++;
}
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + '$' + crypto.scryptSync(pw, salt, 64).toString('hex');
}

// ── 날짜 헬퍼 ────────────────────────────────────────────────
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
function at(dayOffset, hh = 0, mm = 0) {
  return new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + dayOffset, hh, mm, 0, 0);
}
function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function birthFor(age, mm, dd) {
  const passed = mm < TODAY.getMonth() + 1 || (mm === TODAY.getMonth() + 1 && dd <= TODAY.getDate());
  const y = TODAY.getFullYear() - age - (passed ? 0 : 1);
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
function epochDay(dayOffset) { return Math.floor(at(dayOffset, 12).getTime() / 86400000); }
// 예약 종료일: 2026-09-30, 이미 지났으면 D+56
const SEED_END = new Date(2026, 8, 30);
const END_OFFSET = Math.max(56, Math.round((SEED_END - TODAY) / 86400000));

// ── ensure 헬퍼 ──────────────────────────────────────────────
async function ensure(entity, checkSql, checkParams, insertSql, insertParams) {
  const r = await pool.query(checkSql, checkParams);
  if (r.rows.length) { tally(entity, false); return r.rows[0].id; }
  const w = await pool.query(insertSql, insertParams);
  tally(entity, true);
  return w.rows[0] ? w.rows[0].id : null;
}
const ensureUser = async (username, password, name, role, profile) => {
  const r = await pool.query(`SELECT id FROM users WHERE username=$1`, [username]);
  if (r.rows.length) { tally('users', false); return r.rows[0].id; }
  const w = await pool.query(
    `INSERT INTO users (username, password_hash, name, role, profile) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [username, hashPassword(password), name, role, JSON.stringify(profile)]);
  tally('users', true);
  return w.rows[0].id;
};
const ensurePatient = (name, birth, sex, phone, address) => ensure('patients',
  `SELECT id FROM patients WHERE name=$1 AND user_id IS NULL`, [name],
  `INSERT INTO patients (name, birth_date, sex, phone, address) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
  [name, birth, sex, phone, address]);
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
const ensureDx = (pid, name, code, diagnosedAt) => ensure('diagnoses',
  `SELECT id FROM diagnoses WHERE patient_id=$1 AND name=$2`, [pid, name],
  `INSERT INTO diagnoses (patient_id, name, code, diagnosed_at) VALUES ($1,$2,$3,$4) RETURNING id`,
  [pid, name, code, diagnosedAt]);
const ensureRx = (pid, drug, dosage, startDate, active = true) => ensure('prescriptions',
  `SELECT id FROM prescriptions WHERE patient_id=$1 AND drug_name=$2`, [pid, drug],
  `INSERT INTO prescriptions (patient_id, drug_name, dosage, start_date, active)
   VALUES ($1,$2,$3,$4,$5) RETURNING id`,
  [pid, drug, dosage, startDate, active]);
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
const ensureDoc = (pid, docType, requestedAt, status = 'requested') => ensure('documents',
  `SELECT id FROM documents WHERE patient_id=$1 AND doc_type=$2`, [pid, docType],
  `INSERT INTO documents (patient_id, doc_type, requested_at, status)
   VALUES ($1,$2,$3,$4) RETURNING id`,
  [pid, docType, requestedAt, status]);
const ensureNote = (pid, nurseId, noteType, content, when) => ensure('nursing_notes',
  `SELECT id FROM nursing_notes WHERE patient_id=$1 AND nurse_id=$2 AND note_type=$3 AND created_at::date=$4::date`,
  [pid, nurseId, noteType, when],
  `INSERT INTO nursing_notes (patient_id, nurse_id, note_type, content, created_at)
   VALUES ($1,$2,$3,$4,$5) RETURNING id`,
  [pid, nurseId, noteType, content, when]);
const ensureBill = (pid, billedAt, item, amount, paid) => ensure('bills',
  `SELECT id FROM bills WHERE patient_id=$1 AND item=$2 AND amount=$3`, [pid, item, amount],
  `INSERT INTO bills (patient_id, billed_at, item, amount, paid) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
  [pid, billedAt, item, amount, paid]);
const ensureAdmission = (pid, room, ward, admittedAt, dischargeDue, status = 'admitted') => ensure('admissions',
  `SELECT id FROM admissions WHERE patient_id=$1 AND status=$2`, [pid, status],
  `INSERT INTO admissions (patient_id, room, ward, admitted_at, discharge_due, status)
   VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
  [pid, room, ward, admittedAt, dischargeDue, status]);
const ensureMemo = (authorId, targetRole, content, when) => ensure('memos',
  `SELECT id FROM memos WHERE author_id=$1 AND content=$2`, [authorId, content],
  `INSERT INTO memos (author_id, target_role, content, created_at) VALUES ($1,$2,$3,$4) RETURNING id`,
  [authorId, targetRole, content, when]);
const ensureSafety = (pid, eventType, occurredAt) => ensure('safety_events',
  `SELECT id FROM safety_events WHERE event_type=$1
     AND date_trunc('month', occurred_at) = date_trunc('month', $2::timestamptz)`,
  [eventType, occurredAt],
  `INSERT INTO safety_events (patient_id, event_type, occurred_at) VALUES ($1,$2,$3) RETURNING id`,
  [pid, eventType, occurredAt]);

// ── 데이터 정의 ──────────────────────────────────────────────
const DOCTORS = [ // doctor1(홍성민·가정의학과)은 기존 계정
  { username: 'doctor2', name: '김서준', dept: '내과',         title: '과장' },
  { username: 'doctor3', name: '이하은', dept: '정형외과',     title: '과장' },
  { username: 'doctor4', name: '박민재', dept: '소아청소년과', title: '전문의' },
  { username: 'doctor5', name: '최유진', dept: '재활의학과',   title: '과장' },
];
const NURSES = [ // nurse1(김나연·내과 병동)은 기존 계정
  { username: 'nurse2', name: '박지민', ward: '외과 병동' },
  { username: 'nurse3', name: '이수아', ward: '내과 병동' },
  { username: 'nurse4', name: '정다은', ward: '외과 병동' },
  { username: 'nurse5', name: '한예린', ward: '내과 병동' },
];
// 환자 계정 — 기존 미연결 환자(EMR 보유)에 연결
const PATIENT_ACCTS = [
  { username: 'patient2', link: '김철수' },
  { username: 'patient3', link: '박영희' },
  { username: 'patient4', link: '이민수' },
  { username: 'patient5', link: '최지연' },
];
// 신규 외래 환자 30명 (기존 25명과 이름 미중복)
const NEW_PATIENTS = [
  '김도윤', '이서아', '박시우', '최하준', '정예은', '강지호', '조은우', '윤채원', '장민서', '임주원',
  '한서율', '오지안', '서준호', '신아린', '권태양', '황미경', '안성민', '송정자', '전영철', '홍순옥',
  '류재상', '나영순', '진광호', '엄정순', '채병철', '원미자', '방성호', '석순남', '여준영', '국선희',
];
const NEW_AGES = [7, 34, 12, 45, 9, 52, 28, 38, 14, 61, 26, 8, 47, 31, 55, 68, 42, 74, 66, 71, 49, 63, 58, 77, 53, 69, 36, 79, 23, 65];
const ADDRESSES = [
  '서울특별시 송파구 백제고분로 21', '서울특별시 강동구 성내로 8', '서울특별시 광진구 아차산로 55',
  '서울특별시 성동구 마장로 102', '경기도 하남시 미사대로 77', '경기도 성남시 분당구 판교로 33',
  '서울특별시 중랑구 면목로 61', '서울특별시 동대문구 전농로 19', '경기도 구리시 경춘로 88',
];
const DX_POOL = [
  ['고혈압', 'I10'], ['당뇨병', 'E11.9'], ['고지혈증', 'E78.5'], ['알레르기 비염', 'J30.4'],
  ['아토피 피부염', 'L20.9'], ['역류성 식도염', 'K21.0'], ['편두통', 'G43.9'], ['무릎 관절증', 'M17.9'],
  ['회전근개 증후군', 'M75.1'], ['요추 추간판 탈출증', 'M51.2'], ['중이염', 'H66.9'], ['결막염', 'H10.9'],
  ['빈혈', 'D64.9'], ['통풍', 'M10.9'], ['골감소증', 'M85.8'],
];
const RX_POOL = [
  ['Amlodipine 5mg', '1일 1회, 아침 식후'], ['Metformin 500mg', '1일 2회, 아침·저녁 식후'],
  ['Atorvastatin 20mg', '1일 1회, 저녁 식후'], ['Loratadine 10mg', '1일 1회, 취침 전'],
  ['Omeprazole 20mg', '1일 1회, 아침 식전'], ['Ibuprofen 400mg', '1일 3회, 식후'],
  ['Levocetirizine 5mg', '1일 1회, 취침 전'], ['Acetaminophen 650mg', '증상 시 1정'],
  ['Allopurinol 100mg', '1일 1회, 아침 식후'], ['Ferrous sulfate 256mg', '1일 1회, 아침 식전'],
];
const LAB_POOL = [
  ['혈색소', '13.5', '12 ~ 16', null], ['공복혈당', '126', '70 ~ 99', 'H'],
  ['AST', '52', '0 ~ 40', 'H'], ['ALT', '48', '0 ~ 41', 'H'],
  ['크레아티닌', '1.4', '0.5 ~ 1.2', 'H'], ['요산', '7.9', '3.5 ~ 7.2', 'H'],
  ['TSH', '2.1', '0.4 ~ 4.0', null], ['총콜레스테롤', '182', '< 200', null],
];
const BILL_POOL = [
  ['외래 진료비', 18500], ['혈액검사 비용', 45000], ['X-ray 촬영비', 32000], ['물리치료비', 27000],
  ['약제비', 12800], ['초음파 검사비', 65000], ['내시경 검사비', 98000], ['예방접종비', 38000],
  ['MRI 촬영비', 420000], ['주사료', 15400],
];
const CC_POOL = [
  '정기 진료', '복통', '발열', '어지러움', '기침', '두통', '요통', '흉통', '소화불량', '무릎 통증',
  '어깨 결림', '피부 발진', '알레르기 비염', '인후통', '손목 통증', '불면', '부종', '고열', '멀미', '귀 통증',
];
// 진료과별 예약 종류 분포
const KIND_BY_DEPT = {
  '가정의학과':   ['진료', '검사', '검진', '투약', '처치'],
  '내과':         ['진료', '진료', '검사', '투약', '검진'],
  '정형외과':     ['진료', '처치', '물리치료', '검사', '진료'],
  '소아청소년과': ['진료', '진료', '검진', '투약', '검사'],
  '재활의학과':   ['물리치료', '물리치료', '진료', '처치', '검사'],
};
const MORNING = [[9, 0], [9, 30], [10, 0], [10, 30], [11, 0], [11, 30]];
const AFTERNOON = [[13, 0], [13, 30], [14, 0], [14, 30], [15, 0], [15, 30], [16, 0], [16, 30]];

(async () => {
  // ── 0. 기존 계정·환자 확인 ─────────────────────────────────
  const d1 = await pool.query(`SELECT id, profile FROM users WHERE username='doctor1'`);
  const n1 = await pool.query(`SELECT id FROM users WHERE username='nurse1'`);
  if (!d1.rows.length || !n1.rows.length) throw new Error('doctor1/nurse1 없음 — 먼저 node db/seed.js');

  // ── 1. 의사·간호사 계정 ────────────────────────────────────
  const doctorIds = [{ id: d1.rows[0].id, dept: d1.rows[0].profile.department || '가정의학과' }];
  for (const d of DOCTORS) {
    const id = await ensureUser(d.username, 'doctor1234', d.name, 'doctor',
      { department: d.dept, title: d.title });
    doctorIds.push({ id, dept: d.dept });
  }
  const nurseIds = [n1.rows[0].id];
  for (const n of NURSES) {
    nurseIds.push(await ensureUser(n.username, 'nurse1234', n.name, 'nurse',
      { ward: n.ward, title: '간호사' }));
  }

  // ── 2. 환자 계정 — 기존 환자 행에 연결 ─────────────────────
  for (const pa of PATIENT_ACCTS) {
    const pr = await pool.query(
      `SELECT id, birth_date, sex, phone, address FROM patients WHERE name=$1 ORDER BY user_id NULLS FIRST, id LIMIT 1`,
      [pa.link]);
    if (!pr.rows.length) { console.warn(`연결 대상 환자 없음: ${pa.link}`); continue; }
    const p = pr.rows[0];
    const uid = await ensureUser(pa.username, 'patient1234', pa.link, 'patient',
      { birth_date: p.birth_date ? dateStr(new Date(p.birth_date)) : null, sex: p.sex, phone: p.phone, address: p.address });
    const upd = await pool.query(
      `UPDATE patients SET user_id=$1 WHERE id=$2 AND user_id IS NULL RETURNING id`, [uid, p.id]);
    tally('patient_link', upd.rows.length > 0);
  }

  // ── 3. 신규 외래 환자 30명 + EMR ───────────────────────────
  const allPid = []; // 예약 배정용 전체 환자 id 풀
  const exist = await pool.query(`SELECT id FROM patients ORDER BY id`);
  exist.rows.forEach((r) => allPid.push(r.id));
  for (let i = 0; i < NEW_PATIENTS.length; i++) {
    const name = NEW_PATIENTS[i];
    const age = NEW_AGES[i];
    const mm = (i * 5) % 12 + 1;
    const dd = (i * 3) % 27 + 1;
    const pid = await ensurePatient(name, birthFor(age, mm, dd), i % 2 ? 'F' : 'M',
      `010-2003-${String(1001 + i)}`, ADDRESSES[i % ADDRESSES.length]);
    if (allPid.indexOf(pid) === -1) allPid.push(pid);
    // 진단 1~2 + 처방 0~2 (소아는 만성질환 대신 비염·중이염 계열)
    const dxN = 1 + (i % 2);
    for (let k = 0; k < dxN; k++) {
      const [dxName, code] = age < 15 ? DX_POOL[[3, 4, 10, 11][(i + k) % 4]] : DX_POOL[(i * 3 + k) % DX_POOL.length];
      await ensureDx(pid, dxName, code, dateStr(at(-(20 + ((i * 11 + k * 40) % 300)))));
    }
    const rxN = age < 15 ? 1 : (i % 3);
    for (let k = 0; k < rxN; k++) {
      const [drug, dosage] = RX_POOL[(i * 2 + k) % RX_POOL.length];
      await ensureRx(pid, drug, dosage, dateStr(at(-(10 + ((i * 7 + k * 30) % 200)))), (i + k) % 4 !== 3);
    }
    // 바이탈 1 + 검사 0~2 + 진료비 1~3 (일부 미납)
    await ensureVitals(pid, at(-(i % 14), 9, i % 50), 105 + ((i * 7) % 35), 65 + ((i * 5) % 22),
      82 + ((i * 13) % 70), age < 15 ? 25 + age * 2 : 48 + ((i * 3) % 38), Math.round((19 + ((i * 17) % 70) / 10) * 10) / 10);
    for (let k = 0; k < i % 3; k++) {
      const [test, value, ref, flag] = LAB_POOL[(i + k * 3) % LAB_POOL.length];
      await ensureLab(pid, dateStr(at(-(3 + ((i * 5 + k * 9) % 60)))), test, value, ref, flag);
    }
    const billN = 1 + (i % 3);
    for (let k = 0; k < billN; k++) {
      const [item, amount] = BILL_POOL[(i * 2 + k * 3) % BILL_POOL.length];
      await ensureBill(pid, dateStr(at(-(2 + ((i * 3 + k * 11) % 90)))), item, amount, (i + k) % 4 !== 0);
    }
    // 과거 진료 2~5건 (의사·진료과 회전, 최근 10개월)
    const encN = 2 + (i % 4);
    for (let k = 0; k < encN; k++) {
      const doc = doctorIds[(i + k) % doctorIds.length];
      await ensureEncounter(pid, at(-(4 + ((i * 13 + k * 47) % 290)), 9 + ((i + k) % 8), (i * 7 + k * 20) % 60 >= 30 ? 30 : 0),
        doc.id, doc.dept, CC_POOL[(i * 2 + k) % CC_POOL.length], null);
    }
  }

  // ── 4. 외래 예약: 오늘~9월 말 평일 × 의사 5명 × 5~9건 ──────
  //     (doctor1은 seed-emr 오전 슬롯과 겹치지 않게 11:30 이후만)
  const used = new Set(); // 실행 내 환자·시각 중복 방지
  const kindsOf = (dept) => KIND_BY_DEPT[dept] || KIND_BY_DEPT['내과'];
  async function bookDay(d, statusPick) {
    const dow = at(d).getDay();
    if (dow === 0 || dow === 6) return; // 주말 제외
    const n = epochDay(d);
    for (let di = 0; di < doctorIds.length; di++) {
      const doc = doctorIds[di];
      const pool0 = di === 0 ? [[11, 30], ...AFTERNOON] : [...MORNING, ...AFTERNOON];
      const cnt = 5 + ((n + di * 3) % 5); // 5~9건
      for (let si = 0; si < cnt && si < pool0.length; si++) {
        const slot = pool0[(n + si * ((di % 3) + 1)) % pool0.length];
        const when = at(d, slot[0], slot[1]);
        const pid = allPid[(n * 13 + di * 17 + si * 7) % allPid.length];
        const key = pid + '@' + when.getTime();
        if (used.has(key)) continue;
        used.add(key);
        const kind = kindsOf(doc.dept)[(n + si) % 5];
        await ensureAppt(pid, when, doc.id, doc.dept, kind, statusPick ? statusPick(n, di, si) : 'scheduled');
      }
      // 정형외과: 사흘에 한 번 08:00 수술
      if (doc.dept === '정형외과' && n % 3 === 0) {
        const pid = allPid[(n * 7 + 5) % allPid.length];
        const key = pid + '@' + at(d, 8, 0).getTime();
        if (!used.has(key)) {
          used.add(key);
          await ensureAppt(pid, at(d, 8, 0), doc.id, doc.dept, '수술', statusPick ? statusPick(n, di, 0) : 'scheduled');
        }
      }
    }
  }
  for (let d = 0; d <= END_OFFSET; d++) await bookDay(d, null);
  // 과거 4주 이력: done 위주 + cancelled/no_show 약간
  const pastStatus = (n, di, si) => {
    const r = (n * 31 + di * 7 + si) % 20;
    return r === 0 ? 'cancelled' : r === 1 ? 'no_show' : 'done';
  };
  for (let d = -28; d < 0; d++) await bookDay(d, pastStatus);

  // ── 5. 입원 6건 추가 + 퇴원 이력 2건 ───────────────────────
  const wardAdd = [
    ['김도윤', '1217호', '내과 병동'], ['황미경', '1218호', '내과 병동'], ['송정자', '1219호', '내과 병동'],
    ['전영철', '1313호', '외과 병동'], ['홍순옥', '1314호', '외과 병동'], ['채병철', '1315호', '외과 병동'],
  ];
  const pidOf = async (name) => {
    const r = await pool.query(`SELECT id FROM patients WHERE name=$1 ORDER BY id LIMIT 1`, [name]);
    return r.rows.length ? r.rows[0].id : null;
  };
  for (let i = 0; i < wardAdd.length; i++) {
    const pid = await pidOf(wardAdd[i][0]);
    if (pid) await ensureAdmission(pid, wardAdd[i][1], wardAdd[i][2], at(-(1 + i), 11, 0), dateStr(at(4 + i * 2)));
  }
  for (const [name, room, ward] of [['류재상', '1220호', '내과 병동'], ['나영순', '1316호', '외과 병동']]) {
    const pid = await pidOf(name);
    if (pid) await ensureAdmission(pid, room, ward, at(-45, 10, 0), dateStr(at(-32)), 'discharged');
  }

  // ── 6. 서류: 신청 5건 + 발급/반려 이력 6건 ─────────────────
  const docAdd = [
    ['김도윤', '검사결과서', 0, 'requested'], ['정예은', '검사결과서', -1, 'requested'],
    ['서준호', '처방전', 0, 'requested'], ['황미경', '처방전', -1, 'requested'],
    ['안성민', '기타', -2, 'requested'],
    ['이서아', '진단서', -5, 'issued'], ['박시우', '소견서', -6, 'issued'],
    ['강지호', '보험서류', -8, 'issued'], ['윤채원', '진단서', -9, 'issued'],
    ['장민서', '의무기록 사본', -11, 'issued'], ['임주원', '진단서', -7, 'rejected'],
  ];
  for (let i = 0; i < docAdd.length; i++) {
    const pid = await pidOf(docAdd[i][0]);
    if (pid) await ensureDoc(pid, docAdd[i][1], at(docAdd[i][2], 9, 10 + i * 4), docAdd[i][3]);
  }

  // ── 7. 간호기록: 간호사 5명 × 오늘·어제 병동 라운딩 ────────
  const wardRooms = {
    '내과 병동': ['강민준', '윤서연', '임도현', '한지우', '오세훈', '신유진', '배준서', '김도윤', '황미경', '송정자'],
    '외과 병동': ['송하은', '문경호', '양수빈', '조현우', '백서현', '노태민', '유가은', '전영철', '홍순옥', '채병철'],
  };
  const NOTE_KINDS = ['활력징후', '투약', '처치', '간호기록'];
  const allNurses = [{ id: nurseIds[0], ward: '내과 병동' }].concat(
    NURSES.map((n, i) => ({ id: nurseIds[i + 1], ward: n.ward })));
  for (let day = -1; day <= 0; day++) {
    for (let ni = 0; ni < allNurses.length; ni++) {
      const names = wardRooms[allNurses[ni].ward];
      for (let k = 0; k < 4; k++) {
        const nm = names[(ni * 4 + k + (day + 1) * 3) % names.length];
        const pid = await pidOf(nm);
        if (!pid) continue;
        const kindN = NOTE_KINDS[(ni + k) % NOTE_KINDS.length];
        await ensureNote(pid, allNurses[ni].id, kindN,
          `${nm} ${kindN === '활력징후' ? '활력징후 측정 — 정상 범위' : kindN === '투약' ? '처방 약물 투약 시행' : kindN === '처치' ? '드레싱/수액 처치 시행' : '상태 안정, 특이사항 없음'}`,
          at(day, 7 + ni * 2, (k * 15) % 60));
      }
    }
  }

  // ── 8. 메모·안전 이벤트 ────────────────────────────────────
  await ensureMemo(doctorIds[1].id, 'nurse', '1217호 김도윤 환아 보호자 면담 후 투약 변경 예정 — 확인 바랍니다.', at(0, 8, 20));
  await ensureMemo(nurseIds[1], 'nurse', '외과 병동 1313호 전영철 환자 금일 검사 전 금식 유지 중입니다.', at(0, 7, 30));
  await ensureSafety(await pidOf('오세훈'), '낙상', at(-8, 22, 10));
  await ensureSafety(await pidOf('문경호'), '투약오류', at(-40, 14, 0));

  // ── 결과 출력 ────────────────────────────────────────────────
  console.log(`seed-demo2 완료 (기준일 ${dateStr(TODAY)}, 예약 종료 D+${END_OFFSET}=${dateStr(at(END_OFFSET))})`);
  console.log('entity별 inserted / skipped(기존 재사용):');
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k.padEnd(14)} +${String(v.inserted).padStart(5)} / =${v.skipped}`);
  }
  const tables = ['users', 'patients', 'admissions', 'appointments', 'encounters', 'diagnoses',
    'prescriptions', 'vitals', 'lab_results', 'documents', 'nursing_notes', 'memos', 'bills', 'safety_events'];
  const counts = [];
  for (const t of tables) {
    const r = await pool.query(`SELECT count(*)::int AS c FROM ${t}`);
    counts.push(`${t}=${r.rows[0].c}`);
  }
  console.log('테이블 행 수:', counts.join(' '));
  await pool.end();
})().catch((e) => { console.error('seed-demo2 실패:', e.message); process.exit(1); });
