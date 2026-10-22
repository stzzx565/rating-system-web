/**
 * 一键开启外网访问（零费用）
 * 流程：
 *   1. 检查本地预览服务(8081)，没起就自动启动 serve.js
 *   2. 检查视频解析服务(8080)，没起则提示双击“视频解析服务.bat”
 *   3. 启动 cloudflared 免费隧道（trycloudflare.com，免注册）
 *   4. 把隧道地址写入 JSONBin 云端配置 bin（github.io 网页版自动识别）
 *   5. 打印可分享的外网地址，窗口保持开启即外网在线
 */
const { spawn, execSync, execFileSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT_WEB = 8081;   // 本地预览（站点+接口代理）
const PORT_API = 8080;   // 视频解析服务
const PORT_TDUCK = 8999; // TDuck 问卷系统
const ROOT = __dirname;
const TUNNEL_URL_FILE = path.join(ROOT, '外网地址.txt');
// 云端配置 bin（与 js/app.js 中一致）
const CFG_URL = 'https://api.jsonbin.io/v3/b/6ad5f513ffd5d16053782d28';
const CFG_KEY = '$2a$10$c2NEBUyWOI3Yqv3mlGn8zeY7ysKbSPQdFv9Oyli9LN5J8LN1wkvSK';

function portUp(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 2000 }, r => { r.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function findCloudflared() {
  // 1) PATH
  try {
    const out = execSync('where cloudflared', { stdio: 'pipe' }).toString().trim().split(/\r?\n/)[0];
    if (out && fs.existsSync(out)) return out;
  } catch (e) {}
  // 2) winget 常见位置
  const cands = [
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages'),
    'C:\\Program Files\\cloudflared\\cloudflared.exe'
  ];
  for (const c of cands) {
    if (c.toLowerCase().endsWith('.exe') && fs.existsSync(c)) return c;
    if (fs.existsSync(c) && !c.toLowerCase().endsWith('.exe')) {
      try {
        const found = execSync(`dir /s /b "${c}\\cloudflared.exe"`, { stdio: 'pipe', shell: 'cmd.exe' }).toString().trim().split(/\r?\n/)[0];
        if (found && fs.existsSync(found)) return found;
      } catch (e) {}
    }
  }
  return null;
}

function downloadCloudflared() {
  const dir = path.join(ROOT, 'tools');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, 'cloudflared.exe');
  if (fs.existsSync(dest)) return dest;
  const url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
  console.log('  正在下载 cloudflared（约40MB，首次一次即可）...');
  return new Promise((resolve, reject) => {
    const https = require('https');
    const follow = u => https.get(u, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return follow(res.headers.location); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const tmp = dest + '.down';
      const f = fs.createWriteStream(tmp);
      let total = 0, last = 0;
      res.on('data', c => {
        total += c.length;
        if (total - last > 5 * 1024 * 1024) { process.stdout.write(`\r  已下载 ${(total / 1048576).toFixed(0)}MB`); last = total; }
      });
      f.on('finish', () => { f.close(); fs.renameSync(tmp, dest); console.log('  下载完成'); resolve(dest); });
      res.pipe(f);
    }).on('error', reject);
    follow(url);
  });
}

async function putConfig(url, tduckUrl) {
  const res = await fetch(CFG_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': CFG_KEY },
    body: JSON.stringify({
      videoApiBase: url,
      tduckApiBase: tduckUrl || '',
      updatedAt: new Date().toISOString()
    })
  });
  if (!res.ok) throw new Error('配置写入失败 HTTP ' + res.status);
}

// 备用配置：把隧道地址写入仓库里的 config.json 并推送到 GitHub Pages
// （github.io 托管，无请求额度限制；网页版在 JSONBin 读不到时会读这里）
function findGit() {
  const win = 'C:\\Program Files\\Git\\cmd\\git.exe';
  try { if (fs.existsSync(win)) return win; } catch (e) { /* 忽略 */ }
  return 'git';
}

async function syncConfigToPages(url, tduckUrl) {
  const file = path.join(ROOT, 'config.json');
  const target = { v: url, t: tduckUrl || '' };
  const parse = s => { try { const j = JSON.parse(s); return { v: j.videoApiBase, t: j.tduckApiBase || '' }; } catch (e) { return null; } };
  let old = '';
  try { old = fs.readFileSync(file, 'utf8'); } catch (e) { /* 文件不存在 */ }
  const cur = parse(old);
  const changed = !cur || cur.v !== target.v || cur.t !== target.t;
  if (changed) {
    fs.writeFileSync(file, JSON.stringify({
      videoApiBase: target.v,
      tduckApiBase: target.t,
      updatedAt: new Date().toISOString()
    }, null, 2) + '\n', 'utf8');
  }
  const git = findGit();
  const opts = { cwd: ROOT, stdio: 'pipe', timeout: 90000, windowsHide: true, encoding: 'utf8' };
  const run = args => execFileSync(git, args, opts);
  try {
    if (changed) {
      run(['add', 'config.json']);
      run(['-c', 'user.name=stzzx565', '-c', 'user.email=stzzx565@users.noreply.github.com',
        'commit', '-m', 'chore: sync tunnel config']);
    }
    // 即使内容没变也尝试推送（补推上次网络不通没推成功的提交）
    run(['pull', '--rebase', 'origin', 'master']);
    run(['push', 'origin', 'master']);
    return 'ok';
  } catch (gitErr) {
    // github.com 直连不稳时改走 api.github.com（gh CLI）通道，推送同一份内容
    try {
      const gh = 'C:\\Program Files\\GitHub CLI\\gh.exe';
      if (!fs.existsSync(gh)) throw gitErr;
      const ghOpts = { stdio: 'pipe', timeout: 90000, windowsHide: true, encoding: 'utf8' };
      const apiPath = '/repos/stzzx565/rating-system-web/contents/config.json';
      const b64 = fs.readFileSync(file).toString('base64');
      let sha = '';
      try { sha = execFileSync(gh, ['api', apiPath, '--jq', '.sha'], ghOpts).trim(); } catch (e) { /* 404=远端尚无此文件 */ }
      const ag = ['api', '-X', 'PUT', apiPath,
        '-f', 'message=chore: sync tunnel config', '-f', 'content=' + b64];
      if (sha) ag.push('-f', 'sha=' + sha);
      execFileSync(gh, ag, ghOpts);
      return 'api';
    } catch (e2) { throw gitErr; }
  }
}

// 为本地某个端口开一条免费隧道，解析出地址（失败返回 null）
function openTunnel(cf, port) {
  return new Promise(resolve => {
    const child = spawn(cf, ['tunnel', '--url', `http://localhost:${port}`], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']
    });
    let done = false;
    const finish = url => { if (!done) { done = true; resolve({ child, url }); } };
    const onOut = data => {
      const m = data.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m) finish(m[0]);
    };
    child.stdout.on('data', onOut);
    child.stderr.on('data', onOut);
    child.on('exit', () => finish(null));
    // 60 秒没拿到地址视为失败
    setTimeout(() => finish(null), 60000);
  });
}

(async function main() {
  console.log('');
  console.log('  ============ 外网访问启动 ============');

  // 1. 预览服务
  if (!(await portUp(PORT_WEB))) {
    console.log(`  本地预览服务(${PORT_WEB})未运行，正在启动...`);
    spawn(process.execPath, [path.join(ROOT, 'serve.js')], { cwd: ROOT, detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 15; i++) { await new Promise(r => setTimeout(r, 500)); if (await portUp(PORT_WEB)) break; }
  }
  if (!(await portUp(PORT_WEB))) { console.error('  [错误] 预览服务启动失败，请手动运行 本地预览.bat'); process.exit(1); }
  console.log(`  预览服务 OK (:${PORT_WEB})`);

  // 2. 视频解析服务（未运行则自动启动，无需再手动双击 bat）
  if (!(await portUp(PORT_API))) {
    console.log(`  视频解析服务(:${PORT_API})未运行，正在启动...`);
    const svcDir = path.join(ROOT, '..', 'video-parser-service');
    spawn(process.execPath, ['server.js'], { cwd: svcDir, detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 500)); if (await portUp(PORT_API)) break; }
  }
  if (await portUp(PORT_API)) {
    console.log(`  视频解析服务 OK (:${PORT_API})`);
  } else {
    console.error('  [错误] 视频解析服务启动失败（外网将无法解析视频），请检查 video-parser-service 目录');
    process.exit(1);
  }

  // 3. TDuck 问卷系统（未运行则自动启动 MySQL + 服务）
  if (!(await portUp(PORT_TDUCK))) {
    console.log('  问卷服务(:8999)未运行，正在启动（约30秒）...');
    const TD = path.join(ROOT, '..', 'TDuck');
    if (!(await portUp(3306))) {
      spawn(path.join(TD, 'mysql', 'bin', 'mysqld.exe'),
        ['--no-defaults', '--console', `--basedir=${path.join(TD, 'mysql')}`,
         `--datadir=${path.join(TD, 'mysql', 'data')}`, '--port=3306', '--bind-address=127.0.0.1'],
        { cwd: TD, detached: true, stdio: 'ignore' }).unref();
      for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 1000)); if (await portUp(3306)) break; }
    }
    spawn(path.join(TD, 'jre', 'bin', 'java.exe'),
      ['-Dfile.encoding=utf-8', '-jar', path.join(TD, 'tduck-api.jar')],
      { cwd: TD, detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 90; i++) { await new Promise(r => setTimeout(r, 1000)); if (await portUp(PORT_TDUCK)) break; }
  }

  // 3. cloudflared
  let cf = findCloudflared();
  if (!cf) {
    try { cf = await downloadCloudflared(); }
    catch (e) { console.error('  [错误] cloudflared 下载失败(检查网络后重试):', e.message); process.exit(1); }
  }

  console.log('  正在创建外网隧道...');
  const mainT = await openTunnel(cf, PORT_WEB);
  if (!mainT.url) {
    console.error('  [错误] 主隧道创建失败，请重新运行本脚本');
    process.exit(1);
  }

  // 问卷系统（TDuck :8999）单独一条隧道；没运行就不开，问卷外网暂不可用
  let tduckUrl = '';
  if (await portUp(PORT_TDUCK)) {
    console.log(`  问卷服务 OK (:${PORT_TDUCK})，正在创建问卷隧道...`);
    const tT = await openTunnel(cf, PORT_TDUCK);
    if (tT.url) {
      tduckUrl = tT.url;
      tT.child.on('exit', () => console.log('  [提示] 问卷隧道已断开（重启本脚本可恢复，地址会变）'));
    } else {
      console.log('  [提示] 问卷隧道创建失败，外网暂无法打开问卷系统');
    }
  } else {
    console.log(`  [提示] 问卷服务(:${PORT_TDUCK})未运行 —— 外网无法打开“电脑版完整问卷系统”。`);
    console.log('         需要时双击 D:\\TDuck\\启动问卷系统.bat，再重新运行本脚本。');
  }

  // 隧道断开（重启/网络波动）→ 自动重建并同步新地址，无需人工干预
  async function restartTunnel() {
    console.log('');
    console.log('  [提示] 主隧道已断开，正在自动重建（外网地址会变化）…');
    const t = await openTunnel(cf, PORT_WEB);
    if (!t.url) { console.error('  [警告] 重建失败，5 秒后重试…'); setTimeout(restartTunnel, 5000); return; }
    t.child.on('exit', () => restartTunnel());
    await onUrl(t.url);
  }
  mainT.child.on('exit', () => restartTunnel());

  async function onUrl(url) {
    console.log('');
    console.log('  ============================================');
    console.log('   外网访问已开启，把下面地址发给任何人即可打开：');
    console.log('');
    console.log('    ' + url);
    if (tduckUrl) {
      console.log('');
      console.log('   问卷系统外网地址：' + tduckUrl);
    }
    console.log('');
    console.log('   (视频/问卷接口地址已同步到云端，github.io 网页版会自动识别)');
    console.log('  ============================================');
    console.log('   保持本窗口开启 = 外网持续可用；关闭窗口 = 外网停止');
    console.log('   每次重启后地址会变，重新运行本脚本会打印新地址');
    // 三个同步互相独立：一个失败不影响其它两个
    try {
      await putConfig(url, tduckUrl);
      console.log('   (最新地址已同步 JSONBin 云端配置)');
    } catch (e) {
      console.warn('   [警告] JSONBin 配置同步失败:', e.message);
    }
    try {
      await syncConfigToPages(url, tduckUrl);
      console.log('   (最新地址已同步 github.io/config.json 备用配置)');
    } catch (e) {
      console.warn('   [提示] github.io 备用配置同步未完成(不影响主配置):', String(e.message || e).split('\n')[0]);
    }
    try {
      fs.writeFileSync(TUNNEL_URL_FILE, url + (tduckUrl ? '\n' + tduckUrl : '') + '\n', 'utf8');
      console.log('   (最新地址也已写入 外网地址.txt)');
    } catch (e) {
      console.warn('   [提示] 外网地址.txt 写入失败:', e.message);
    }
    console.log('');
  }
  await onUrl(mainT.url);
})().catch(e => { console.error('失败:', e); process.exit(1); });
