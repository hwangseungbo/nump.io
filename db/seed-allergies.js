// ============================================================
// Basil Nexus — 알레르기 시드 (patient 일부, 의료진 기록 컨셉)
// 사용법:
//   node db/seed-allergies.js --dry-run   ← 변경 예정만 출력하고 ROLLBACK
//   node db/seed-allergies.js             ← 실제 적용 (COMMIT)
//
// 전제: patients.allergies 컬럼 (db/migrate-persona-fixes.sql — 관리자 적용 필요)
// 멱등: allergies가 비어 있는(미기록) 환자만 채움 — 기록된 값은 절대 덮어쓰지 않음.
// 약물-알레르기 자동 매칭은 범위 제외.
// ============================================================
const { Pool } = require('pg');
const cfg = require('../db.config.json');

const DRY = process.argv.includes('--dry-run');
const pool = new Pool(cfg);

// [username, allergies[]] — 현실적 항목 (주민번호 등 실개인정보 아님)
const DATA = [
  ['patient1', ['페니실린']],
  ['patient3', ['조영제(요오드계)']],
  ['patient6', ['아스피린', '설파제']],
  ['patient8', ['갑각류(새우·게)']],
];

(async () => {
  const client = await pool.connect();
  try {
    const has = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='allergies'`);
    if (!has.rows.length) {
      console.error('patients.allergies 컬럼이 없습니다 — 먼저 관리자 PC에서:');
      console.error('  sudo -u postgres psql -d basilnexus -f db/migrate-persona-fixes.sql');
      process.exitCode = 1;
      return;
    }
    await client.query('BEGIN');
    console.log(`seed-allergies 시작 (모드: ${DRY ? 'DRY-RUN — 종료 시 ROLLBACK' : '실제 적용'})`);
    let set = 0, kept = 0;
    for (const [un, list] of DATA) {
      const r = await client.query(
        `SELECT p.id, p.name, p.allergies FROM patients p JOIN users u ON u.id=p.user_id WHERE u.username=$1`, [un]);
      if (!r.rows.length) { console.warn(`  ! 환자 없음: ${un} — 건너뜀`); continue; }
      const p = r.rows[0];
      if (Array.isArray(p.allergies) && p.allergies.length) { kept++; continue; } // 기록 보호
      await client.query(`UPDATE patients SET allergies=$1 WHERE id=$2`, [list, p.id]);
      set++;
      if (DRY) console.log(`   - ${un} ${p.name}: [${list.join(', ')}] (예정)`);
    }
    console.log(`알레르기: +${set}건 / =${kept}건 이미 기록됨`);
    if (DRY) {
      await client.query('ROLLBACK');
      console.log('DRY-RUN → ROLLBACK 완료 (DB 미변경)');
    } else {
      await client.query('COMMIT');
      console.log('COMMIT 완료');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('seed-allergies 실패 (ROLLBACK):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
