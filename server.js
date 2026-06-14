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

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(url.parse(req.url).pathname); }
  catch { res.writeHead(400); return res.end('Bad Request'); }

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
