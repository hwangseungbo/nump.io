// ============================================================
// Basil Nexus — 기존 서류 담당의 백필 시드
// 사용법:
//   node db/seed-doc-assignees.js --dry-run   ← 변경 예정만 출력하고 ROLLBACK
//   node db/seed-doc-assignees.js             ← 실제 적용 (COMMIT)
//
// 전제: documents.assignee_id 컬럼 (db/migrate-doc-links.sql — 관리자 적용 필요)
// 내용: assignee_id IS NULL인 기존 서류에 그 환자의 최근 진료 의사를 담당으로 지정.
//  - encounter_id는 null 유지 — 과거 신청의 "대상 진료"는 불명이라 추정하지 않음.
//  - 멱등: 이미 담당이 있는 건은 건드리지 않음. 최근 진료 의사가 없으면 미지정 유지.
// ============================================================
const { Pool } = require('pg');
const cfg = require('../db.config.json');

const DRY = process.argv.includes('--dry-run');
const pool = new Pool(cfg);

(async () => {
  const client = await pool.connect();
  try {
    const has = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='assignee_id'`);
    if (!has.rows.length) {
      console.error('documents.assignee_id 컬럼이 없습니다 — 먼저 관리자 PC에서:');
      console.error('  cd /home/nump/Basil_Nexus/nump.io-main && sudo -u postgres psql -d basilnexus < db/migrate-doc-links.sql');
      process.exitCode = 1;
      return;
    }
    await client.query('BEGIN');
    console.log(`seed-doc-assignees 시작 (모드: ${DRY ? 'DRY-RUN — 종료 시 ROLLBACK' : '실제 적용'})`);

    const targets = await client.query(
      `SELECT d.id, d.doc_type, p.name,
              (SELECT e.doctor_id FROM encounters e
                WHERE e.patient_id=d.patient_id AND e.doctor_id IS NOT NULL
                ORDER BY e.visited_at DESC LIMIT 1) AS did
         FROM documents d JOIN patients p ON p.id=d.patient_id
        WHERE d.assignee_id IS NULL
        ORDER BY d.id`);
    let set = 0, noDoc = 0;
    const kept = (await client.query(
      `SELECT count(*)::int AS c FROM documents WHERE assignee_id IS NOT NULL`)).rows[0].c;
    for (const t of targets.rows) {
      if (!t.did) { noDoc++; continue; } // 진료 이력 없음 — 미지정 유지
      await client.query(`UPDATE documents SET assignee_id=$1 WHERE id=$2`, [t.did, t.id]);
      set++;
      if (DRY) {
        const dn = (await client.query(`SELECT name FROM users WHERE id=$1`, [t.did])).rows[0];
        console.log(`   - #${t.id} ${t.name} ${t.doc_type} → 담당 ${dn ? dn.name : t.did} (예정)`);
      }
    }
    console.log(`담당의 백필: +${set}건 / =${kept}건 이미 지정 / 미지정 유지 ${noDoc}건(진료 이력 없음)`);

    if (DRY) {
      await client.query('ROLLBACK');
      console.log('DRY-RUN → ROLLBACK 완료 (DB 미변경)');
    } else {
      await client.query('COMMIT');
      console.log('COMMIT 완료');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('seed-doc-assignees 실패 (ROLLBACK):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
