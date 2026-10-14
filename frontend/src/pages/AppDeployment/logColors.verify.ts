/**
 * 发布控制台日志配色回归验证（node --import tsx src/pages/AppDeployment/logColors.verify.ts）
 *
 * 背景：docker buildx / pnpm 的「进度信息」写在 stderr，早先一律按浅红渲染，
 * 被误读成报错。这里锁定：真错误=浅红、警告=浅黄、其余 stderr=浅绿、stdout=默认色。
 */
import assert from 'node:assert/strict';
import { LOG_COLOR, logLineColor } from './components/logColors';
import type { PackLogLine } from '@/services/UAC/api/appDeployment';

const stderr = (text: string): PackLogLine => ({ seq: 1, stream: 'stderr', text, at: '' });
const stdout = (text: string): PackLogLine => ({ seq: 1, stream: 'stdout', text, at: '' });

/* docker buildx 进度（真实日志里出现过的行）→ 浅绿 */
const progressLines = [
  '#0 building with "desktop-linux" instance using docker driver',
  '#1 [internal] load build definition from Dockerfile.bff',
  '#1 transferring dockerfile: 1.61kB done',
  '#1 DONE 0.0s',
  '#2 [internal] load metadata for docker.io/library/node:22-bookworm',
  '#3 transferring context: 133B done',
  '#7 exporting to image',
  '#7 DONE 0.2s',
  'View build details: docker-desktop://dashboard/build/desktop-linux/desktop-linux/xxx',
];
for (const text of progressLines) {
  assert.equal(logLineColor(stderr(text)), LOG_COLOR.info, `stderr 进度信息应为浅绿：${text}`);
}

/* 真错误 → 浅红（stdout / stderr 都要认） */
const errorLines = [
  '[ERR] 缺少命令: rsync',
  '[ERR] Docker 没有启动。请先打开 Docker Desktop，等引擎起来后再打包。',
  'ERROR: failed to solve: process "/bin/sh -c pnpm install" did not complete successfully: exit code: 1',
  'error: unknown flag: --platform',
  'Failed to install dependencies',
  'no such file or directory',
  'fatal: not a git repository',
  '打包失败',
  '命令失败: tar',
  '失败：docker 未启动',
];
for (const text of errorLines) {
  assert.equal(logLineColor(stderr(text)), LOG_COLOR.error, `错误行应为浅红：${text}`);
  assert.equal(logLineColor(stdout(text)), LOG_COLOR.error, `错误行（stdout）也应为浅红：${text}`);
}

/* 警告 → 浅黄 */
for (const text of [
  '[WARN] 未检测到 rsync（Git for Windows 不自带），改用 Node 复制器 scripts/deploy/copy-tree.cjs',
  '[WARN] 未能下载 docker-compose 静态二进制，已写入 docker compose 插件回退包装',
  'npm warn deprecated inflight@1.0.6',
]) {
  assert.equal(logLineColor(stderr(text)), LOG_COLOR.warn, `警告行应为浅黄：${text}`);
}

/* 普通 stdout → 默认色 */
for (const text of [
  '摘要',
  '  版本: 1.2.7（来源: package.json（仓库根））',
  '==== 完成 ====',
  '压缩包: /srv/uac2/packages/EADAF/eadaf-offline-compose-patch-web-amd64-v1.2.7-20261015-0412.tar.gz',
  'docker save fpcu2-bff:v1 -> fpcu2-bff_v1.tar',
]) {
  assert.equal(logLineColor(stdout(text)), LOG_COLOR.normal, `stdout 普通输出应为默认色：${text}`);
}

/* 边界：成功统计 / 假设句里的「失败」不能标红 */
assert.equal(logLineColor(stdout('Found 0 errors')), LOG_COLOR.normal, '「0 errors」不应标红');
assert.equal(logLineColor(stderr('Found 0 errors')), LOG_COLOR.info, 'stderr 的「0 errors」按进度色');
assert.equal(
  logLineColor(
    stdout(
      '==== 容器 npm registry 用项目自带的 .npmrc: https://registry.npmjs.org/（如拉包失败，用 EADAF_NPM_REGISTRY=... pnpm pack:app 覆盖） ====',
    ),
  ),
  LOG_COLOR.normal,
  '「如拉包失败」这类提示不应标红',
);
assert.equal(logLineColor(stderr('')), LOG_COLOR.info, '空行不炸');

console.log('logColors 验证通过：进度浅绿 / 警告浅黄 / 错误浅红');
