// ============================================================
// Basil Nexus — 확장 환자(patient6~10) 기본 EMR 시드
// 사용법:
//   node db/seed-emr-expand.js --dry-run   ← 변경 예정만 출력하고 ROLLBACK
//   node db/seed-emr-expand.js             ← 실제 적용 (COMMIT)
//
// 내용: 계정 확장으로 생긴 patient6~10이 EMR 0건이라 빈 환자로 보임 →
//       연령·진료과가 맞는 주치의(신규 doctor6~10 위주)를 배정해
//       진료·진단·처방·검사·바이탈·예약(과거 done + 미래 scheduled)을 채운다.
//  - patient6 김복순(80대): doctor9 안과(백내장) + doctor2 내과(고혈압)
//  - patient7 이준서(3세): doctor10 이비인후과(급성 중이염) — 소아 수치 주의
//  - patient8 박서연(10대): doctor7 피부과(아토피)
//  - patient9 정태웅(30대): doctor6 외과(충수염 수술 후 경과)
//  - patient10 한말자(60대): doctor8 신경과(양성 발작성 현훈)
//
// 원칙 (기존 시드 컨벤션):
//  - 날짜는 실행 시점 상대 (seed-demo2.js TODAY/at()/dateStr() 패턴)
//  - 트랜잭션 1개 + --dry-run이면 ROLLBACK (seed-unpaid-bills.js 패턴)
//  - 멱등: 자연키 존재검사 후 INSERT (seed-demo2 ensure 패턴을 client 기반으로)
//  - patient1~5 등 기존 데이터는 일절 건드리지 않음 (patient6~10 전용)
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

// ── 날짜 헬퍼 (seed-demo2.js 패턴) ──────────────────────────
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
function at(dayOffset, hh = 0, mm = 0) {
  return new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + dayOffset, hh, mm, 0, 0);
}
function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// 미래 예약용: 주말이면 다음 평일로 미룸 (3~14일 내 오프셋만 사용)
function weekday(dayOffset, hh, mm) {
  let d = at(dayOffset, hh, mm);
  while (d.getDay() === 0 || d.getDay() === 6) d = new Date(d.getTime() + 86400000);
  return d;
}
// 과거 진료·예약용: 주말이면 직전 평일로 당김 (실행 시점 상대 날짜라 요일이 변하므로 보정)
function pastWeekday(dayOffset, hh = 0, mm = 0) {
  let d = at(dayOffset, hh, mm);
  while (d.getDay() === 0 || d.getDay() === 6) d = new Date(d.getTime() - 86400000);
  return d;
}

// ── 환자별 시나리오 정의 ────────────────────────────────────
// doc: username(실행 시 users.id 조회 — id 하드코딩 금지)
const PLAN = [
  {
    username: 'patient6', // 김복순 (F, 1945 — 80대)
    encounters: [
      { doc: 'doctor9', dept: '안과', when: pastWeekday(-35, 10, 0), cc: '시야 흐림',
        note: '양안 노년성 백내장 — 우안 우세, 수술 시기 상담 예정', dxKey: 'cataract' },
      { doc: 'doctor2', dept: '내과', when: pastWeekday(-21, 9, 30), cc: '고혈압 정기 진료',
        note: '혈압 142/86 — 용량 유지, 저염식 교육', dxKey: 'htn' },
    ],
    diagnoses: {
      cataract: ['노년성 백내장', 'H25.9', pastWeekday(-35)],
      htn: ['본태성 고혈압', 'I10', pastWeekday(-21)],
    },
    prescriptions: [
      ['Amlodipine 5mg', '1일 1회, 아침 식후', pastWeekday(-21), null, true],
      ['인공눈물 점안액 0.5mL', '1일 4회, 양안 점안', pastWeekday(-35), null, true],
    ],
    labs: [
      [pastWeekday(-21), '총콜레스테롤', '205', '< 200', 'H'],
      [pastWeekday(-21), '공복혈당', '96', '70 ~ 99', null],
      [pastWeekday(-21), 'LDL-C', '128', '< 130', null],
    ],
    vitals: [
      [pastWeekday(-21, 9, 40), 142, 86, 96, 52.3, 22.9],
      [pastWeekday(-7, 9, 0), 138, 84, 94, 52.1, 22.8],
    ],
    appts: [
      { doc: 'doctor2', dept: '내과', when: pastWeekday(-21, 9, 30), kind: '진료', status: 'done' },
      { doc: 'doctor9', dept: '안과', when: weekday(7, 10, 30), kind: '진료', status: 'scheduled' },
    ],
  },
  {
    username: 'patient7', // 이준서 (M, 2022 — 3세)
    encounters: [
      { doc: 'doctor10', dept: '이비인후과', when: pastWeekday(-28, 16, 0), cc: '발열·우측 귀 통증',
        note: '우측 급성 중이염 — 항생제 시럽 7일 처방, 3일 후 재진 권고', dxKey: 'aom' },
      { doc: 'doctor10', dept: '이비인후과', when: pastWeekday(-5, 15, 30), cc: '중이염 경과 재진',
        note: '삼출액 소량 잔존 — 항생제 시럽 5일 재처방, 다음 주 경과 확인', dxKey: null },
    ],
    diagnoses: { aom: ['급성 중이염', 'H66.9', pastWeekday(-28)] },
    prescriptions: [
      ['Amoxicillin syrup 250mg/5mL (아목시실린 시럽)', '1일 3회, 5mL씩 식후', pastWeekday(-28), pastWeekday(-21), false],
      ['Cefaclor syrup 125mg/5mL (세파클러 시럽)', '1일 3회, 4mL씩 식후', pastWeekday(-5), null, true],
    ],
    labs: [
      [pastWeekday(-28), 'CRP', '1.2', '< 0.5', 'H'],
      [pastWeekday(-28), 'WBC', '11.2', '4.0 ~ 10.0', 'H'],
      [pastWeekday(-5), 'CRP', '0.4', '< 0.5', null],
    ],
    vitals: [ // 3세 — 소아 수치
      [pastWeekday(-28, 16, 10), 95, 60, null, 14.2, 16.0],
      [pastWeekday(-5, 15, 40), 96, 58, null, 14.3, 16.1],
    ],
    appts: [
      { doc: 'doctor10', dept: '이비인후과', when: pastWeekday(-5, 15, 30), kind: '진료', status: 'done' },
      { doc: 'doctor10', dept: '이비인후과', when: weekday(5, 16, 0), kind: '진료', status: 'scheduled' },
    ],
  },
  {
    username: 'patient8', // 박서연 (F, 2011 — 10대)
    encounters: [
      { doc: 'doctor7', dept: '피부과', when: pastWeekday(-42, 17, 0), cc: '팔꿈치 안쪽 가려움·발진',
        note: '아토피 피부염 중등도 — 보습제·국소 스테로이드 시작, 4주 후 재평가', dxKey: 'ad' },
      { doc: 'doctor7', dept: '피부과', when: pastWeekday(-14, 17, 30), cc: '아토피 경과 재진',
        note: '병변 호전 추세 — 보습 유지, 스테로이드 격일로 감량', dxKey: null },
    ],
    diagnoses: { ad: ['아토피 피부염', 'L20.9', pastWeekday(-42)] },
    prescriptions: [
      ['Hydrocortisone 1% cream', '1일 2회, 병변부 얇게 도포', pastWeekday(-42), null, true],
      ['세라마이드 보습제', '1일 2회 이상, 전신 도포', pastWeekday(-42), null, true],
    ],
    labs: [
      [pastWeekday(-42), 'Total IgE', '320', '< 100', 'H'],
      [pastWeekday(-42), '호산구(%)', '6.8', '0 ~ 5', 'H'],
      [pastWeekday(-42), 'CRP', '0.2', '< 0.5', null],
    ],
    vitals: [
      [pastWeekday(-42, 17, 10), 108, 68, null, 51.0, 20.1],
    ],
    appts: [
      { doc: 'doctor7', dept: '피부과', when: pastWeekday(-14, 17, 30), kind: '진료', status: 'done' },
      { doc: 'doctor7', dept: '피부과', when: weekday(10, 17, 0), kind: '진료', status: 'scheduled' },
    ],
  },
  {
    username: 'patient9', // 정태웅 (M, 1990 — 30대)
    encounters: [
      { doc: 'doctor6', dept: '외과', when: pastWeekday(-24, 11, 0), cc: '우하복부 통증',
        note: '급성 충수염 — 복강경 충수절제술 시행, 경과 양호 퇴원', dxKey: 'appy' },
      { doc: 'doctor6', dept: '외과', when: pastWeekday(-10, 14, 0), cc: '수술 후 경과 관찰',
        note: '창상 치유 양호 — 실밥 제거, 2주 후 최종 확인', dxKey: null },
    ],
    diagnoses: { appy: ['급성 충수염', 'K35.8', pastWeekday(-24)] },
    prescriptions: [
      ['Acetaminophen 650mg', '1일 3회, 통증 시', pastWeekday(-24), pastWeekday(-10), false],
      ['유산균 정장제', '1일 2회, 아침저녁 식후', pastWeekday(-10), null, true],
    ],
    labs: [
      [pastWeekday(-24), 'WBC', '13.5', '4.0 ~ 10.0', 'H'],
      [pastWeekday(-24), 'CRP', '3.8', '< 0.5', 'H'],
      [pastWeekday(-10), 'WBC', '7.2', '4.0 ~ 10.0', null],
    ],
    vitals: [
      [pastWeekday(-24, 10, 50), 128, 80, null, 78.5, 24.8],
      [pastWeekday(-10, 14, 10), 122, 78, null, 78.0, 24.6],
    ],
    appts: [
      { doc: 'doctor6', dept: '외과', when: pastWeekday(-10, 14, 0), kind: '진료', status: 'done' },
      { doc: 'doctor6', dept: '외과', when: weekday(4, 14, 30), kind: '진료', status: 'scheduled' },
    ],
  },
  {
    username: 'patient10', // 한말자 (F, 1958 — 60대)
    encounters: [
      { doc: 'doctor8', dept: '신경과', when: pastWeekday(-30, 10, 30), cc: '반복되는 회전성 어지럼',
        note: '양성 발작성 두위 현훈(BPPV) — 이석정복술 시행, 전정재활운동 교육', dxKey: 'bppv' },
      { doc: 'doctor8', dept: '신경과', when: pastWeekday(-9, 11, 0), cc: '어지럼 경과 재진',
        note: '발작 빈도 감소 — 재활운동 유지, 재발 시 조기 내원 안내', dxKey: null },
    ],
    diagnoses: { bppv: ['양성 발작성 현훈', 'H81.1', pastWeekday(-30)] },
    prescriptions: [
      ['Betahistine 16mg', '1일 3회, 식후', pastWeekday(-30), null, true],
      ['Dimenhydrinate 50mg', '어지럼 심할 때 1정, 1일 2회까지', pastWeekday(-30), null, true],
    ],
    labs: [
      [pastWeekday(-30), '공복혈당', '108', '70 ~ 99', 'H'],
      [pastWeekday(-30), '총콜레스테롤', '195', '< 200', null],
      [pastWeekday(-30), '혈색소', '12.8', '12 ~ 16', null],
    ],
    vitals: [
      [pastWeekday(-30, 10, 40), 135, 82, 108, 58.9, 24.1],
    ],
    appts: [
      { doc: 'doctor8', dept: '신경과', when: pastWeekday(-9, 11, 0), kind: '진료', status: 'done' },
      { doc: 'doctor8', dept: '신경과', when: weekday(12, 11, 0), kind: '진료', status: 'scheduled' },
    ],
  },
];

(async () => {
  const client = await pool.connect(); // 트랜잭션은 단일 커넥션에서
  // ── ensure 헬퍼 (자연키 존재검사 후 INSERT — seed-demo2 패턴의 client판) ──
  async function ensure(entity, checkSql, checkParams, insertSql, insertParams) {
    const r = await client.query(checkSql, checkParams);
    if (r.rows.length) { tally(entity, false); return r.rows[0].id; }
    const w = await client.query(insertSql, insertParams);
    tally(entity, true);
    return w.rows[0] ? w.rows[0].id : null;
  }
  const docId = async (username) => { // 의사 배정은 반드시 username으로 조회
    const r = await client.query(`SELECT id FROM users WHERE username=$1 AND role='doctor'`, [username]);
    return r.rows.length ? r.rows[0].id : null;
  };
  try {
    await client.query('BEGIN');
    console.log(`seed-emr-expand 시작 (모드: ${DRY ? 'DRY-RUN — 종료 시 ROLLBACK' : '실제 적용'}, 기준일 ${dateStr(TODAY)})`);

    for (const P of PLAN) {
      const pr = await client.query(
        `SELECT p.id, p.name FROM users u JOIN patients p ON p.user_id=u.id WHERE u.username=$1`, [P.username]);
      if (!pr.rows.length) { console.warn(`  ! ${P.username}: patients 연결 없음 — 건너뜀 (먼저 node db/seed-accounts-expand.js)`); continue; }
      const pid = pr.rows[0].id;
      if (DRY) console.log(` - ${P.username} ${pr.rows[0].name} (pid ${pid})`);

      // encounters (+ dxKey가 있으면 diagnoses를 encounter에 연결)
      const encIds = {};
      for (const e of P.encounters) {
        const did = await docId(e.doc);
        if (!did) { console.warn(`  ! 의사 없음: ${e.doc} — ${P.username} encounter 건너뜀`); continue; }
        const eid = await ensure('encounters',
          `SELECT id FROM encounters WHERE patient_id=$1 AND visited_at=$2`, [pid, e.when],
          `INSERT INTO encounters (patient_id, doctor_id, visited_at, visit_type, department, chief_complaint, note)
           VALUES ($1,$2,$3,'outpatient',$4,$5,$6) RETURNING id`,
          [pid, did, e.when, e.dept, e.cc, e.note]);
        if (e.dxKey) encIds[e.dxKey] = eid;
      }
      // diagnoses (encounter_id 연결)
      for (const [key, [name, code, when]] of Object.entries(P.diagnoses)) {
        await ensure('diagnoses',
          `SELECT id FROM diagnoses WHERE patient_id=$1 AND name=$2`, [pid, name],
          `INSERT INTO diagnoses (patient_id, encounter_id, name, code, diagnosed_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [pid, encIds[key] || null, name, code, dateStr(when)]);
      }
      // prescriptions
      for (const [drug, dosage, start, end, active] of P.prescriptions) {
        await ensure('prescriptions',
          `SELECT id FROM prescriptions WHERE patient_id=$1 AND drug_name=$2`, [pid, drug],
          `INSERT INTO prescriptions (patient_id, drug_name, dosage, start_date, end_date, active)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [pid, drug, dosage, dateStr(start), end ? dateStr(end) : null, active]);
      }
      // lab_results (같은 항목의 시점별 결과 허용 — 날짜 포함 자연키)
      for (const [when, test, value, ref, flag] of P.labs) {
        await ensure('lab_results',
          `SELECT id FROM lab_results WHERE patient_id=$1 AND tested_at=$2::date AND test_name=$3`,
          [pid, dateStr(when), test],
          `INSERT INTO lab_results (patient_id, tested_at, test_name, value, ref_range, flag)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [pid, dateStr(when), test, value, ref, flag]);
      }
      // vitals
      for (const [when, sys, dia, glu, w, bmi] of P.vitals) {
        await ensure('vitals',
          `SELECT id FROM vitals WHERE patient_id=$1 AND measured_at=$2`, [pid, when],
          `INSERT INTO vitals (patient_id, measured_at, systolic, diastolic, glucose, weight_kg, bmi)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [pid, when, sys, dia, glu, w, bmi]);
      }
      // appointments (과거 done 1 + 미래 scheduled 1)
      for (const a of P.appts) {
        const did = await docId(a.doc);
        if (!did) { console.warn(`  ! 의사 없음: ${a.doc} — ${P.username} appointment 건너뜀`); continue; }
        await ensure('appointments',
          `SELECT id FROM appointments WHERE patient_id=$1 AND scheduled_at=$2`, [pid, a.when],
          `INSERT INTO appointments (patient_id, doctor_id, scheduled_at, department, kind, status)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [pid, did, a.when, a.dept, a.kind, a.status]);
        if (DRY) console.log(`     예약 ${dateStr(a.when)} ${a.dept} ${a.kind} (${a.status}) — ${a.doc}`);
      }
    }

    // ── 결과 출력 ──────────────────────────────────────────────
    console.log('entity별 inserted / skipped(기존 재사용):');
    for (const [k, v] of Object.entries(stats)) {
      console.log(`  ${k.padEnd(14)} +${String(v.inserted).padStart(3)} / =${v.skipped}`);
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
    console.error('seed-emr-expand 실패 (ROLLBACK):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
