// ============================================================
// Basil Nexus — 데모 데이터 최신화 시드 (F)
// 사용법:
//   node db/seed-demo-refresh.js --dry-run   ← 변경 예정만 출력하고 ROLLBACK
//   node db/seed-demo-refresh.js             ← 실제 적용 (COMMIT)
//
// 배경(3자 점검): 간호기록·서류·메모 시드가 8/3~4 고정이라 이번 달 통계가 0,
// 입원 환자 22명이 active 처방 0건이라 투약 워크리스트 meds가 비고,
// 간호사 빠른 연락처의 의사 전화가 전부 '-'.
//
// 내용 (전부 멱등 · 상대 날짜 · 추가/병합만):
//  1. 최근 간호기록 — 어제·오늘 병동 라운딩 (간호사 5명 × 환자 순환)
//  2. 최근 서류 — 신청 4건(오늘·어제) + 발급 3건(2~5일 전)
//  3. 최근 메모 — 3건 (오늘·어제)
//  4. 투약 처방 보정 — admitted인데 active 처방 0건인 환자에게 기본 처방 1건
//  5. 의사 내선번호 — profile.phone 없으면 데모 내선 병합 (기존 값 보존)
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
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
function at(dayOffset, hh = 0, mm = 0) {
  return new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + dayOffset, hh, mm, 0, 0);
}
function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const NOTE_KINDS = ['활력징후', '투약', '처치', '간호기록'];
const NOTE_TEXT = {
  '활력징후': '활력징후 측정 — 정상 범위',
  '투약': '처방 약물 투약 시행',
  '처치': '드레싱/수액 처치 시행',
  '간호기록': '상태 안정, 특이사항 없음'
};
// 투약 보정용 기본 처방 풀 (seed-demo2 RX_POOL 계열)
const RX_POOL = [
  ['Omeprazole 20mg', '1일 1회, 아침 식전'],
  ['Acetaminophen 650mg', '1일 3회, 식후'],
  ['Amlodipine 5mg', '1일 1회, 아침 식후'],
  ['Levocetirizine 5mg', '1일 1회, 취침 전'],
  ['Ibuprofen 400mg', '1일 3회, 식후'],
];
const DOCS_ADD = [ // [환자 순번(입원자 목록 기준), doc_type, 상대일, status]
  [0, '검사결과서', 0, 'requested'], [2, '진단서', 0, 'requested'],
  [4, '처방전', -1, 'requested'], [6, '소견서', -1, 'requested'],
  [1, '진단서', -3, 'issued'], [3, '보험서류', -4, 'issued'], [5, '의무기록 사본', -5, 'issued'],
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log(`seed-demo-refresh 시작 (모드: ${DRY ? 'DRY-RUN — 종료 시 ROLLBACK' : '실제 적용'}, 기준일 ${dateStr(TODAY)})`);

    const adm = await client.query(
      `SELECT p.id, p.name, a.ward FROM admissions a JOIN patients p ON p.id=a.patient_id
        WHERE a.status='admitted' ORDER BY a.ward, a.room, p.id`);
    const nurses = await client.query(
      `SELECT id, name, profile->>'ward' AS ward FROM users
        WHERE role='nurse' AND active AND username IN ('nurse1','nurse2','nurse3','nurse4','nurse5') ORDER BY id`);
    const byWard = {};
    adm.rows.forEach((r) => { (byWard[r.ward] ||= []).push(r); });

    // 1) 최근 간호기록 — 어제·오늘, 간호사별 담당 병동 환자 4명 순환
    for (let day = -1; day <= 0; day++) {
      for (let ni = 0; ni < nurses.rows.length; ni++) {
        const nrs = nurses.rows[ni];
        const pats = byWard[nrs.ward] || [];
        for (let k = 0; k < 4 && pats.length; k++) {
          const pat = pats[(ni * 4 + k + (day + 1) * 3) % pats.length];
          const kind = NOTE_KINDS[(ni + k) % NOTE_KINDS.length];
          const when = at(day, 7 + ni * 2, (k * 15) % 60);
          if (when.getTime() > Date.now()) continue; // 오늘 미래 시각은 생략
          const has = await client.query(
            `SELECT 1 FROM nursing_notes WHERE patient_id=$1 AND nurse_id=$2 AND note_type=$3 AND created_at::date=$4::date`,
            [pat.id, nrs.id, kind, dateStr(when)]);
          if (has.rows.length) { tally('nursing_notes', false); continue; }
          await client.query(
            `INSERT INTO nursing_notes (patient_id, nurse_id, note_type, content, created_at) VALUES ($1,$2,$3,$4,$5)`,
            [pat.id, nrs.id, kind, `${pat.name} ${NOTE_TEXT[kind]}`, when]);
          tally('nursing_notes', true);
        }
      }
    }
    console.log(`1) 최근 간호기록: +${(stats.nursing_notes || {}).inserted || 0} / =${(stats.nursing_notes || {}).skipped || 0}`);

    // 2) 최근 서류 — 멱등 키 (patient_id, doc_type, requested_at::date)
    for (const [idx, docType, dd, status] of DOCS_ADD) {
      const pat = adm.rows[idx % adm.rows.length];
      if (!pat) continue;
      const when = at(dd, 9, 20 + idx * 7);
      const has = await client.query(
        `SELECT 1 FROM documents WHERE patient_id=$1 AND doc_type=$2 AND requested_at::date=$3::date`,
        [pat.id, docType, dateStr(when)]);
      if (has.rows.length) { tally('documents', false); continue; }
      await client.query(
        `INSERT INTO documents (patient_id, doc_type, requested_at, status) VALUES ($1,$2,$3,$4)`,
        [pat.id, docType, when, status]);
      tally('documents', true);
      if (DRY) console.log(`   - 서류: ${pat.name} ${docType} (${dateStr(when)}, ${status})`);
    }
    console.log(`2) 최근 서류: +${(stats.documents || {}).inserted || 0} / =${(stats.documents || {}).skipped || 0}`);

    // 3) 최근 메모 — 멱등 키 (author_id, content)
    const MEMOS = [
      ['doctor2', `${dateStr(at(0)).slice(5)} 회진 후 1206호 수액 속도 재확인 부탁드립니다.`, at(0, 8, 40)],
      ['nurse1', '내과 병동 야간 라운딩 시 낙상 고위험 환자 침상 난간 확인 완료.', at(0, 7, 10)],
      ['nurse2', '외과 병동 드레싱 카트 소모품 보충했습니다.', at(-1, 16, 20)],
    ];
    for (const [un, content, when] of MEMOS) {
      const u = await client.query(`SELECT id FROM users WHERE username=$1`, [un]);
      if (!u.rows.length) continue;
      const has = await client.query(`SELECT 1 FROM memos WHERE author_id=$1 AND content=$2`, [u.rows[0].id, content]);
      if (has.rows.length) { tally('memos', false); continue; }
      await client.query(
        `INSERT INTO memos (author_id, target_role, content, created_at) VALUES ($1,'nurse',$2,$3)`,
        [u.rows[0].id, content, when]);
      tally('memos', true);
    }
    console.log(`3) 최근 메모: +${(stats.memos || {}).inserted || 0} / =${(stats.memos || {}).skipped || 0}`);

    // 4) 투약 처방 보정 — admitted + active 처방 0건 (투약 워크리스트 meds 공백 원인)
    const noRx = await client.query(
      `SELECT p.id, p.name FROM admissions a JOIN patients p ON p.id=a.patient_id
        WHERE a.status='admitted'
          AND NOT EXISTS (SELECT 1 FROM prescriptions rx WHERE rx.patient_id=p.id AND rx.active)
        ORDER BY p.id`);
    for (let i = 0; i < noRx.rows.length; i++) {
      const pat = noRx.rows[i];
      const [drug, dosage] = RX_POOL[i % RX_POOL.length];
      const has = await client.query(
        `SELECT 1 FROM prescriptions WHERE patient_id=$1 AND drug_name=$2`, [pat.id, drug]);
      if (has.rows.length) { tally('prescriptions', false); continue; }
      await client.query(
        `INSERT INTO prescriptions (patient_id, drug_name, dosage, start_date, active) VALUES ($1,$2,$3,$4,TRUE)`,
        [pat.id, drug, dosage, dateStr(at(-(3 + (i % 10))))]);
      tally('prescriptions', true);
      if (DRY) console.log(`   - 처방 보정: ${pat.name} ← ${drug}`);
    }
    console.log(`4) 투약 처방 보정(대상 ${noRx.rows.length}명): +${(stats.prescriptions || {}).inserted || 0} / =${(stats.prescriptions || {}).skipped || 0}`);

    // 5) 의사 내선번호 — profile.phone 없을 때만 병합 (기존 값 보존)
    const docs = await client.query(
      `SELECT id, username, name, profile->>'phone' AS phone FROM users WHERE role='doctor' AND active ORDER BY id`);
    let ph = 0, kp = 0;
    for (let i = 0; i < docs.rows.length; i++) {
      const d = docs.rows[i];
      if (d.phone) { kp++; continue; }
      const ext = `02-6300-71${String(10 + i).slice(-2)}`; // 데모 내선
      await client.query(`UPDATE users SET profile = profile || $2::jsonb WHERE id=$1`,
        [d.id, JSON.stringify({ phone: ext })]);
      ph++;
      if (DRY) console.log(`   - 내선: ${d.username} ${d.name} → ${ext}`);
    }
    console.log(`5) 의사 내선번호: +${ph} / =${kp}`);

    if (DRY) {
      await client.query('ROLLBACK');
      console.log('DRY-RUN → ROLLBACK 완료 (DB 미변경)');
    } else {
      await client.query('COMMIT');
      console.log('COMMIT 완료');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('seed-demo-refresh 실패 (ROLLBACK):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
