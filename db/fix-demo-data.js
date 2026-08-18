// ============================================================
// Basil Nexus — 데모 데이터 정리 스크립트 (P1 시연 신뢰성)
// 사용법:
//   node db/fix-demo-data.js --dry-run   ← 변경 예정 건수만 출력하고 ROLLBACK
//   node db/fix-demo-data.js             ← 실제 적용 (COMMIT)
//
// 내용 (전부 결정적·멱등 — 재실행 안전):
//  0. doctor1 개명 홍길동→홍성민 (환자 홍길동과 동명이인 혼란 해소)
//     + memos.content의 '홍길동 의사/원장' → '홍성민 의사/원장'
//     (환자 홍길동 언급 오염 방지를 위해 '의사'/'원장' 접미사 패턴만 치환)
//  1. 지난 날짜의 'scheduled' 예약 → id%12==0이면 no_show, 아니면 done
//  2. 오늘이지만 이미 지난 시각의 'scheduled' 예약 → done
//     (시간이 흐르면 대상이 늘어나므로 재실행으로 언제든 갱신)
//  3. 입원 정리: 김도윤(admission 27)·하진서(24)·정승환(5) 퇴원 처리,
//     나머지 admitted인데 퇴원 예정일이 지난 건은 CURRENT_DATE + (id%7+2)일로 연장
//  4. 소아 처방 교체: prescriptions id=10 (김도윤 7세, Amlodipine 5mg)
//     → Cetirizine syrup (알레르기 비염에 적합)
//
// 원칙: 트랜잭션 1개로 묶고 --dry-run이면 ROLLBACK. 출력은 "+N건 변경 / =M건 이미 정상".
// ============================================================
const { Pool } = require('pg');
const cfg = require('../db.config.json');

const DRY = process.argv.includes('--dry-run');
const pool = new Pool(cfg);

// 지정 퇴원 대상: [admission id, 환자 이름(안전 가드 — 불일치 시 건너뛰고 경고)]
const DISCHARGE_TARGETS = [
  [27, '김도윤'],   // 7세 내과 병동 입원 어색함 해소
  [24, '하진서'],   // "이번 달 퇴원 0" 해소
  [5,  '정승환'],
];
const NEW_DRUG = 'Cetirizine syrup 5mg/5mL (세티리진 시럽)';
const NEW_DOSAGE = '1일 1회, 저녁 식후';

(async () => {
  const client = await pool.connect(); // 트랜잭션은 단일 커넥션에서
  try {
    await client.query('BEGIN');
    console.log(`fix-demo-data 시작 (모드: ${DRY ? 'DRY-RUN — 종료 시 ROLLBACK' : '실제 적용'})`);

    // ── 0. doctor1 개명 + memos 치환 ───────────────────────────
    const ok0 = await client.query(
      `SELECT count(*)::int AS n FROM users WHERE username = 'doctor1' AND name = '홍성민'`);
    const upd0 = await client.query(
      `UPDATE users SET name = '홍성민' WHERE username = 'doctor1' AND name = '홍길동' RETURNING id`);
    console.log(`0) doctor1 개명(홍길동→홍성민): +${upd0.rowCount}건 변경 / =${ok0.rows[0].n}건 이미 정상`);
    const ok0m = await client.query(
      `SELECT count(*)::int AS n FROM memos WHERE content LIKE '%홍성민 의사%' OR content LIKE '%홍성민 원장%'`);
    const upd0m = await client.query(
      `UPDATE memos SET content = replace(replace(content, '홍길동 의사', '홍성민 의사'), '홍길동 원장', '홍성민 원장')
        WHERE content LIKE '%홍길동 의사%' OR content LIKE '%홍길동 원장%' RETURNING id`);
    console.log(`0) memos 의사/원장 호칭 치환: +${upd0m.rowCount}건 변경 / =${ok0m.rows[0].n}건 이미 정상`);

    // ── 1. 지난 날짜 'scheduled' 예약 → done / no_show ─────────
    const ok1 = await client.query(
      `SELECT count(*)::int AS n FROM appointments
        WHERE scheduled_at < CURRENT_DATE AND status <> 'scheduled'`);
    const upd1 = await client.query(
      `UPDATE appointments
          SET status = CASE WHEN id % 12 = 0 THEN 'no_show' ELSE 'done' END
        WHERE scheduled_at < CURRENT_DATE AND status = 'scheduled'
        RETURNING (id % 12 = 0) AS ns`);
    const ns1 = upd1.rows.filter((r) => r.ns).length;
    console.log(`1) 지난 예약 정리: +${upd1.rowCount}건 변경 (done ${upd1.rowCount - ns1} / no_show ${ns1}) / =${ok1.rows[0].n}건 이미 정상`);

    // ── 2. 오늘 지난 시각 'scheduled' 예약 → done ──────────────
    const ok2 = await client.query(
      `SELECT count(*)::int AS n FROM appointments
        WHERE scheduled_at::date = CURRENT_DATE AND scheduled_at < now() AND status <> 'scheduled'`);
    const upd2 = await client.query(
      `UPDATE appointments SET status = 'done'
        WHERE scheduled_at::date = CURRENT_DATE AND scheduled_at < now() AND status = 'scheduled'
        RETURNING id`);
    console.log(`2) 오늘 지난 시각 예약 완료 처리: +${upd2.rowCount}건 변경 / =${ok2.rows[0].n}건 이미 정상`);

    // ── 3a. 지정 입원 건 퇴원 처리 (환자 이름 가드) ────────────
    let dChanged = 0, dAlready = 0;
    for (const [aid, pname] of DISCHARGE_TARGETS) {
      const row = await client.query(
        `SELECT a.status, p.name FROM admissions a JOIN patients p ON p.id = a.patient_id WHERE a.id = $1`, [aid]);
      if (!row.rows.length || row.rows[0].name !== pname) {
        console.warn(`   ! admission ${aid}(${pname}) 대상 불일치/없음 — 건너뜀 (실제: ${row.rows.length ? row.rows[0].name : '없음'})`);
        continue;
      }
      if (row.rows[0].status === 'discharged') { dAlready++; continue; }
      await client.query(`UPDATE admissions SET status = 'discharged' WHERE id = $1`, [aid]);
      dChanged++;
      if (DRY) console.log(`   - admission ${aid} ${pname} → discharged (예정)`);
    }
    console.log(`3a) 지정 퇴원(김도윤·하진서·정승환): +${dChanged}건 변경 / =${dAlready}건 이미 정상`);

    // ── 3b. 남은 admitted 중 퇴원 예정일 초과 → 연장 ───────────
    const ok3 = await client.query(
      `SELECT count(*)::int AS n FROM admissions WHERE status = 'admitted' AND discharge_due >= CURRENT_DATE`);
    const upd3 = await client.query(
      `UPDATE admissions SET discharge_due = CURRENT_DATE + ((id % 7) + 2)
        WHERE status = 'admitted' AND discharge_due < CURRENT_DATE
        RETURNING id, discharge_due::date AS dd`);
    console.log(`3b) 퇴원 예정일 연장(+2~+8일 분산): +${upd3.rowCount}건 변경 / =${ok3.rows[0].n}건 이미 정상`);

    // ── 4. 소아 처방 교체 (id=10, 김도윤 소유 가드) ────────────
    const rx = await client.query(`SELECT patient_id, drug_name FROM prescriptions WHERE id = 10`);
    if (!rx.rows.length || rx.rows[0].patient_id !== 30) {
      console.warn(`   ! prescriptions id=10 대상 불일치/없음 — 건너뜀`);
      console.log(`4) 소아 처방 교체: +0건 변경 / =0건 이미 정상`);
    } else if (rx.rows[0].drug_name === NEW_DRUG) {
      console.log(`4) 소아 처방 교체: +0건 변경 / =1건 이미 정상`);
    } else {
      await client.query(`UPDATE prescriptions SET drug_name = $1, dosage = $2 WHERE id = 10`, [NEW_DRUG, NEW_DOSAGE]);
      console.log(`4) 소아 처방 교체: +1건 변경 (${rx.rows[0].drug_name} → ${NEW_DRUG}) / =0건 이미 정상`);
    }

    // ── 마무리 ─────────────────────────────────────────────────
    if (DRY) {
      await client.query('ROLLBACK');
      console.log('DRY-RUN → ROLLBACK 완료 (DB 미변경)');
    } else {
      await client.query('COMMIT');
      console.log('COMMIT 완료');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('fix-demo-data 실패 (ROLLBACK):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
