// ============================================================
// Basil Nexus — 최근 진료 기록 보강 시드 (patient2~5)
// 사용법: node db/seed-personas.js 적용 후  node db/seed-recent-encounters.js
//
// 목적: 환자 챗 "최근 진료 의사 자동 매칭"이 환자마다 다른 의사로 잡히도록,
//       페르소나 관심사와 정합되는 최근 encounter를 추가한다.
//  - patient2 김철수 → doctor3 이하은(정형외과) 골다공증 추적 (기존 doctor1 7/28보다 최신)
//  - patient3 박영희 → doctor2 김서준(내과) 당뇨(HbA1c 7.2) 관리
//  - patient4 이민수 → doctor2 김서준(내과) 위염(Pantoprazole) 추적
//  - patient5 최지연 → doctor2 김서준(내과) 갑상선기능저하(TSH 6.8) 추적
//  - patient1 홍길동은 기존 doctor1 매칭 유지 (변경 없음)
//
// 원칙 (seed-demo2.js와 동일):
//  - 날짜는 실행 시점 기준 상대 (최근 4~6일)
//  - 멱등: patient_id + doctor_id + visited_at::date 존재 검사 후 없을 때만 INSERT
// ============================================================
const { Pool } = require('pg');
const cfg = require('../db.config.json');

const pool = new Pool(cfg);
const stats = {};
function tally(entity, didInsert, n = 1) {
  const s = (stats[entity] ||= { inserted: 0, skipped: 0 });
  didInsert ? (s.inserted += n) : (s.skipped += n);
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

// ── 추가할 최근 진료 정의 ────────────────────────────────────
// [환자 username, 의사 username, 진료과, 상대일, 시, 분, 주호소, 노트]
const ENCOUNTERS = [
  ['patient2', 'doctor3', '정형외과', -5, 10, 30, '골다공증 추적 관찰',
    'DEXA T-score -2.6 확인 — 약물 치료 유지, 낙상 주의 교육 시행'],
  ['patient3', 'doctor2', '내과', -4, 9, 30, '당뇨 관리 상담',
    'HbA1c 7.2 — 경구혈당강하제(Metformin) 유지, 식이·운동 교육 시행'],
  ['patient4', 'doctor2', '내과', -6, 14, 0, '위염 추적 진료',
    'Pantoprazole 40mg 유지, 상복부 불편감 호전 추세'],
  ['patient5', 'doctor2', '내과', -5, 15, 30, '갑상선기능저하 추적',
    'TSH 6.8 — Levothyroxine 50mcg 유지, 용량 조정 여부는 다음 검사 후 결정'],
];

(async () => {
  const lines = [];
  for (const [pUser, dUser, dept, dd, hh, mm, cc, note] of ENCOUNTERS) {
    const pr = await pool.query(
      `SELECT p.id, p.name FROM patients p JOIN users u ON u.id=p.user_id WHERE u.username=$1`, [pUser]);
    const dr = await pool.query(
      `SELECT id, name FROM users WHERE username=$1 AND role='doctor'`, [dUser]);
    if (!pr.rows.length || !dr.rows.length) {
      console.warn(`대상 없음: ${pUser} 또는 ${dUser} — 먼저 node db/seed-demo2.js`);
      continue;
    }
    const pid = pr.rows[0].id, did = dr.rows[0].id;
    const when = at(dd, hh, mm);
    // 멱등 키: patient_id + doctor_id + visited_at::date
    const has = await pool.query(
      `SELECT id FROM encounters WHERE patient_id=$1 AND doctor_id=$2 AND visited_at::date=$3::date`,
      [pid, did, dateStr(when)]);
    if (has.rows.length) {
      tally('encounters', false);
      lines.push(`  ${pUser.padEnd(8)} ${pr.rows[0].name} → ${dr.rows[0].name}  encounter =`);
      continue;
    }
    await pool.query(
      `INSERT INTO encounters (patient_id, doctor_id, visited_at, visit_type, department, chief_complaint, note)
       VALUES ($1,$2,$3,'outpatient',$4,$5,$6)`,
      [pid, did, when, dept, cc, note]);
    tally('encounters', true);
    lines.push(`  ${pUser.padEnd(8)} ${pr.rows[0].name} → ${dr.rows[0].name}  encounter +1 (${dateStr(when)} ${dept} · ${cc})`);
  }

  // ── 결과 출력 + 매칭 확인 ────────────────────────────────────
  console.log(`seed-recent-encounters 완료 (기준일 ${dateStr(TODAY)})`);
  lines.forEach((l) => console.log(l));
  console.log('entity별 inserted / skipped(기존 유지):');
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k.padEnd(14)} +${String(v.inserted).padStart(5)} / =${v.skipped}`);
  }
  const chk = await pool.query(`
    SELECT u.username, d.username AS last_doctor, e.visited_at::date AS d
      FROM users u JOIN patients p ON p.user_id=u.id
      JOIN LATERAL (SELECT doctor_id, visited_at FROM encounters
                     WHERE patient_id=p.id ORDER BY visited_at DESC LIMIT 1) e ON true
      LEFT JOIN users d ON d.id=e.doctor_id
     WHERE u.username LIKE 'patient_' ORDER BY u.username`);
  console.log('환자별 최근 진료 의사:', chk.rows.map((r) => `${r.username}→${r.last_doctor}`).join(' '));
  await pool.end();
})().catch((e) => { console.error('seed-recent-encounters 실패:', e.message); process.exit(1); });
