// Basil Nexus — 초기 계정 시드 (P1)
// 사용법: node db/seed.js   (schema.sql 적용 후 실행)
const { Pool } = require('pg');
const crypto = require('crypto');
const cfg = require('../db.config.json');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return salt + '$' + hash;
}

const USERS = [
  { username: 'admin',    password: 'admin1234',   name: '관리자',  role: 'admin',
    profile: {} },
  { username: 'doctor1',  password: 'doctor1234',  name: '홍성민',  role: 'doctor',
    profile: { department: '가정의학과', title: '원장' } },
  { username: 'nurse1',   password: 'nurse1234',   name: '김나연',  role: 'nurse',
    profile: { ward: '내과 병동', title: '간호사' } },
  { username: 'patient1', password: 'patient1234', name: '홍길동',  role: 'patient',
    profile: { birth_date: '1980-05-15', sex: 'M', phone: '010-1234-5678',
               address: '서울특별시 강남구 테헤란로 123', email: 'honggd@example.com' } },
];

(async () => {
  const pool = new Pool(cfg);
  try {
    for (const u of USERS) {
      const r = await pool.query(
        `INSERT INTO users (username, password_hash, name, role, profile)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (username) DO UPDATE
           SET name=EXCLUDED.name, role=EXCLUDED.role, profile=EXCLUDED.profile
         RETURNING id`,
        [u.username, hashPassword(u.password), u.name, u.role, JSON.stringify(u.profile)]
      );
      console.log(`seed: ${u.username} (${u.role}) -> id=${r.rows[0].id}`);
      // 환자 계정은 patients 테이블에도 연결
      if (u.role === 'patient') {
        await pool.query(
          `INSERT INTO patients (user_id, name, birth_date, sex, phone, address)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (user_id) DO UPDATE SET name=EXCLUDED.name`,
          [r.rows[0].id, u.name, u.profile.birth_date, u.profile.sex, u.profile.phone, u.profile.address]
        );
      }
    }
    console.log('seed 완료');
  } finally {
    await pool.end();
  }
})().catch((e) => { console.error('seed 실패:', e.message); process.exit(1); });
