// ============================================================
// Basil Nexus — 3자 페르소나 점검 반영 마이그레이션 (추가 전용)
// 사용법:
//   node db/migrate-persona-fixes.js --dry-run   ← 변경 예정만 출력하고 ROLLBACK
//   node db/migrate-persona-fixes.js             ← 실제 적용 (COMMIT)
//
// 내용 (전부 멱등 · ADD COLUMN/CREATE TABLE IF NOT EXISTS만 — DROP·기존행 UPDATE 없음):
//  A. patients.allergies TEXT[] DEFAULT '{}'            — 알레르기(의료진 기록·환자 확인)
//  B. care_orders 테이블                                 — 환자별 지시(오더) 채널
//  C. appointments.reason TEXT                           — 방문 사유
//     encounters.patient_summary TEXT                    — 환자용 방문 요약
//  E. vitals.temp_c NUMERIC(4,1), pulse INT, spo2 INT    — 체온·맥박·산소포화도
// 컬럼·테이블 추가만이라 운영 구코드에 영향 없음.
// ============================================================
const { Pool } = require('pg');
const cfg = require('../db.config.json');

const DRY = process.argv.includes('--dry-run');
const pool = new Pool(cfg);

const COLS = [ // [table, column, type]
  ['patients', 'allergies', `TEXT[] DEFAULT '{}'`],
  ['appointments', 'reason', 'TEXT'],
  ['encounters', 'patient_summary', 'TEXT'],
  ['vitals', 'temp_c', 'NUMERIC(4,1)'],
  ['vitals', 'pulse', 'INTEGER'],
  ['vitals', 'spo2', 'INTEGER'],
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log(`migrate-persona-fixes 시작 (모드: ${DRY ? 'DRY-RUN — 종료 시 ROLLBACK' : '실제 적용'})`);

    // 주의: patients/appointments/encounters/vitals는 postgres 소유(초기 schema.sql을
    // sudo psql로 적용)라 basil 접속으로는 ALTER 불가 → 권한 부족 컬럼은 건너뛰고
    // 마지막에 관리자 실행 안내를 출력한다. (SAVEPOINT로 트랜잭션 유지)
    let added = 0, kept = 0;
    const needAdmin = [];
    for (const [table, name, type] of COLS) {
      const has = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [table, name]);
      if (has.rows.length) { kept++; continue; }
      await client.query('SAVEPOINT col');
      try {
        await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${type}`);
        added++;
        if (DRY) console.log(`   - ${table}.${name} ${type} 추가 (예정)`);
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT col');
        if (/must be owner/.test(e.message)) {
          needAdmin.push(`${table}.${name}`);
          console.warn(`   ! ${table}.${name}: 소유자 권한 필요 — 건너뜀`);
        } else throw e;
      }
    }
    console.log(`1) 컬럼 추가: +${added}건 변경 / =${kept}건 이미 정상${needAdmin.length ? ` / 관리자 필요 ${needAdmin.length}건` : ''}`);

    const hasT = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name='care_orders'`);
    if (hasT.rows.length) {
      console.log(`2) care_orders 테이블: +0건 변경 / =1건 이미 정상`);
    } else {
      await client.query(`CREATE TABLE IF NOT EXISTS care_orders (
        id          SERIAL PRIMARY KEY,
        patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        author_id   INTEGER NOT NULL REFERENCES users(id),
        author_role TEXT NOT NULL,                          -- doctor/nurse
        content     TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'open'            -- open/acked/done/cancelled
                    CHECK (status IN ('open','acked','done','cancelled')),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        acked_by    INTEGER REFERENCES users(id),
        acked_at    TIMESTAMPTZ,
        done_by     INTEGER REFERENCES users(id),
        done_at     TIMESTAMPTZ
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_care_orders_patient ON care_orders(patient_id, status)`);
      console.log(`2) care_orders 테이블: +1건 변경 / =0건 이미 정상`);
    }

    if (DRY) {
      await client.query('ROLLBACK');
      console.log('DRY-RUN → ROLLBACK 완료 (DB 미변경)');
    } else {
      await client.query('COMMIT');
      console.log('COMMIT 완료');
    }
    if (needAdmin.length) {
      console.log('');
      console.log('※ 아래 컬럼은 테이블 소유자(postgres) 권한이 필요합니다. 관리자 PC에서 1회 실행:');
      console.log('   sudo -u postgres psql -d basilnexus -f db/migrate-persona-fixes.sql');
      console.log('   (파일은 추가 전용 · 멱등 — 재실행 안전)');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('migrate-persona-fixes 실패 (ROLLBACK):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
