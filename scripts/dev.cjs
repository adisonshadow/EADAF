'use strict';

/**
 * scripts/dev.cjs
 *
 * `pnpm dev` 的唯一入口（Windows / macOS / Linux 通用）：先判别该用哪种 shell，
 * 再决定怎么跑这套开发栈。
 *
 * 为什么需要判别（也就是原来 `pnpm dev` 报错的原因）：
 *   仓库原有 scripts/dev.sh 是 Unix 脚本。Windows 下：
 *     - cmd / PowerShell 里 `bash scripts/dev.sh` 走的是 WSL 转发器，
 *       WSL 会把 Windows 路径当 Linux 路径，还伴随 localhost 代理告警；
 *     - .sh 一旦被检出成 CRLF，bash 直接报
 *         scripts/dev.sh: line 13: $'\r': command not found
 *         : invalid option name14: set: pipefail
 *   所以这里先探环境（git-bash / wsl / cmd / pwsh 是否可用），再选 runner。
 *
 * 判别规则（pnpm dev --check 会打印完整矩阵）：
 *   - 非 Windows            → native（纯 Node 引擎，与 dev.sh 行为等价）
 *   - Windows + Git Bash    → native（引擎已跨平台；Git Bash 缺 lsof/nc，
 *                             原生 Node 比 bash 更可靠。DEV_RUNNER=git-bash 可强制走 .sh）
 *   - Windows 只有 WSL      → native（不用 wsl.exe：路径映射 / 代理告警 / WSL 内要重装 pnpm）
 *   - Windows 无 bash       → native（纯 Node 引擎，不依赖任何 shell）
 *
 * 强制指定 runner：
 *   DEV_RUNNER=auto|native|git-bash|bash|wsl
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const IS_WINDOWS = process.platform === 'win32';

const paint = (code, text) =>
  process.stdout.isTTY && !process.env.NO_COLOR ? `\u001b[${code}m${text}\u001b[0m` : text;
const log = (msg = '') => process.stdout.write(`${msg}\n`);

const { probeEnvironment, printCheckReport, runStack } = require('./lib/dev-core.cjs');

/** runner 判别：返回 { runner, reason }。 */
function decideRunner(env, forced) {
  const requested = (forced || 'auto').toLowerCase();
  if (requested !== 'auto') {
    return { runner: requested, reason: 'DEV_RUNNER 显式指定' };
  }
  if (!IS_WINDOWS) {
    return { runner: 'native', reason: '非 Windows：纯 Node 引擎，逻辑与 dev.sh 等价且无外部命令依赖' };
  }
  if (env.gitBash) {
    return {
      runner: 'native',
      reason: 'Windows + Git Bash：引擎已跨平台，原生 Node 不依赖 lsof/nc，比 bash 更稳（DEV_RUNNER=git-bash 可切回 .sh）',
    };
  }
  if (env.wsl) {
    return {
      runner: 'native',
      reason: 'Windows 仅有 WSL 转发器：不走 wsl.exe（路径映射 / localhost 代理告警 / WSL 内需重装 pnpm）',
    };
  }
  return { runner: 'native', reason: 'Windows 无 bash：纯 Node 引擎，不依赖 cmd / PowerShell 逻辑分叉' };
}

function runNative() {
  return runStack({ quietHeader: true });
}

function runGitBash(env, extraArgs) {
  const script = path.join(REPO_ROOT, 'scripts', 'dev.sh');
  log(paint('36', `🐚 使用 Git Bash：${env.gitBash.path}`));
  const child = spawn(env.gitBash.path, [script, ...extraArgs], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    windowsHide: true,
  });
  return new Promise((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      log(paint('31', `❌ Git Bash 启动失败：${err.message}`));
      resolve(1);
    });
  });
}

/** WSL 需要把 Windows 路径转成 /mnt/<drive>/... ，并且先 cd 进仓库。 */
function runWsl(extraArgs) {
  const wslPath = REPO_ROOT.replace(/^([A-Za-z]):\\/, (_, d) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, '/');
  log(paint('36', `🐧 使用 WSL：wsl.exe --cd ${wslPath} bash scripts/dev.sh`));
  const child = spawn('wsl.exe', ['--cd', wslPath, 'bash', 'scripts/dev.sh', ...extraArgs], {
    stdio: 'inherit',
    windowsHide: true,
  });
  return new Promise((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      log(paint('31', `❌ WSL 启动失败：${err.message}`));
      resolve(1);
    });
  });
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const env = probeEnvironment();
  const { runner, reason } = decideRunner(env, process.env.DEV_RUNNER);

  if (args.includes('--help') || args.includes('-h')) {
    log('用法：pnpm dev [--check]');
    log('  --check   只打印环境判别矩阵，不启动服务');
    log('  环境变量：DEV_RUNNER=auto|native|git-bash|bash|wsl');
    return 0;
  }

  if (args.includes('--check')) {
    log('');
    log(paint('35', `  runner 决策 : ${runner}`));
    log(paint('35', `  决策理由    : ${reason}`));
    printCheckReport(env, runner, reason);
    return 0;
  }

  switch (runner) {
    case 'git-bash':
    case 'bash':
      if (!env.gitBash) {
        log(paint('33', '⚠️  DEV_RUNNER 要求 Git Bash，但未检测到；回退到纯 Node 引擎。'));
        return runNative();
      }
      return runGitBash(env, args);
    case 'wsl':
      if (!env.wsl) {
        log(paint('33', '⚠️  DEV_RUNNER 要求 WSL，但未检测到；回退到纯 Node 引擎。'));
        return runNative();
      }
      return runWsl(args);
    case 'native':
    default:
      return runNative();
  }
}

main().then((code) => {
  process.exitCode = code;
});
