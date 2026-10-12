'use strict';

/**
 * scripts/test-killdev-matcher.cjs
 *
 * killdev 的进程匹配自测。这里的用例全部来自真实踩过的坑：
 *   - DeepSeek Harness / Cursor 的 node.exe 里包含 "node"，不能被误判成本仓库入口；
 *   - powershell -Command "node scripts/dev.cjs" 只是包装器，不是根进程；
 *   - cmd /d /s /c node scripts/dev.cjs 才是真正的根进程；
 *   - 别的仓库的 nodemon / vite 命令行不能被误判。
 *
 * 运行：node scripts/test-killdev-matcher.cjs
 */

const assert = require('node:assert');

const { isDevRoot, baseName, collectDescendants, REPO_ROOT } = require('./killdev.cjs');

const repo = REPO_ROOT;
const repoFwd = repo.replace(/\\/g, '/');

const CASES = [
  // ---- 应当命中：本仓库 dev 入口 ----
  ['node scripts/dev.cjs', true, 'pnpm 包装出的直接入口'],
  ['C:\\Windows\\system32\\cmd.exe /d /s /c node scripts/dev.cjs', true, 'cmd 包装（Windows 实际形态）'],
  ['C:\\Windows\\System32\\cmd.exe /d /s /c "node scripts/dev.cjs"', true, '带引号的 cmd 包装'],
  [`node ${repoFwd}/scripts/dev.cjs`, true, '绝对路径入口'],
  [`node ${repoFwd}\\scripts\\preview.cjs`, true, 'preview 绝对路径'],
  ['node scripts/preview.cjs', true, 'preview 相对路径'],
  ['node scripts/killdev.cjs', true, 'killdev 自身入口'],
  [`"C:\\Program Files\\Git\\bin\\bash.exe" ${repoFwd}/scripts/dev.sh`, true, 'Git Bash 跑 dev.sh'],
  ['bash scripts/dev.sh', false, 'POSIX 相对 bash（无绝对路径，无法确认是本仓库）'],
  ['"node"   "C:\\Users\\x\\AppData\\Roaming\\npm\\\\node_modules\\pnpm\\bin\\pnpm.mjs" --filter ./frontend dev', true, 'pnpm --filter frontend dev'],
  ['C:\\Windows\\system32\\cmd.exe /d /s /c "pnpm --filter ./frontend dev"', true, 'cmd 包装的 pnpm --filter'],
  ['"C:\\Program Files\\nodejs\\node.exe" C:\\Users\\x\\AppData\\Roaming\\npm/node_modules/pnpm/bin/pnpm.mjs --filter ./backend dev', true, 'pnpm --filter backend dev'],

  // ---- 不应命中：同类但无关的进程 ----
  ['node  scripts/other.cjs', false, '同目录但不是 dev 入口'],
  ['node scripts/dev.js', false, '扩展名不同'],
  ['node /home/x/other/scripts/dev.cjs', false, '别的仓库（绝对路径不在本仓库）'],
  ['/usr/bin/node /srv/other/scripts/dev.cjs', false, '别的仓库 POSIX 路径'],
  ['node -e "require(\'./killdev.cjs\')"', false, '内联 node -e 脚本'],
  [
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoLogo -NoProfile -NonInteractive -Command node scripts/dev.cjs --check',
    false,
    'powershell -Command 只是包装器',
  ],
  [
    '"C:\\Users\\x\\AppData\\Local\\Programs\\DeepSeek Harness\\DeepSeek Harness.exe" "C:\\Users\\x\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\app.asar\\dsh\\bin\\node.exe" Electron',
    false,
    'DeepSeek Harness 的 node.exe（曾经的误杀目标）',
  ],
  [
    'c:\\Users\\x\\AppData\\Local\\Programs\\cursor\\resources\\app\\resources\\helpers\\node.exe --max-old-space-size=3072 -e "require(process.argv[1])" tsserver.js',
    false,
    'Cursor 的 tsserver',
  ],
  ['node   "D:\\Other\\project\\node_modules\\.bin\\\\..\\nodemon\\bin\\nodemon.js" "src/app.js"', false, '别的仓库 nodemon'],
  ['node   "D:\\Other\\project\\frontend\\node_modules\\.bin\\\\..\\vite\\bin\\vite.js" --host', false, '别的仓库 vite'],
  ['C:\\Windows\\system32\\cmd.exe /d /s /c "D:\\Other\\backend\\node_modules\\.bin\\nodemon.cmd src/app.js"', false, '别的仓库 nodemon.cmd'],
  ['pnpm --filter ./other dev', false, '别的 filter'],
  ['pnpm install', false, '不是 dev/preview'],
  ['pnpm dev', false, '根入口已被 dev.cjs 取代，不再是根进程'],
];

const DESCENDANT_CASES = [
  {
    name: 'pnpm → dev.cjs → cross-env → nodemon → node',
    rows: [
      { pid: 1, ppid: 0, command: 'node scripts/dev.cjs' },
      { pid: 2, ppid: 1, command: 'node .../nodemon/bin/nodemon.js src/app.js' },
      { pid: 3, ppid: 2, command: 'node src/app.js' },
      { pid: 9, ppid: 0, command: 'unrelated' },
    ],
    roots: [1],
    expect: [1, 2, 3],
  },
];

function main() {
  let failed = 0;

  for (const [command, expected, label] of CASES) {
    const actual = isDevRoot(command);
    if (actual === expected) continue;
    failed += 1;
    process.stdout.write(`❌ ${label}\n   期望 ${expected} 实际 ${actual}\n   ${command}\n`);
  }

  for (const tc of DESCENDANT_CASES) {
    const got = [...collectDescendants(tc.rows, new Set(tc.roots))].sort((a, b) => a - b);
    try {
      assert.deepStrictEqual(got, tc.expect);
    } catch {
      failed += 1;
      process.stdout.write(`❌ ${tc.name}: 期望 ${tc.expect} 实际 ${got}\n`);
    }
  }

  const nameSamples = [
    ['"C:\\Program Files\\nodejs\\node.exe" src/app.js', 'node.exe'],
    ['C:\\Windows\\system32\\cmd.exe /d /s /c vite --host', 'cmd.exe'],
  ];
  for (const [command, expected] of nameSamples) {
    const got = baseName(command);
    if (got !== expected) {
      failed += 1;
      process.stdout.write(`❌ baseName(${command}) = ${got}，期望 ${expected}\n`);
    }
  }

  const total = CASES.length + DESCENDANT_CASES.length + nameSamples.length;
  if (failed === 0) {
    process.stdout.write(`✅ killdev 匹配自测通过（${total} 项）\n`);
    process.exitCode = 0;
    return;
  }
  process.stdout.write(`❌ killdev 匹配自测失败 ${failed}/${total}\n`);
  process.exitCode = 1;
}

main();
