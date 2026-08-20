// ============================================================
// Basil Nexus — 미납 청구 보충 스크립트 (토스 결제 테스트용)
// 사용법:
//   node db/seed-unpaid-bills.js --dry-run   ← 변경 예정만 출력하고 ROLLBACK
//   node db/seed-unpaid-bills.js             ← 실제 적용 (COMMIT)
//
// 내용: 로그인 가능한 환자 계정(users.role='patient')의 환자마다
//       미납(bills.paid=FALSE)이 최소 MIN_UNPAID건이 되도록 부족분만 INSERT.
//       결제 테스트로 미납이 소진되면 재실행해서 보충한다 (top-up 멱등:
//       이미 충분한 환자는 건드리지 않고, 항목·금액·날짜는 결정적으로 생성).
// 원칙: 트랜잭션 1개, --dry-run이면 ROLLBACK. 출력은 "+N건 / =M명 이미 정상".
// ============================================================
const { Pool } = require('pg');
const cfg = require('../db.config.json');

const DRY = process.argv.includes('--dry-run');
const pool = new Pool(cfg);

const MIN_UNPAID = 4;
// [항목, 금액(원)] — 외래 진료비 규모의 현실적인 값
const ITEMS = [
  ['외래 진찰료', 16500],
  ['혈액검사 비용', 45000],
  ['X-ray 촬영료', 28000],
  ['물리치료비', 12000],
  ['처방조제료', 8500],
  ['초음파 검사비', 65000],
  ['심전도 검사비', 22000],
  ['주사 처치료', 9800],
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log(`seed-unpaid-bills 시작 (모드: ${DRY ? 'DRY-RUN — 종료 시 ROLLBACK' : '실제 적용'}, 목표: 환자당 미납 ${MIN_UNPAID}건 이상)`);

    const pats = await client.query(
      `SELECT p.id, p.name, count(b.id) FILTER (WHERE NOT b.paid)::int AS unpaid
         FROM users u JOIN patients p ON p.user_id = u.id
         LEFT JOIN bills b ON b.patient_id = p.id
        WHERE u.role = 'patient'
        GROUP BY p.id, p.name ORDER BY p.id`);

    let added = 0, okPats = 0;
    for (const pat of pats.rows) {
      const need = MIN_UNPAID - pat.unpaid;
      if (need <= 0) { okPats++; continue; }
      for (let i = 0; i < need; i++) {
        // 결정적 생성: 항목은 (환자id*3 + 기존미납 + i)로 순환, 날짜는 최근 3주 내 분산
        const [item, amount] = ITEMS[(pat.id * 3 + pat.unpaid + i) % ITEMS.length];
        const daysAgo = (pat.id + i * 5) % 21;
        await client.query(
          `INSERT INTO bills (patient_id, billed_at, item, amount, paid)
           VALUES ($1, CURRENT_DATE - $2::int, $3, $4, FALSE)`,
          [pat.id, daysAgo, item, amount]);
        added++;
        if (DRY) console.log(`   - ${pat.name}(${pat.id}): ${item} ${amount.toLocaleString()}원, ${daysAgo}일 전 (예정)`);
      }
    }
    console.log(`미납 보충: +${added}건 / =${okPats}명 이미 정상 (환자 계정 ${pats.rows.length}명)`);

    if (DRY) {
      await client.query('ROLLBACK');
      console.log('DRY-RUN → ROLLBACK 완료 (DB 미변경)');
    } else {
      await client.query('COMMIT');
      console.log('COMMIT 완료');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('seed-unpaid-bills 실패 (ROLLBACK):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
