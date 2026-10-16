'use strict';

/**
 * scripts/lib/dev-core.cjs
 *
 * 与平台无关的 monorepo 开发环境引擎（backend → frontend 串行启动）。
 *
 * 这是 scripts/dev.sh / scripts/dev.ps1 / scripts/dev.cmd 共同的行为内核，
 * 只依赖 Node 内置模块，不需要 bash、WSL、lsof、curl、ps、netstat。
 *
 * 之所以存在：仓库的 *.sh 是 Unix 脚本，Windows 上要么用 WSL / Git Bash 跑，
 * 要么换成 .cmd。为了不维护三份会漂移的逻辑，判别与启动都收敛到这里。
 *
 * 用法：
 *   node scripts/dev-core.cjs            # 启动开发栈
 *   node scripts/dev-core.cjs --check    # 只打印环境判别矩阵，不启动
 *   node scripts/dev-core.cjs --help
 */

const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const IS_WINDOWS = process.platform === 'win32';
const IS_DARWIN = process.platform === 'darwin';

/* ------------------------------------------------------------------ *
 * 可调参数（环境变量覆盖，与 dev.sh 的变量名保持一致）
 * ------------------------------------------------------------------ */

const CFG = {
  backendFilter: process.env.BACKEND_FILTER || './backend',
  frontendFilter: process.env.FRONTEND_FILTER || './frontend',
  waitTimeout: Number(process.env.BACKEND_WAIT_TIMEOUT || 60),
  healthPath: '/api/v1/health',
  defaultPort: 29526,
};

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;

const paint = (code, text) => (COLOR ? `\u001b[${code}m${text}\u001b[0m` : text);
const log = (msg = '') => process.stdout.write(`${msg}\n`);
const step = (msg) => log(paint('36', msg));
const ok = (msg) => log(paint('32', msg));
const warn = (msg) => log(paint('33', msg));
const fail = (msg) => log(paint('31', msg));

const rule = () => log('================================================================');

/* ------------------------------------------------------------------ *
 * 环境判别：回答“这台机器该用 bash 还是 bat / ps1 / 原生 Node”
 * ------------------------------------------------------------------ */

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function whichAll(names) {
  const exts = IS_WINDOWS ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';') : [''];
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const found = new Map();
  for (const name of names) {
    for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = path.join(dir, name + ext);
        if (fileExists(candidate)) {
          found.set(name, candidate);
          break;
        }
      }
      if (found.has(name)) break;
    }
  }
  return found;
}

/** Git for Windows：提供真 bash（MSYS2），比 WSL 更适合跑本仓库的 dev.sh。 */
function findGitBash() {
  const found = whichAll(['bash']);
  const fromPath = found.get('bash');
  if (fromPath) {
    const lower = fromPath.toLowerCase();
    // C:\Windows\System32\bash.exe 是 WSL 的转发器，不是 Git Bash
    if (!lower.includes('system32') && !lower.includes('sysnative')) {
      return { path: fromPath, source: 'PATH' };
    }
  }
  const candidates = [
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Git', 'usr', 'bin', 'bash.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fileExists(candidate)) return { path: candidate, source: 'well-known' };
  }
  return null;
}

/** WSL 转发器存在与否（wsl.exe 基本总是存在，能跑不代表用到）。 */
function findWsl() {
  const found = whichAll(['wsl']);
  const p = found.get('wsl') || (fileExists('C:\\Windows\\System32\\wsl.exe') ? 'C:\\Windows\\System32\\wsl.exe' : null);
  return p ? { path: p } : null;
}

function findCmd() {
  const comspec = process.env.ComSpec;
  if (comspec && fileExists(comspec)) return comspec;
  const found = whichAll(['cmd']);
  return found.get('cmd') || null;
}

function findPowerShell() {
  const found = whichAll(['pwsh', 'powershell']);
  return found.get('pwsh') || found.get('powershell') || null;
}

/**
 * 判别矩阵。返回值里带 decision，--check 会把它完整打印出来。
 */
function probeEnvironment() {
  const gitBash = findGitBash();
  const wsl = findWsl();
  const cmd = findCmd();
  const powershell = findPowerShell();
  const nodeMajor = Number(process.versions.node.split('.')[0]);

  const availableRunners = ['native'];
  if (gitBash) availableRunners.push('git-bash');
  if (wsl) availableRunners.push('wsl');

  return {
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    nodeOk: nodeMajor >= 22,
    repoRoot: REPO_ROOT,
    gitBash,
    wsl,
    cmd,
    powershell,
    availableRunners,
  };
}

/* ------------------------------------------------------------------ *
 * 报告
 * ------------------------------------------------------------------ */

function printCheckReport(env, runner = null, reason = null) {
  rule();
  log('🔎 开发环境判别 / dev environment probe');
  rule();
  log(`  平台            : ${env.platform} (${env.arch})`);
  log(`  Node            : ${env.node} ${env.nodeOk ? '✅' : '❌ 需要 >= 22.13'}`);
  log(`  仓库根          : ${env.repoRoot}`);
  log(`  Git Bash        : ${env.gitBash ? `✅ ${env.gitBash.path}` : '— 未检测到'}`);
  log(`  WSL             : ${env.wsl ? `✅ ${env.wsl.path}` : '— 未检测到'}`);
  log(`  cmd.exe         : ${env.cmd ? `✅ ${env.cmd}` : '— 未检测到'}`);
  log(`  PowerShell      : ${env.powershell ? `✅ ${env.powershell}` : '— 未检测到'}`);
  log('');
  log(`  dev.sh          : ${describeScript('scripts/dev.sh')}`);
  log(`  killdev.sh      : ${describeScript('scripts/killdev.sh')}`);
  log('');

  const envFiles = ['backend/.env.development', 'backend/.env.development.local', 'backend/.env.example'];
  for (const rel of envFiles) {
    const abs = path.join(REPO_ROOT, rel);
    log(`  ${rel.padEnd(32)}: ${fileExists(abs) ? '存在' : '缺失'}`);
  }
  log(`  后端实际端口    : ${readApiPort()}`);
  log('');

  if (runner) {
    ok(`  ✅ 本次 runner   : ${runner}`);
    log(`     理由          : ${reason}`);
  } else {
    log(`  可用 runner     : ${env.availableRunners.join(' / ')}`);
  }
  log('');
  log('  runner 说明：');
  log('    native    = 纯 Node 引擎（scripts/lib/dev-core.cjs），三平台同一份逻辑，');
  log('                默认选项，不依赖 bash / lsof / nc / curl / netstat；');
  log('    git-bash  = 用 Git Bash 跑 scripts/dev.sh（DEV_RUNNER=git-bash）；');
  log('    wsl       = 用 wsl.exe 跑 scripts/dev.sh（DEV_RUNNER=wsl，需 WSL 内另装依赖）。');
  rule();
}

/** 检查某个 shell 脚本的换行符，CRLF 会直接让 bash 报 $'\r'。 */
function describeScript(rel) {
  const abs = path.join(REPO_ROOT, rel);
  if (!fileExists(abs)) return '缺失';
  const buf = fs.readFileSync(abs);
  let crlf = 0;
  let lf = 0;
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === 0x0a) {
      if (i > 0 && buf[i - 1] === 0x0d) crlf += 1;
      else lf += 1;
    }
  }
  if (crlf > 0) {
    return `❌ CRLF（${crlf} 行）→ bash 会报 $'\\r': command not found；执行 git add --renormalize . 修正`;
  }
  return `✅ LF（${lf} 行）`;
}

/* ------------------------------------------------------------------ *
 * 端口 / 健康检查（不依赖 lsof、nc、curl）
 * ------------------------------------------------------------------ */

function readApiPort() {
  if (process.env.API_PORT && /^[0-9]+$/.test(process.env.API_PORT)) {
    return Number(process.env.API_PORT);
  }
  // 与后端、shell 脚本共用同一套 env 级联（.env → .env.{NODE_ENV} → .env.{NODE_ENV}.local）。
  // 不要再自己 grep 单个文件：端口写在个人覆盖层里时那样会读到旧值。
  const loader = path.join(REPO_ROOT, 'backend', 'scripts', 'lib', 'load-env.cjs');
  if (fileExists(loader)) {
    try {
      const out = String(execFileSync(process.execPath, [loader, '--value', 'API_PORT'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }) || '').trim();
      if (/^[0-9]+$/.test(out)) return Number(out);
    } catch {
      /* 忽略：解析失败就用默认端口 */
    }
  }
  return CFG.defaultPort;
}

function portListening(port, timeout = 800) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function httpHealth(port, timeout = 2000) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: CFG.healthPath, timeout, headers: { accept: 'application/json' } },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 64 * 1024) req.destroy();
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

async function backendHealthy(port) {
  const res = await httpHealth(port);
  if (!res) return false;
  return res.body.includes('"code":200') || res.body.includes('"status":"ok"');
}

/* ------------------------------------------------------------------ *
 * 进程管理
 * ------------------------------------------------------------------ */

const children = new Map(); // pid -> { child, name }
let shuttingDown = false;

/**
 * 用独立进程组（Unix）/ taskkill 进程树（Windows），便于整棵进程树一起杀。
 * stdio 里 stdin 一律 ignore，避免多个子进程抢控制台输入。
 */
function startProcess(name, spec, { group = true } = {}) {
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd || REPO_ROOT,
    shell: spec.shell !== false,
    stdio: ['ignore', spec.stdout || 'inherit', spec.stderr || spec.stdout || 'inherit'],
    env: withBinPath(spec.binDirs || [], spec.env || {}),
    windowsHide: true,
    detached: group && !IS_WINDOWS,
  });
  if (child.pid) children.set(child.pid, { child, name });
  child.on('exit', () => {
    if (child.pid) children.delete(child.pid);
  });
  return child;
}

function killTree(pid, signal = 'SIGTERM') {
  if (!pid) return;
  if (IS_WINDOWS) {
    try {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch {
      /* taskkill 不可用就退化为 kill */
      try {
        process.kill(pid);
      } catch { /* 已退出 */ }
    }
    return;
  }
  try {
    process.kill(-pid, signal); // 负号 = 整个进程组
  } catch {
    try {
      process.kill(pid, signal);
    } catch { /* 已退出 */ }
  }
}

function killAllTrees(signal = 'SIGTERM') {
  for (const [pid] of children) killTree(pid, signal);
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 包内 node_modules/.bin 的候选路径（Windows 上是 .cmd，需要显式进 PATH）。 */
function localBinDirs(pkgRel = '') {
  const dirs = [];
  if (pkgRel) dirs.push(path.join(REPO_ROOT, pkgRel, 'node_modules', '.bin'));
  dirs.push(path.join(REPO_ROOT, 'node_modules', '.bin'));
  return dirs.filter((d) => {
    try {
      return fs.statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
}

/**
 * 把 node_modules/.bin 前置进 PATH。
 * pnpm 的 `pnpm run` 会自动做这件事；我们用 Node 直接 spawn 子进程时不会，
 * 所以 `nodemon` / `vite` 这类 bin 必须手动找得到。
 */
function withBinPath(binDirs, extraEnv = {}) {
  const current = process.env.PATH || process.env.Path || '';
  const sep = IS_WINDOWS ? ';' : ':';
  const prefix = binDirs.join(sep);
  const env = { ...process.env, ...extraEnv };
  env.PATH = prefix ? `${prefix}${sep}${current}` : current;
  if (IS_WINDOWS) env.Path = env.PATH; // Windows 上大小写不敏感，但保持一致更省心
  // 去掉 pnpm 直接 spawn 子进程时 Node 的 DEP0190 噪音
  env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --disable-warning=DEP0190`.trim();
  return env;
}

/* ------------------------------------------------------------------ *
 * 启动流程
 * ------------------------------------------------------------------ */

function backendSpec(env) {
  // backend 的 dev 脚本是 "cross-env NODE_ENV=development nodemon src/app.js"。
  // pnpm 的 `pnpm run` 会把 node_modules/.bin 加进 PATH 并处理 shell，我们直接
  // spawn 时这两件事都要自己做，否则 Windows 上会 ENOENT: spawn nodemon。
  if (IS_WINDOWS) {
    const local = path.join(REPO_ROOT, 'backend', 'node_modules', '.bin', 'cross-env.cmd');
    if (fileExists(local)) {
      return {
        command: local,
        args: ['NODE_ENV=development', 'nodemon', 'src/app.js'],
        cwd: path.join(REPO_ROOT, 'backend'),
        binDirs: localBinDirs('backend'),
        log: 'backend/node_modules/.bin/cross-env.cmd NODE_ENV=development nodemon src/app.js',
      };
    }
    warn('    ⚠️  未找到 backend/node_modules/.bin/cross-env.cmd，先执行 pnpm install；本次改用 cmd 的 set 语法。');
    return {
      command: 'cmd',
      args: ['/d', '/s', '/c', 'set NODE_ENV=development&& nodemon src/app.js'],
      cwd: path.join(REPO_ROOT, 'backend'),
      binDirs: localBinDirs('backend'),
      log: 'cmd /c "set NODE_ENV=development && nodemon src/app.js"',
    };
  }
  return {
    command: 'pnpm',
    args: ['--filter', CFG.backendFilter, 'dev'],
    cwd: REPO_ROOT,
    log: `pnpm --filter "${CFG.backendFilter}" dev`,
  };
}

function frontendSpec(mode = 'dev') {
  const verb = mode === 'preview' ? 'preview' : 'dev';
  return {
    command: 'pnpm',
    args: ['--filter', CFG.frontendFilter, verb],
    cwd: REPO_ROOT,
    binDirs: localBinDirs('frontend'),
    log: `pnpm --filter "${CFG.frontendFilter}" ${verb}`,
  };
}

/** preview 模式要求 frontend/dist 已构建（对应 preview.sh 的前置检查）。 */
function checkFrontendDist() {
  const dist = path.join(REPO_ROOT, 'frontend', 'dist');
  try {
    return fs.statSync(dist).isDirectory() && fs.readdirSync(dist).length > 0;
  } catch {
    return false;
  }
}

function describeEnvHint() {
  const dev = path.join(REPO_ROOT, 'backend', '.env.development');
  const local = path.join(REPO_ROOT, 'backend', '.env.development.local');
  if (fileExists(dev) || fileExists(local)) return null;
  return [
    'backend/.env.development 与 backend/.env.development.local 都不存在。',
    '后端这次会用内置默认值（PostgreSQL localhost:25432 / Redis localhost:26379），',
    '若启动失败请先执行：  cp backend/.env.example backend/.env.development',
  ].join('\n    ');
}

function tailFile(file, lines = 60) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const rows = text.split(/\r?\n/);
    return rows.slice(-lines).join('\n');
  } catch {
    return '(日志读取失败)';
  }
}

async function waitForBackend(child, logFile, expectedPort) {
  const deadline = Date.now() + CFG.waitTimeout * 1000;
  const startedRe = /API Server started on (port )?[0-9.:a-fA-F]+/;

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode) {
      rule();
      fail('❌ backend 进程已退出，日志尾部：');
      log('------------------------------------------------------------');
      log(tailFile(logFile));
      log('------------------------------------------------------------');
      const hint = describeEnvHint();
      if (hint) warn(`    ${hint}`);
      return null;
    }

    let content = '';
    try {
      content = fs.readFileSync(logFile, 'utf8');
    } catch { /* 日志还没落盘 */ }

    const match = content.match(startedRe);
    if (match) {
      log(`    检测到启动日志：${match[0]}`);
      return expectedPort;
    }

    if ((await portListening(expectedPort, 300)) && (await backendHealthy(expectedPort))) {
      log(`    检测到端口 ${expectedPort} 已可连且健康检查通过`);
      return expectedPort;
    }

    await sleep(400);
  }

  rule();
  fail(`❌ backend 在 ${CFG.waitTimeout}s 内未打印启动成功日志。日志尾部：`);
  log('------------------------------------------------------------');
  log(tailFile(logFile));
  log('------------------------------------------------------------');
  const hint = describeEnvHint();
  if (hint) warn(`    ${hint}`);
  return null;
}

/** 轮询等待端口可连，用于“日志已出现但端口还没起来”。 */
async function waitForPort(port, timeout) {
  const deadline = Date.now() + timeout * 1000;
  while (Date.now() < deadline) {
    if (await portListening(port, 500)) return true;
    await sleep(400);
  }
  return false;
}

function localIPv4() {
  const result = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const netInfo of nets[name] || []) {
      const family = typeof netInfo.family === 'string' ? netInfo.family : `IPv${netInfo.family}`;
      if (family === 'IPv4' && !netInfo.internal) result.push(netInfo.address);
    }
  }
  return result;
}

function printLanUrls(port, label = '') {
  for (const ip of localIPv4()) {
    log(label ? `    ${label} http://${ip}:${port}` : `    http://${ip}:${port}`);
  }
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

function installSignalHandlers() {
  const onSignal = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('');
    log('↩️  收到退出信号，正在清理子进程 ...');
    killAllTrees('SIGTERM');
    if (IS_WINDOWS) {
      // taskkill /F 是异步的，留一点时间再退出
      setTimeout(() => process.exit(0), 900);
    }
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGHUP', () => onSignal('SIGHUP'));
  process.on('exit', () => {
    if (shuttingDown) killAllTrees('SIGKILL');
  });
}

async function runStack({ quietHeader = false, mode = 'dev', header = null } = {}) {
  const env = probeEnvironment();

  if (!env.nodeOk) {
    fail(`❌ Node ${env.node} 低于 backend 要求的 >= 22.13，请先升级 Node。`);
    return 1;
  }

  installSignalHandlers();

  const expectedPort = readApiPort();
  const logFile = path.join(
    os.tmpdir(),
    `eadaf-backend-dev.${process.pid}.${Date.now().toString(36)}.log`,
  );

  if (!quietHeader) {
    step(header || `[runner] native（纯 Node 引擎）`);
    log('');
  }

  /* ---------------------------- backend ---------------------------- */
  rule();
  log(`🟢 [1/2] backend  (${backendSpec(env).log})`);
  rule();

  if (mode === 'preview') {
    log('    （preview 模式同样先起 backend，前端走 vite preview 提供 frontend/dist）');
  }

  let backendChild = null;
  let backendPort = expectedPort;
  let backendStartedByUs = false;

  if (await portListening(expectedPort)) {
    if (await backendHealthy(expectedPort)) {
      ok(`♻️  端口 ${expectedPort} 上已有可用 backend，跳过重复启动（nodemon 会热重载）。`);
      log(`    Local:   http://localhost:${expectedPort}${CFG.healthPath}`);
      printLanUrls(expectedPort, 'Network:');
      log('    若要强制重启：pnpm killdev && pnpm dev');
    } else {
      fail(`❌ 端口 ${expectedPort} 已被占用，但健康检查失败，无法确认是本仓库 backend：`);
      log('    请先执行：pnpm killdev');
      log('    或手动结束占用进程后再 pnpm dev。');
      return 1;
    }
  } else {
    const spec = backendSpec(env);
    log(`    启动 ${spec.log}`);
    log(`    日志: ${logFile}`);
    backendChild = startProcess('backend', {
      ...spec,
      stdout: fs.openSync(logFile, 'a'),
      stderr: fs.openSync(logFile, 'a'),
    });
    backendStartedByUs = true;
    log(`    backend pid=${backendChild.pid}`);

    const hint = describeEnvHint();
    if (hint) warn(`    ⚠️  ${hint}`);
    log(`    等待 backend 启动（最多 ${CFG.waitTimeout}s）...`);

    const ready = await waitForBackend(backendChild, logFile, expectedPort);
    if (ready === null) {
      if (backendChild.pid) killTree(backendChild.pid, 'SIGKILL');
      return 1;
    }
    backendPort = ready;

    if (await waitForPort(backendPort, 5)) {
      ok(`    ✅ 端口 ${backendPort} 已就绪`);
    } else {
      warn(`    ⚠️  backend 已打印启动日志，但端口 ${backendPort} 暂时不可连（可能仍在初始化）。`);
    }
    log(`    Local:   http://localhost:${backendPort}${CFG.healthPath}`);
    printLanUrls(backendPort, 'Network:');
  }

  /* ---------------------------- frontend --------------------------- */
  if (mode === 'preview' && !checkFrontendDist()) {
    log('');
    fail('❌ 未找到 frontend/dist，请先执行：');
    log('   pnpm --filter ./frontend build');
    if (backendStartedByUs && backendChild && backendChild.pid) {
      killTree(backendChild.pid, 'SIGKILL');
    }
    return 1;
  }

  log('');
  rule();
  log(`🟢 [2/2] 启动 frontend (${frontendSpec(mode).log})`);
  log(`        backend: http://localhost:${backendPort}`);
  printLanUrls(backendPort, '        backend Network:');
  rule();
  log('');

  const frontend = startProcess('frontend', frontendSpec(mode));

  const code = await new Promise((resolve) => {
    frontend.on('exit', (exitCode) => resolve(exitCode ?? 0));
    frontend.on('error', () => resolve(1));
  });

  if (shuttingDown) return 0;

  log('');
  if (backendStartedByUs && backendChild && backendChild.pid) {
    log(`🛑 停止本次启动的 backend (pid=${backendChild.pid}) ...`);
    killTree(backendChild.pid, 'SIGTERM');
    await sleep(400);
    if (alive(backendChild.pid)) killTree(backendChild.pid, 'SIGKILL');
  } else {
    log('♻️  保留已在运行的 backend / nodemon（改 backend 文件会自动重载）。');
  }

  try {
    fs.rmSync(logFile, { force: true });
  } catch { /* 忽略 */ }

  log('👋 已退出。');
  return code;
}

module.exports = {
  probeEnvironment,
  printCheckReport,
  runStack,
  readApiPort,
  portListening,
  killTree,
  REPO_ROOT,
  CFG,
};

/** 直接执行 dev-core.cjs 时的 CLI（dev.cjs 会通过 --check 复用）。 */
if (require.main === module) {
  const run = process.argv.includes('--check')
    ? Promise.resolve().then(() => {
        printCheckReport(probeEnvironment());
        return 0;
      })
    : runStack();

  run
    .then((code) => {
      process.exitCode = code;
      setTimeout(() => process.exit(code), 1500).unref();
    })
    .catch((err) => {
      fail(`❌ 启动失败：${err && err.stack ? err.stack : err}`);
      process.exit(1);
    });
}
