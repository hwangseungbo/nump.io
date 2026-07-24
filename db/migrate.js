// Basil Nexus — 마이그레이션 실행기 (P4: migrate-002.sql)
// 사용법: node db/migrate.js   (db.config.json으로 접속, sudo 불필요)
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const cfg = require('../db.config.json');

const MIGRATIONS = ['migrate-002.sql'];

(async () => {
  const pool = new Pool(cfg);
  try {
    for (const name of MIGRATIONS) {
      const sql = fs.readFileSync(path.join(__dirname, name), 'utf8');
      process.stdout.write(`migrate: ${name} 적용 중 ... `);
      await pool.query(sql);           // IF NOT EXISTS — 재실행 안전
      console.log('OK');
    }
    const r = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_name = ANY($1)
        ORDER BY table_name`,
      [['admissions', 'memos', 'bills', 'safety_events']]
    );
    console.log('migrate 완료 — 확인된 P4 테이블:', r.rows.map((x) => x.table_name).join(', '));
    if (r.rows.length !== 4) {
      throw new Error(`P4 테이블 4개 중 ${r.rows.length}개만 확인됨`);
    }
  } finally {
    await pool.end();
  }
})().catch((e) => { console.error('migrate 실패:', e.message); process.exit(1); });
