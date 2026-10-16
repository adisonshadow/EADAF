/**
 * 一条命令同时起 BFF 与 Vite（开发用）。
 *
 *   pnpm --filter ./app_example dev:all
 *
 * BFF:  http://localhost:29530（/auth、/api）
 * Vite: http://localhost:29529（前端；把 /auth、/api 代理给 BFF）
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');

const children = [];

function run(command, args, name) {
  const child = spawn(command, args, {
    cwd: appDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  const prefix = `[${name}] `;
  const pipe = (stream, target) => {
    stream.setEncoding('utf8');
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach((line) => target.write(`${prefix}${line}\n`));
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}退出（code=${code}），一并停止另一个进程`);
    shutdown();
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach((child) => {
    if (!child.killed) child.kill('SIGTERM');
  });
  setTimeout(() => process.exit(0), 200);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run(process.execPath, ['--env-file=.env', 'server/index.mjs'], 'bff');
run(process.execPath, [path.join(appDir, 'node_modules', 'vite', 'bin', 'vite.js')], 'web');
