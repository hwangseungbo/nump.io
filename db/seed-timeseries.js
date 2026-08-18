// ============================================================
// Basil Nexus — 시계열 히스토리 시드 (P3a 추이 그래프용)
// 사용법:
//   node db/seed-timeseries.js --dry-run   ← 변경 예정 건수만 출력하고 ROLLBACK
//   node db/seed-timeseries.js             ← 실제 적용 (COMMIT)
//
// 내용: 데모 환자의 검사·바이탈이 1~2건뿐이라 "추이" 시연이 불가 →
//       기존 최신값으로 자연스럽게 이어지는 과거 시점 행만 추가한다.
//  - 기존 행은 절대 수정/삭제하지 않음 (과거 시점 INSERT만)
//  - 역사 시리즈는 고정 절대 날짜 (재실행 드리프트 방지)
//  - 내과 병동 admitted 환자 전원: 최근 3일 08:00/20:00 바이탈만 상대 날짜
//    (미래 시각은 건너뜀 — 재실행 시 새 날짜 분이 추가되는 것은 의도된 동작)
//
// 멱등 키: lab_results (patient_id, tested_at, test_name) / vitals (patient_id, measured_at)
// 출력: "+N/=M" 컨벤션 (seed-personas.js와 동일)
// ============================================================
const { Pool } = require('pg');
const cfg = require('../db.config.json');

const DRY = process.argv.includes('--dry-run');
const pool = new Pool(cfg);
const stats = {};
function tally(entity, didInsert, n = 1) {
  const s = (stats[entity] ||= { inserted: 0, skipped: 0 });
  didInsert ? (s.inserted += n) : (s.skipped += n);
}

// ── 검사 히스토리 (고정 절대 날짜, 기존 최신값으로 수렴하는 추세) ──
// [username, tested_at, test_name, value, ref_range, flag]
const LABS = [
  // patient1 홍길동 — 고지혈증 개선 추세 (기존 2026-06-15: LDL-C 135 H / 총콜레스테롤 210 H)
  ['patient1', '2025-09-15', 'LDL-C', '158', '< 130', 'H'],
  ['patient1', '2025-12-15', 'LDL-C', '149', '< 130', 'H'],
  ['patient1', '2026-03-15', 'LDL-C', '141', '< 130', 'H'],
  ['patient1', '2025-09-15', '총콜레스테롤', '232', '< 200', 'H'],
  ['patient1', '2025-12-15', '총콜레스테롤', '224', '< 200', 'H'],
  ['patient1', '2026-03-15', '총콜레스테롤', '218', '< 200', 'H'],
  // patient2 김철수 — 골밀도 소폭 개선 (기존 2026-06-15: DEXA -2.6 L / 칼슘 9.2)
  ['patient2', '2025-07-15', 'DEXA T-score', '-2.8', '≥ -1.0', 'L'],
  ['patient2', '2025-07-15', '혈청 칼슘', '9.1', '8.6 ~ 10.2', null],
  // patient3 박영희 — 당뇨 개선 추세 (기존 2026-07-22: HbA1c 7.2 H)
  ['patient3', '2025-08-20', 'HbA1c', '7.9', '< 5.7', 'H'],
  ['patient3', '2025-11-20', 'HbA1c', '7.6', '< 5.7', 'H'],
  ['patient3', '2026-02-20', 'HbA1c', '7.5', '< 5.7', 'H'],
  ['patient3', '2026-05-20', 'HbA1c', '7.3', '< 5.7', 'H'],
  ['patient3', '2025-08-20', '공복혈당', '155', '70 ~ 99', 'H'],
  ['patient3', '2026-01-20', '공복혈당', '146', '70 ~ 99', 'H'],
  ['patient3', '2026-05-20', '공복혈당', '138', '70 ~ 99', 'H'],
  // patient4 이민수 — 염증 호전 (기존 2026-07-21: CRP 0.8 H)
  ['patient4', '2026-05-12', 'CRP', '1.9', '< 0.5', 'H'],
  ['patient4', '2026-06-16', 'CRP', '1.2', '< 0.5', 'H'],
  ['patient4', '2026-05-12', '혈색소', '13.8', '12 ~ 16', null],
  ['patient4', '2026-06-16', '혈색소', '14.1', '12 ~ 16', null],
  // patient5 최지연 — 갑상선 호전 (기존 2026-07-23: TSH 6.8 H)
  ['patient5', '2026-03-20', 'TSH', '9.1', '0.4 ~ 4.0', 'H'],
  ['patient5', '2026-05-22', 'TSH', '8.2', '0.4 ~ 4.0', 'H'],
];

// ── 바이탈 히스토리 (고정 절대 날짜, 외래 추이용) ──────────────
// [username, measured_at, systolic, diastolic, glucose, weight_kg, bmi]
const VITALS = [
  // patient1 — 월 1회 6건, BP 142/88 → 130/82 개선 (기존 2026-07-23 120/80)
  ['patient1', '2026-01-20 09:00', 142, 88, 99, 73.5, 24.1],
  ['patient1', '2026-02-20 09:00', 140, 86, 99, 73.2, 24.0],
  ['patient1', '2026-03-20 09:00', 138, 86, 98, 73.0, 23.9],
  ['patient1', '2026-04-20 09:00', 135, 84, 98, 72.8, 23.9],
  ['patient1', '2026-05-20 09:00', 132, 83, 97, 72.6, 23.8],
  ['patient1', '2026-06-20 09:00', 130, 82, 96, 72.4, 23.7],
  // patient3 — 6건, glucose 168 → 148 개선 (기존 2026-07-24 glu 145)
  ['patient3', '2026-01-22 09:00', 138, 88, 168, 59.4, 24.5],
  ['patient3', '2026-02-22 09:00', 137, 87, 163, 59.2, 24.4],
  ['patient3', '2026-03-22 09:00', 136, 86, 158, 59.1, 24.4],
  ['patient3', '2026-04-22 09:00', 135, 85, 154, 59.0, 24.3],
  ['patient3', '2026-05-22 09:00', 134, 85, 150, 58.8, 24.3],
  ['patient3', '2026-06-22 09:00', 133, 84, 148, 58.7, 24.2],
  // patient5 — 3건 (기존 2026-07-24 122/78 glu 101)
  ['patient5', '2026-04-18 09:00', 124, 80, 104, 55.4, 22.7],
  ['patient5', '2026-05-18 09:00', 123, 79, 102, 55.2, 22.6],
  ['patient5', '2026-06-18 09:00', 122, 78, 101, 55.1, 22.5],
];

// 내과 병동 입원 환자 바이탈 — 환자별 고정 체중/BMI, 나머지는 결정적 변주
function wardVital(pid, dayIdx, slot) { // slot 0=08:00, 1=20:00
  return {
    systolic: 112 + ((pid * 7 + dayIdx * 3 + slot * 2) % 24),
    diastolic: 68 + ((pid * 5 + dayIdx * 2 + slot) % 16),
    glucose: 88 + ((pid * 11 + dayIdx * 5 + slot * 3) % 60),
    weight: Math.round((50 + ((pid * 3) % 26) + 0.5) * 10) / 10,
    bmi: Math.round((20 + ((pid * 7) % 50) / 10) * 10) / 10,
  };
}

async function pidOf(client, username) {
  const r = await client.query(
    `SELECT p.id FROM patients p JOIN users u ON u.id=p.user_id WHERE u.username=$1`, [username]);
  return r.rows.length ? r.rows[0].id : null;
}

(async () => {
  const client = await pool.connect(); // 트랜잭션은 단일 커넥션에서
  try {
    await client.query('BEGIN');
    console.log(`seed-timeseries 시작 (모드: ${DRY ? 'DRY-RUN — 종료 시 ROLLBACK' : '실제 적용'})`);

    // ── 1. 검사 히스토리 ───────────────────────────────────────
    for (const [un, dt, test, value, ref, flag] of LABS) {
      const pid = await pidOf(client, un);
      if (!pid) { console.warn(`  ! 환자 없음: ${un} — 건너뜀`); continue; }
      const has = await client.query(
        `SELECT 1 FROM lab_results WHERE patient_id=$1 AND tested_at=$2::date AND test_name=$3`, [pid, dt, test]);
      if (has.rows.length) { tally('lab_results', false); continue; }
      await client.query(
        `INSERT INTO lab_results (patient_id, tested_at, test_name, value, ref_range, flag)
         VALUES ($1,$2,$3,$4,$5,$6)`, [pid, dt, test, value, ref, flag]);
      tally('lab_results', true);
    }
    console.log(`1) 검사 히스토리: +${(stats.lab_results || {}).inserted || 0}건 / =${(stats.lab_results || {}).skipped || 0}건 이미 있음`);

    // ── 2. 외래 바이탈 히스토리 ────────────────────────────────
    for (const [un, dt, sys, dia, glu, w, bmi] of VITALS) {
      const pid = await pidOf(client, un);
      if (!pid) { console.warn(`  ! 환자 없음: ${un} — 건너뜀`); continue; }
      const has = await client.query(
        `SELECT 1 FROM vitals WHERE patient_id=$1 AND measured_at=$2::timestamptz`, [pid, dt]);
      if (has.rows.length) { tally('vitals(이력)', false); continue; }
      await client.query(
        `INSERT INTO vitals (patient_id, measured_at, systolic, diastolic, glucose, weight_kg, bmi)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`, [pid, dt, sys, dia, glu, w, bmi]);
      tally('vitals(이력)', true);
    }
    console.log(`2) 외래 바이탈 히스토리: +${(stats['vitals(이력)'] || {}).inserted || 0}건 / =${(stats['vitals(이력)'] || {}).skipped || 0}건 이미 있음`);

    // ── 3. 내과 병동 입원 환자 최근 3일 바이탈 (08:00/20:00) ────
    const ward = await client.query(
      `SELECT a.patient_id FROM admissions a WHERE a.status='admitted' AND a.ward='내과 병동' ORDER BY a.patient_id`);
    const nowMs = Date.now();
    const base = new Date(); base.setHours(0, 0, 0, 0);
    for (const { patient_id: pid } of ward.rows) {
      for (let dayIdx = 2; dayIdx >= 0; dayIdx--) {     // -2일 ~ 오늘
        for (let slot = 0; slot < 2; slot++) {          // 08:00 / 20:00
          const when = new Date(base.getTime() - dayIdx * 86400000 + (slot ? 20 : 8) * 3600000);
          if (when.getTime() > nowMs) continue;         // 미래 시각은 건너뜀
          const has = await client.query(
            `SELECT 1 FROM vitals WHERE patient_id=$1 AND measured_at=$2`, [pid, when]);
          if (has.rows.length) { tally('vitals(병동)', false); continue; }
          const v = wardVital(pid, dayIdx, slot);
          await client.query(
            `INSERT INTO vitals (patient_id, measured_at, systolic, diastolic, glucose, weight_kg, bmi)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`, [pid, when, v.systolic, v.diastolic, v.glucose, v.weight, v.bmi]);
          tally('vitals(병동)', true);
        }
      }
    }
    console.log(`3) 병동 바이탈(입원 ${ward.rows.length}명 × 최근 3일): +${(stats['vitals(병동)'] || {}).inserted || 0}건 / =${(stats['vitals(병동)'] || {}).skipped || 0}건 이미 있음`);

    // ── 마무리 ─────────────────────────────────────────────────
    if (DRY) {
      await client.query('ROLLBACK');
      console.log('DRY-RUN → ROLLBACK 완료 (DB 미변경)');
    } else {
      await client.query('COMMIT');
      console.log('COMMIT 완료');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('seed-timeseries 실패 (ROLLBACK):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
