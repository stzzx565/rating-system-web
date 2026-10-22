/**
 * 网页版本地预览服务器（零依赖）
 * - 静态托管 web 目录
 * - /api/*、/proxy*  代理到视频解析服务（默认 http://127.0.0.1:8080）
 * - /tduck/*         代理到 TDuck 问卷服务（默认 http://127.0.0.1:8999）
 * 代理解决跨域/混合内容问题：页面与接口同源
 * 启动：双击 本地预览.bat 或 node serve.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8081;
const ROOT = __dirname;
// 后端地址（也可用环境变量覆盖：set VIDEO_BACKEND=http://1.2.3.4:8080）
const VIDEO_BACKEND = process.env.VIDEO_BACKEND || 'http://127.0.0.1:8080';
const TDUCK_BACKEND = process.env.TDUCK_BACKEND || 'http://127.0.0.1:8999';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

// ---------- 代理转发（含跨域 CORS：外网页面 github.io 调用本接口必需） ----------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, HEAD, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Max-Age': '86400'
};
function proxy(req, res, targetBase) {
  if (req.method === 'OPTIONS') {
    // 跨域预检请求：直接放行
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  const u = new URL(req.url, targetBase);
  const opts = {
    protocol: u.protocol,
    hostname: u.hostname,
    port: u.port,
    path: u.pathname + u.search,
    method: req.method,
    headers: Object.assign({}, req.headers, { host: u.host })
  };
  const up = http.request(opts, function (r) {
    res.writeHead(r.statusCode, Object.assign({}, r.headers, CORS));
    r.pipe(res);
  });
  up.on('error', function (e) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ code: 502, message: '后端服务未启动或不可达: ' + e.message }));
  });
  req.pipe(up);
}

// ---------- 静态文件 ----------
function serveStatic(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { pathname = '/'; }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) {
      if (!path.extname(file)) {
        // 无扩展名时尝试 .html（兼容不带后缀的链接）
        fs.stat(file + '.html', function (e2, s2) {
          if (!e2 && s2.isFile()) return send(file + '.html', s2, res);
          notFound(res);
        });
        return;
      }
      notFound(res);
      return;
    }
    send(file, st, res);
  });
}
function send(file, st, res) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': 'no-cache'
  });
  fs.createReadStream(file).pipe(res);
}
function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
}

const server = http.createServer(function (req, res) {
  const p = req.url.split('?')[0];
  if (p === '/api' || p.startsWith('/api/') || p === '/proxy' || p.startsWith('/proxy/')) {
    // 保留 query string
    const full = req.url;
    req.url = full;
    return proxy(req, res, VIDEO_BACKEND);
  }
  if (p === '/tduck' || p.startsWith('/tduck/')) {
    // 剥掉 /tduck 前缀再转发（外网页面经隧道访问 /tduck/* → 问卷服务的 /*）
    var rest = req.url.slice('/tduck'.length);
    req.url = rest === '' ? '/' : rest;
    return proxy(req, res, TDUCK_BACKEND);
  }
  if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('');
  console.log('  网页版预览服务已启动:');
  console.log('    本机访问:   http://localhost:' + PORT);
  // 打印局域网地址，方便手机（微信内）访问
  const ifs = os.networkInterfaces();
  const addrs = [];
  Object.keys(ifs).forEach(function (name) {
    (ifs[name] || []).forEach(function (i) {
      if (i.family === 'IPv4' && !i.internal) addrs.push(i.address);
    });
  });
  addrs.forEach(function (a) {
    console.log('    手机访问:   http://' + a + ':' + PORT + '  (与电脑同一Wi-Fi)');
  });
  console.log('    视频解析后端代理 -> ' + VIDEO_BACKEND);
  console.log('    TDuck 问卷代理    -> ' + TDUCK_BACKEND);
  console.log('  请保持本窗口开启，按 Ctrl+C 停止');
  console.log('');
});
