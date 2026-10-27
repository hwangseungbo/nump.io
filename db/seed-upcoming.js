// ============================================================
// Basil Nexus — 시연용 "이번 달" 데이터 채움 시드 (상대 날짜 · 멱등)
// 사용법:
//   node db/seed-upcoming.js --dry-run   ← 변경 예정 건수만 출력하고 ROLLBACK
//   node db/seed-upcoming.js             ← 실제 적용 (COMMIT)
//
// 배경: 예약·진료·수납 시드가 과거 날짜에 멈춰 있어 시연 시 "다가오는 예약 0건",
// 의사 대시보드 오늘 예약 0건, 이번 달 진료 0건으로 보임.
//
// 내용 (전부 결정적 해시 기반 — 재실행 시 전부 skip):
//  1. 데모 환자(patient1~10) 예약 — 오늘~월말, 주 2~3회, 단골 진료과·주치의 유지
//  2. 의사별 외래 스케줄 — 계정 없는 환자 순환 배정 (평일 3~5건/일, 토요일 오전 2건)
//  3. 입원 병동 워크리스트 — 매일 투약/처치/검사 8건 (간호 대시보드 태그용)
//  4. 이번 달 1일~어제 외래 진료 백필 + 데모 환자 수납(기납부 — 미납 시나리오 보존)
//     · 오늘 지난 시각 슬롯은 status='done'으로 넣고 진료 기록도 1:1 생성
//  5. 데모 환자 주간 바이탈(기존 마지막 측정치 연속) · 최근 7일 검사결과,
//     입원 환자 어제·오늘 병동 바이탈
//
// 일요일은 외래 휴진(병동 워크리스트만), 토요일은 오전만. 점심 12:30~14:00 제외.
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
// 결정적 해시 (FNV-1a) — Math.random 금지, 재실행 동일 결과
function H(...xs) {
  let h = 2166136261;
  for (const x of xs) { h ^= x & 0xffff; h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 13; }
  return h >>> 0;
}
const NOW = new Date();
const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
const MONTH_END = new Date(NOW.getFullYear(), NOW.getMonth() + 1, 0);
const at = (d, hh, mm = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0);
const dayN = (d) => d.getDate();
const dow = (d) => (d.getDay() + 6) % 7;            // 0=월 … 5=토, 6=일
const eachDay = (from, to) => { const a = []; for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) a.push(new Date(d)); return a; };

// 진료과별 소재 (주호소·수납 항목·검사 사유)
const DEPT = {
  '가정의학과':   { cc: ['정기 검진', '고혈압 추적 관찰', '감기 증상'],        bill: [['외래 진찰료', 16500], ['혈액검사 비용', 45000]] },
  '내과':         { cc: ['고혈압 추적 관찰', '당뇨 조절 상담', '소화불량'],    bill: [['외래 진찰료', 16500], ['심전도 검사비', 22000]] },
  '정형외과':     { cc: ['요통', '무릎 통증', '골다공증 추적 관찰'],           bill: [['외래 진찰료', 16500], ['X-ray 촬영료', 28000]] },
  '소아청소년과': { cc: ['감기 증상', '알레르기 비염', '예방접종 상담'],       bill: [['외래 진찰료', 16500], ['처방조제료', 8500]] },
  '재활의학과':   { cc: ['물리치료', '재활 운동 평가', '어깨 통증'],           bill: [['물리치료비', 12000], ['외래 진찰료', 16500]] },
  '외과':         { cc: ['수술 후 경과 관찰', '상처 소독'],                    bill: [['외래 진찰료', 16500], ['처치료', 15000]] },
  '피부과':       { cc: ['피부 발진', '아토피 추적 관찰'],                     bill: [['외래 진찰료', 16500], ['처방조제료', 8500]] },
  '신경과':       { cc: ['두통', '어지럼증'],                                  bill: [['외래 진찰료', 16500], ['혈액검사 비용', 45000]] },
  '안과':         { cc: ['시력 검사', '안구건조증'],                           bill: [['외래 진찰료', 16500], ['검사료', 21000]] },
  '이비인후과':   { cc: ['비염 증상', '중이염 추적'],                          bill: [['외래 진찰료', 16500], ['처치료', 15000]] },
};
const KINDS = ['진료', '검사', '진료', '물리치료', '진료', '검진'];
const REASON = { '진료': '정기 진료', '검사': '검사 예약', '물리치료': '물리치료', '검진': '건강검진' };
const WARD_PLAN = [ // [kind, hh, mm] — 매일 반복되는 병동 일과
  ['투약', 9, 0], ['투약', 17, 0], ['처치', 10, 30], ['검사', 11, 0],
  ['투약', 9, 30], ['처치', 14, 30], ['검사', 15, 0], ['투약', 17, 30],
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log(`seed-upcoming 시작 (모드: ${DRY ? 'DRY-RUN — 종료 시 ROLLBACK' : '실제 적용'})`);
    console.log(`  기간: 백필 ${TODAY.getFullYear()}-${TODAY.getMonth() + 1}-01~어제 / 예약 오늘~${MONTH_END.getDate()}일`);

    // ── 기준 데이터 로드 ────────────────────────────────────────
    const doctors = (await client.query(
      `SELECT id, name, profile->>'department' AS dept FROM users WHERE role='doctor' AND active ORDER BY id`)).rows;
    const byDept = Object.fromEntries(doctors.map((d) => [d.dept, d]));
    const demo = (await client.query(   // 데모 계정 환자 (황승보 등 실사용 계정 제외)
      `SELECT pt.id, pt.name FROM patients pt JOIN users u ON u.id=pt.user_id
        WHERE u.username ~ '^patient[0-9]+$' ORDER BY pt.id`)).rows;
    const anon = (await client.query(
      `SELECT id FROM patients WHERE user_id IS NULL ORDER BY id`)).rows.map((r) => r.id);
    const admitted = (await client.query(   // 계정 보유 환자(patient2~5 입원 중) 제외 — 데모 계정의 예약 목록을 외래 위주로 유지
      `SELECT a.patient_id FROM admissions a JOIN patients p ON p.id=a.patient_id
        WHERE a.status='admitted' AND p.user_id IS NULL ORDER BY a.id`)).rows.map((r) => r.patient_id);
    // 데모 환자 단골 진료과(최다 진료과) — 없으면 가정의학과
    const affinity = {};
    for (const p of demo) {
      const r = await client.query(
        `SELECT department FROM encounters WHERE patient_id=$1 AND department IS NOT NULL
          GROUP BY department ORDER BY count(*) DESC, department LIMIT 1`, [p.id]);
      affinity[p.id] = (r.rows[0] && byDept[r.rows[0].department]) ? r.rows[0].department : '가정의학과';
    }

    // ── 공용 insert 헬퍼 (NOT EXISTS 가드 = 멱등) ───────────────
    async function insAppt(pid, docId, when, dept, kind, status, reason) {
      const r = await client.query(
        `INSERT INTO appointments (patient_id, doctor_id, scheduled_at, department, kind, status, reason)
         SELECT $1,$2,$3,$4,$5,$6,$7
          WHERE NOT EXISTS (SELECT 1 FROM appointments WHERE patient_id=$1 AND scheduled_at=$3)`,
        [pid, docId, when, dept, kind, status, reason]);
      tally('예약(' + (status === 'done' ? '완료' : '예정') + ')', r.rowCount > 0);
      return r.rowCount > 0;
    }
    async function insEnc(pid, doc, when, dept, cc, note) {
      const r = await client.query(
        `INSERT INTO encounters (patient_id, doctor_id, visited_at, visit_type, department, chief_complaint, note)
         SELECT $1,$2,$3,'outpatient',$4,$5,$6
          WHERE NOT EXISTS (SELECT 1 FROM encounters WHERE patient_id=$1 AND visited_at=$3)`,
        [pid, doc, when, dept, cc, note]);
      tally('진료기록', r.rowCount > 0);
    }
    async function insBill(pid, when, item, amount) {
      const r = await client.query(
        `INSERT INTO bills (patient_id, billed_at, item, amount, paid)
         SELECT $1,$2,$3,$4,true
          WHERE NOT EXISTS (SELECT 1 FROM bills WHERE patient_id=$1 AND billed_at=$2 AND item=$3)`,
        [pid, when, item, amount]);
      tally('수납(기납부)', r.rowCount > 0);
    }

    // ── 1. 데모 환자 예약 (오늘~월말, 주 2~3회) ─────────────────
    for (const p of demo) {
      // 환자별 고정 요일 2~3개 (월0~토5) — 주마다 같은 요일 반복이 자연스러움
      const base = H(p.id) % 6;
      const days = [base, (base + 2) % 6];
      if (p.id % 2 === 1) days.push((base + 4) % 6);
      for (const d of eachDay(TODAY, MONTH_END)) {
        if (dow(d) === 6 || !days.includes(dow(d))) continue;        // 일요일 휴진
        const kind = KINDS[H(p.id, dayN(d)) % KINDS.length];
        const dept = kind === '물리치료' ? '재활의학과' : affinity[p.id];
        const doc = byDept[dept] || byDept['가정의학과'];
        let hh = 9 + (H(p.id, dayN(d), 1) % 8); if (hh === 13) hh = 14;   // 점심 회피
        if (dow(d) === 5) hh = 9 + (H(p.id, dayN(d), 1) % 4);            // 토요일 오전
        const when = at(d, hh, (H(p.id, dayN(d), 2) % 2) * 30);
        const status = when < NOW ? 'done' : 'scheduled';
        const ok = await insAppt(p.id, doc.id, when, dept, kind, status, REASON[kind]);
        if (ok && status === 'done')   // 오늘 이미 지난 시각 → 진료 기록도 생성
          await insEnc(p.id, doc.id, when, dept, DEPT[dept].cc[H(p.id, dayN(d), 3) % DEPT[dept].cc.length], '경과 양호, 익주 추적 관찰.');
      }
    }

    // ── 2. 의사별 외래 스케줄 채움 (계정 없는 환자 순환) ────────
    for (const d of eachDay(TODAY, MONTH_END)) {
      if (dow(d) === 6) continue;                                    // 일요일 휴진
      const sat = dow(d) === 5;
      for (let di = 0; di < doctors.length; di++) {
        const doc = doctors[di];
        const n = sat ? 2 : 3 + (H(di, dayN(d)) % 3);                // 평일 3~5, 토 2
        for (let k = 0; k < n; k++) {
          let hh;
          if (sat) hh = 9 + k;                                       // 토요일 9·10시
          else { hh = 9 + (H(di, dayN(d), k) % 8); if (hh === 13) hh = 14; }
          const when = at(d, hh, (H(di, dayN(d), k + 50) % 2) * 30);
          const pid = anon[(di * 13 + dayN(d) * 7 + k * 3) % anon.length];
          const kind = ['진료', '진료', '검진', '검사'][H(di, dayN(d), k + 9) % 4];
          const status = when < NOW ? 'done' : 'scheduled';
          const ok = await insAppt(pid, doc.id, when, doc.dept, kind, status, REASON[kind]);
          if (ok && status === 'done')
            await insEnc(pid, doc.id, when, doc.dept, DEPT[doc.dept].cc[H(pid, dayN(d)) % DEPT[doc.dept].cc.length], '외래 진료, 특이 소견 없음.');
        }
      }
    }

    // ── 3. 입원 병동 워크리스트 (매일 투약/처치/검사) ───────────
    for (const d of eachDay(TODAY, MONTH_END)) {
      for (let k = 0; k < WARD_PLAN.length; k++) {
        const [kind, hh, mm] = WARD_PLAN[k];
        const pid = admitted[(dayN(d) * 5 + k) % admitted.length];
        const when = at(d, hh, mm);
        const status = when < NOW ? 'done' : 'scheduled';
        await insAppt(pid, null, when, '병동', kind, status, '병동 정기 ' + kind);
      }
    }

    // ── 4. 이번 달 1일~어제 외래 진료 백필 (+ 데모 환자 수납) ───
    const monthStart = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
    const yesterday = new Date(TODAY); yesterday.setDate(yesterday.getDate() - 1);
    for (const d of eachDay(monthStart, yesterday)) {
      if (dow(d) >= 5) continue;                                     // 주말 백필 없음
      // 4a. 의사별 1~2건 (계정 없는 환자)
      for (let di = 0; di < doctors.length; di++) {
        const doc = doctors[di];
        const n = 1 + (H(di, dayN(d), 77) % 2);
        for (let k = 0; k < n; k++) {
          let hh = 9 + (H(di, dayN(d), k + 30) % 8); if (hh === 13) hh = 14;
          const pid = anon[(di * 17 + dayN(d) * 11 + k * 5) % anon.length];
          await insEnc(pid, doc.id, at(d, hh, 0), doc.dept,
            DEPT[doc.dept].cc[H(pid, dayN(d), 4) % DEPT[doc.dept].cc.length], '외래 진료, 특이 소견 없음.');
        }
      }
      // 4b. 데모 환자 주 1회 진료 + 수납(기납부 — 미납 시나리오는 건드리지 않음)
      for (const p of demo) {
        if (dow(d) !== H(p.id, 99) % 5) continue;                    // 환자별 고정 요일 주 1회
        const dept = affinity[p.id];
        const doc = byDept[dept];
        let hh = 10 + (H(p.id, dayN(d), 5) % 6); if (hh === 13) hh = 14;
        const when = at(d, hh, 0);
        await insEnc(p.id, doc.id, when, dept,
          DEPT[dept].cc[H(p.id, dayN(d), 6) % DEPT[dept].cc.length], '경과 양호. 복약 유지.');
        const [item, amount] = DEPT[dept].bill[H(p.id, dayN(d), 7) % DEPT[dept].bill.length];
        await insBill(p.id, when, '외래 진찰료', 16500);
        if (item !== '외래 진찰료') await insBill(p.id, when, item, amount);
      }
    }

    // ── 5. 바이탈·검사결과 ──────────────────────────────────────
    // 5a. 데모 환자 — 기존 마지막 측정치에서 이어지는 주간 바이탈 (매주 월요일 + 오늘)
    for (const p of demo) {
      const last = (await client.query(
        `SELECT systolic, diastolic, glucose, weight_kg, bmi FROM vitals
          WHERE patient_id=$1 ORDER BY measured_at DESC LIMIT 1`, [p.id])).rows[0]
        || { systolic: 122, diastolic: 78, glucose: null, weight_kg: 62.0, bmi: 22.5 };
      const days = eachDay(monthStart, TODAY).filter((d) => dow(d) === 0 || +d === +TODAY);
      for (const d of days) {
        const j = (H(p.id, dayN(d), 8) % 9) - 4;                     // -4~+4 요동
        const r = await client.query(
          `INSERT INTO vitals (patient_id, measured_at, systolic, diastolic, glucose, weight_kg, bmi)
           SELECT $1,$2,$3,$4,$5,$6,$7
            WHERE NOT EXISTS (SELECT 1 FROM vitals WHERE patient_id=$1 AND measured_at=$2)`,
          [p.id, at(d, 9, 10), last.systolic + j, last.diastolic + ((j / 2) | 0),
           last.glucose == null ? null : last.glucose + j,
           (Number(last.weight_kg) + j * 0.1).toFixed(1), last.bmi]);
        tally('바이탈(데모)', r.rowCount > 0);
      }
      // 최근 7일 검사결과 2종 (혈당 기록 보유자는 공복혈당 수치 연동)
      const tDate = new Date(TODAY); tDate.setDate(tDate.getDate() - (H(p.id, 11) % 5) - 1);
      const glu = last.glucose == null ? 95 + (H(p.id, 12) % 20) : last.glucose;
      for (const [name, value, ref, flag] of [
        ['공복혈당', String(glu), '70 ~ 99', glu > 99 ? 'H' : null],
        ['CRP', (0.2 + (H(p.id, 13) % 4) / 10).toFixed(1), '< 0.5', (0.2 + (H(p.id, 13) % 4) / 10) >= 0.5 ? 'H' : null],
      ]) {
        const r = await client.query(
          `INSERT INTO lab_results (patient_id, tested_at, test_name, value, ref_range, flag)
           SELECT $1,$2,$3,$4,$5,$6
            WHERE NOT EXISTS (SELECT 1 FROM lab_results WHERE patient_id=$1 AND tested_at=$2 AND test_name=$3)`,
          [p.id, tDate, name, value, ref, flag]);
        tally('검사결과', r.rowCount > 0);
      }
    }
    // 5b. 입원 환자 — 어제·오늘 아침 병동 바이탈 (체온·맥박·산소포화도 포함)
    for (const pid of admitted) {
      for (const off of [-1, 0]) {
        const d = new Date(TODAY); d.setDate(d.getDate() + off);
        const j = H(pid, dayN(d), 14);
        const r = await client.query(
          `INSERT INTO vitals (patient_id, measured_at, systolic, diastolic, temp_c, pulse, spo2)
           SELECT $1,$2,$3,$4,$5,$6,$7
            WHERE NOT EXISTS (SELECT 1 FROM vitals WHERE patient_id=$1 AND measured_at=$2)`,
          [pid, at(d, 6, 30), 112 + (j % 25), 68 + (j % 14), (36.2 + (j % 8) / 10).toFixed(1), 64 + (j % 24), 96 + (j % 4)]);
        tally('바이탈(병동)', r.rowCount > 0);
      }
    }

    // ── 마무리 ─────────────────────────────────────────────────
    console.log('결과:');
    for (const [k, v] of Object.entries(stats))
      console.log(`  ${k}: +${v.inserted}건 생성 / =${v.skipped}건 이미 존재`);
    if (DRY) { await client.query('ROLLBACK'); console.log('DRY-RUN → ROLLBACK 완료 (DB 미변경)'); }
    else { await client.query('COMMIT'); console.log('COMMIT 완료'); }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('seed-upcoming 실패 (ROLLBACK):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
