'use strict';

/**
 * scripts/run-sh.cjs
 *
 * 通用 `.sh` 运行器：给那些本质是 Linux/部署工具链、无法跨平台重写的脚本
 * （offline-deploy.sh / pack-*.sh / initdb.sh 等）提供一个统一的入口和明确的报错。
 *
 * 用法： node scripts/run-sh.cjs <脚本相对路径> [参数...]
 *
 * 判别顺序（Windows）：
 *   1. DEV_RUNNER=git-bash 或检测到 Git Bash → 用真 bash 执行（首选）
 *   2. 否则如果明确允许 WSL（DEV_RUNNER=wsl 或 ALLOW_WSL=1）→ wsl.exe 执行
 *   3. 否则直接报错并给出安装/启用提示，绝不静默走 WSL 转发器
 *
 * 为什么默认不自动用 WSL：wsl.exe 会把 Windows 路径当 Linux 路径，
 * 且 WSL 内的 pnpm/node 与 Windows 侧不是同一套，容易出难查的问题。
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

const { probeEnvironment, REPO_ROOT } = require('./lib/dev-core.cjs');

const IS_WINDOWS = process.platform === 'win32';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.stdout.write('用法：node scripts/run-sh.cjs <脚本相对路径> [参数...]\n');
    return 2;
  }

  const scriptRel = args[0];
  const scriptAbs = path.resolve(REPO_ROOT, scriptRel);
  const scriptArgs = args.slice(1);
  const env = probeEnvironment();

  if (!IS_WINDOWS) {
    const child = spawn('/bin/bash', [scriptAbs, ...scriptArgs], { cwd: REPO_ROOT, stdio: 'inherit' });
    return new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)));
  }

  const wantBash = (process.env.DEV_RUNNER || 'auto') !== 'wsl' && Boolean(env.gitBash);
  if (wantBash) {
    const child = spawn(env.gitBash.path, [scriptAbs, ...scriptArgs], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    return new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)));
  }

  const allowWsl = process.env.DEV_RUNNER === 'wsl' || process.env.ALLOW_WSL === '1';
  if (allowWsl && env.wsl) {
    const wslPath = REPO_ROOT.replace(/^([A-Za-z]):\\/, (_, d) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, '/');
    const child = spawn('wsl.exe', ['--cd', wslPath, 'bash', scriptRel, ...scriptArgs], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    return new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)));
  }

  process.stdout.write(
    [
      '',
      `❌ ${scriptRel} 是 Unix shell 脚本，当前 Windows 环境没有可用的 bash。`,
      '',
      '   三个选择：',
      '   1) 安装 Git for Windows（含 Git Bash），然后重跑本命令；',
      '   2) 显式走 WSL：$env:ALLOW_WSL=1; pnpm <script>  或  $env:DEV_RUNNER="wsl"; pnpm <script>；',
      `   3) 只在 Linux/macOS/CI 上执行该脚本。`,
      '',
      `   （脚本路径：${scriptAbs}）`,
      '',
    ].join('\n'),
  );
  return 1;
}

main().then((code) => {
  process.exitCode = code;
});
