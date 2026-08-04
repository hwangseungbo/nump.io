// ============================================================
// Basil Nexus — P3 시연용 페르소나 시드 (patient1~5)
// 사용법: node db/seed-demo2.js 적용 후  node db/seed-personas.js
//
// 내용:
//  - patient1~5 계정에 성격이 뚜렷한 대화 이력(chat_messages, 환자당 3~5 Q/A쌍)과
//    user_personas(summary + traits)를 심어 어드민 "AI 페르소나" 패널 시연에 사용
//  - 대화 소재는 각 환자의 실제 EMR(진단·처방·예약·검사)을 조회해 실데이터와 일치시킴
//
// 원칙 (seed-demo2.js와 동일):
//  - 날짜는 실행 시점 기준 상대 (대화는 최근 2주에 분산, created_at 명시 INSERT)
//  - 멱등: chat_messages는 해당 user에 session_id LIKE 'bn-demo-%' 행이 있으면 건너뜀,
//          user_personas는 행이 이미 존재하면 절대 덮어쓰지 않고 건너뜀 (실누적 보호)
// ============================================================
const { Pool } = require('pg');
const cfg = require('../db.config.json');

const pool = new Pool(cfg);
const stats = {};
function tally(entity, didInsert, n = 1) {
  const s = (stats[entity] ||= { inserted: 0, skipped: 0 });
  didInsert ? (s.inserted += n) : (s.skipped += n);
}

// ── 날짜 헬퍼 ────────────────────────────────────────────────
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
function at(dayOffset, hh = 0, mm = 0) {
  return new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + dayOffset, hh, mm, 0, 0);
}
function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── 환자별 실제 EMR 요약 조회 (대화 소재로 사용) ─────────────
async function emrOf(pid) {
  const [dx, rx, ap, lab] = await Promise.all([
    pool.query(`SELECT name FROM diagnoses WHERE patient_id=$1 ORDER BY diagnosed_at DESC LIMIT 3`, [pid]),
    pool.query(`SELECT drug_name, dosage FROM prescriptions WHERE patient_id=$1 AND active ORDER BY id LIMIT 3`, [pid]),
    pool.query(
      `SELECT department, kind, to_char(scheduled_at, 'FMMM"월" FMDD"일"') AS dstr
         FROM appointments WHERE patient_id=$1 AND status='scheduled' AND scheduled_at >= now()
        ORDER BY scheduled_at LIMIT 1`, [pid]),
    pool.query(`SELECT test_name, value FROM lab_results WHERE patient_id=$1 ORDER BY tested_at DESC LIMIT 1`, [pid]),
  ]);
  return {
    dx: dx.rows.map((r) => r.name),
    rx: rx.rows,
    appt: ap.rows[0] || null,
    lab: lab.rows[0] || null,
    // EMR이 빈 환자를 위한 폴백 포함 헬퍼
    drug(i, fb) { return (this.rx[i] && this.rx[i].drug_name) || fb; },
    dx0(fb) { return this.dx[0] || fb; },
    labStr(fb) { return this.lab ? `${this.lab.test_name} ${this.lab.value}` : fb; },
    apptStr(fb) {
      return this.appt ? `${this.appt.department || '외래'} ${this.appt.kind}(${this.appt.dstr})` : fb;
    },
  };
}

// ── 페르소나 정의 (5명 — 성격·말투가 뚜렷이 다르게) ──────────
// pairs/summary는 EMR 요약(e)을 받아 실데이터(약 이름·수치·예약)를 끼워 넣는다.
const PERSONAS = [
  { // 공손·꼼꼼 — 검사 수치·복약을 조목조목
    username: 'patient1', msgCount: 4, days: [-13, -9, -5, -2],
    traits: { '말투': '존댓말, 공손함', '태도': '꼼꼼함, 차분함',
      '관심사': ['콜레스테롤 수치', '복약 방법', '허리 통증'],
      '주의사항': '수치와 근거를 함께 제시하면 만족도가 높음' },
    summary: (e) => [
      '검사 수치와 복약 방법을 조목조목 확인하는 꼼꼼하고 공손한 환자.',
      `${e.labStr('검사 수치')}의 의미, ${e.drug(1, '처방약')} 복용 시간, ${e.drug(2, '영양제')} 복용법을 구체적으로 질문함.`,
      '허리 통증으로 정형외과 진료에도 관심이 있으며, 근거와 수치를 갖춘 정확한 설명을 선호함.',
    ].join('\n'),
    pairs: (e) => [
      [`안녕하세요. 지난번 검사에서 ${e.labStr('콜레스테롤 수치가 다소 높게')}(으)로 나왔다고 들었는데, 정상 범위와 얼마나 차이가 나는 건지 자세히 알고 싶습니다.`,
       `안녕하세요, 홍길동 님. ${e.labStr('해당 수치')}는 정상 상한보다 다소 높은 수준입니다. 식이 조절과 처방약 복용을 유지하시면서 다음 검사에서 변화를 확인하시는 것이 좋겠습니다.`],
      [`${e.drug(1, '처방약')}은 저녁에 복용 중인데, 아침으로 바꿔도 효과가 동일한지 궁금합니다. 복용 시간을 정확히 지키고 싶어서요.`,
       `${e.drug(1, '해당 약')}은 매일 일정한 시간에 꾸준히 복용하는 것이 가장 중요합니다. 복용 시간 변경은 담당 의사와 상의 후 조정하시길 권장드립니다.`],
      [`${e.drug(2, '영양제')}는 식전과 식후 중 언제 복용하는 것이 흡수에 더 좋은가요?`,
       `${e.drug(2, '해당 성분')}는 지용성이라 식사 직후에 복용하시면 흡수가 더 잘 됩니다.`],
      [`다음 ${e.apptStr('진료')} 전에 미리 준비하거나 기록해 둘 것이 있을까요? 허리 통증이 이어져서 여쭤봅니다.`,
       `통증이 있었던 시간대와 자세, 강도를 간단히 메모해 오시면 진료에 큰 도움이 됩니다. 진료 전까지 무리한 운동은 피해 주세요.`],
    ],
  },
  { // 반말·거침·조급 — 막말 페르소나 데모의 핵심
    username: 'patient2', msgCount: 6, days: [-12, -8, -4, -1],
    traits: { '말투': '반말, 거침, 명령조', '태도': '조급함, 퉁명스러움',
      '관심사': ['골다공증 약', '혈압', '예약 일정'],
      '주의사항': '서론 없이 결론부터 한두 문장으로 짧게 답할 것' },
    summary: (e) => [
      '용건만 짧게 말하는 반말·명령조의 환자로, 설명이 길어지면 즉시 불만을 표함.',
      `골다공증 약(${e.drug(1, 'Alendronate')})과 혈압약(${e.drug(0, 'Amlodipine')}) 복용 필요성, 예약 일정을 반복 확인함.`,
      '결론부터 한두 문장으로 짧게 답하는 방식을 선호함.',
    ].join('\n'),
    pairs: (e) => [
      [`됐고, 내 뼈 검사 결과나 빨리 말해봐. 숫자만.`,
       `최근 골밀도 검사 결과는 ${e.labStr('T-score -2.6')}입니다. 골다공증 범위라 약물 치료 유지가 필요합니다.`],
      [`${e.drug(1, '그 뼈 약')} 이거 꼭 먹어야 되냐. 귀찮아 죽겠네. 짧게 답해.`,
       `네, ${e.drug(1, '해당 약')}은 골절 예방에 중요합니다. 주 1회 아침 공복에 복용하고 30분간 눕지 마세요.`],
      [`혈압약은 또 언제까지 먹으라는 거야. 결론만.`,
       `${e.drug(0, '혈압약')}은 수치가 안정돼도 임의로 중단하면 안 됩니다. 중단 여부는 진료에서 결정합니다.`],
      [`예약이 왜 이렇게 많아. 다음 거 언제야. 빨리.`,
       `가장 가까운 예약은 ${e.apptStr('가정의학과 진료')}입니다. 변경은 예약 메뉴에서 바로 가능합니다.`],
    ],
  },
  { // 불안·반복 확인·매우 정중
    username: 'patient3', msgCount: 4, days: [-13, -10, -7, -4, -2],
    traits: { '말투': '매우 정중한 존댓말', '태도': '불안, 걱정 많음, 반복 확인',
      '관심사': ['당화혈색소 수치', '당뇨 합병증', '검사 준비'],
      '주의사항': '안심시키는 차분한 어조의 설명이 필요함' },
    summary: (e) => [
      `매우 정중하지만 불안이 많아 같은 걱정(${e.labStr('당화혈색소')} 수치, 합병증)을 반복해서 확인하는 환자.`,
      `${e.drug(0, '당뇨약')} 복용을 성실히 지키고 있으며 검사 전 금식 등 준비사항도 미리 걱정함.`,
      '안심시키는 차분한 어조로 결론을 먼저 말해 주는 설명이 효과적임.',
    ].join('\n'),
    pairs: (e) => [
      [`안녕하세요, 선생님. 지난 검사에서 ${e.labStr('당화혈색소가 조금 높다')}(이)라고 들었는데... 정말 괜찮은 걸까요? 너무 걱정이 됩니다.`,
       `걱정되시는 마음 이해합니다. 관리 목표보다 조금 높은 수준이지만, 약을 잘 복용하시고 식이를 조절하시면 충분히 개선될 수 있습니다.`],
      [`${e.drug(0, '당뇨약')}을 하루도 빠짐없이 먹고 있는데도 수치가 안 내려가면 어떡하죠? 합병증이 생기는 건 아닐까요?`,
       `꾸준히 복용하고 계신 것이 가장 중요합니다. 합병증은 장기간 고혈당이 지속될 때 문제가 되므로, 지금처럼 관리하시면 됩니다.`],
      [`죄송한데 한 번만 더 여쭤볼게요. 지금 수치가 당장 위험한 정도는 아닌 거지요? 자꾸 마음이 불안해서요.`,
       `네, 당장 위험한 수치는 아닙니다. 궁금한 점은 기록해 두셨다가 ${e.apptStr('다음 검사')} 때 함께 확인하시면 안심이 되실 거예요.`],
      [`밤에 발끝이 저린 것 같기도 한데... 혹시 합병증 초기 증상일까요? 계속 신경이 쓰입니다.`,
       `일시적인 저림은 자세 등 다른 원인일 수도 있습니다. 증상이 반복되면 진료 때 꼭 말씀해 주세요. 미리 걱정하지 않으셔도 됩니다.`],
      [`검사 전날에는 몇 시부터 금식해야 하나요? 실수로 뭘 먹게 될까 봐 벌써 걱정입니다.`,
       `보통 검사 전날 밤 9시 이후 금식이며 물은 소량 가능합니다. 휴대폰 알림을 맞춰 두시면 실수 걱정을 덜 수 있습니다.`],
    ],
  },
  { // 사무적·간결 — 용건만
    username: 'patient4', msgCount: 0, days: [-11, -6, -3],
    traits: { '말투': '간결한 존댓말, 단답형', '태도': '사무적, 용건 중심',
      '관심사': ['위장약 복용 기간', '예약 일정', '서류 발급'],
      '주의사항': '요점만 짧게 전달할 것' },
    summary: (e) => [
      `사무적이고 간결하게 용건만 묻는 환자. ${e.drug(0, '처방약')} 복용 기간, 예약 일정,`,
      '서류 발급 절차 등 행정·일정 확인 위주로 질문함. 요점만 짧게 전달하는 답변을 선호함.',
    ].join('\n'),
    pairs: (e) => [
      [`${e.drug(0, '처방약')} 복용 기간 확인 부탁합니다.`,
       `${e.drug(0, '해당 약')}은 보통 4~8주 복용합니다. 정확한 종료 시점은 다음 진료에서 결정됩니다.`],
      [`다음 예약 일정만 알려주세요.`,
       `가장 가까운 예약은 ${e.apptStr('예약')}입니다.`],
      [`진단서 발급 절차 간단히 부탁합니다.`,
       `서류 발급 메뉴에서 진단서를 신청하시면 담당의 승인 후 발급됩니다. 보통 1~2일 소요됩니다.`],
    ],
  },
  { // 수다스럽고 친근 — 생활습관·식이 질문 많음
    username: 'patient5', msgCount: 2, days: [-12, -9, -6, -3, -1],
    traits: { '말투': '친근한 존댓말, 수다스러움', '태도': '적극적, 긍정적',
      '관심사': ['갑상선 약 복용법', '식이 요법', '생활습관·운동'],
      '주의사항': '생활 속 실천 팁을 곁들이면 좋음' },
    summary: (e) => [
      '수다스럽고 친근한 말투의 환자로 생활습관·식이 질문이 많음.',
      `${e.drug(0, '갑상선 약')} 복용과 커피·해조류 등 식이의 관계, 운동, 체중 변화에 관심이 많고`,
      '식단 일기 등 자가 관리에 적극적임. 생활 속 실천 팁을 곁들인 답변을 좋아함.',
    ].join('\n'),
    pairs: (e) => [
      [`안녕하세요! ${e.drug(0, '갑상선 약')} 먹을 때 커피는 얼마나 띄우고 마셔야 해요? 아침에 커피 없이는 하루를 못 시작하거든요.`,
       `반갑습니다. ${e.drug(0, '갑상선 약')}은 공복에 복용하시고, 커피는 30분~1시간 뒤에 드시는 것이 흡수에 좋습니다.`],
      [`미역국이나 김 같은 해조류는 계속 먹어도 되나요? 요오드가 갑상선에 안 좋을 수 있다는 얘기를 들어서요.`,
       `일반적인 식사량의 해조류는 괜찮습니다. 다만 요오드 보충제를 따로 챙겨 드시는 것은 피하시는 게 좋습니다.`],
      [`요즘 몸이 무겁고 살이 찌는 느낌인데 갑상선 때문일 수도 있나요? 운동은 어떤 게 좋아요?`,
       `갑상선 기능 저하가 있으면 체중이 늘 수 있습니다. 걷기 같은 유산소 운동을 주 3회 이상 꾸준히 하시는 것을 추천드립니다.`],
      [`지난번에 ${e.labStr('TSH가 조금 높다')}(이)라고 나왔던데, 요즘 낮잠이 많아진 거랑 관계가 있을까요?`,
       `${e.labStr('해당 수치')}는 목표보다 다소 높아 피로감과 관련이 있을 수 있습니다. 약 용량 조정 여부는 다음 진료에서 확인합니다.`],
      [`다음 진료 전까지 식단 일기를 써 가면 도움이 될까요? 뭐든 열심히 해 볼게요!`,
       `좋은 생각입니다. 식사 시간과 내용, 커피 마신 시각까지 적어 오시면 복약 상담에 큰 도움이 됩니다.`],
    ],
  },
];

(async () => {
  const lines = []; // 환자별 결과 요약
  for (const P of PERSONAS) {
    // 계정·환자 연결 확인
    const u = await pool.query(
      `SELECT u.id AS uid, p.id AS pid, u.name FROM users u JOIN patients p ON p.user_id=u.id
        WHERE u.username=$1`, [P.username]);
    if (!u.rows.length) { console.warn(`계정/환자 연결 없음: ${P.username} — 먼저 node db/seed-demo2.js`); continue; }
    const { uid, pid, name } = u.rows[0];
    const e = await emrOf(pid);
    const pairs = P.pairs(e);
    const sessionId = 'bn-demo-' + P.username;

    // 1) chat_messages — 해당 user에 bn-demo-% 행이 있으면 건너뜀 (멱등)
    const has = await pool.query(
      `SELECT 1 FROM chat_messages WHERE user_id=$1 AND session_id LIKE 'bn-demo-%' LIMIT 1`, [uid]);
    let chatNote;
    if (has.rows.length) {
      tally('chat_messages', false, pairs.length * 2);
      chatNote = 'chat =';
    } else {
      for (let i = 0; i < pairs.length; i++) {
        const q = at(P.days[i % P.days.length], 9 + ((i * 2) % 9), (i * 13) % 55);
        const a = new Date(q.getTime() + 2 * 60000); // 답변은 2분 뒤
        await pool.query(
          `INSERT INTO chat_messages (user_id, session_id, role, content, created_at) VALUES ($1,$2,'user',$3,$4)`,
          [uid, sessionId, pairs[i][0], q]);
        await pool.query(
          `INSERT INTO chat_messages (user_id, session_id, role, content, created_at) VALUES ($1,$2,'assistant',$3,$4)`,
          [uid, sessionId, pairs[i][1], a]);
        tally('chat_messages', true, 2);
      }
      chatNote = `chat +${pairs.length * 2}행`;
    }

    // 2) user_personas — 행이 이미 있으면 절대 덮어쓰지 않음 (실누적 보호)
    const ins = await pool.query(
      `INSERT INTO user_personas (user_id, summary, traits, msg_count)
       VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO NOTHING RETURNING user_id`,
      [uid, P.summary(e), JSON.stringify(P.traits), P.msgCount]);
    tally('user_personas', ins.rows.length > 0);
    lines.push(`  ${P.username.padEnd(8)} ${name}  ${chatNote}, persona ${ins.rows.length ? '+1' : '='}`);
  }

  // ── 결과 출력 ────────────────────────────────────────────────
  console.log(`seed-personas 완료 (기준일 ${dateStr(TODAY)})`);
  lines.forEach((l) => console.log(l));
  console.log('entity별 inserted / skipped(기존 유지):');
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k.padEnd(14)} +${String(v.inserted).padStart(5)} / =${v.skipped}`);
  }
  const counts = [];
  for (const t of ['chat_messages', 'user_personas']) {
    const r = await pool.query(`SELECT count(*)::int AS c FROM ${t}`);
    counts.push(`${t}=${r.rows[0].c}`);
  }
  console.log('테이블 행 수:', counts.join(' '));
  await pool.end();
})().catch((e) => { console.error('seed-personas 실패:', e.message); process.exit(1); });
