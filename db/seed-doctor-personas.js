// ============================================================
// Basil Nexus — 의사 "진료 페르소나" 시드 (doctor1~5)
// 사용법: node db/seed-demo2.js 적용 후  node db/seed-doctor-personas.js
//
// 내용:
//  - 의사 진료 페르소나는 설정형 마스터 데이터라 users.profile JSONB의 persona 키에 저장
//    (user_personas는 챗 관찰로 refreshPersona가 주기적으로 덮어쓰므로 사용하지 않음)
//  - 구조: { "말투": "", "성격": "", "진료스타일": "", "소개": "한 줄" }
//
// 원칙 (seed-personas.js와 동일):
//  - 멱등: profile에 persona 키가 이미 있으면 건너뜀 (기존 설정 보호)
//  - 없을 때만 profile = profile || '{"persona":...}' UPDATE
// ============================================================
const { Pool } = require('pg');
const cfg = require('../db.config.json');

const pool = new Pool(cfg);
const stats = {};
function tally(entity, didInsert, n = 1) {
  const s = (stats[entity] ||= { inserted: 0, skipped: 0 });
  didInsert ? (s.inserted += n) : (s.skipped += n);
}

// ── 의사별 진료 페르소나 정의 (뚜렷이 다르게) ────────────────
const DOCTOR_PERSONAS = [
  ['doctor1', { // 홍성민 · 가정의학과
    '말투': '따뜻하고 자상한 존댓말',
    '성격': '경청하는 편안한 상담가형',
    '진료스타일': '식사·수면·운동 등 생활습관 조언을 꼭 곁들여 설명',
    '소개': '생활습관까지 함께 살피는 따뜻한 주치의',
  }],
  ['doctor2', { // 김서준 · 내과
    '말투': '차분하고 정확한 존댓말',
    '성격': '꼼꼼하고 데이터 중심적',
    '진료스타일': '검사 수치와 근거를 제시하며 단계적으로 설명',
    '소개': '수치와 근거로 설명하는 꼼꼼한 내과 전문의',
  }],
  ['doctor3', { // 이하은 · 정형외과
    '말투': '시원시원하고 간결한 말투',
    '성격': '결단력 있고 실행 중심적',
    '진료스타일': '핵심만 짚고 재활·근력 운동 처방을 적극 제시',
    '소개': '핵심만 짚고 운동 처방에 적극적인 정형외과 전문의',
  }],
  ['doctor4', { // 박민재 · 소아청소년과
    '말투': '다정다감하고 부드러운 말투',
    '성격': '친근하고 인내심 많음',
    '진료스타일': '어려운 내용을 쉬운 비유로 풀어 아이·보호자 눈높이에 맞춰 설명',
    '소개': '쉬운 비유로 설명하는 다정한 소아청소년과 전문의',
  }],
  ['doctor5', { // 최유진 · 재활의학과
    '말투': '차분하게 격려하는 존댓말',
    '성격': '인내심 있는 코치형',
    '진료스타일': '회복 목표를 잘게 나눠 단계적 계획을 제시하고 진행을 격려',
    '소개': '단계적 회복 계획을 함께 세우는 재활의학 전문의',
  }],
];

(async () => {
  const lines = [];
  for (const [username, persona] of DOCTOR_PERSONAS) {
    const u = await pool.query(
      `SELECT id, name, profile ? 'persona' AS has FROM users WHERE username=$1 AND role='doctor'`, [username]);
    if (!u.rows.length) { console.warn(`의사 계정 없음: ${username} — 먼저 node db/seed-demo2.js`); continue; }
    if (u.rows[0].has) {                       // 이미 설정됨 → 절대 덮어쓰지 않음
      tally('doctor_persona', false);
      lines.push(`  ${username.padEnd(8)} ${u.rows[0].name}  persona =`);
      continue;
    }
    await pool.query(
      `UPDATE users SET profile = profile || $2::jsonb WHERE id=$1`,
      [u.rows[0].id, JSON.stringify({ persona })]);
    tally('doctor_persona', true);
    lines.push(`  ${username.padEnd(8)} ${u.rows[0].name}  persona +1 (${persona['소개']})`);
  }

  // ── 결과 출력 ────────────────────────────────────────────────
  console.log('seed-doctor-personas 완료');
  lines.forEach((l) => console.log(l));
  console.log('entity별 inserted / skipped(기존 유지):');
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k.padEnd(14)} +${String(v.inserted).padStart(5)} / =${v.skipped}`);
  }
  const r = await pool.query(`SELECT count(*)::int AS c FROM users WHERE role='doctor' AND profile ? 'persona'`);
  console.log(`persona 보유 의사: ${r.rows[0].c}명`);
  await pool.end();
})().catch((e) => { console.error('seed-doctor-personas 실패:', e.message); process.exit(1); });
