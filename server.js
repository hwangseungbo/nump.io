// Lifoneer / Basil Nexus — static HTTP server + AI proxy + 인증 API (PostgreSQL)
// Usage:  node server.js [port]      (default port 8088)
//   serves the ./public folder, bound to 0.0.0.0
const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');
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
function handleAiProxy(req, res) {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => { size += c.length; if (size > 2 * 1024 * 1024) { req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    const payload = Buffer.concat(chunks);
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

  // AI 프록시
  if (pathname === '/api/medgemma-chat') {
    if (req.method !== 'POST') { res.writeHead(405); return res.end('Method Not Allowed'); }
    return handleAiProxy(req, res);
  }
  // 인증 API
  if (pathname === '/api/login'  && req.method === 'POST') return apiLogin(req, res);
  if (pathname === '/api/logout' && req.method === 'POST') return apiLogout(req, res);
  if (pathname === '/api/me'     && req.method === 'GET')  return apiMe(req, res);
  if (pathname === '/api/admin/users') return apiAdminUsers(req, res);

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
