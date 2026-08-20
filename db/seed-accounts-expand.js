// ============================================================
// Basil Nexus — 데모 계정 확장 시드 (역할별 6~10 + 기존 직원 sex/birth_date)
// 사용법:
//   node db/seed-accounts-expand.js --dry-run   ← 변경 예정만 출력하고 ROLLBACK
//   node db/seed-accounts-expand.js             ← 실제 적용 (COMMIT)
//
// 내용:
//  1. 기존 직원(doctor1~5, nurse1~5) profile에 sex·birth_date 병합(기존 키 보존)
//     — 아바타 자동 선택(avatarFor)용. 이미 sex 키가 있으면 건너뜀.
//  2. 신규 계정 doctor6~10 / nurse6~10 / patient6~10 생성 (연령·성별 다양화)
//     — username 존재 여부로 멱등. 환자는 users + patients(연결) 동시 생성,
//       기존 patients와 이름 충돌 시 경고 후 건너뜀.
//
// 원칙: 추가·병합만 수행(기존 값 덮어쓰기 없음). 출력 "+N건 / =M건 이미 정상".
// ============================================================
const { Pool } = require('pg');
const crypto = require('crypto');
const cfg = require('../db.config.json');

const DRY = process.argv.includes('--dry-run');
const pool = new Pool(cfg);

function hashPassword(pw) { // db/seed.js와 동일 방식
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + '$' + crypto.scryptSync(pw, salt, 64).toString('hex');
}

// ── 1. 기존 직원 sex·birth_date ──────────────────────────────
const STAFF_FILL = [
  ['doctor1', 'M', '1972-03-15'], ['doctor2', 'M', '1980-07-22'], ['doctor3', 'F', '1990-11-05'],
  ['doctor4', 'M', '1985-04-18'], ['doctor5', 'F', '1970-09-30'],
  ['nurse1', 'F', '1998-02-14'], ['nurse2', 'M', '1992-06-25'], ['nurse3', 'F', '1980-12-08'],
  ['nurse4', 'F', '1994-05-19'], ['nurse5', 'F', '2001-08-03'],
];

// ── 2a. 신규 의사 (persona는 기존 seed-doctor-personas와 같은 4키 형식) ──
const NEW_DOCTORS = [
  ['doctor6', '오정환', 'M', '1969-01-12', '외과', '과장',
    { '말투': '묵직하고 신뢰감 있는 존댓말', '성격': '신중하고 과묵한 베테랑', '진료스타일': '수술 전후 과정을 단계별로 차분히 설명', '소개': '수술 전후를 차분히 설명하는 베테랑 외과 전문의' }],
  ['doctor7', '임지현', 'F', '1988-10-02', '피부과', '전문의',
    { '말투': '밝고 상냥한 존댓말', '성격': '세심하고 긍정적', '진료스타일': '생활 속 피부 관리 습관을 함께 짚어줌', '소개': '피부 관리 습관까지 챙기는 상냥한 피부과 전문의' }],
  ['doctor8', '강도현', 'M', '1979-03-27', '신경과', '전문의',
    { '말투': '차분하고 논리적인 존댓말', '성격': '분석적이고 침착함', '진료스타일': '증상의 원인을 그림 그리듯 순서대로 설명', '소개': '원인을 순서대로 풀어 설명하는 신경과 전문의' }],
  ['doctor9', '윤미래', 'F', '1962-07-08', '안과', '과장',
    { '말투': '따뜻하고 느긋한 존댓말', '성격': '너그럽고 경험 많은 원로', '진료스타일': '고령 환자 눈높이에 맞춘 쉬운 설명', '소개': '눈높이 설명이 장기인 경험 많은 안과 전문의' }],
  ['doctor10', '서연우', 'F', '1993-12-16', '이비인후과', '전문의',
    { '말투': '빠릿하고 친근한 존댓말', '성격': '활기차고 실용적', '진료스타일': '핵심 처치와 주의사항을 간결하게 안내', '소개': '핵심만 간결하게 안내하는 이비인후과 전문의' }],
];

// ── 2b. 신규 간호사 (ward는 admissions에 실존하는 병동 값만) ──
const NEW_NURSES = [
  ['nurse6', '김태오', 'M', '1996-04-09', '내과 병동'],
  ['nurse7', '조은별', 'F', '1985-09-21', '외과 병동'],
  ['nurse8', '문성호', 'M', '1972-11-30', '외과 병동'],
  ['nurse9', '배소현', 'F', '1978-06-14', '내과 병동'],
  ['nurse10', '신유나', 'F', '2000-01-25', '외과 병동'],
];

// ── 2c. 신규 환자 (연령·성별 다양화: 80대·유아·10대·30대·60대) ──
const NEW_PATIENTS = [
  ['patient6', '김복순', 'F', '1945-05-20', '010-3006-1001', '서울특별시 은평구 연서로 12'],
  ['patient7', '이준서', 'M', '2022-09-13', '010-3007-1002', '서울특별시 마포구 월드컵로 88'],
  ['patient8', '박서연', 'F', '2011-03-08', '010-3008-1003', '경기도 고양시 일산동구 중앙로 55'],
  ['patient9', '정태웅', 'M', '1990-07-04', '010-3009-1004', '서울특별시 관악구 남부순환로 210'],
  ['patient10', '한말자', 'F', '1958-12-01', '010-3010-1005', '경기도 부천시 소사로 33'],
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log(`seed-accounts-expand 시작 (모드: ${DRY ? 'DRY-RUN — 종료 시 ROLLBACK' : '실제 적용'})`);

    // 1) 기존 직원 profile 병합
    let f1 = 0, k1 = 0;
    for (const [un, sex, birth] of STAFF_FILL) {
      const r = await client.query(`SELECT id, profile ? 'sex' AS has FROM users WHERE username=$1`, [un]);
      if (!r.rows.length) { console.warn(`  ! 계정 없음: ${un} — 건너뜀`); continue; }
      if (r.rows[0].has) { k1++; continue; }
      await client.query(`UPDATE users SET profile = profile || $2::jsonb WHERE id=$1`,
        [r.rows[0].id, JSON.stringify({ sex, birth_date: birth })]);
      f1++;
      if (DRY) console.log(`   - ${un} sex=${sex} birth_date=${birth} 병합 (예정)`);
    }
    console.log(`1) 기존 직원 sex/birth_date: +${f1}건 / =${k1}건 이미 정상`);

    // 2a) 신규 의사
    let d2 = 0, kd2 = 0;
    for (const [un, name, sex, birth, dept, title, persona] of NEW_DOCTORS) {
      const has = await client.query(`SELECT 1 FROM users WHERE username=$1`, [un]);
      if (has.rows.length) { kd2++; continue; }
      await client.query(
        `INSERT INTO users (username, password_hash, name, role, profile) VALUES ($1,$2,$3,'doctor',$4)`,
        [un, hashPassword('doctor1234'), name,
         JSON.stringify({ department: dept, title, sex, birth_date: birth, persona })]);
      d2++;
      if (DRY) console.log(`   - ${un} ${name} (${dept}) 생성 (예정)`);
    }
    console.log(`2a) 신규 의사 6~10: +${d2}건 / =${kd2}건 이미 정상`);

    // 2b) 신규 간호사
    let n2 = 0, kn2 = 0;
    for (const [un, name, sex, birth, ward] of NEW_NURSES) {
      const has = await client.query(`SELECT 1 FROM users WHERE username=$1`, [un]);
      if (has.rows.length) { kn2++; continue; }
      await client.query(
        `INSERT INTO users (username, password_hash, name, role, profile) VALUES ($1,$2,$3,'nurse',$4)`,
        [un, hashPassword('nurse1234'), name,
         JSON.stringify({ ward, title: '간호사', sex, birth_date: birth })]);
      n2++;
      if (DRY) console.log(`   - ${un} ${name} (${ward}) 생성 (예정)`);
    }
    console.log(`2b) 신규 간호사 6~10: +${n2}건 / =${kn2}건 이미 정상`);

    // 2c) 신규 환자 — users + patients(연결). 기존 환자와 이름 충돌 시 경고 후 건너뜀.
    let p2 = 0, kp2 = 0;
    for (const [un, name, sex, birth, phone, address] of NEW_PATIENTS) {
      const has = await client.query(`SELECT 1 FROM users WHERE username=$1`, [un]);
      if (has.rows.length) { kp2++; continue; }
      const dup = await client.query(`SELECT id FROM patients WHERE name=$1`, [name]);
      if (dup.rows.length) { console.warn(`  ! 기존 환자와 이름 충돌: ${name} (patients ${dup.rows[0].id}) — ${un} 건너뜀`); continue; }
      const u = await client.query(
        `INSERT INTO users (username, password_hash, name, role, profile) VALUES ($1,$2,$3,'patient',$4) RETURNING id`,
        [un, hashPassword('patient1234'), name,
         JSON.stringify({ sex, birth_date: birth, phone, address })]);
      await client.query(
        `INSERT INTO patients (user_id, name, birth_date, sex, phone, address) VALUES ($1,$2,$3,$4,$5,$6)`,
        [u.rows[0].id, name, birth, sex, phone, address]);
      p2++;
      if (DRY) console.log(`   - ${un} ${name} (${sex}, ${birth}) 생성 (예정)`);
    }
    console.log(`2c) 신규 환자 6~10: +${p2}건 / =${kp2}건 이미 정상`);

    if (DRY) {
      await client.query('ROLLBACK');
      console.log('DRY-RUN → ROLLBACK 완료 (DB 미변경)');
    } else {
      await client.query('COMMIT');
      console.log('COMMIT 완료');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('seed-accounts-expand 실패 (ROLLBACK):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
