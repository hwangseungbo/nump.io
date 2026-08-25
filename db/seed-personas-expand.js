// ============================================================
// Basil Nexus — 확장 환자(patient6~10) 페르소나 + 대화 이력 시드
// 사용법:
//   node db/seed-emr-expand.js 적용 후
//   node db/seed-personas-expand.js --dry-run   ← 변경 예정만 출력하고 ROLLBACK
//   node db/seed-personas-expand.js             ← 실제 적용 (COMMIT)
//
// 내용: patient6~10에 성격이 뚜렷한 대화 이력(chat_messages, 환자당 3~5 Q/A쌍)과
//       user_personas(summary + traits)를 심는다. 기존 patient1~5의 5종
//       (공손·꼼꼼 / 반말·거침 / 불안·반복 / 사무적 / 수다)과 뚜렷이 다르게:
//  - 김복순(81세): 정감 있는 어르신 말투, 같은 내용 반복 확인, 쉬운 말 선호
//  - 이준서(3세): 보호자(어머니)가 대리 상담 — 아이 열·귀 통증 걱정
//  - 박서연(15세): 간결·직설적인 10대, 인터넷 정보 확인형
//  - 정태웅(36세): 바쁜 직장인, 일정(복귀 시기) 중심
//  - 한말자(67세): 증상 서술이 길고 상세, 안심 선호, 자녀 권유로 앱 시작
//
// 원칙 (seed-personas.js와 동일 + 트랜잭션/--dry-run 추가):
//  - 대화 소재는 실제 EMR(emrOf)에서 주입 (EMR 미시드 시 폴백 문구 — 정상)
//  - session_id 'bn-demo-'+username, created_at 최근 2주 분산
//  - 멱등: chat은 bn-demo-% 존재 시 환자 단위 skip, persona는 ON CONFLICT DO NOTHING
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

// ── 날짜 헬퍼 ────────────────────────────────────────────────
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
function at(dayOffset, hh = 0, mm = 0) {
  return new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + dayOffset, hh, mm, 0, 0);
}
function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── 환자별 실제 EMR 요약 조회 (대화 소재 — seed-personas.js 패턴) ──
async function emrOf(client, pid) {
  // 단일 client 트랜잭션 안이라 순차 실행 (Promise.all은 pg deprecation 경고)
  const dx = await client.query(`SELECT name FROM diagnoses WHERE patient_id=$1 ORDER BY diagnosed_at DESC LIMIT 3`, [pid]);
  const rx = await client.query(`SELECT drug_name, dosage FROM prescriptions WHERE patient_id=$1 AND active ORDER BY id LIMIT 3`, [pid]);
  const ap = await client.query(
    `SELECT department, kind, to_char(scheduled_at, 'FMMM"월" FMDD"일"') AS dstr
       FROM appointments WHERE patient_id=$1 AND status='scheduled' AND scheduled_at >= now()
      ORDER BY scheduled_at LIMIT 1`, [pid]);
  const lab = await client.query(`SELECT test_name, value FROM lab_results WHERE patient_id=$1 ORDER BY tested_at DESC LIMIT 1`, [pid]);
  return {
    dx: dx.rows.map((r) => r.name),
    rx: rx.rows,
    appt: ap.rows[0] || null,
    lab: lab.rows[0] || null,
    drug(i, fb) { return (this.rx[i] && this.rx[i].drug_name) || fb; },
    dx0(fb) { return this.dx[0] || fb; },
    labStr(fb) { return this.lab ? `${this.lab.test_name} ${this.lab.value}` : fb; },
    apptStr(fb) {
      return this.appt ? `${this.appt.department || '외래'} ${this.appt.kind}(${this.appt.dstr})` : fb;
    },
  };
}

// ── 페르소나 정의 (기존 1~5와 뚜렷이 다른 5종) ───────────────
const PERSONAS = [
  { // 81세 — 정감 있는 어르신, 반복 확인, 쉬운 말 선호
    username: 'patient6', msgCount: 4, days: [-13, -9, -5, -2],
    traits: { '말투': '정감 있는 어르신 존댓말', '태도': '같은 내용을 반복해 확인, 느긋함',
      '관심사': ['백내장 수술', '혈압약 복용법', '눈에 좋은 음식'],
      '주의사항': '어려운 용어를 피하고 천천히 쉬운 말로 설명할 것' },
    summary: (e) => [
      '정감 있는 어르신 말투로, 안심될 때까지 같은 내용을 여러 번 확인하는 환자.',
      `${e.dx0('백내장')} 수술 여부·입원 기간과 ${e.drug(0, '혈압약')} 복용 시간을 반복해 물음.`,
      '어려운 의학 용어보다 쉬운 말과 느긋한 설명을 좋아함.',
    ].join('\n'),
    pairs: (e) => [
      [`선생님, 내 눈이 요새 영 뿌옇게 보이는데... 그 백내장이라는 게 수술을 꼭 해야 하는 거유?`,
       `안녕하세요, 김복순 님. 백내장은 진행 정도에 따라 수술 시기를 정합니다. 지난 진료에서 상담드린 대로, 일상이 불편해지셨다면 수술을 고려할 시기예요. 다음 안과 진료에서 원장님과 편하게 상의하시면 됩니다.`],
      [`혈압약(${e.drug(0, '혈압약')})은 밥 먹고 먹는 거라 했지요? 아침에 먹는 게 맞는지 자꾸 물어봐서 미안해요.`,
       `괜찮습니다, 몇 번이고 물어보셔도 돼요. 네, 아침 식사 후에 한 알 드시는 게 맞습니다. 달력에 표시해 두시면 기억하기 편하세요.`],
      [`지난번에도 물어봤는데... 눈 수술하면 며칠이나 입원해야 하는 거유? 자꾸 까먹어서 그래요.`,
       `백내장 수술은 보통 입원 없이 당일로 끝나는 경우가 많습니다. 정확한 건 수술 결정할 때 다시 안내드릴 테니 걱정 마세요.`],
      [`다음 ${e.apptStr('안과 진료')} 전에 눈에 좋은 음식 같은 거 있으면 알려줘요.`,
       `녹황색 채소와 등푸른 생선이 눈 건강에 좋다고 알려져 있어요. 골고루 드시고, 진료 날짜 잊지 않게 하루 전에 알림을 확인해 주세요.`],
    ],
  },
  { // 3세 — 보호자(어머니) 대리 상담
    username: 'patient7', msgCount: 2, days: [-12, -8, -4, -1],
    traits: { '말투': '보호자(어머니)가 대리 상담 — 걱정스러운 존댓말', '태도': '아이 상태 변화에 민감, 꼼꼼히 기록',
      '관심사': ['중이염 재발 신호', '항생제 시럽 복용법', '아이 열 관리'],
      '주의사항': '보호자 대리 상담임 — 3세 아이 기준으로 안내 필요' },
    summary: (e) => [
      '3세 이준서 환아의 어머니가 대리로 상담하는 계정.',
      `${e.dx0('급성 중이염')} 치료 중으로 ${e.drug(0, '항생제 시럽')} 용법, 발열 대처, 재발 신호를 꼼꼼히 확인함.`,
      '아이 기준의 구체적 수치(용량·체온)와 관찰 포인트를 원함.',
    ].join('\n'),
    pairs: (e) => [
      [`안녕하세요, 이준서 엄마예요. 시럽(${e.drug(0, '항생제 시럽')})을 밥을 잘 안 먹은 날에도 꼭 챙겨 먹여야 할까요?`,
       `안녕하세요, 어머님. 항생제 시럽은 식사량과 관계없이 정해진 시간에 챙겨 드시는 게 중요합니다. 간단한 간식 후에라도 시간 맞춰 먹여 주세요.`],
      [`밤에 열이 38도 넘으면 해열제 먹이고 지켜봐도 되나요? 아니면 바로 응급실 가야 하나요?`,
       `38도 이상이면 해열제를 먹이고 30분~1시간 간격으로 체온을 확인해 주세요. 열이 39도 이상 지속되거나 처지고 잘 안 먹으면 진료를 받는 게 안전합니다.`],
      [`요즘 귀를 자꾸 만지작거리는데, 중이염이 또 온 걸까요? 지난번엔 열부터 났었거든요.`,
       `귀를 만지는 것만으로 재발이라 단정하긴 어렵지만, 관찰 포인트인 건 맞아요. 열·보챔·귀에서 분비물이 함께 보이면 예약일 전이라도 내원해 주세요.`],
      [`다음 ${e.apptStr('이비인후과 진료')} 전에 목욕이나 수영장은 괜찮을까요?`,
       `가정 목욕은 귀에 물이 많이 들어가지 않게 하시면 괜찮습니다. 수영장은 경과 확인 진료에서 상태를 본 뒤 시작하시길 권해요.`],
    ],
  },
  { // 15세 — 간결·직설, 인터넷 정보 확인형
    username: 'patient8', msgCount: 4, days: [-11, -7, -4, -2],
    traits: { '말투': '짧은 존댓말, 직설적', '태도': '실용적, 인터넷에서 본 정보 확인형',
      '관심사': ['아토피 관리', '스테로이드 연고 부작용', '보습 루틴'],
      '주의사항': '근거 있는 짧은 답 선호 — 과장·잔소리식 설명은 역효과' },
    summary: (e) => [
      '간결하고 직설적인 10대 환자. 인터넷에서 본 정보를 확인하러 짧게 질문함.',
      `${e.dx0('아토피 피부염')} 치료 중 — ${e.drug(0, '스테로이드 연고')} 부작용, 보습 횟수, ${e.labStr('검사 수치')} 의미를 물음.`,
      '근거 있는 짧은 답을 좋아하고 장황한 설명은 읽지 않음.',
    ].join('\n'),
    pairs: (e) => [
      [`스테로이드 연고 계속 발라도 돼요? 인터넷에서 피부 얇아진다던데요.`,
       `처방 용량대로 단기간 쓰면 괜찮아요. 걱정하는 부작용은 장기간 과량 사용 시 문제라, 지금처럼 격일 감량 지시를 따르면 됩니다.`],
      [`보습제는 하루에 몇 번까지 발라야 돼요?`,
       `최소 2회, 샤워 직후 3분 안에 한 번은 꼭 발라 주세요. 가려울 때 수시로 더 발라도 괜찮습니다.`],
      [`검사에서 ${e.labStr('IgE 320')}이라던데 이거 높은 거예요?`,
       `참고치보다 높은 수치예요. 알레르기 성향이 있다는 뜻이지만, 수치 자체보다 증상 관리가 중요합니다. 지금 치료 방향이 그에 맞춰져 있어요.`],
      [`급식에 새우 나오는데 그냥 먹어도 돼요?`,
       `새우를 먹고 두드러기·가려움이 심해진 적이 없다면 굳이 피할 필요는 없어요. 반응이 있었던 음식만 다음 진료 때 알려 주세요.`],
    ],
  },
  { // 36세 — 바쁜 직장인, 일정 중심
    username: 'patient9', msgCount: 0, days: [-10, -6, -3, -1],
    traits: { '말투': '빠르고 실용적인 존댓말', '태도': '일정 중심, 요점 위주',
      '관심사': ['수술 후 회복 일정', '운동 재개 시기', '출근·출장 가능 여부'],
      '주의사항': '시기·기간을 숫자로 명확히 제시할 것' },
    summary: (e) => [
      `바쁜 직장인. ${e.dx0('급성 충수염')} 수술 후 경과 관찰 중으로, 질문이 전부 복귀 일정에 관한 것.`,
      '출근·운동·출장 가능 시점을 숫자로 딱 떨어지게 듣고 싶어 함.',
      '요점 위주의 실용적 답변 선호.',
    ].join('\n'),
    pairs: (e) => [
      [`수술한 지 3주가 넘었는데, 사무직 출근은 이제 무리 없겠죠? 다음 주부터 정상 출근 예정입니다.`,
       `네, 복강경 수술 후 사무직은 보통 1~2주면 복귀 가능합니다. 지금 시점이면 무리 없고, 장시간 앉을 때 한 번씩 일어나 움직여 주세요.`],
      [`헬스장 웨이트는 언제부터 가능한가요? 유산소는 이미 걷기로 하고 있습니다.`,
       `걷기는 잘하고 계신 거고, 복압이 크게 걸리는 웨이트는 보통 수술 후 4~6주부터 단계적으로 권합니다. 다음 외래에서 확인 후 시작하시면 안전합니다.`],
      [`${e.apptStr('외과 진료')} 전에 1박 2일 국내 출장이 있는데 비행기 타도 됩니까?`,
       `수술 부위 문제가 없는 지금 시점의 단거리 비행은 일반적으로 괜찮습니다. 통증·발열이 생기면 일정과 무관하게 진료를 먼저 받아 주세요.`],
      [`배 흉터에 뭐 발라야 하나요? 간단하게 요점만 부탁합니다.`,
       `실밥 제거 부위가 아물었으니 실리콘 겔 시트나 연고를 하루 1~2회, 2~3개월 사용하는 게 표준적입니다. 자외선 차단도 함께해 주세요.`],
    ],
  },
  { // 67세 — 걱정 많고 서술이 긴, 안심 선호, 자녀 권유로 앱 시작
    username: 'patient10', msgCount: 2, days: [-13, -10, -6, -3, -1],
    traits: { '말투': '정중하고 서술이 긴 존댓말', '태도': '걱정 많음, 증상을 상세히 기록·서술',
      '관심사': ['어지럼 재발', '전정재활운동', '뇌 질환 걱정'],
      '주의사항': '안심시키는 답변 선호 — 딸 권유로 앱 사용을 시작한 초보 사용자' },
    summary: (e) => [
      `딸 권유로 앱을 쓰기 시작한 환자. ${e.dx0('양성 발작성 현훈')} 치료 중으로 증상을 길고 상세하게 서술함.`,
      `어지럼이 뇌 질환은 아닌지 걱정이 많아, ${e.drug(0, '어지럼약')} 복용과 전정재활운동을 성실히 따르는 중.`,
      '결론을 먼저 말하고 안심시키는 차분한 설명이 효과적임.',
    ].join('\n'),
    pairs: (e) => [
      [`선생님, 딸이 이 앱으로 물어보라고 해서 처음 적어봅니다. 아침에 이불을 개려고 고개를 숙였다가 천장이 빙 도는 느낌이 한 십 초쯤 있다가 가라앉았는데요, 지난달보다는 훨씬 덜하긴 한데 이게 혹시 머리에 무슨 문제가 있는 건 아닌지 자꾸 걱정이 됩니다.`,
       `걱정되셨겠어요. 말씀하신 양상은 진단받으신 양성 발작성 현훈(이석증)의 전형적인 모습이고, 짧게 돌다 가라앉으며 점점 좋아지는 경과도 좋은 신호입니다. 뇌 질환과는 다른 병이니 너무 염려 마세요.`],
      [`가르쳐 주신 그 전정재활운동을 아침저녁으로 하고 있는데요, 운동을 하는 중에는 오히려 어지럼이 살짝 생깁니다. 이러면 몸에 해로운 건 아닌지, 그래도 계속하는 게 맞는지 여쭙고 싶습니다.`,
       `아주 잘하고 계십니다. 운동 중에 가벼운 어지럼이 잠깐 생기는 건 오히려 균형 기관이 적응하는 정상 과정이에요. 지금처럼 꾸준히 하시면 됩니다. 다만 어지럼이 오래 지속되면 강도를 줄여 주세요.`],
      [`약(${e.drug(0, '어지럼약')})을 식후에 먹고 있는데 속이 조금 미식거리는 것 같기도 합니다. 제가 예민해서 그런 건지, 약 때문인지 모르겠어서 상세히 적어봅니다.`,
       `세심하게 관찰하고 계시네요. 그 약은 간혹 가벼운 속 불편감이 있을 수 있습니다. 식사 직후 복용을 유지해 보시고, 불편이 계속되면 ${e.apptStr('다음 진료')} 때 말씀해 주세요. 임의로 중단하지 않으셔도 될 정도입니다.`],
      [`김장철이라 고개를 숙일 일이 많은데, 어지럼이 또 올까 봐 겁이 나서요. 조심해야 할 자세 같은 게 있으면 알려 주세요.`,
       `갑자기 고개를 숙이거나 홱 돌리는 동작만 천천히 하시면 됩니다. 일을 나눠서 쉬엄쉬엄 하시고, 어지럼이 다시 잦아지면 예약일 전이라도 내원하시면 됩니다. 지금 경과라면 크게 걱정하실 단계는 아니에요.`],
    ],
  },
];

(async () => {
  const client = await pool.connect(); // 트랜잭션은 단일 커넥션에서
  try {
    await client.query('BEGIN');
    console.log(`seed-personas-expand 시작 (모드: ${DRY ? 'DRY-RUN — 종료 시 ROLLBACK' : '실제 적용'}, 기준일 ${dateStr(TODAY)})`);
    const lines = [];
    for (const P of PERSONAS) {
      const u = await client.query(
        `SELECT u.id AS uid, p.id AS pid, u.name FROM users u JOIN patients p ON p.user_id=u.id
          WHERE u.username=$1`, [P.username]);
      if (!u.rows.length) { console.warn(`  ! 계정/환자 연결 없음: ${P.username} — 건너뜀`); continue; }
      const { uid, pid, name } = u.rows[0];
      const e = await emrOf(client, pid);
      const pairs = P.pairs(e);
      const sessionId = 'bn-demo-' + P.username;

      // 1) chat_messages — bn-demo-% 존재 시 환자 단위 skip (멱등)
      const has = await client.query(
        `SELECT 1 FROM chat_messages WHERE user_id=$1 AND session_id LIKE 'bn-demo-%' LIMIT 1`, [uid]);
      let chatNote;
      if (has.rows.length) {
        tally('chat_messages', false, pairs.length * 2);
        chatNote = 'chat =';
      } else {
        for (let i = 0; i < pairs.length; i++) {
          const q = at(P.days[i % P.days.length], 9 + ((i * 2) % 9), (i * 13) % 55);
          const a = new Date(q.getTime() + 2 * 60000); // 답변은 2분 뒤
          await client.query(
            `INSERT INTO chat_messages (user_id, session_id, role, content, created_at) VALUES ($1,$2,'user',$3,$4)`,
            [uid, sessionId, pairs[i][0], q]);
          await client.query(
            `INSERT INTO chat_messages (user_id, session_id, role, content, created_at) VALUES ($1,$2,'assistant',$3,$4)`,
            [uid, sessionId, pairs[i][1], a]);
          tally('chat_messages', true, 2);
        }
        chatNote = `chat +${pairs.length * 2}행`;
      }

      // 2) user_personas — 행이 있으면 절대 덮어쓰지 않음 (실누적 보호)
      const ins = await client.query(
        `INSERT INTO user_personas (user_id, summary, traits, msg_count)
         VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO NOTHING RETURNING user_id`,
        [uid, P.summary(e), JSON.stringify(P.traits), P.msgCount]);
      tally('user_personas', ins.rows.length > 0);
      lines.push(`  ${P.username.padEnd(9)} ${name}  ${chatNote}, persona ${ins.rows.length ? '+1' : '='}`);
    }

    lines.forEach((l) => console.log(l));
    console.log('entity별 inserted / skipped(기존 유지):');
    for (const [k, v] of Object.entries(stats)) {
      console.log(`  ${k.padEnd(14)} +${String(v.inserted).padStart(4)} / =${v.skipped}`);
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
    console.error('seed-personas-expand 실패 (ROLLBACK):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
