// ============================================================
// Basil Nexus — 지시(오더) 데모 시드
// 사용법:
//   node db/seed-care-orders.js --dry-run   ← 변경 예정만 출력하고 ROLLBACK
//   node db/seed-care-orders.js             ← 실제 적용 (COMMIT)
//
// 내용: 내과 병동 입원 환자에게 데모 지시 4건 (open/acked/done 혼합 — 3단계 시연).
// 멱등: (patient_id, content) 존재 검사. 담당자는 username으로 조회(id 하드코딩 금지).
// ============================================================
const { Pool } = require('pg');
const cfg = require('../db.config.json');

const DRY = process.argv.includes('--dry-run');
const pool = new Pool(cfg);

// [환자 username, 지시자 username, content, status, ack 간호사, done 간호사, 몇 시간 전]
const ORDERS = [
  ['patient2', 'doctor1', '혈압 6시간마다 측정 후 140/90 초과 시 보고', 'open', null, null, 3],
  ['patient3', 'doctor2', '취침 전 혈당 측정 — 180 초과 시 당직의 콜', 'acked', 'nurse1', null, 7],
  ['patient4', 'doctor2', '수액 종료 후 라인 제거하고 경구 수분 섭취 격려', 'done', 'nurse1', 'nurse1', 26],
  ['patient5', 'nurse1', '어지럼 호소 시 침상 난간 올리고 보행 동행', 'open', null, null, 1],
];

async function uid(client, username) {
  const r = await client.query(`SELECT id FROM users WHERE username=$1`, [username]);
  return r.rows.length ? r.rows[0].id : null;
}

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log(`seed-care-orders 시작 (모드: ${DRY ? 'DRY-RUN — 종료 시 ROLLBACK' : '실제 적용'})`);
    let ins = 0, kept = 0;
    for (const [pUser, aUser, content, status, ackUser, doneUser, hoursAgo] of ORDERS) {
      const pr = await client.query(
        `SELECT p.id, p.name FROM patients p JOIN users u ON u.id=p.user_id WHERE u.username=$1`, [pUser]);
      const aid = await uid(client, aUser);
      if (!pr.rows.length || !aid) { console.warn(`  ! 대상 없음: ${pUser}/${aUser} — 건너뜀`); continue; }
      const pid = pr.rows[0].id;
      const has = await client.query(
        `SELECT 1 FROM care_orders WHERE patient_id=$1 AND content=$2`, [pid, content]);
      if (has.rows.length) { kept++; continue; }
      const role = (await client.query(`SELECT role FROM users WHERE id=$1`, [aid])).rows[0].role;
      const ackId = ackUser ? await uid(client, ackUser) : null;
      const doneId = doneUser ? await uid(client, doneUser) : null;
      await client.query(
        `INSERT INTO care_orders (patient_id, author_id, author_role, content, status, created_at,
                                  acked_by, acked_at, done_by, done_at)
         VALUES ($1,$2,$3,$4,$5, now() - ($6 || ' hours')::interval,
                 $7, CASE WHEN $7::int IS NULL THEN NULL ELSE now() - ($6 || ' hours')::interval + interval '20 minutes' END,
                 $8, CASE WHEN $8::int IS NULL THEN NULL ELSE now() - ($6 || ' hours')::interval + interval '2 hours' END)`,
        [pid, aid, role, content, status, String(hoursAgo), ackId, doneId]);
      ins++;
      if (DRY) console.log(`   - ${pr.rows[0].name}: [${status}] ${content} (${aUser}, ${hoursAgo}시간 전)`);
    }
    console.log(`지시: +${ins}건 / =${kept}건 이미 있음`);
    if (DRY) {
      await client.query('ROLLBACK');
      console.log('DRY-RUN → ROLLBACK 완료 (DB 미변경)');
    } else {
      await client.query('COMMIT');
      console.log('COMMIT 완료');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('seed-care-orders 실패 (ROLLBACK):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
