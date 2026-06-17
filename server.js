// Lifoneer / Basil Nexus — simple zero-dependency static HTTP server
// Usage:  node server.js [port]      (default port 8088)
//   serves the ./public folder, bound to 0.0.0.0 (reachable on your LAN / via port-forwarding)
const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

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

// ── Basil Nexus AI 프록시 ───────────────────────────────────
//   브라우저(HTTPS) → /api/medgemma-chat → (서버 내부) → http://121.158.168.10:5078/api/chat
//   HTTPS 페이지에서 HTTP 챗 서비스를 직접 못 부르는 혼합콘텐츠/CORS 문제를 서버 중계로 우회.
const AI_UPSTREAM = { host: '121.158.168.10', port: 5078, path: '/api/chat' };
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

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(url.parse(req.url).pathname); }
  catch { res.writeHead(400); return res.end('Bad Request'); }

  // AI 프록시 라우트 (정적 파일보다 먼저 처리)
  if (pathname === '/api/medgemma-chat') {
    if (req.method !== 'POST') { res.writeHead(405); return res.end('Method Not Allowed'); }
    return handleAiProxy(req, res);
  }

  if (pathname.endsWith('/')) pathname += 'index.html';
  // resolve safely inside ROOT (block path traversal)
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404 Not Found</h1><p><a href="/">Home</a></p>');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(filePath).pipe(res);
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
  console.log(' Lifoneer / Basil Nexus  static server');
  console.log(`  local      : http://localhost:${PORT}/`);
  console.log(`  lifoneer   : http://localhost:${PORT}/lifoneer/`);
  console.log(`  bound      : ${HOST}:${PORT}  (LAN / port-forward reachable)`);
  console.log('  stop       : Ctrl+C');
  console.log('────────────────────────────────────────────');
});
