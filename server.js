// Lifoneer / Basil Nexus — static HTTP server + AI proxy + 인증 API (PostgreSQL)
// Usage:  node server.js [port]      (default port 8088)
//   serves the ./public folder, bound to 0.0.0.0
const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');
const net  = require('net');
const crypto = require('crypto');

const ROOT = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || process.argv[2] || 8088);
const HOST = '0.0.0.0';

const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif',
  '.ico':'image/x-icon', '.webp':'image/webp', '.txt':'text/plain; charset=utf-8',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.map':'application/json'
};

// ── DB (PostgreSQL) ─────────────────────────────────────────
// db.config.json 이 없거나 pg 미설치여도 정적 서빙은 계속 동작한다.
let pool = null;
function getPool() {
  if (pool) return pool;
  const cfgPath = path.join(__dirname, 'db.config.json');
  if (!fs.existsSync(cfgPath)) throw new Error('db.config.json 없음');
  const { Pool } = require('pg');
  pool = new Pool(JSON.parse(fs.readFileSync(cfgPath, 'utf8')));
  return pool;
}

// ── 인증 헬퍼 ───────────────────────────────────────────────
const SESSION_COOKIE = 'bn_session';
const SESSION_DAYS = 7;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + '$' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(pw, salt, 64);
  const orig = Buffer.from(hash, 'hex');
  return calc.length === orig.length && crypto.timingSafeEqual(calc, orig);
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function sendJson(res, code, obj, headers) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
  res.end(JSON.stringify(obj));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > (limit || 1e6)) { req.destroy(); reject(new Error('too large')); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const db = getPool();
  const r = await db.query(
    `SELECT u.id, u.username, u.name, u.role, u.profile
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now() AND u.active`, [token]);
  return r.rows[0] || null;
}

// ── 인증 API ────────────────────────────────────────────────
async function apiLogin(req, res) {
  let body;
  try { body = JSON.parse((await readBody(req)).toString() || '{}'); }
  catch { return sendJson(res, 400, { error: '잘못된 요청' }); }
  const { username, password } = body;
  if (!username || !password) return sendJson(res, 400, { error: '아이디와 비밀번호를 입력하세요.' });
  const db = getPool();
  const r = await db.query('SELECT * FROM users WHERE username=$1 AND active', [username]);
  const u = r.rows[0];
  if (!u || !verifyPassword(password, u.password_hash))
    return sendJson(res, 401, { error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  const token = crypto.randomBytes(32).toString('hex');
  await db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2, now() + $3::interval)',
    [token, u.id, SESSION_DAYS + ' days']);
  await db.query('DELETE FROM sessions WHERE expires_at < now()'); // 청소
  sendJson(res, 200, { ok: true, role: u.role, name: u.name, profile: u.profile }, {
    'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`
  });
}
async function apiLogout(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) { try { await getPool().query('DELETE FROM sessions WHERE token=$1', [token]); } catch {} }
  sendJson(res, 200, { ok: true }, { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
}
async function apiMe(req, res) {
  const u = await currentUser(req);
  if (!u) return sendJson(res, 401, { error: '로그인이 필요합니다.' });
  sendJson(res, 200, { id: u.id, username: u.username, name: u.name, role: u.role, profile: u.profile });
}
// P6 회원가입 — 환자 전용. 이름+생년월일+휴대폰이 기존 미연결 환자와 정확히 1명
// 일치하면 그 환자에 연결(기존 기록 승계), 아니면 신규 환자로 등록한다.
async function apiSignup(req, res) {
  let body;
  try { body = JSON.parse((await readBody(req)).toString() || '{}'); }
  catch { return sendJson(res, 400, { error: '잘못된 요청' }); }
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '').trim();
  const birthDate = String(body.birth_date || '').trim();
  const phoneDigits = String(body.phone || '').replace(/\D/g, '');
  const sex = body.sex === 'M' || body.sex === 'F' ? body.sex : null;

  if (!/^[a-z0-9_]{4,20}$/.test(username))
    return sendJson(res, 400, { error: '아이디는 4~20자의 영문 소문자·숫자·밑줄(_)만 사용할 수 있습니다.' });
  if (password.length < 8)
    return sendJson(res, 400, { error: '비밀번호는 8자 이상이어야 합니다.' });
  if (!name || name.length > 30)
    return sendJson(res, 400, { error: '이름을 확인해 주세요.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || isNaN(Date.parse(birthDate))
      || new Date(birthDate) > new Date() || birthDate < '1900-01-01')
    return sendJson(res, 400, { error: '생년월일을 확인해 주세요.' });
  if (!/^01\d{8,9}$/.test(phoneDigits))
    return sendJson(res, 400, { error: '휴대폰 번호를 확인해 주세요.' });
  const phone = phoneDigits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');

  const db = getPool();
  const client = await db.connect();
  let userId, linked = false;
  try {
    await client.query('BEGIN');
    const u = await client.query(
      `INSERT INTO users (username, password_hash, name, role, profile)
       VALUES ($1,$2,$3,'patient',$4) RETURNING id`,
      [username, hashPassword(password), name, JSON.stringify({ birth_date: birthDate, phone })]);
    userId = u.rows[0].id;
    const m = await client.query(
      `SELECT id FROM patients
        WHERE user_id IS NULL AND name=$1 AND birth_date=$2::date
          AND regexp_replace(coalesce(phone,''), '\\D', '', 'g') = $3
        ORDER BY id`, [name, birthDate, phoneDigits]);
    if (m.rows.length === 1) {
      await client.query('UPDATE patients SET user_id=$1 WHERE id=$2', [userId, m.rows[0].id]);
      linked = true;
    } else {
      await client.query(
        `INSERT INTO patients (user_id, name, birth_date, sex, phone) VALUES ($1,$2,$3::date,$4,$5)`,
        [userId, name, birthDate, sex, phone]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    if (String(e.message).includes('duplicate'))
      return sendJson(res, 409, { error: '이미 사용 중인 아이디입니다.' });
    throw e;
  } finally {
    client.release();
  }

  const token = crypto.randomBytes(32).toString('hex');
  await db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2, now() + $3::interval)',
    [token, userId, SESSION_DAYS + ' days']);
  sendJson(res, 200, { ok: true, role: 'patient', name, linked }, {
    'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`
  });
}
async function apiAdminUsers(req, res) {
  const me = await currentUser(req);
  if (!me) return sendJson(res, 401, { error: '로그인이 필요합니다.' });
  if (me.role !== 'admin') return sendJson(res, 403, { error: '관리자만 사용할 수 있습니다.' });
  const db = getPool();
  if (req.method === 'GET') {
    const r = await db.query('SELECT id, username, name, role, profile, active, created_at FROM users ORDER BY id');
    return sendJson(res, 200, { users: r.rows });
  }
  if (req.method === 'POST') {
    let body;
    try { body = JSON.parse((await readBody(req)).toString() || '{}'); }
    catch { return sendJson(res, 400, { error: '잘못된 요청' }); }
    const { username, password, name, role, profile } = body;
    if (!username || !password || !name || !role) return sendJson(res, 400, { error: '필수 항목 누락' });
    if (!['admin','doctor','nurse','patient'].includes(role)) return sendJson(res, 400, { error: '잘못된 역할' });
    if (String(password).length < 8) return sendJson(res, 400, { error: '비밀번호는 8자 이상' });
    try {
      const r = await db.query(
        `INSERT INTO users (username, password_hash, name, role, profile) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [username, hashPassword(password), name, role, JSON.stringify(profile || {})]);
      if (role === 'patient') {
        const p = profile || {};
        await db.query(
          `INSERT INTO patients (user_id, name, birth_date, sex, phone, address)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id) DO NOTHING`,
          [r.rows[0].id, name, p.birth_date || null, p.sex || null, p.phone || null, p.address || null]);
      }
      return sendJson(res, 200, { ok: true, id: r.rows[0].id });
    } catch (e) {
      if (String(e.message).includes('duplicate')) return sendJson(res, 409, { error: '이미 존재하는 아이디입니다.' });
      throw e;
    }
  }
  sendJson(res, 405, { error: 'Method Not Allowed' });
}

// ── P4 대시보드 API (docs/API-CONTRACT-P4.md) ───────────────
const WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];
const DOC_TYPES = ['진단서', '소견서', '의무기록 사본', '검사결과서', '처방전', '보험서류', '기타'];
const APPT_KINDS = ['진료', '검사', '투약', '처치', '물리치료', '수술', '검진'];
const NOTE_TYPES = ['활력징후', '투약', '처치', '간호기록'];
const DOC_STATUS_LABEL  = { requested: '신청됨', issued: '발급완료', rejected: '반려' };
const APPT_STATUS_LABEL = { scheduled: '대기', done: '완료', cancelled: '취소', no_show: 'No-Show' };

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtDate(d)   { return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`; }          // "YYYY.MM.DD"
function fmtDateW(d)  { return `${fmtDate(d)} (${WEEK_KO[d.getDay()]})`; }                                     // "YYYY.MM.DD (금)"
function fmtDateKo(d) { return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK_KO[d.getDay()]})`; } // "YYYY년 M월 D일 (금)"
function fmtTime(d)   { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }                              // "HH:MM"
function calcAge(birth) {            // 만나이(정수) — birth: Date|null
  if (!birth) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age;
}
function fmtPid(id, createdAt) {     // "ID YYYYMMDD-nnn"
  return `ID ${createdAt.getFullYear()}${pad2(createdAt.getMonth() + 1)}${pad2(createdAt.getDate())}-${String(id).padStart(3, '0')}`;
}
function memoAuthor(name, role) {    // doctor→"이름 의사", nurse→"이름 간호사", admin→"관리자", patient→"이름"
  if (role === 'doctor') return `${name} 의사`;
  if (role === 'nurse')  return `${name} 간호사`;
  if (role === 'admin')  return '관리자';
  return name || '';
}
function toNum(v) { return v == null ? null : Number(v); }   // pg NUMERIC → number
function doctorLabel(name, profile) {                        // "홍길동 원장" (title 없으면 "의사")
  return name ? `${name} ${(profile && profile.title) || '의사'}` : '';
}
const PAGE_SIZE = 20;
function pageOf(query) {                                     // ?page= → 1 이상 정수(기본 1)
  const n = parseInt(query.page, 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
function parseId(v) {                                        // 양의 int4 정수만 허용, 아니면 null
  if (!/^\d+$/.test(String(v))) return null;
  const n = Number(v);
  return n >= 1 && n <= 2147483647 ? n : null;
}
function isValidDateStr(s) {                                 // "YYYY-MM-DD" + 실제 존재하는 날짜
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const d = new Date(s + 'T00:00:00');
  return !isNaN(d.getTime()) && fmtDate(d) === s.replace(/-/g, '.');   // 2026-02-30 등 자동 이월 차단
}

// 로그인 + 역할 검사 (admin은 모든 role API 허용). 실패 시 401/403 응답 후 null.
async function requireRole(req, res, roles) {
  const u = await currentUser(req);
  if (!u) { sendJson(res, 401, { error: 'unauthorized' }); return null; }
  if (u.role !== 'admin' && !roles.includes(u.role)) { sendJson(res, 403, { error: 'forbidden' }); return null; }
  return u;
}
async function readJsonBody(req) {
  try { return JSON.parse((await readBody(req)).toString() || '{}'); }
  catch { return null; }
}

// status='requested' 서류를 doc_type enum 순서로 집계 (count>0만)
async function getDocRequests(db) {
  const r = await db.query(`SELECT doc_type, count(*)::int AS c FROM documents WHERE status='requested' GROUP BY doc_type`);
  const map = new Map(r.rows.map((x) => [x.doc_type, x.c]));
  return DOC_TYPES.filter((t) => map.get(t) > 0).map((t) => ({ type: t, count: map.get(t) }));
}

// patientDetail (계약 §4) — 의사 대시보드 recentPatient / 환자 검색 공용
async function patientDetail(db, patientId) {
  const pr = await db.query(`SELECT id, name, sex, birth_date, created_at FROM patients WHERE id=$1`, [patientId]);
  if (!pr.rows.length) return null;
  const p = pr.rows[0];
  const [dxr, rxr, vr, lr, er] = await Promise.all([
    db.query(`SELECT name, code, diagnosed_at FROM diagnoses WHERE patient_id=$1
              ORDER BY diagnosed_at ASC NULLS LAST, id`, [patientId]),
    db.query(`SELECT drug_name, dosage, active FROM prescriptions WHERE patient_id=$1
              ORDER BY start_date ASC NULLS LAST, id`, [patientId]),
    db.query(`SELECT measured_at, systolic, diastolic, glucose, weight_kg, bmi FROM vitals
              WHERE patient_id=$1 ORDER BY measured_at DESC LIMIT 3`, [patientId]),
    db.query(`SELECT tested_at, test_name, value, ref_range, flag FROM lab_results
              WHERE patient_id=$1 ORDER BY tested_at DESC, id LIMIT 5`, [patientId]),
    db.query(`SELECT visited_at, note FROM encounters
              WHERE patient_id=$1 AND visited_at <= now() ORDER BY visited_at DESC LIMIT 1`, [patientId])
  ]);
  const active = rxr.rows.filter((r) => r.active);
  const enc = er.rows[0];
  return {
    id: p.id, name: p.name, sex: p.sex, age: calcAge(p.birth_date), pid: fmtPid(p.id, p.created_at),
    dx: dxr.rows.map((r) => r.name).join(', '),
    rx: active.length ? active[0].drug_name + (active.length > 1 ? ` 외 ${active.length - 1}종` : '') : '',
    lastVisit: enc ? fmtDate(enc.visited_at) : '',
    memo: (enc && enc.note) || '',
    emr: {
      diagnoses: dxr.rows.map((r) => ({ name: r.name, code: r.code, date: r.diagnosed_at ? fmtDate(r.diagnosed_at) : null })),
      prescriptions: rxr.rows.map((r) => ({ drug: r.drug_name, dosage: r.dosage, active: r.active })),
      vitals: vr.rows.map((r) => ({ date: fmtDate(r.measured_at), systolic: r.systolic, diastolic: r.diastolic,
                                    glucose: r.glucose, weight: toNum(r.weight_kg), bmi: toNum(r.bmi) })),
      labs: lr.rows.map((r) => ({ date: fmtDate(r.tested_at), test: r.test_name, value: r.value, ref: r.ref_range, flag: r.flag }))
    }
  };
}

// §1 GET /api/dashboard/doctor
async function apiDashboardDoctor(req, res) {
  const me = await requireRole(req, res, ['doctor']);
  if (!me) return;
  const db = getPool();
  let doctorId = me.id;
  if (me.role !== 'doctor') {   // admin 열람 시 첫 의사 기준
    const d = await db.query(`SELECT id FROM users WHERE role='doctor' AND active ORDER BY id LIMIT 1`);
    if (d.rows.length) doctorId = d.rows[0].id;
  }
  const [schedR, noShowR, encR, recentR, alertR, docRequests] = await Promise.all([
    db.query(`SELECT a.scheduled_at, a.status, p.name, p.sex, p.birth_date,
                     COALESCE((SELECT string_agg(d.name, '·' ORDER BY d.diagnosed_at ASC NULLS LAST, d.id)
                                 FROM diagnoses d WHERE d.patient_id=p.id), '') AS dx
                FROM appointments a JOIN patients p ON p.id=a.patient_id
               WHERE a.doctor_id=$1 AND a.scheduled_at::date=CURRENT_DATE AND a.status IN ('scheduled','done')
               ORDER BY a.scheduled_at`, [doctorId]),
    db.query(`SELECT count(*)::int AS c FROM appointments
               WHERE doctor_id=$1 AND status='no_show'
                 AND date_trunc('month', scheduled_at)=date_trunc('month', now())`, [doctorId]),
    db.query(`SELECT count(*)::int AS c FROM encounters
               WHERE date_trunc('month', visited_at)=date_trunc('month', now())`),
    // 최근 encounter의 환자 — 통계 시드가 미래 시각 포함이므로 now() 필터 없이 조회 (DB 시드 규약)
    db.query(`SELECT patient_id FROM encounters ORDER BY visited_at DESC LIMIT 1`),
    db.query(`SELECT count(*)::int AS c FROM documents WHERE status='requested'`),
    getDocRequests(db)
  ]);
  let firstScheduled = true;
  const schedule = schedR.rows.map((r) => {
    let status = 'done';
    if (r.status === 'scheduled') {
      status = firstScheduled ? 'now' : 'wait';
      firstScheduled = false;
    }
    return { time: fmtTime(r.scheduled_at), name: r.name, sex: r.sex, age: calcAge(r.birth_date), dx: r.dx, status };
  });
  const waiting = schedR.rows.filter((r) => r.status === 'scheduled').length;
  const recentPatient = recentR.rows.length ? await patientDetail(db, recentR.rows[0].patient_id) : null;
  sendJson(res, 200, {
    todayLabel: fmtDateKo(new Date()),
    sidebar: { scheduled: schedR.rows.length, waiting },
    schedule,
    docRequests,
    monthStats: { waiting, noShow: noShowR.rows[0].c, encounters: encR.rows[0].c },
    recentPatient,
    alertCount: alertR.rows[0].c
  });
}

// §2 GET /api/dashboard/nurse
async function apiDashboardNurse(req, res) {
  const me = await requireRole(req, res, ['nurse']);
  if (!me) return;
  const db = getPool();
  let ward = (me.profile && me.profile.ward) || null;
  if (!ward) {                  // admin 열람 시 첫 간호사의 병동 기준
    const w = await db.query(`SELECT profile->>'ward' AS w FROM users
                               WHERE role='nurse' AND active AND profile->>'ward' IS NOT NULL ORDER BY id LIMIT 1`);
    ward = w.rows.length ? w.rows[0].w : '내과 병동';
  }
  const [sbR, cntR, patR, safetyR, medR, labR, careR, admR, docsAllR, memosR,
         inR, testR, surgR, docContactsR, notesR, docRequests] = await Promise.all([
    db.query(`SELECT count(*) FILTER (WHERE note_type='활력징후')::int AS vitals,
                     count(*) FILTER (WHERE note_type='투약')::int   AS meds
                FROM nursing_notes WHERE created_at::date=CURRENT_DATE`),
    db.query(`SELECT count(*)::int AS c FROM admissions WHERE status='admitted' AND ward=$1`, [ward]),
    db.query(`SELECT p.id, p.name, p.sex, p.birth_date, a.room,
                     COALESCE((SELECT string_agg(d.name, ', ' ORDER BY d.diagnosed_at ASC NULLS LAST, d.id)
                                 FROM diagnoses d WHERE d.patient_id=p.id), '') AS dx
                FROM admissions a JOIN patients p ON p.id=a.patient_id
               WHERE a.status='admitted' AND a.ward=$1
               ORDER BY a.room LIMIT 5`, [ward]),
    db.query(`SELECT event_type, count(*)::int AS c FROM safety_events
               WHERE date_trunc('month', occurred_at)=date_trunc('month', now()) GROUP BY event_type`),
    db.query(`SELECT count(*)::int AS c FROM appointments
               WHERE kind='투약' AND scheduled_at::date=CURRENT_DATE AND status<>'cancelled'`),
    db.query(`SELECT count(*)::int AS c FROM lab_results WHERE tested_at >= CURRENT_DATE - 7`),
    db.query(`SELECT count(*)::int AS c FROM appointments
               WHERE kind='처치' AND scheduled_at::date=CURRENT_DATE AND status<>'cancelled'`),
    db.query(`SELECT count(*)::int AS c FROM admissions
               WHERE status='admitted' AND discharge_due BETWEEN CURRENT_DATE AND CURRENT_DATE + 1`),
    db.query(`SELECT count(*)::int AS c FROM documents WHERE status='requested'`),
    db.query(`SELECT m.created_at, m.content, u.name, u.role
                FROM memos m LEFT JOIN users u ON u.id=m.author_id
               ORDER BY m.created_at DESC LIMIT 3`),
    db.query(`SELECT count(*)::int AS c FROM admissions WHERE status='admitted'`),
    db.query(`SELECT count(*)::int AS c FROM appointments
               WHERE kind='검사' AND scheduled_at::date=CURRENT_DATE AND status<>'cancelled'`),
    db.query(`SELECT count(*)::int AS c FROM appointments
               WHERE kind='수술' AND scheduled_at::date=CURRENT_DATE AND status<>'cancelled'`),
    db.query(`SELECT name, profile FROM users WHERE role='doctor' AND active ORDER BY id`),
    db.query(`SELECT n.note_type,
                     (SELECT a.room FROM admissions a
                       WHERE a.patient_id=n.patient_id AND a.status='admitted'
                       ORDER BY a.admitted_at DESC LIMIT 1) AS room
                FROM nursing_notes n ORDER BY n.created_at DESC LIMIT 5`),
    getDocRequests(db)
  ]);
  // 담당 환자 5명 — 오늘 예약 kind 최우선 1건 태그 매핑 (검사>투약>처치, 그 외 null)
  const TAG_MAP = { '검사': ['검사 예정', 't-test'], '투약': ['투약 시간', 't-med'], '처치': ['처치 예정', 't-care'] };
  const ids = patR.rows.map((r) => r.id);
  const apptR = ids.length ? await db.query(
    `SELECT patient_id, kind, scheduled_at FROM appointments
      WHERE patient_id = ANY($1::int[]) AND scheduled_at::date=CURRENT_DATE AND status='scheduled'
      ORDER BY scheduled_at`, [ids]) : { rows: [] };
  const patients = patR.rows.map((r) => {
    const mine = apptR.rows.filter((a) => a.patient_id === r.id);
    let tag = null, tagClass = null, time = null;
    for (const kind of ['검사', '투약', '처치']) {
      const hit = mine.find((a) => a.kind === kind);
      if (hit) { tag = TAG_MAP[kind][0]; tagClass = TAG_MAP[kind][1]; time = fmtTime(hit.scheduled_at); break; }
    }
    return { initial: r.name.charAt(0), name: r.name, sex: r.sex, age: calcAge(r.birth_date),
             room: r.room, dx: r.dx, tag, tagClass, time };
  });
  const safetyMap = new Map(safetyR.rows.map((r) => [r.event_type, r.c]));
  const alerts = {
    med: medR.rows[0].c, lab: labR.rows[0].c, care: careR.rows[0].c,
    admission: admR.rows[0].c, docs: docsAllR.rows[0].c
  };
  const NOTE_LABEL = { '활력징후': '환자 활력징후 기록', '투약': '환자 투약 후 기록',
                       '처치': '환자 처치 기록', '간호기록': '환자 간호 기록 작성' };
  const contacts = docContactsR.rows.map((r) => ({
    initial: r.name.charAt(0), name: `${r.name} 의사 (담당)`, phone: (r.profile && r.profile.phone) || '-'
  }));
  contacts.push({ initial: '주', name: '주치의 당직', phone: '02-123-1111' });
  contacts.push({ initial: '수', name: '수간호사', phone: '010-9876-5432' });
  sendJson(res, 200, {
    todayLabel: fmtDateW(new Date()),
    sidebar: { vitals: sbR.rows[0].vitals, meds: sbR.rows[0].meds },
    patientCount: cntR.rows[0].c,
    patients,
    docRequests,
    safety: { fall: safetyMap.get('낙상') || 0, sore: safetyMap.get('욕창') || 0,
              medError: safetyMap.get('투약오류') || 0, infection: safetyMap.get('감염') || 0 },
    alerts,
    memos: memosR.rows.map((r) => ({ time: fmtTime(r.created_at), text: r.content, author: memoAuthor(r.name, r.role) })),
    ward: { inpatients: inR.rows[0].c, dischargeDue: admR.rows[0].c,
            testsToday: testR.rows[0].c, surgeriesToday: surgR.rows[0].c },
    contacts,
    recentNotes: notesR.rows.map((r) => ({ label: NOTE_LABEL[r.note_type] || `환자 ${r.note_type || ''} 기록`, room: r.room || '' })),
    alertCount: alerts.med + alerts.lab + alerts.care + alerts.admission + alerts.docs
  });
}

// 본인(user_id 연결) patients 행 — admin은 첫 환자 계정 행으로 대체
async function myPatientRow(db, me) {
  let r = await db.query(
    `SELECT p.*, u.profile AS user_profile FROM patients p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1`, [me.id]);
  if (!r.rows.length && me.role === 'admin') {
    r = await db.query(
      `SELECT p.*, u.profile AS user_profile FROM patients p JOIN users u ON u.id=p.user_id
        WHERE u.role='patient' AND u.active ORDER BY p.id LIMIT 1`);
  }
  return r.rows[0] || null;
}

// §3 GET /api/dashboard/patient
async function apiDashboardPatient(req, res) {
  const me = await requireRole(req, res, ['patient']);
  if (!me) return;
  const db = getPool();
  const p = await myPatientRow(db, me);
  if (!p) return sendJson(res, 404, { error: '환자 정보를 찾을 수 없습니다.' });
  const [apptR, encR, medR, docR, billR, unpaidR, vitR, labR, docReqCntR, weekApptR] = await Promise.all([
    db.query(`SELECT a.scheduled_at, a.kind, a.department, u.name AS dname, u.profile AS dprofile
                FROM appointments a LEFT JOIN users u ON u.id=a.doctor_id
               WHERE a.patient_id=$1 AND a.status='scheduled' AND a.scheduled_at > now()
               ORDER BY a.scheduled_at LIMIT 4`, [p.id]),
    db.query(`SELECT e.visited_at, e.department, u.name AS dname, u.profile AS dprofile,
                     COALESCE((SELECT string_agg(d.name, ', ' ORDER BY d.id)
                                 FROM diagnoses d WHERE d.encounter_id=e.id), '') AS dx
                FROM encounters e LEFT JOIN users u ON u.id=e.doctor_id
               WHERE e.patient_id=$1 AND e.visited_at <= now()
               ORDER BY e.visited_at DESC LIMIT 3`, [p.id]),
    db.query(`SELECT drug_name, dosage FROM prescriptions
               WHERE patient_id=$1 AND active ORDER BY start_date ASC NULLS LAST, id`, [p.id]),
    db.query(`SELECT doc_type, requested_at, status FROM documents
               WHERE patient_id=$1 ORDER BY requested_at DESC LIMIT 5`, [p.id]),
    db.query(`SELECT billed_at, item, amount FROM bills
               WHERE patient_id=$1 ORDER BY billed_at DESC, id DESC LIMIT 3`, [p.id]),
    db.query(`SELECT COALESCE(sum(amount), 0)::int AS s FROM bills WHERE patient_id=$1 AND NOT paid`, [p.id]),
    db.query(`SELECT measured_at, systolic, diastolic, glucose, weight_kg, bmi FROM vitals
               WHERE patient_id=$1 ORDER BY measured_at DESC LIMIT 1`, [p.id]),
    db.query(`SELECT max(tested_at) AS d FROM lab_results WHERE patient_id=$1`, [p.id]),
    db.query(`SELECT count(*)::int AS c FROM documents WHERE patient_id=$1 AND status='requested'`, [p.id]),
    db.query(`SELECT count(*)::int AS c FROM appointments
               WHERE patient_id=$1 AND status='scheduled'
                 AND scheduled_at > now() AND scheduled_at <= now() + interval '7 days'`, [p.id])
  ]);
  const apptMeta = (r) => [r.department, doctorLabel(r.dname, r.dprofile)].filter(Boolean).join(' / ');
  // nextAppt + upcoming
  let nextAppt = null;
  if (apptR.rows.length) {
    const a = apptR.rows[0];
    const day0 = new Date(); day0.setHours(0, 0, 0, 0);
    const day1 = new Date(a.scheduled_at); day1.setHours(0, 0, 0, 0);
    nextAppt = {
      dateLabel: `${fmtDateW(a.scheduled_at)} ${fmtTime(a.scheduled_at)}`,
      meta: apptMeta(a),
      dday: Math.round((day1 - day0) / 86400000)
    };
  }
  const upcoming = apptR.rows.slice(1, 4).map((a) => ({
    date: fmtDateW(a.scheduled_at), time: fmtTime(a.scheduled_at),
    label: a.kind === '진료' ? '정기 진료' : (a.kind || '')
  }));
  // health (최신 vitals 1건, 없으면 null)
  let health = null;
  if (vitR.rows.length) {
    const v = vitR.rows[0];
    const bmi = toNum(v.bmi);
    const bmiLabel = bmi == null ? '' : bmi < 18.5 ? '저체중' : bmi < 25 ? '정상' : bmi < 30 ? '과체중' : '비만';
    const lastLab = labR.rows[0] && labR.rows[0].d;
    const lastEnc = encR.rows[0] && encR.rows[0].visited_at;
    const lastCheck = lastLab || lastEnc ? fmtDate(new Date(Math.max(lastLab ? lastLab.getTime() : 0, lastEnc ? lastEnc.getTime() : 0))) : '';
    health = { bp: `${v.systolic} / ${v.diastolic}`, glucose: v.glucose, weight: toNum(v.weight_kg), bmi, bmiLabel, lastCheck };
  }
  sendJson(res, 200, {
    profile: {
      name: p.name, birth: p.birth_date ? fmtDate(p.birth_date) : '', age: calcAge(p.birth_date),
      sexLabel: p.sex === 'M' ? '남' : p.sex === 'F' ? '여' : '',
      phone: p.phone || '', email: (p.user_profile && p.user_profile.email) || '', address: p.address || ''
    },
    nextAppt,
    upcoming,
    encounters: encR.rows.map((r) => ({
      date: fmtDate(r.visited_at), department: r.department || '', dx: r.dx, doctor: doctorLabel(r.dname, r.dprofile)
    })),
    meds: medR.rows.map((r) => ({ name: r.drug_name, dosage: r.dosage })),
    docs: docR.rows.map((r) => ({ type: r.doc_type, date: fmtDate(r.requested_at), status: r.status, statusLabel: DOC_STATUS_LABEL[r.status] || r.status })),
    bills: { unpaid: unpaidR.rows[0].s, rows: billR.rows.map((r) => ({ date: fmtDate(r.billed_at), item: r.item, amount: r.amount })) },
    health,
    alertCount: docReqCntR.rows[0].c + weekApptR.rows[0].c
  });
}

// §4 GET /api/patients?q= — 이름 부분일치(ILIKE) 또는 pid 숫자 일치, 최대 5명
// P5 §1-1 확장: q 없으면 최근 내원순 20명/page + total
async function apiPatients(req, res) {
  const me = await requireRole(req, res, ['doctor', 'nurse']);
  if (!me) return;
  const db = getPool();
  const query = url.parse(req.url, true).query;
  const q = String(query.q || '').trim();
  if (!q) {
    const page = pageOf(query);
    const [cntR, idR] = await Promise.all([
      db.query(`SELECT count(*)::int AS c FROM patients`),
      db.query(`SELECT p.id FROM patients p
                LEFT JOIN LATERAL (SELECT max(e.visited_at) AS lv FROM encounters e
                                    WHERE e.patient_id=p.id AND e.visited_at <= now()) v ON TRUE
                ORDER BY v.lv DESC NULLS LAST, p.id
                LIMIT $1 OFFSET $2`, [PAGE_SIZE, (page - 1) * PAGE_SIZE])
    ]);
    const results = [];
    for (const row of idR.rows) {
      const d = await patientDetail(db, row.id);
      if (d) results.push(d);
    }
    return sendJson(res, 200, { total: cntR.rows[0].c, results });
  }
  const m = q.match(/(\d+)\s*$/);                       // "ID 20260724-002" / "2" → 뒤 숫자
  let idNum = m ? parseInt(m[1], 10) : -1;
  if (!Number.isSafeInteger(idNum) || idNum > 2147483647) idNum = -1;
  const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';   // LIKE 메타문자 이스케이프
  const r = await db.query(
    `SELECT id FROM patients WHERE name ILIKE $1 OR id = $2 ORDER BY id LIMIT 5`, [like, idNum]);
  const results = [];
  for (const row of r.rows) {
    const d = await patientDetail(db, row.id);
    if (d) results.push(d);
  }
  sendJson(res, 200, { results });
}

// §5 POST /api/documents (patient) — 본인 명의 서류 발급 신청
async function apiCreateDocument(req, res) {
  const me = await requireRole(req, res, ['patient']);
  if (!me) return;
  const body = await readJsonBody(req);
  if (!body) return sendJson(res, 400, { error: '잘못된 요청' });
  const docType = body.doc_type;
  if (!DOC_TYPES.includes(docType)) return sendJson(res, 400, { error: '잘못된 서류 종류' });
  const db = getPool();
  const p = await myPatientRow(db, me);
  if (!p) return sendJson(res, 404, { error: '환자 정보를 찾을 수 없습니다.' });
  const r = await db.query(
    `INSERT INTO documents (patient_id, doc_type) VALUES ($1, $2) RETURNING requested_at`, [p.id, docType]);
  sendJson(res, 201, {
    ok: true,
    doc: { type: docType, date: fmtDate(r.rows[0].requested_at), status: 'requested', statusLabel: '신청됨' }
  });
}

// §5 POST /api/appointments (patient) — doctor_id=첫 의사, department=그 의사 진료과
async function apiCreateAppointment(req, res) {
  const me = await requireRole(req, res, ['patient']);
  if (!me) return;
  const body = await readJsonBody(req);
  if (!body) return sendJson(res, 400, { error: '잘못된 요청' });
  const { date, time, kind } = body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || '')))
    return sendJson(res, 400, { error: '날짜/시간 형식 오류' });
  if (!APPT_KINDS.includes(kind)) return sendJson(res, 400, { error: '잘못된 예약 종류' });
  const when = new Date(`${date}T${time}:00`);
  if (isNaN(when.getTime()) || fmtDate(when) !== date.replace(/-/g, '.'))   // 2026-02-30 등 자동 이월 차단
    return sendJson(res, 400, { error: '유효하지 않은 날짜' });
  if (when.getTime() <= Date.now()) return sendJson(res, 400, { error: '과거 시각은 예약할 수 없습니다.' });
  const db = getPool();
  const p = await myPatientRow(db, me);
  if (!p) return sendJson(res, 404, { error: '환자 정보를 찾을 수 없습니다.' });
  const dup = await db.query(
    `SELECT 1 FROM appointments WHERE patient_id=$1 AND scheduled_at=$2 AND status='scheduled'`, [p.id, when]);
  if (dup.rows.length)
    return sendJson(res, 409, { error: '같은 시간에 이미 예약이 있습니다. 다른 시간을 선택해 주세요.' });
  const d = await db.query(`SELECT id, profile FROM users WHERE role='doctor' AND active ORDER BY id LIMIT 1`);
  const doctorId = d.rows.length ? d.rows[0].id : null;
  const department = d.rows.length ? (d.rows[0].profile && d.rows[0].profile.department) || null : null;
  await db.query(
    `INSERT INTO appointments (patient_id, doctor_id, scheduled_at, department, kind)
     VALUES ($1, $2, $3, $4, $5)`, [p.id, doctorId, when, department, kind]);
  sendJson(res, 201, { ok: true });
}

// §5 POST /api/memos (nurse, admin)
async function apiCreateMemo(req, res) {
  const me = await requireRole(req, res, ['nurse']);
  if (!me) return;
  const body = await readJsonBody(req);
  if (!body) return sendJson(res, 400, { error: '잘못된 요청' });
  const content = String(body.content || '').trim();
  if (!content) return sendJson(res, 400, { error: '내용을 입력하세요.' });
  const db = getPool();
  const r = await db.query(
    `INSERT INTO memos (author_id, target_role, content) VALUES ($1, 'nurse', $2) RETURNING created_at`,
    [me.id, content]);
  sendJson(res, 201, {
    ok: true,
    memo: { time: fmtTime(r.rows[0].created_at), text: content, author: memoAuthor(me.name, me.role) }
  });
}

// §6 GET /api/health (로그인 필수) — db: SELECT 1, llm: AI 업스트림 TCP 연결(1초 타임아웃)
async function apiHealth(req, res) {
  const me = await currentUser(req);
  if (!me) return sendJson(res, 401, { error: 'unauthorized' });
  let dbOk = false;
  try { await getPool().query('SELECT 1'); dbOk = true; } catch {}
  const llmOk = await new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; sock.destroy(); resolve(v); } };
    const sock = net.connect({ host: AI_UPSTREAM.host, port: AI_UPSTREAM.port, timeout: 1000 });
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
  sendJson(res, 200, { db: dbOk, llm: llmOk, backup: '정상', security: '안전' });
}

// ── P5 API (docs/API-CONTRACT-P5.md §1) ─────────────────────

// §1-5 공통: 대상 환자 결정 — patient: 본인 고정(patient_id 무시),
// doctor/nurse: ?patient_id= 필수, admin: 지정 시 해당 환자·없으면 첫 환자 계정(P4 열람 규약).
// 실패 시 여기서 응답하고 null 반환.
async function resolveTargetPatient(db, me, res, query) {
  if (me.role === 'patient' || (me.role === 'admin' && !query.patient_id)) {
    const p = await myPatientRow(db, me);
    if (!p) { sendJson(res, 404, { error: '환자 정보를 찾을 수 없습니다.' }); return null; }
    return p.id;
  }
  const pidNum = parseId(query.patient_id);
  if (!pidNum) { sendJson(res, 400, { error: 'patient_id가 필요합니다.' }); return null; }
  const r = await db.query(`SELECT id FROM patients WHERE id=$1`, [pidNum]);
  if (!r.rows.length) { sendJson(res, 404, { error: '환자를 찾을 수 없습니다.' }); return null; }
  return pidNum;
}

// §1-2 GET /api/appointments — 역할별 조회 (doctor·admin: date / nurse: ward / patient: self)
async function apiAppointmentsGet(req, res) {
  const me = await requireRole(req, res, ['doctor', 'nurse', 'patient']);
  if (!me) return;
  const db = getPool();
  const query = url.parse(req.url, true).query;
  const scope = String(query.scope || '');

  // patient(또는 admin scope=self): 본인 예약 upcoming/past
  if (me.role === 'patient' || (me.role === 'admin' && scope === 'self')) {
    const p = await myPatientRow(db, me);
    if (!p) return sendJson(res, 404, { error: '환자 정보를 찾을 수 없습니다.' });
    const [upR, pastR] = await Promise.all([
      db.query(`SELECT a.id, a.scheduled_at, a.kind, a.department, u.name AS dname, u.profile AS dprofile
                  FROM appointments a LEFT JOIN users u ON u.id=a.doctor_id
                 WHERE a.patient_id=$1 AND a.status='scheduled' AND a.scheduled_at > now()
                 ORDER BY a.scheduled_at, a.id`, [p.id]),
      db.query(`SELECT a.id, a.scheduled_at, a.kind, a.department, a.status, u.name AS dname, u.profile AS dprofile
                  FROM appointments a LEFT JOIN users u ON u.id=a.doctor_id
                 WHERE a.patient_id=$1 AND (a.scheduled_at <= now() OR a.status <> 'scheduled')
                 ORDER BY a.scheduled_at DESC, a.id DESC LIMIT 10`, [p.id])
    ]);
    return sendJson(res, 200, {
      upcoming: upR.rows.map((r) => ({
        id: r.id, date: fmtDateW(r.scheduled_at), time: fmtTime(r.scheduled_at), kind: r.kind || '',
        department: r.department || '', doctor: doctorLabel(r.dname, r.dprofile), cancellable: true
      })),
      past: pastR.rows.map((r) => ({
        id: r.id, date: fmtDateW(r.scheduled_at), time: fmtTime(r.scheduled_at), kind: r.kind || '',
        department: r.department || '', doctor: doctorLabel(r.dname, r.dprofile),
        status: r.status, statusLabel: APPT_STATUS_LABEL[r.status] || r.status
      }))
    });
  }

  // doctor/nurse 공통: ?date=YYYY-MM-DD (기본 오늘)
  let day = new Date(); day.setHours(0, 0, 0, 0);
  if (query.date !== undefined && String(query.date) !== '') {
    if (!isValidDateStr(query.date)) return sendJson(res, 400, { error: '날짜 형식 오류' });
    day = new Date(query.date + 'T00:00:00');
  }
  const dateParam = `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}`;

  // nurse(또는 admin scope=ward): 의사 무관 전체 + room(입원 시)
  if (me.role === 'nurse' || (me.role === 'admin' && scope === 'ward')) {
    const r = await db.query(
      `SELECT a.id, a.scheduled_at, a.kind, a.status, p.name, p.sex, p.birth_date,
              (SELECT ad.room FROM admissions ad
                WHERE ad.patient_id=a.patient_id AND ad.status='admitted'
                ORDER BY ad.admitted_at DESC LIMIT 1) AS room
         FROM appointments a JOIN patients p ON p.id=a.patient_id
        WHERE a.scheduled_at::date=$1::date
        ORDER BY a.scheduled_at, a.id`, [dateParam]);
    return sendJson(res, 200, {
      dateLabel: fmtDateKo(day),
      rows: r.rows.map((x) => ({
        id: x.id, time: fmtTime(x.scheduled_at), name: x.name, sex: x.sex, age: calcAge(x.birth_date),
        kind: x.kind || '', status: x.status, statusLabel: APPT_STATUS_LABEL[x.status] || x.status,
        room: x.room || ''
      }))
    });
  }

  // doctor/admin: 본인(admin은 첫 의사) 담당, 시간순
  let doctorId = me.id;
  if (me.role !== 'doctor') {
    const d = await db.query(`SELECT id FROM users WHERE role='doctor' AND active ORDER BY id LIMIT 1`);
    if (d.rows.length) doctorId = d.rows[0].id;
  }
  const r = await db.query(
    `SELECT a.id, a.scheduled_at, a.kind, a.status, p.name, p.sex, p.birth_date
       FROM appointments a JOIN patients p ON p.id=a.patient_id
      WHERE a.doctor_id=$1 AND a.scheduled_at::date=$2::date
      ORDER BY a.scheduled_at, a.id`, [doctorId, dateParam]);
  sendJson(res, 200, {
    dateLabel: fmtDateKo(day),
    rows: r.rows.map((x) => ({
      id: x.id, time: fmtTime(x.scheduled_at), name: x.name, sex: x.sex, age: calcAge(x.birth_date),
      kind: x.kind || '', status: x.status, statusLabel: APPT_STATUS_LABEL[x.status] || x.status
    }))
  });
}

// §1-3 PATCH /api/appointments/:id — patient: 본인·미래·scheduled 취소 / staff: done 처리
async function apiAppointmentPatch(req, res, id) {
  const me = await requireRole(req, res, ['doctor', 'nurse', 'patient']);
  if (!me) return;
  const body = await readJsonBody(req);
  if (!body) return sendJson(res, 400, { error: '잘못된 요청' });
  const status = body.status;
  if (status !== 'cancelled' && status !== 'done') return sendJson(res, 400, { error: '잘못된 상태 값' });
  const db = getPool();
  const r = await db.query(
    `SELECT a.id, a.patient_id, a.scheduled_at, a.kind, a.status, p.user_id
       FROM appointments a JOIN patients p ON p.id=a.patient_id WHERE a.id=$1`, [id]);
  if (!r.rows.length) return sendJson(res, 404, { error: '예약을 찾을 수 없습니다.' });
  const a = r.rows[0];
  if (me.role === 'patient') {                     // 취소만, 본인 + 미래 + scheduled
    if (status !== 'cancelled') return sendJson(res, 403, { error: 'forbidden' });
    if (a.user_id !== me.id) return sendJson(res, 403, { error: 'forbidden' });
    if (a.status !== 'scheduled') return sendJson(res, 400, { error: '취소할 수 없는 예약입니다.' });
    if (new Date(a.scheduled_at).getTime() <= Date.now())
      return sendJson(res, 400, { error: '지난 예약은 취소할 수 없습니다.' });
    await db.query(`UPDATE appointments SET status='cancelled' WHERE id=$1`, [id]);
    return sendJson(res, 200, { ok: true });
  }
  // doctor/nurse/admin: done 처리만, scheduled 건만
  if (status !== 'done') return sendJson(res, 400, { error: '잘못된 상태 값' });
  if (a.status !== 'scheduled') return sendJson(res, 400, { error: '완료 처리할 수 없는 예약입니다.' });
  await db.query(`UPDATE appointments SET status='done' WHERE id=$1`, [id]);
  // nurse가 투약/처치/검사 완료 시 간호기록 자동 삽입
  if (me.role === 'nurse' && ['투약', '처치', '검사'].includes(a.kind)) {
    const noteType = a.kind === '검사' ? '간호기록' : a.kind;
    await db.query(
      `INSERT INTO nursing_notes (patient_id, nurse_id, note_type, content) VALUES ($1,$2,$3,$4)`,
      [a.patient_id, me.id, noteType, `${a.kind} 수행 완료`]);
  }
  sendJson(res, 200, { ok: true });
}

// §1-4 GET /api/encounters?page=&patient_id= — 20/page 최신순 (patient는 본인만, patient 키 생략)
async function apiEncounters(req, res) {
  const me = await requireRole(req, res, ['doctor', 'nurse', 'patient']);
  if (!me) return;
  const db = getPool();
  const query = url.parse(req.url, true).query;
  const page = pageOf(query);
  let pidFilter = null;
  const omitPatient = me.role === 'patient';
  if (omitPatient) {
    const p = await myPatientRow(db, me);
    if (!p) return sendJson(res, 404, { error: '환자 정보를 찾을 수 없습니다.' });
    pidFilter = p.id;
  } else if (query.patient_id !== undefined && String(query.patient_id) !== '') {
    pidFilter = parseId(query.patient_id);
    if (!pidFilter) return sendJson(res, 400, { error: '잘못된 patient_id' });
  }
  const where = `WHERE e.visited_at <= now()` + (pidFilter ? ` AND e.patient_id=$1` : '');
  const params = pidFilter ? [pidFilter] : [];
  const [cntR, rowR] = await Promise.all([
    db.query(`SELECT count(*)::int AS c FROM encounters e ${where}`, params),
    db.query(
      `SELECT e.visited_at, e.department, e.note, p.name AS pname, u.name AS dname, u.profile AS dprofile,
              COALESCE(NULLIF((SELECT string_agg(d.name, ', ' ORDER BY d.id)
                                 FROM diagnoses d WHERE d.encounter_id=e.id), ''),
                       (SELECT string_agg(d.name, ', ' ORDER BY d.diagnosed_at ASC NULLS LAST, d.id)
                          FROM diagnoses d WHERE d.patient_id=e.patient_id), '') AS dx
         FROM encounters e JOIN patients p ON p.id=e.patient_id LEFT JOIN users u ON u.id=e.doctor_id
        ${where}
        ORDER BY e.visited_at DESC, e.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE])
  ]);
  sendJson(res, 200, {
    total: cntR.rows[0].c, page,
    rows: rowR.rows.map((r) => {
      const row = { date: fmtDate(r.visited_at), time: fmtTime(r.visited_at) };
      if (!omitPatient) row.patient = r.pname;
      row.department = r.department || '';
      row.dx = r.dx;
      row.doctor = doctorLabel(r.dname, r.dprofile);
      row.note = r.note || '';
      return row;
    })
  });
}

// §1-5 GET /api/lab-results — 최신순 50
async function apiLabResults(req, res) {
  const me = await requireRole(req, res, ['doctor', 'nurse', 'patient']);
  if (!me) return;
  const db = getPool();
  const pid = await resolveTargetPatient(db, me, res, url.parse(req.url, true).query);
  if (!pid) return;
  const r = await db.query(
    `SELECT tested_at, test_name, value, ref_range, flag FROM lab_results
      WHERE patient_id=$1 ORDER BY tested_at DESC, id DESC LIMIT 50`, [pid]);
  sendJson(res, 200, {
    rows: r.rows.map((x) => ({ date: fmtDate(x.tested_at), test: x.test_name, value: x.value, ref: x.ref_range, flag: x.flag }))
  });
}

// §1-5 GET /api/prescriptions — 활성 우선, 최신순
async function apiPrescriptions(req, res) {
  const me = await requireRole(req, res, ['doctor', 'nurse', 'patient']);
  if (!me) return;
  const db = getPool();
  const pid = await resolveTargetPatient(db, me, res, url.parse(req.url, true).query);
  if (!pid) return;
  const r = await db.query(
    `SELECT drug_name, dosage, start_date, end_date, active FROM prescriptions
      WHERE patient_id=$1 ORDER BY active DESC, start_date DESC NULLS LAST, id DESC`, [pid]);
  sendJson(res, 200, {
    rows: r.rows.map((x) => ({
      drug: x.drug_name, dosage: x.dosage || '',
      start: x.start_date ? fmtDate(x.start_date) : '', end: x.end_date ? fmtDate(x.end_date) : '',
      active: x.active
    }))
  });
}

// §1-5 GET /api/vitals — 최신순 20
async function apiVitals(req, res) {
  const me = await requireRole(req, res, ['doctor', 'nurse', 'patient']);
  if (!me) return;
  const db = getPool();
  const pid = await resolveTargetPatient(db, me, res, url.parse(req.url, true).query);
  if (!pid) return;
  const r = await db.query(
    `SELECT measured_at, systolic, diastolic, glucose, weight_kg, bmi FROM vitals
      WHERE patient_id=$1 ORDER BY measured_at DESC, id DESC LIMIT 20`, [pid]);
  sendJson(res, 200, {
    rows: r.rows.map((x) => ({
      date: fmtDate(x.measured_at), time: fmtTime(x.measured_at),
      systolic: x.systolic, diastolic: x.diastolic, glucose: x.glucose,
      weight: toNum(x.weight_kg), bmi: toNum(x.bmi)
    }))
  });
}

// §1-5 GET /api/bills — 미납 합계 + 최신순 20
async function apiBillsGet(req, res) {
  const me = await requireRole(req, res, ['doctor', 'nurse', 'patient']);
  if (!me) return;
  const db = getPool();
  const pid = await resolveTargetPatient(db, me, res, url.parse(req.url, true).query);
  if (!pid) return;
  const [unpaidR, rowR] = await Promise.all([
    db.query(`SELECT COALESCE(sum(amount), 0)::int AS s FROM bills WHERE patient_id=$1 AND NOT paid`, [pid]),
    db.query(`SELECT id, billed_at, item, amount, paid FROM bills
               WHERE patient_id=$1 ORDER BY billed_at DESC, id DESC LIMIT 20`, [pid])
  ]);
  sendJson(res, 200, {
    unpaid: unpaidR.rows[0].s,
    rows: rowR.rows.map((x) => ({ id: x.id, date: fmtDate(x.billed_at), item: x.item, amount: x.amount, paid: x.paid }))
  });
}

// §1-5 PATCH /api/bills/:id — patient 본인 미납 건만 수납 처리(데모)
async function apiBillPatch(req, res, id) {
  const me = await requireRole(req, res, ['patient']);
  if (!me) return;
  const body = await readJsonBody(req);
  if (!body || body.paid !== true) return sendJson(res, 400, { error: '잘못된 요청' });
  const db = getPool();
  const p = await myPatientRow(db, me);
  if (!p) return sendJson(res, 404, { error: '환자 정보를 찾을 수 없습니다.' });
  const r = await db.query(`SELECT id, patient_id, paid FROM bills WHERE id=$1`, [id]);
  if (!r.rows.length) return sendJson(res, 404, { error: '청구 내역을 찾을 수 없습니다.' });
  const bill = r.rows[0];
  if (bill.patient_id !== p.id) return sendJson(res, 403, { error: 'forbidden' });
  if (bill.paid) return sendJson(res, 400, { error: '이미 수납된 내역입니다.' });
  await db.query(`UPDATE bills SET paid=TRUE WHERE id=$1`, [id]);
  sendJson(res, 200, { ok: true });
}

// §1-6 GET /api/documents?status=&page= — staff: 전체 / patient: 본인(patient 키 생략)
async function apiDocumentsGet(req, res) {
  const me = await requireRole(req, res, ['doctor', 'nurse', 'patient']);
  if (!me) return;
  const db = getPool();
  const query = url.parse(req.url, true).query;
  const status = String(query.status || 'all');
  if (!['requested', 'issued', 'rejected', 'processed', 'all'].includes(status))
    return sendJson(res, 400, { error: '잘못된 status' });
  const page = pageOf(query);
  const omitPatient = me.role === 'patient';
  let pidFilter = null;
  if (omitPatient) {
    const p = await myPatientRow(db, me);
    if (!p) return sendJson(res, 404, { error: '환자 정보를 찾을 수 없습니다.' });
    pidFilter = p.id;
  }
  const conds = [];
  const params = [];
  if (status === 'processed') conds.push(`d.status <> 'requested'`);
  else if (status !== 'all') { params.push(status); conds.push(`d.status=$${params.length}`); }
  if (pidFilter) { params.push(pidFilter); conds.push(`d.patient_id=$${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const [cntR, rowR] = await Promise.all([
    db.query(`SELECT count(*)::int AS c FROM documents d ${where}`, params),
    db.query(
      `SELECT d.id, d.doc_type, d.requested_at, d.status, p.name AS pname
         FROM documents d JOIN patients p ON p.id=d.patient_id
        ${where}
        ORDER BY d.requested_at DESC, d.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE])
  ]);
  sendJson(res, 200, {
    total: cntR.rows[0].c,
    rows: rowR.rows.map((r) => {
      const row = { id: r.id };
      if (!omitPatient) row.patient = r.pname;
      row.type = r.doc_type;
      row.date = fmtDate(r.requested_at);
      row.status = r.status;
      row.statusLabel = DOC_STATUS_LABEL[r.status] || r.status;
      return row;
    })
  });
}

// §1-6 PATCH /api/documents/:id — doctor/nurse/admin, requested 건만 issued|rejected
async function apiDocumentPatch(req, res, id) {
  const me = await requireRole(req, res, ['doctor', 'nurse']);
  if (!me) return;
  const body = await readJsonBody(req);
  if (!body) return sendJson(res, 400, { error: '잘못된 요청' });
  const status = body.status;
  if (status !== 'issued' && status !== 'rejected') return sendJson(res, 400, { error: '잘못된 상태 값' });
  const db = getPool();
  const r = await db.query(`SELECT id, status FROM documents WHERE id=$1`, [id]);
  if (!r.rows.length) return sendJson(res, 404, { error: '서류를 찾을 수 없습니다.' });
  if (r.rows[0].status !== 'requested') return sendJson(res, 400, { error: '이미 처리된 서류입니다.' });
  await db.query(`UPDATE documents SET status=$1 WHERE id=$2`, [status, id]);
  sendJson(res, 200, { ok: true });
}

// §1-7 GET /api/admissions?ward= — 병실순
async function apiAdmissionsGet(req, res) {
  const me = await requireRole(req, res, ['nurse', 'doctor']);
  if (!me) return;
  const db = getPool();
  const ward = String((url.parse(req.url, true).query.ward || '')).trim() || null;
  const r = await db.query(
    `SELECT a.id, a.room, a.ward, a.admitted_at, a.discharge_due, a.status,
            (a.discharge_due BETWEEN CURRENT_DATE AND CURRENT_DATE + 1) AS due_soon,
            p.name, p.sex, p.birth_date
       FROM admissions a JOIN patients p ON p.id=a.patient_id
      WHERE ($1::text IS NULL OR a.ward=$1)
      ORDER BY a.room, a.id`, [ward]);
  sendJson(res, 200, {
    rows: r.rows.map((x) => {
      let statusLabel = '입원 중';
      if (x.status === 'discharged') statusLabel = '퇴원';
      else if (x.due_soon || x.status === 'discharge_due') statusLabel = '퇴원 예정';
      return {
        id: x.id, room: x.room || '', ward: x.ward || '', patient: x.name,
        sex: x.sex, age: calcAge(x.birth_date),
        admittedAt: fmtDate(x.admitted_at),
        dischargeDue: x.discharge_due ? fmtDate(x.discharge_due) : '',
        status: x.status, statusLabel
      };
    })
  });
}

// §1-7 POST /api/admissions — 신규 입원 (이미 admitted면 409)
async function apiAdmissionPost(req, res) {
  const me = await requireRole(req, res, ['nurse', 'doctor']);
  if (!me) return;
  const body = await readJsonBody(req);
  if (!body) return sendJson(res, 400, { error: '잘못된 요청' });
  const patientId = parseId(body.patient_id);
  const room = String(body.room || '').trim();
  const ward = String(body.ward || '').trim();
  if (!patientId || !room || !ward) return sendJson(res, 400, { error: '필수 항목 누락' });
  let dischargeDue = null;
  if (body.discharge_due !== undefined && body.discharge_due !== null && body.discharge_due !== '') {
    if (!isValidDateStr(body.discharge_due)) return sendJson(res, 400, { error: '퇴원 예정일 형식 오류' });
    dischargeDue = body.discharge_due;
  }
  const db = getPool();
  const pr = await db.query(`SELECT id FROM patients WHERE id=$1`, [patientId]);
  if (!pr.rows.length) return sendJson(res, 404, { error: '환자를 찾을 수 없습니다.' });
  const dup = await db.query(`SELECT id FROM admissions WHERE patient_id=$1 AND status='admitted'`, [patientId]);
  if (dup.rows.length) return sendJson(res, 409, { error: '이미 입원 중인 환자입니다.' });
  await db.query(
    `INSERT INTO admissions (patient_id, room, ward, discharge_due) VALUES ($1,$2,$3,$4)`,
    [patientId, room, ward, dischargeDue]);
  sendJson(res, 201, { ok: true });
}

// §1-7 PATCH /api/admissions/:id — 퇴원 처리 또는 퇴원 예정일 변경
async function apiAdmissionPatch(req, res, id) {
  const me = await requireRole(req, res, ['nurse', 'doctor']);
  if (!me) return;
  const body = await readJsonBody(req);
  if (!body) return sendJson(res, 400, { error: '잘못된 요청' });
  const db = getPool();
  const r = await db.query(`SELECT id, status FROM admissions WHERE id=$1`, [id]);
  if (!r.rows.length) return sendJson(res, 404, { error: '입원 정보를 찾을 수 없습니다.' });
  if (body.status !== undefined) {
    if (body.status !== 'discharged') return sendJson(res, 400, { error: '잘못된 상태 값' });
    if (r.rows[0].status === 'discharged') return sendJson(res, 400, { error: '이미 퇴원 처리된 입원입니다.' });
    await db.query(`UPDATE admissions SET status='discharged' WHERE id=$1`, [id]);
    return sendJson(res, 200, { ok: true });
  }
  if (body.discharge_due !== undefined) {
    if (!isValidDateStr(body.discharge_due)) return sendJson(res, 400, { error: '퇴원 예정일 형식 오류' });
    await db.query(`UPDATE admissions SET discharge_due=$1 WHERE id=$2`, [body.discharge_due, id]);
    return sendJson(res, 200, { ok: true });
  }
  sendJson(res, 400, { error: '잘못된 요청' });
}

// §1-8 GET /api/nursing-notes?type=&page= — 20/page 최신순
async function apiNursingNotesGet(req, res) {
  const me = await requireRole(req, res, ['nurse']);
  if (!me) return;
  const db = getPool();
  const query = url.parse(req.url, true).query;
  const type = String(query.type || '').trim();
  if (type && !NOTE_TYPES.includes(type)) return sendJson(res, 400, { error: '잘못된 기록 유형' });
  const page = pageOf(query);
  const where = type ? `WHERE n.note_type=$1` : '';
  const params = type ? [type] : [];
  const [cntR, rowR] = await Promise.all([
    db.query(`SELECT count(*)::int AS c FROM nursing_notes n ${where}`, params),
    db.query(
      `SELECT n.created_at, n.note_type, n.content, p.name AS pname, u.name AS nname,
              (SELECT ad.room FROM admissions ad
                WHERE ad.patient_id=n.patient_id AND ad.status='admitted'
                ORDER BY ad.admitted_at DESC LIMIT 1) AS room
         FROM nursing_notes n JOIN patients p ON p.id=n.patient_id LEFT JOIN users u ON u.id=n.nurse_id
        ${where}
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE])
  ]);
  sendJson(res, 200, {
    total: cntR.rows[0].c,
    rows: rowR.rows.map((r) => ({
      date: fmtDate(r.created_at), time: fmtTime(r.created_at), patient: r.pname,
      room: r.room || '', type: r.note_type || '', content: r.content || '', nurse: r.nname || ''
    }))
  });
}

// §1-8 POST /api/nursing-notes
async function apiNursingNotePost(req, res) {
  const me = await requireRole(req, res, ['nurse']);
  if (!me) return;
  const body = await readJsonBody(req);
  if (!body) return sendJson(res, 400, { error: '잘못된 요청' });
  const patientId = parseId(body.patient_id);
  const content = String(body.content || '').trim();
  if (!patientId) return sendJson(res, 400, { error: '잘못된 patient_id' });
  if (!NOTE_TYPES.includes(body.note_type)) return sendJson(res, 400, { error: '잘못된 기록 유형' });
  if (!content) return sendJson(res, 400, { error: '내용을 입력하세요.' });
  const db = getPool();
  const pr = await db.query(`SELECT id FROM patients WHERE id=$1`, [patientId]);
  if (!pr.rows.length) return sendJson(res, 404, { error: '환자를 찾을 수 없습니다.' });
  await db.query(
    `INSERT INTO nursing_notes (patient_id, nurse_id, note_type, content) VALUES ($1,$2,$3,$4)`,
    [patientId, me.id, body.note_type, content]);
  sendJson(res, 201, { ok: true });
}

// §1-9 GET /api/memos?limit=50
async function apiMemosGet(req, res) {
  const me = await requireRole(req, res, ['nurse']);
  if (!me) return;
  const db = getPool();
  let limit = parseInt(url.parse(req.url, true).query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;
  const r = await db.query(
    `SELECT m.created_at, m.content, u.name, u.role
       FROM memos m LEFT JOIN users u ON u.id=m.author_id
      ORDER BY m.created_at DESC, m.id DESC LIMIT $1`, [limit]);
  sendJson(res, 200, {
    rows: r.rows.map((x) => ({
      date: fmtDate(x.created_at), time: fmtTime(x.created_at),
      text: x.content, author: memoAuthor(x.name, x.role)
    }))
  });
}

// §1-10 GET /api/stats/doctor — 이번 달 진료 통계
async function apiStatsDoctor(req, res) {
  const me = await requireRole(req, res, ['doctor']);
  if (!me) return;
  const db = getPool();
  let doctorId = me.id;
  if (me.role !== 'doctor') {   // admin 열람 시 첫 의사 기준
    const d = await db.query(`SELECT id FROM users WHERE role='doctor' AND active ORDER BY id LIMIT 1`);
    if (d.rows.length) doctorId = d.rows[0].id;
  }
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const [encR, noShowR, kindR, dailyR] = await Promise.all([
    db.query(`SELECT count(*)::int AS c FROM encounters
               WHERE date_trunc('month', visited_at)=date_trunc('month', now())`),
    db.query(`SELECT count(*)::int AS c FROM appointments
               WHERE doctor_id=$1 AND status='no_show'
                 AND date_trunc('month', scheduled_at)=date_trunc('month', now())`, [doctorId]),
    db.query(`SELECT kind, count(*)::int AS c FROM appointments
               WHERE date_trunc('month', scheduled_at)=date_trunc('month', now()) GROUP BY kind`),
    db.query(`SELECT extract(day FROM visited_at)::int AS d, count(*)::int AS c FROM encounters
               WHERE date_trunc('month', visited_at)=date_trunc('month', now()) GROUP BY 1`)
  ]);
  const kindMap = new Map(kindR.rows.map((r) => [r.kind, r.c]));
  const dailyMap = new Map(dailyR.rows.map((r) => [r.d, r.c]));
  const daily = [];
  for (let d = 1; d <= lastDay; d++) daily.push({ day: d, count: dailyMap.get(d) || 0 });
  sendJson(res, 200, {
    month: `${now.getFullYear()}년 ${now.getMonth() + 1}월`,
    encounters: encR.rows[0].c,
    noShow: noShowR.rows[0].c,
    byKind: APPT_KINDS.filter((k) => kindMap.get(k) > 0).map((k) => ({ kind: k, count: kindMap.get(k) })),
    daily
  });
}

// §1-10 GET /api/stats/nurse — 이번 달 간호 통계
async function apiStatsNurse(req, res) {
  const me = await requireRole(req, res, ['nurse']);
  if (!me) return;
  const db = getPool();
  const now = new Date();
  const [noteR, safetyR, admR, dischR, doneR] = await Promise.all([
    db.query(`SELECT note_type, count(*)::int AS c FROM nursing_notes
               WHERE date_trunc('month', created_at)=date_trunc('month', now()) GROUP BY note_type`),
    db.query(`SELECT event_type, count(*)::int AS c FROM safety_events
               WHERE date_trunc('month', occurred_at)=date_trunc('month', now()) GROUP BY event_type`),
    db.query(`SELECT count(*)::int AS c FROM admissions WHERE status='admitted'`),
    db.query(`SELECT count(*)::int AS c FROM admissions
               WHERE status='discharged'
                 AND date_trunc('month', COALESCE(discharge_due::timestamptz, admitted_at))=date_trunc('month', now())`),
    db.query(`SELECT count(*)::int AS c FROM appointments
               WHERE status='done' AND scheduled_at::date=CURRENT_DATE`)
  ]);
  const noteMap = new Map(noteR.rows.map((r) => [r.note_type, r.c]));
  const safetyMap = new Map(safetyR.rows.map((r) => [r.event_type, r.c]));
  sendJson(res, 200, {
    month: `${now.getFullYear()}년 ${now.getMonth() + 1}월`,
    notesByType: NOTE_TYPES.map((t) => ({ type: t, count: noteMap.get(t) || 0 })),
    safety: { fall: safetyMap.get('낙상') || 0, sore: safetyMap.get('욕창') || 0,
              medError: safetyMap.get('투약오류') || 0, infection: safetyMap.get('감염') || 0 },
    admitted: admR.rows[0].c,
    dischargedThisMonth: dischR.rows[0].c,
    doneToday: doneR.rows[0].c
  });
}

// §1-11 POST /api/me/password — 전 역할 비밀번호 변경
async function apiMePassword(req, res) {
  const me = await currentUser(req);
  if (!me) return sendJson(res, 401, { error: 'unauthorized' });
  const body = await readJsonBody(req);
  if (!body) return sendJson(res, 400, { error: '잘못된 요청' });
  const current = String(body.current || '');
  const next = String(body.next || '');
  const db = getPool();
  const r = await db.query(`SELECT password_hash FROM users WHERE id=$1`, [me.id]);
  if (!r.rows.length || !verifyPassword(current, r.rows[0].password_hash))
    return sendJson(res, 400, { error: '현재 비밀번호가 올바르지 않습니다.' });
  if (next.length < 8) return sendJson(res, 400, { error: '비밀번호는 8자 이상이어야 합니다.' });
  await db.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hashPassword(next), me.id]);
  sendJson(res, 200, { ok: true });
}

// ── 역할 페이지 접근 보호 ───────────────────────────────────
// /platform/doctor|nurse|patient/* → 로그인 + 역할 일치 필요 (admin은 모두 허용)
// /platform/admin/*                → admin만
const ROLE_HOME = { doctor: '/platform/doctor/', nurse: '/platform/nurse/', patient: '/platform/patient/', admin: '/platform/admin/' };
async function guardPlatform(req, res, pathname) {
  const m = pathname.match(/^\/platform\/(doctor|nurse|patient|admin)(\/|$)/);
  if (!m) return false;                       // 보호 대상 아님
  const need = m[1];
  let user = null;
  try { user = await currentUser(req); } catch (e) { /* DB 미가동 시 아래에서 로그인으로 */ }
  if (!user) {
    res.writeHead(302, { Location: '/platform/login.html', 'Cache-Control': 'no-store' });
    res.end(); return true;
  }
  if (user.role !== need && user.role !== 'admin') {
    res.writeHead(302, { Location: ROLE_HOME[user.role] || '/', 'Cache-Control': 'no-store' });
    res.end(); return true;
  }
  return false;                               // 통과 → 정적 서빙 계속
}

// ── Basil Nexus AI 프록시 ───────────────────────────────────
const AI_UPSTREAM = { host: '165.132.220.115', port: 5096, path: '/api/chat' };

// 로그인한 환자의 챗 질문에는 본인 EMR 요약을 컨텍스트로 자동 첨부한다.
// (의사/간호사 챗과 비로그인 메인 챗은 기존 그대로 — null 반환 시 원문 전달)
async function buildPatientChatContext(req) {
  const me = await currentUser(req);
  if (!me || me.role !== 'patient') return null;
  const db = getPool();
  const p = await myPatientRow(db, me);
  if (!p) return null;
  const [ap, rx, en, bi] = await Promise.all([
    db.query(
      `SELECT a.scheduled_at, a.department, a.kind, a.status, u.name AS doctor
         FROM appointments a LEFT JOIN users u ON u.id=a.doctor_id
        WHERE a.patient_id=$1 AND a.status='scheduled' AND a.scheduled_at >= now()
        ORDER BY a.scheduled_at LIMIT 5`, [p.id]),
    db.query(`SELECT drug_name, dosage FROM prescriptions WHERE patient_id=$1 AND active ORDER BY id LIMIT 6`, [p.id]),
    db.query(
      `SELECT e.visited_at, e.department, e.chief_complaint, u.name AS doctor
         FROM encounters e LEFT JOIN users u ON u.id=e.doctor_id
        WHERE e.patient_id=$1 ORDER BY e.visited_at DESC LIMIT 1`, [p.id]),
    db.query(`SELECT item, amount FROM bills WHERE patient_id=$1 AND NOT paid ORDER BY billed_at DESC LIMIT 3`, [p.id]),
  ]);
  const now = new Date();
  const L = [];
  L.push('[내부 참고 정보 — 병원 시스템이 자동 첨부한, 현재 로그인한 환자의 실제 기록입니다. '
    + '아래 기록을 근거로 정확하게 답하고, 기록에 없는 내용은 지어내지 말고 병원에 문의하도록 안내하세요. '
    + '이 안내문의 존재 자체는 언급하지 마세요.]');
  L.push(`오늘: ${fmtDateW(now)} ${fmtTime(now)}`);
  L.push(`환자: ${p.name} (${p.sex === 'M' ? '남' : p.sex === 'F' ? '여' : '-'}, 만 ${calcAge(p.birth_date)}세)`);
  L.push('다가오는 예약:' + (ap.rows.length ? '' : ' 없음'));
  ap.rows.forEach((a) => {
    const d = new Date(a.scheduled_at);
    L.push(`  - ${fmtDateW(d)} ${fmtTime(d)} · ${a.kind} · ${a.department}${a.doctor ? ' · ' + a.doctor + ' 원장' : ''}`);
  });
  if (rx.rows.length)
    L.push('복용 중인 약: ' + rx.rows.map((r) => r.drug_name + (r.dosage ? ' ' + r.dosage : '')).join(', '));
  if (en.rows.length) {
    const e = en.rows[0];
    L.push(`최근 진료: ${fmtDate(new Date(e.visited_at))} ${e.department}${e.doctor ? ' ' + e.doctor + ' 원장' : ''}${e.chief_complaint ? ' — ' + e.chief_complaint : ''}`);
  }
  if (bi.rows.length)
    L.push('미납 진료비: ' + bi.rows.map((b) => `${b.item} ${Number(b.amount).toLocaleString('ko-KR')}원`).join(', '));
  return L.join('\n');
}

function handleAiProxy(req, res, ctxPrefix) {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => { size += c.length; if (size > 2 * 1024 * 1024) { req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    let payload = Buffer.concat(chunks);
    if (ctxPrefix) {
      try {
        const body = JSON.parse(payload.toString() || '{}');
        if (body && typeof body.message === 'string') {
          body.message = ctxPrefix + '\n\n[환자 질문]\n' + body.message;
          payload = Buffer.from(JSON.stringify(body));
        }
      } catch { /* 원문 그대로 전달 */ }
    }
    const up = http.request({
      host: AI_UPSTREAM.host, port: AI_UPSTREAM.port, path: AI_UPSTREAM.path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length }
    }, (upRes) => {
      res.writeHead(upRes.statusCode || 502, {
        'Content-Type': upRes.headers['content-type'] || 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      upRes.pipe(res);
    });
    up.on('error', (e) => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/event-stream; charset=utf-8' });
      res.end('data: ' + JSON.stringify({ error: 'AI 서버 연결 실패: ' + e.message }) + '\n\n');
    });
    up.setTimeout(180000, () => up.destroy(new Error('시간 초과')));
    // 클라이언트가 도중에 떠나면(페이지 이동·탭 닫기) 업스트림 연결을 끊어
    // 모델이 헛되이 답변을 계속 생성하지 않도록 한다.
    res.on('close', () => { if (!res.writableFinished) up.destroy(); });
    up.write(payload); up.end();
  });
}

// ── 요청 처리 ───────────────────────────────────────────────
async function handle(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(url.parse(req.url).pathname); }
  catch { res.writeHead(400); return res.end('Bad Request'); }

  // AI 프록시 (로그인 환자는 본인 EMR 컨텍스트 자동 첨부)
  if (pathname === '/api/medgemma-chat') {
    if (req.method !== 'POST') { res.writeHead(405); return res.end('Method Not Allowed'); }
    let ctx = null;
    try { ctx = await buildPatientChatContext(req); } catch { /* DB 미가동 시 원문 전달 */ }
    return handleAiProxy(req, res, ctx);
  }
  // 인증 API
  if (pathname === '/api/login'  && req.method === 'POST') return apiLogin(req, res);
  if (pathname === '/api/logout' && req.method === 'POST') return apiLogout(req, res);
  if (pathname === '/api/me'     && req.method === 'GET')  return apiMe(req, res);
  if (pathname === '/api/signup' && req.method === 'POST') return apiSignup(req, res);
  if (pathname === '/api/admin/users') return apiAdminUsers(req, res);

  // P4 대시보드 API (docs/API-CONTRACT-P4.md)
  if (pathname === '/api/dashboard/doctor'  && req.method === 'GET')  return apiDashboardDoctor(req, res);
  if (pathname === '/api/dashboard/nurse'   && req.method === 'GET')  return apiDashboardNurse(req, res);
  if (pathname === '/api/dashboard/patient' && req.method === 'GET')  return apiDashboardPatient(req, res);
  if (pathname === '/api/patients'          && req.method === 'GET')  return apiPatients(req, res);
  if (pathname === '/api/documents'         && req.method === 'POST') return apiCreateDocument(req, res);
  if (pathname === '/api/appointments'      && req.method === 'POST') return apiCreateAppointment(req, res);
  if (pathname === '/api/memos'             && req.method === 'POST') return apiCreateMemo(req, res);
  if (pathname === '/api/health'            && req.method === 'GET')  return apiHealth(req, res);

  // P5 API (docs/API-CONTRACT-P5.md §1)
  if (pathname === '/api/appointments'  && req.method === 'GET') return apiAppointmentsGet(req, res);
  if (pathname === '/api/encounters'    && req.method === 'GET') return apiEncounters(req, res);
  if (pathname === '/api/lab-results'   && req.method === 'GET') return apiLabResults(req, res);
  if (pathname === '/api/prescriptions' && req.method === 'GET') return apiPrescriptions(req, res);
  if (pathname === '/api/vitals'        && req.method === 'GET') return apiVitals(req, res);
  if (pathname === '/api/bills'         && req.method === 'GET') return apiBillsGet(req, res);
  if (pathname === '/api/documents'     && req.method === 'GET') return apiDocumentsGet(req, res);
  if (pathname === '/api/admissions') {
    if (req.method === 'GET')  return apiAdmissionsGet(req, res);
    if (req.method === 'POST') return apiAdmissionPost(req, res);
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }
  if (pathname === '/api/nursing-notes') {
    if (req.method === 'GET')  return apiNursingNotesGet(req, res);
    if (req.method === 'POST') return apiNursingNotePost(req, res);
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }
  if (pathname === '/api/memos'        && req.method === 'GET')  return apiMemosGet(req, res);
  if (pathname === '/api/stats/doctor' && req.method === 'GET')  return apiStatsDoctor(req, res);
  if (pathname === '/api/stats/nurse'  && req.method === 'GET')  return apiStatsNurse(req, res);
  if (pathname === '/api/me/password'  && req.method === 'POST') return apiMePassword(req, res);
  // PATCH /api/{documents|appointments|admissions|bills}/:id — id는 양의 정수만
  const pm = pathname.match(/^\/api\/(documents|appointments|admissions|bills)\/([^/]+)$/);
  if (pm) {
    if (req.method !== 'PATCH') return sendJson(res, 405, { error: 'Method Not Allowed' });
    const id = parseId(pm[2]);
    if (!id) return sendJson(res, 404, { error: 'not found' });
    if (pm[1] === 'documents')    return apiDocumentPatch(req, res, id);
    if (pm[1] === 'appointments') return apiAppointmentPatch(req, res, id);
    if (pm[1] === 'admissions')   return apiAdmissionPatch(req, res, id);
    return apiBillPatch(req, res, id);
  }

  // 역할 페이지 보호 (redirect 시 true 반환)
  if (await guardPlatform(req, res, pathname)) return;

  if (pathname.endsWith('/')) pathname += 'index.html';
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404 Not Found</h1><p><a href="/">Home</a></p>');
    }
    const ext = path.extname(filePath).toLowerCase();
    const IMG_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico'];
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache'
        : IMG_EXTS.includes(ext) ? 'public, max-age=2592000'   // 이미지 30일
        : 'public, max-age=3600'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error('[error]', req.method, req.url, e.message);
    if (!res.headersSent) sendJson(res, 500, { error: '서버 오류: ' + e.message });
    else try { res.end(); } catch {}
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`[error] port ${PORT} is already in use. Try: node server.js 8090`);
  else if (e.code === 'EACCES') console.error(`[error] no permission to bind port ${PORT}. Try a port >1024, e.g. node server.js 8088`);
  else console.error('[error]', e.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('────────────────────────────────────────────');
  console.log(' Lifoneer / Basil Nexus  server (static + auth + AI proxy)');
  console.log(`  local      : http://localhost:${PORT}/`);
  console.log(`  bound      : ${HOST}:${PORT}`);
  console.log('  stop       : Ctrl+C');
  console.log('────────────────────────────────────────────');
});
