// ============================================================
// Basil Nexus — 토스페이먼츠 결제 연동 마이그레이션 (bills 확장)
// 사용법:
//   node db/migrate-toss-payments.js --dry-run   ← 변경 예정만 출력하고 ROLLBACK
//   node db/migrate-toss-payments.js             ← 실제 적용 (COMMIT)
//
// 내용 (전부 멱등 — ADD COLUMN/CREATE INDEX IF NOT EXISTS):
//  - bills 컬럼 추가: order_id, payment_key, pay_method, approved_at, receipt_url
//  - UNIQUE INDEX bills_order_id_uq ON bills(order_id)  (NULL 허용 — 미결제 행 다수 OK)
// 컬럼 추가만이라 기존 코드(운영 포함)에 영향 없음.
// ============================================================
const { Pool } = require('pg');
const cfg = require('../db.config.json');

const DRY = process.argv.includes('--dry-run');
const pool = new Pool(cfg);

const COLS = [
  ['order_id',    'TEXT'],         // 토스 orderId (checkout 시 발급)
  ['payment_key', 'TEXT'],         // 토스 paymentKey (승인 성공 시)
  ['pay_method',  'TEXT'],         // 결제 수단 (토스 응답 method — '카드' 등)
  ['approved_at', 'TIMESTAMPTZ'],  // 승인 시각 (토스 approvedAt)
  ['receipt_url', 'TEXT'],         // 영수증 URL
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log(`migrate-toss-payments 시작 (모드: ${DRY ? 'DRY-RUN — 종료 시 ROLLBACK' : '실제 적용'})`);

    let added = 0, kept = 0;
    for (const [name, type] of COLS) {
      const has = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name='bills' AND column_name=$1`, [name]);
      if (has.rows.length) { kept++; continue; }
      await client.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS ${name} ${type}`);
      added++;
      if (DRY) console.log(`   - bills.${name} ${type} 추가 (예정)`);
    }
    console.log(`1) bills 컬럼: +${added}건 변경 / =${kept}건 이미 정상`);

    const hasIdx = await client.query(`SELECT 1 FROM pg_indexes WHERE indexname='bills_order_id_uq'`);
    if (hasIdx.rows.length) {
      console.log(`2) UNIQUE INDEX bills_order_id_uq: +0건 변경 / =1건 이미 정상`);
    } else {
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS bills_order_id_uq ON bills(order_id)`);
      console.log(`2) UNIQUE INDEX bills_order_id_uq: +1건 변경 / =0건 이미 정상`);
    }

    if (DRY) {
      await client.query('ROLLBACK');
      console.log('DRY-RUN → ROLLBACK 완료 (DB 미변경)');
    } else {
      await client.query('COMMIT');
      console.log('COMMIT 완료');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('migrate-toss-payments 실패 (ROLLBACK):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
