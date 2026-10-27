// ============================================================
// Basil Nexus — 약제 마스터(drug_master) 구축 + 처방 표기 정비 시드
// (LavenderRx: 인드림헬스케어 약물 상호작용 솔루션 연동 준비, 2026-10)
// 사용법:
//   node db/seed-drug-master.js --dry-run   ← 변경 예정만 출력하고 ROLLBACK
//   node db/seed-drug-master.js             ← 실제 적용 (COMMIT)
//
// 내용 (멱등 — 재실행 안전):
//  1. drug_master 테이블 생성 — 벤더 샘플("전달 약제명.xlsx") 6컬럼 체계.
//     mainDrugCode/kdCode는 벤더 사전 회신 후 채움(code_confirmed=false로 적재).
//  2. prescription_drug_map 매핑 테이블 (prescriptions는 postgres 소유라 ALTER 불가 —
//     basil 소유의 별도 매핑 테이블로 처방↔마스터 연결)
//  3. 기존 영문 자유텍스트 drug_name → 한글 제품명(성분명) 표기로 전환 + 마스터 연결
//     ※ fix-demo-data.js NEW_DRUG, seed-demo-refresh.js RX_POOL도 새 표기로 맞춰둠
//  4. 상호작용 데모 조합 처방 추가 (시연 포인트 — patient1~6, 기전 중복 없이):
//     - 홍길동(p1): 아스피린프로텍트 + 부루펜 (NSAID의 항혈소판 간섭·출혈 위험)
//     - 김철수(p2): 플라빅스 + 로섹 (CYP2C19 — 클로피도그렐 활성화 저해)
//     - 박영희(p3): 아마릴 + 씨프로바이 (설폰요소제+퀴놀론 — 저혈당 위험)
//     - 이민수(p4): 리피토 + 클래리시드 (CYP3A4 — 횡문근융해 위험)
//     - 최지연(p5): 씬지로이드 + 훼로바유 (철분제가 레보티록신 흡수 저해)
//     - 김복순(p6): 조코 20mg 추가 (기존 노바스크와 병용 시 심바스타틴 용량 상한)
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

// [제품명(원문), 성분명(한), 성분명(영), 기존 drug_name(매칭용, null=신규), 새 표기, 비고]
const MASTER = [
  ['노바스크정5밀리그램',        '암로디핀베실산염',       'Amlodipine besylate',  'Amlodipine 5mg',        '노바스크정5mg(암로디핀)', null],
  ['로섹캡슐20밀리그램',         '오메프라졸',             'Omeprazole',           'Omeprazole 20mg',       '로섹캡슐20mg(오메프라졸)', null],
  ['씨잘정5밀리그램',            '레보세티리진염산염',     'Levocetirizine',       'Levocetirizine 5mg',    '씨잘정5mg(레보세티리진)', null],
  ['타이레놀이알서방정650밀리그램', '아세트아미노펜',      'Acetaminophen',        'Acetaminophen 650mg',   '타이레놀이알서방정650mg(아세트아미노펜)', null],
  ['부루펜정400밀리그램',        '이부프로펜',             'Ibuprofen',            'Ibuprofen 400mg',       '부루펜정400mg(이부프로펜)', null],
  ['자이로릭정100밀리그램',      '알로푸리놀',             'Allopurinol',          'Allopurinol 100mg',     '자이로릭정100mg(알로푸리놀)', null],
  ['리피토정20밀리그램',         '아토르바스타틴칼슘',     'Atorvastatin',         'Atorvastatin 20mg',     '리피토정20mg(아토르바스타틴)', null],
  ['리피토정10밀리그램',         '아토르바스타틴칼슘',     'Atorvastatin',         'Atorvastatin 10mg',     '리피토정10mg(아토르바스타틴)', null],
  ['다이아벡스정500밀리그램',    '메트포르민염산염',       'Metformin',            'Metformin 500mg',       '다이아벡스정500mg(메트포르민)', null],
  ['훼로바유서방정',             '건조황산제일철',         'Ferrous sulfate',      'Ferrous sulfate 256mg', '훼로바유서방정(황산제일철)', null],
  ['씬지로이드정0.05밀리그램',   '레보티록신나트륨',       'Levothyroxine',        'Levothyroxine 50mcg',   '씬지로이드정0.05mg(레보티록신)', null],
  ['판토록정40밀리그램',         '판토프라졸나트륨',       'Pantoprazole',         'Pantoprazole 40mg',     '판토록정40mg(판토프라졸)', null],
  ['지르텍액',                   '세티리진염산염',         'Cetirizine',           'Cetirizine syrup 5mg/5mL (세티리진 시럽)', '지르텍액1mg/mL(세티리진)', '소아 시럽'],
  ['메디락디에스장용캡슐',       '바실루스균·유산균제제',  'Bacillus/Lactobacillus', '유산균 정장제',        '메디락디에스장용캡슐(유산균)', '일반의약품'],
  ['히드로코르티손크림1%',       '히드로코르티손',         'Hydrocortisone',       'Hydrocortisone 1% cream', '히드로코르티손크림1%', '외용제 — 상호작용 분석 비대상'],
  ['클라리틴정10밀리그램',       '로라타딘',               'Loratadine',           'Loratadine 10mg',       '클라리틴정10mg(로라타딘)', null],
  ['아목시실린건조시럽250mg/5mL', '아목시실린수화물',      'Amoxicillin',          'Amoxicillin syrup 250mg/5mL (아목시실린 시럽)', '아목시실린건조시럽250mg/5mL', '성분명 표기(제품 미지정)'],
  ['세라마이드 보습제',          '세라마이드',             'Ceramide',             '세라마이드 보습제',     '세라마이드 보습제', '비의약품(보습제) — 분석 비대상'],
  ['아스피린프로텍트정100밀리그램', '아스피린',            'Aspirin',              'Aspirin 100mg',         '아스피린프로텍트정100mg(아스피린)', null],
  ['베타히스틴정16밀리그램',     '베타히스틴염산염',       'Betahistine',          'Betahistine 16mg',      '베타히스틴정16mg', '성분명 표기(제품 미지정)'],
  ['비타민D 1000IU',             '콜레칼시페롤',           'Cholecalciferol',      '비타민D 1000IU',        '비타민D 1000IU', '건강기능식품'],
  ['포사맥스정70밀리그램',       '알렌드론산나트륨',       'Alendronate',          'Alendronate 70mg',      '포사맥스정70mg(알렌드로네이트)', null],
  ['세파클러건조시럽125mg/5mL',  '세파클러수화물',         'Cefaclor',             'Cefaclor syrup 125mg/5mL (세파클러 시럽)', '세파클러건조시럽125mg/5mL', '성분명 표기(제품 미지정)'],
  ['인공눈물점안액0.5mL',        '카르복시메틸셀룰로오스나트륨', 'Carmellose sodium', '인공눈물 점안액 0.5mL', '인공눈물점안액0.5mL', '점안제 — 분석 비대상'],
  ['보나링에이정',               '디멘히드리네이트',       'Dimenhydrinate',       'Dimenhydrinate 50mg',   '보나링에이정(디멘히드리네이트)', null],
  ['조코정20밀리그램',           '심바스타틴',             'Simvastatin',          null,                    '조코정20mg(심바스타틴)', null],
  ['플라빅스정75밀리그램',       '클로피도그렐황산수소염', 'Clopidogrel',          null,                    '플라빅스정75mg(클로피도그렐)', null],
  ['아마릴정2밀리그램',          '글리메피리드',           'Glimepiride',          null,                    '아마릴정2mg(글리메피리드)', null],
  ['씨프로바이정500밀리그램',    '시프로플록사신염산염수화물', 'Ciprofloxacin',    null,                    '씨프로바이정500mg(시프로플록사신)', '항생제 단기 처방'],
  ['클래리시드필름코팅정250밀리그램', '클래리스로마이신',  'Clarithromycin',       null,                    '클래리시드정250mg(클래리스로마이신)', '항생제 단기 처방'],
];

// 상호작용 데모 조합: [username, 새 표기(마스터 display), 용법]
const INTERACTION_RX = [
  ['patient1', '아스피린프로텍트정100mg(아스피린)', '1일 1회, 아침 식후'],
  ['patient1', '부루펜정400mg(이부프로펜)',         '1일 3회, 무릎 통증 시'],
  ['patient2', '플라빅스정75mg(클로피도그렐)',      '1일 1회, 아침 식후'],
  ['patient2', '로섹캡슐20mg(오메프라졸)',          '1일 1회, 아침 식전'],
  ['patient3', '아마릴정2mg(글리메피리드)',         '1일 1회, 아침 식전'],
  ['patient3', '씨프로바이정500mg(시프로플록사신)', '1일 2회, 5일간 (방광염)'],
  ['patient4', '리피토정20mg(아토르바스타틴)',      '1일 1회, 저녁 식후'],
  ['patient4', '클래리시드정250mg(클래리스로마이신)', '1일 2회, 7일간 (기관지염)'],
  ['patient5', '훼로바유서방정(황산제일철)',        '1일 1회, 점심 식후'],
  ['patient6', '조코정20mg(심바스타틴)',            '1일 1회, 저녁 식후'],
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log(`seed-drug-master 시작 (모드: ${DRY ? 'DRY-RUN — 종료 시 ROLLBACK' : '실제 적용'})`);

    // ── 1·2. 스키마 ────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS drug_master (
        id              SERIAL PRIMARY KEY,
        kor_prod_name   TEXT NOT NULL UNIQUE,  -- korProdNameOrigin
        kor_ing_origin  TEXT,                  -- korIngNameOrigin ([M성분코드] 포함 원문 — 벤더 회신 후 채움)
        kor_ing_name    TEXT,                  -- korIngName
        eng_ing_name    TEXT,                  -- engIngName
        main_drug_code  TEXT,                  -- mainDrugCode (주성분코드)
        kd_code         TEXT,                  -- kdCode
        code_confirmed  BOOLEAN NOT NULL DEFAULT false, -- 벤더/공공DB로 코드 검증 완료 여부
        note            TEXT
      )`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS prescription_drug_map (
        prescription_id INTEGER PRIMARY KEY REFERENCES prescriptions(id) ON DELETE CASCADE,
        drug_master_id  INTEGER NOT NULL REFERENCES drug_master(id)
      )`);
    console.log('1·2) drug_master·prescription_drug_map 테이블 준비 완료');

    // ── 3. 마스터 적재 + 처방 표기 전환·연결 ───────────────────
    const masterIdOf = {};                      // display → drug_master.id (4번에서 재사용)
    for (const [prod, ingKor, ingEng, oldName, display, note] of MASTER) {
      const up = await client.query(
        `INSERT INTO drug_master (kor_prod_name, kor_ing_name, eng_ing_name, note)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (kor_prod_name) DO UPDATE SET kor_ing_name=$2, eng_ing_name=$3, note=$4
         RETURNING id, (xmax = 0) AS inserted`, [prod, ingKor, ingEng, note]);
      tally('마스터', up.rows[0].inserted);
      masterIdOf[display] = up.rows[0].id;
      const names = oldName ? [oldName, display] : [display];
      const r = await client.query(
        `UPDATE prescriptions SET drug_name=$1 WHERE drug_name = ANY($2) AND drug_name <> $1`,
        [display, names]);
      const m = await client.query(
        `INSERT INTO prescription_drug_map (prescription_id, drug_master_id)
         SELECT id, $2 FROM prescriptions WHERE drug_name=$1
         ON CONFLICT (prescription_id) DO UPDATE SET drug_master_id=EXCLUDED.drug_master_id`,
        [display, up.rows[0].id]);
      tally('처방 표기 전환', r.rowCount > 0, r.rowCount || 1);
      tally('마스터 연결', m.rowCount > 0, m.rowCount || 1);
      if (DRY && r.rowCount) console.log(`   - ${oldName || '(신규)'} → ${display} (${r.rowCount}건)`);
    }

    // ── 4. 상호작용 데모 조합 ──────────────────────────────────
    for (const [un, display, dosage] of INTERACTION_RX) {
      const pt = await client.query(
        `SELECT pt.id FROM patients pt JOIN users u ON u.id=pt.user_id WHERE u.username=$1`, [un]);
      if (!pt.rows.length) { console.warn(`   ! ${un} 환자 없음 — 건너뜀`); continue; }
      const pid = pt.rows[0].id;
      const enc = await client.query(   // 가장 최근 진료에 귀속 (시작일 일치)
        `SELECT id, visited_at::date AS d FROM encounters WHERE patient_id=$1 ORDER BY visited_at DESC LIMIT 1`, [pid]);
      const r = await client.query(
        `INSERT INTO prescriptions (patient_id, encounter_id, drug_name, dosage, start_date, active)
         SELECT $1,$2,$3,$4,$5,TRUE
          WHERE NOT EXISTS (SELECT 1 FROM prescriptions WHERE patient_id=$1 AND drug_name=$3)
         RETURNING id`,
        [pid, enc.rows[0] ? enc.rows[0].id : null, display, dosage,
         enc.rows[0] ? enc.rows[0].d : new Date()]);
      if (r.rows.length && masterIdOf[display])
        await client.query(
          `INSERT INTO prescription_drug_map (prescription_id, drug_master_id) VALUES ($1,$2)
           ON CONFLICT (prescription_id) DO NOTHING`, [r.rows[0].id, masterIdOf[display]]);
      tally('상호작용 처방', r.rowCount > 0);
      if (DRY && r.rowCount) console.log(`   - ${un} ← ${display}`);
    }

    // ── 마무리 ─────────────────────────────────────────────────
    const orphan = await client.query(
      `SELECT count(*)::int n FROM prescriptions rx
        WHERE NOT EXISTS (SELECT 1 FROM prescription_drug_map m WHERE m.prescription_id=rx.id)`);
    console.log('결과:');
    for (const [k, v] of Object.entries(stats))
      console.log(`  ${k}: +${v.inserted}건 / =${v.skipped}건 기존 유지`);
    console.log(`  마스터 미연결 처방: ${orphan.rows[0].n}건 (0이어야 정상)`);
    if (DRY) { await client.query('ROLLBACK'); console.log('DRY-RUN → ROLLBACK 완료 (DB 미변경)'); }
    else { await client.query('COMMIT'); console.log('COMMIT 완료'); }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('seed-drug-master 실패 (ROLLBACK):', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
