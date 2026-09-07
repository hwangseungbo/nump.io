// ============================================================
// Basil Nexus — 환자용 방문 요약 시드 (기존 encounter 보강)
// 사용법:
//   node db/seed-patient-summaries.js --dry-run   ← 변경 예정만 출력하고 ROLLBACK
//   node db/seed-patient-summaries.js             ← 실제 적용 (COMMIT)
//
// 전제: encounters.patient_summary 컬럼 (db/migrate-persona-fixes.sql — 관리자 적용 필요)
// 내용: 각 환자의 "가장 최근" encounter에 "오늘 확인한 것/진단/다음 할 일" 3줄 요약.
// 멱등: patient_summary가 비어 있을 때만 기록 (의사가 쓴 요약은 절대 덮어쓰지 않음).
// ============================================================
const { Pool } = require('pg');
const cfg = require('../db.config.json');

const DRY = process.argv.includes('--dry-run');
const pool = new Pool(cfg);

// [username, 3줄 요약]
const DATA = [
  ['patient1', '오늘 확인한 것: 혈압과 콜레스테롤 추이를 확인했어요.\n진단: 고지혈증은 약과 식이로 잘 조절되고 있어요.\n다음 할 일: 처방약을 그대로 드시고 다음 검사 때 다시 확인해요.'],
  ['patient2', '오늘 확인한 것: 골밀도 검사 결과와 약 복용 상태를 봤어요.\n진단: 골다공증은 약물 치료를 유지하는 단계예요.\n다음 할 일: 주 1회 약을 잊지 말고, 낙상에 특히 주의해 주세요.'],
  ['patient3', '오늘 확인한 것: 당화혈색소와 혈당 기록을 확인했어요.\n진단: 당뇨 수치가 조금씩 좋아지고 있어요.\n다음 할 일: 지금처럼 약과 식사 조절을 유지하면 됩니다.'],
  ['patient4', '오늘 확인한 것: 위염 증상과 복용 경과를 확인했어요.\n진단: 위염은 호전 추세예요.\n다음 할 일: 약을 끝까지 드시고, 속쓰림이 다시 심해지면 내원하세요.'],
  ['patient5', '오늘 확인한 것: 갑상선 호르몬 수치를 확인했어요.\n진단: 갑상선기능저하증은 약으로 조절 중이에요.\n다음 할 일: 아침 공복 복용을 지키고 다음 혈액검사 때 용량을 다시 봐요.'],
  ['patient9', '오늘 확인한 것: 수술 부위 회복 상태를 확인했어요.\n진단: 충수염 수술 후 경과가 좋아요.\n다음 할 일: 2주 후 마지막 확인 진료만 오시면 됩니다.'],
  ['patient10', '오늘 확인한 것: 어지럼 발작 빈도와 재활운동 수행을 확인했어요.\n진단: 이석증은 좋아지는 중이에요.\n다음 할 일: 재활운동을 계속하고, 어지럼이 심해지면 예약 전이라도 오세요.'],
];

(async () => {
  const client = await pool.connect();
  try {
    const has = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='encounters' AND column_name='patient_summary'`);
    if (!has.rows.length) {
      console.error('encounters.patient_summary 컬럼이 없습니다 — 먼저 관리자 PC에서:');
      console.error('  sudo -u postgres psql -d basilnexus -f db/migrate-persona-fixes.sql');
      process.exitCode = 1;
      return;
    }
    await client.query('BEGIN');
    console.log(`seed-patient-summaries 시작 (모드: ${DRY ? 'DRY-RUN — 종료 시 ROLLBACK' : '실제 적용'})`);
    let set = 0, kept = 0;
    for (const [un, summary] of DATA) {
      const r = await client.query(
        `SELECT e.id, e.visited_at::date AS d, e.patient_summary, p.name
           FROM encounters e JOIN patients p ON p.id=e.patient_id JOIN users u ON u.id=p.user_id
          WHERE u.username=$1 AND e.visited_at <= now()
          ORDER BY e.visited_at DESC LIMIT 1`, [un]);
      if (!r.rows.length) { console.warn(`  ! 진료 기록 없음: ${un} — 건너뜀`); continue; }
      const e = r.rows[0];
      if (e.patient_summary) { kept++; continue; } // 의사 작성분 보호
      await client.query(`UPDATE encounters SET patient_summary=$1 WHERE id=$2`, [summary, e.id]);
      set++;
      if (DRY) console.log(`   - ${un} ${e.name} (encounter ${e.id}, ${String(e.d).slice(0, 10)}) 요약 3줄 (예정)`);
    }
    console.log(`환자용 요약: +${set}건 / =${kept}건 이미 작성됨`);
    if (DRY) {
      await client.query('ROLLBACK');
      console.log('DRY-RUN → ROLLBACK 완료 (DB 미변경)');
    } else {
      await client.query('COMMIT');
      console.log('COMMIT 완료');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('seed-patient-summaries 실패 (ROLLBACK):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
