'use strict';

/**
 * scripts/preview.cjs
 *
 * `pnpm start` 的唯一入口：生产构建预览（等价于原 scripts/preview.sh）。
 *   1) 先起 backend，等端口就绪
 *   2) 再用 vite preview 提供 frontend/dist（端口 29527）
 *
 * 前置：pnpm --filter ./frontend build
 *
 * 与 dev.cjs 的区别只有前端那一步用 preview 而不是 dev；
 * 其余（跨平台进程树、健康检查、Ctrl+C 清理）完全复用 lib/dev-core.cjs。
 */

const { probeEnvironment, runStack } = require('./lib/dev-core.cjs');

async function main() {
  const env = probeEnvironment();
  if (!env.nodeOk) {
    process.stdout.write(`❌ Node ${env.node} 低于 backend 要求的 >= 22.13，请先升级 Node。\n`);
    return 1;
  }
  return runStack({
    mode: 'preview',
    header: `[mode] preview — backend（nodemon）+ vite preview（frontend/dist，端口 29527）`,
  });
}

main().then((code) => {
  process.exitCode = code;
});
