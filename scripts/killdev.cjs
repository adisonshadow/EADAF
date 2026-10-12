'use strict';

/**
 * scripts/killdev.cjs
 *
 * `pnpm killdev` 的唯一入口（Windows / macOS / Linux 通用）。
 *
 * 原 scripts/killdev.sh 依赖 ps / lsof / fuser / ss —— Windows 上一个都没有
 * （Git Bash 也没有 lsof/ps 的完整语义，WSL 里的 ps 看不到 Windows 进程），
 * 所以这里用 Node 重新实现：
 *   - 基于 netstat -ano（Windows）/ lsof（Unix）找出占用 29526 / 29527 的 PID；
 *   - 基于进程列表找出本仓库的 pnpm / nodemon / vite / dev.cjs 进程；
 *   - Windows 用 taskkill /PID <pid> /T /F 结束整棵进程树。
 *
 * 安全约束：
 *   - 不杀自己、不杀父进程、不杀 PID 0/4；
 *   - 默认先列出再等确认（pnpm killdev 会要求输入 y）；
 *   - 非交互 / CI 用 pnpm killdev:yes 或环境变量 DEV_KILL_FORCE=1。
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');

const { probeEnvironment, REPO_ROOT } = require('./lib/dev-core.cjs');

const IS_WINDOWS = process.platform === 'win32';
const SELF_PID = process.pid;
const PARENT_PID = process.ppid;

const BACKEND_PORT = Number(process.env.BACKEND_PORT || process.env.API_PORT || 29526);
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 29527);

const paint = (code, text) =>
  process.stdout.isTTY && !process.env.NO_COLOR ? `\u001b[${code}m${text}\u001b[0m` : text;
const log = (msg = '') => process.stdout.write(`${msg}\n`);

/** 进程是否还在（权限不足也视为还在）。 */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === 'EPERM';
  }
}

/* ------------------------------------------------------------------ *
 * 进程发现
 * ------------------------------------------------------------------ */

function runPowerShell(script) {
  const env = probeEnvironment();
  if (!env.powershell) return null;
  const res = spawnSync(env.powershell, ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (res.error || res.status !== 0) return null;
  return res.stdout || '';
}

/** 任务管理器级别的进程快照（Windows），失败时回退到 wmic。 */
function listWindowsProcesses() {
  // 用 | 分隔而不是 tab：PowerShell -Command 把反引号转义按字面传过去，
  // 输出里会出现 "`t" 而不是制表符，解析必然错位。
  const script = [
    'Get-CimInstance Win32_Process | ForEach-Object {',
    '  "{0}|{1}|{2}" -f $_.ProcessId, $_.ParentProcessId, (($_.CommandLine -replace "\\|", "/") -join "")',
    '}',
  ].join('\n');

  let stdout = runPowerShell(script);
  if (stdout) {
    const rows = [];
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const first = line.indexOf('|');
      const second = line.indexOf('|', first + 1);
      if (first < 0 || second < 0) continue;
      const pid = Number(line.slice(0, first));
      if (!Number.isFinite(pid)) continue;
      rows.push({
        pid,
        ppid: Number(line.slice(first + 1, second)) || 0,
        command: line.slice(second + 1).trim(),
      });
    }
    if (rows.length) return rows;
  }

  const wmic = spawnSync(
    'wmic',
    ['process', 'get', 'ProcessId,ParentProcessId,CommandLine', '/format:csv'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true },
  );
  if (wmic.error || wmic.status !== 0) return [];
  const rows = [];
  for (const line of (wmic.stdout || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^Node,/i.test(trimmed)) continue;
    // CSV: Node,CommandLine,ParentProcessId,ProcessId
    const parts = trimmed.split(',');
    if (parts.length < 4) continue;
    const pid = Number(parts[parts.length - 1]);
    const ppid = Number(parts[parts.length - 2]);
    if (!Number.isFinite(pid)) continue;
    rows.push({ pid, ppid: Number.isFinite(ppid) ? ppid : 0, command: parts.slice(1, -2).join(',') });
  }
  return rows;
}

/** Unix 下的进程快照：ps 已存在但只有它，不再拼 lsof。 */
function listUnixProcesses() {
  const res = spawnSync('ps', ['-ax', '-o', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (res.error || res.status !== 0) return [];
  const rows = [];
  for (const line of (res.stdout || '').split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    rows.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] });
  }
  return rows;
}

function parseNetstat(stdout) {
  const pids = new Set();
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (m) pids.add(Number(m[3]));
  }
  return pids;
}

/** 占用指定端口的 PID。 */
function pidsOnPort(port) {
  const pids = new Set();

  if (IS_WINDOWS) {
    const netstat = spawnSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    if (!netstat.error && netstat.status === 0) {
      const scoped = (netstat.stdout || '')
        .split(/\r?\n/)
        .filter((line) => new RegExp(`[:.]${port}\\s`).test(line))
        .join('\n');
      for (const pid of parseNetstat(scoped)) pids.add(pid);
    }
    return pids;
  }

  const lsof = spawnSync('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (!lsof.error && lsof.status === 0) {
    for (const line of (lsof.stdout || '').split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
    return pids;
  }

  const fuser = spawnSync('fuser', ['-n', 'tcp', String(port)], { encoding: 'utf8' });
  if (!fuser.error) {
    for (const token of `${fuser.stdout || ''} ${fuser.stderr || ''}`.split(/\s+/)) {
      const pid = Number(token);
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
  }
  return pids;
}

/**
 * 是不是本仓库 dev 栈的“根”进程。
 * 必须锚定命令行开头，不能用 includes("node") —— 否则
 *   ...\DeepSeek Harness.exe ...\node.exe Electron ...
 *   powershell ... -Command "node scripts/dev.cjs ..."
 * 都会被误判成本仓库的 dev 入口（真实踩过的坑）。
 * 命中的根进程会做进程树闭包，因此这里必须足够严格。
 *
 * 分两类：
 *   A. 绝对路径写死在命令行里（pnpm --filter、脚本绝对路径）；
 *   B. 通过 shell 包装执行的相对入口（cmd /d /s /c node scripts/dev.cjs），
 *      这种情况必须用 "只要引号内以 node 开头的可执行名 + 紧跟 scripts/ 相对路径" 来锚定。
 */
function isDevRoot(command) {
  if (!command) return false;
  const lower = command.replace(/\\/g, '/').toLowerCase();
  const repo = REPO_ROOT.replace(/\\/g, '/').toLowerCase();

  // A) 绝对路径直接锚定本仓库脚本
  if (lower.includes(`${repo}/scripts/dev.sh`)) return true;
  if (lower.includes(`${repo}/scripts/preview.sh`)) return true;
  if (lower.includes(`${repo}/scripts/dev.cjs`)) return true;
  if (lower.includes(`${repo}/scripts/preview.cjs`)) return true;
  if (lower.includes(`${repo}/scripts/killdev.cjs`)) return true;

  // B) 相对入口：node scripts/dev.cjs。
  //    必须锚定在命令行开头（允许 cmd /d /s /c 这类 Windows 包装）：
  //      node scripts/dev.cjs                          → 命中
  //      cmd /d /s /c node scripts/dev.cjs             → 命中
  //      powershell -Command "node scripts/dev.cjs"    → 不命中（包装器，不是根进程）
  //      node /home/x/other/scripts/dev.cjs            → 不命中（其他仓库走不到 A）
  const headRe = /^\s*"?(?:[a-z]:)?[^"\s]*[\\/]?(cmd(\.exe)?\s+(?:\/[a-z]\s+)*)?"?node(\.exe|\.cmd)?"?\s+"?(?:\.\.?[\\/])?scripts[\\/](dev|preview|killdev)\.cjs(\s|"|$)/i;
  if (headRe.test(lower)) return true;

  // C) pnpm --filter ./backend|./frontend <dev|preview>
  if (/\bpnpm(\.cjs|\.mjs)?\b/.test(lower)
      && /--filter\s+"?\.?\/(backend|frontend)\b/.test(lower)
      && /\b(dev|preview)\b/.test(lower)) {
    return true;
  }
  return false;
}

/** 进程名（用于日志，比整条命令行短）。 */
function baseName(command) {
  if (!command) return '<unknown>';
  const m = command.match(/"([^"]+\.exe)"|([^\s"\\/]+\.exe)/i);
  if (m) return (m[1] || m[2]).split(/[\\/]/).pop();
  const first = command.trim().split(/\s+/)[0] || '';
  return first.split(/[\\/]/).pop() || '<unknown>';
}

/** 由根进程集合取进程树闭包（含所有后代）。 */
function collectDescendants(rows, roots) {
  const childrenOf = new Map();
  for (const row of rows) {
    if (!childrenOf.has(row.ppid)) childrenOf.set(row.ppid, []);
    childrenOf.get(row.ppid).push(row.pid);
  }
  const result = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    const pid = queue.shift();
    for (const child of childrenOf.get(pid) || []) {
      if (result.has(child)) continue;
      result.add(child);
      queue.push(child);
    }
  }
  return result;
}

function protectedPid(pid) {
  if (!Number.isFinite(pid) || pid <= 4) return true; // 0/4 = System
  if (pid === SELF_PID || pid === PARENT_PID) return true;
  return false;
}

/* ------------------------------------------------------------------ *
 * 结束进程
 * ------------------------------------------------------------------ */

function killTreeWindows(pid) {
  const res = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8', windowsHide: true });
  return !res.error && res.status === 0;
}

function killTreeUnix(pid, signal) {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const force = process.argv.includes('--yes') || process.env.DEV_KILL_FORCE === '1';
  const rows = IS_WINDOWS ? listWindowsProcesses() : listUnixProcesses();
  const byPid = new Map(rows.map((r) => [r.pid, r]));

  const targets = new Map(); // pid -> reason

  // 1) 命令行锚点：本仓库的 dev / preview 入口（带绝对路径，不会误判别的项目）
  const roots = new Set();
  for (const row of rows) {
    if (protectedPid(row.pid)) continue;
    if (isDevRoot(row.command)) roots.add(row.pid);
  }

  // 2) 进程树闭包：根进程的所有后代（pnpm → dev.cjs → cross-env → nodemon → node，
  //    以及 pnpm --filter frontend dev → vite），这才是真正要结束的东西
  const tree = collectDescendants(rows, roots);
  for (const pid of tree) {
    if (protectedPid(pid)) continue;
    if (!targets.has(pid)) targets.set(pid, roots.has(pid) ? 'dev 入口' : 'dev 进程树');
  }

  // 3) 端口锚点：兜底（例如 dev.sh 被中断后残留的 node，或单独起的服务）
  for (const port of [BACKEND_PORT, FRONTEND_PORT]) {
    for (const pid of pidsOnPort(port)) {
      if (protectedPid(pid)) continue;
      if (!targets.has(pid)) targets.set(pid, `占用端口 ${port}`);
    }
  }

  if (targets.size === 0) {
    log('没有发现前后端开发进程。');
    return 0;
  }

  // 根进程先杀：taskkill /T 会把整棵树一起带走，避免子进程变成孤儿。
  const ordered = [...targets.entries()].sort((a, b) => {
    const rank = (entry) => (roots.has(entry[0]) ? 0 : String(entry[1]).startsWith('占用端口') ? 2 : 1);
    return rank(a) - rank(b);
  });

  log('将结束以下进程：');
  for (const [pid, reason] of ordered) {
    const row = byPid.get(pid);
    const cmd = row ? row.command || `(${baseName('')} 命令行不可读)` : `<pid ${pid} 不在快照中>`;
    const short = cmd.length > 100 ? `${cmd.slice(0, 100)}…` : cmd;
    log(`  pid=${pid}  [${reason}]  ${short}`);
  }

  if (!force) {
    if (!process.stdin.isTTY) {
      log('');
      log(paint('33', '非交互环境：未执行结束操作（不是失败）。确认要停时用 pnpm killdev:yes（或 DEV_KILL_FORCE=1）。'));
      return 0;
    }
    const answer = await new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('确认结束以上进程？(y/N) ', (value) => {
        rl.close();
        resolve((value || '').trim().toLowerCase());
      });
    });
    if (answer !== 'y' && answer !== 'yes') {
      log('已取消。');
      return 0;
    }
  }

  log('');
  const failed = [];
  for (const [pid] of ordered) {
    if (!alive(pid)) continue;
    const okKill = IS_WINDOWS ? killTreeWindows(pid) : killTreeUnix(pid, 'SIGTERM');
    if (!okKill) {
      failed.push(pid);
    } else {
      log(`  ✅ 已结束 pid=${pid}`);
    }
  }

  await new Promise((r) => setTimeout(r, 500));

  for (const [pid] of ordered) {
    if (!alive(pid)) continue;
    log(`  强制结束 pid=${pid}`);
    if (IS_WINDOWS) killTreeWindows(pid);
    else killTreeUnix(pid, 'SIGKILL');
  }

  await new Promise((r) => setTimeout(r, 300));

  const still = ordered.filter(([pid]) => alive(pid)).map(([pid]) => pid);
  log('');
  if (still.length === 0) {
    log('✅ 已结束前后端开发进程。');
    return 0;
  }
  log(paint('33', `⚠️  仍有进程未结束（可能需要管理员权限）：${still.join(', ')}`));
  return failed.length ? 1 : 0;
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      log(paint('31', `❌ killdev 失败：${err && err.stack ? err.stack : err}`));
      process.exitCode = 1;
    });
}

// 供自测使用：node scripts/test-killdev-matcher.cjs
module.exports = { isDevRoot, collectDescendants, baseName, REPO_ROOT };
