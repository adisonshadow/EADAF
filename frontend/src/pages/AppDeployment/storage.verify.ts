/**
 * 应用部署浏览器缓存层回归验证
 * （node --import tsx src/pages/AppDeployment/storage.verify.ts）
 *
 * 覆盖：打包历史的新增/去重/按类型过滤/移除/清空、脏数据降级、
 * 「应用 → 项目目录」多键记忆，以及目标目录示例的展示辅助。
 */
import assert from 'node:assert/strict';
import {
  clearPackHistory,
  listKnownAppDirs,
  readAppDirMap,
  readPackHistory,
  rememberAppDir,
  removePackHistory,
  toHistoryRecord,
  upsertPackHistory,
  type PackHistoryRecord,
} from './storage';
import { aliasProjectPath, describePackMeta, joinProjectPath } from './components/packOptions';
import type { PackJob } from '@/services/EADAF/api/appDeployment';

/* localStorage 替身（storage.ts 只依赖 window.localStorage） */
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  },
};

const HISTORY_KEY = 'eadaf.app-deployment.pack-history.v1';
const APP_DIR_KEY = 'eadaf.app-deployment.app-dirs.v1';

const platformJob: PackJob = {
  id: 'job-1',
  kind: 'platform',
  label: '发布平台 · 安装包 · amd64',
  command: 'pnpm pack:eadaf -- --kind install',
  spawnCommand: '',
  status: 'succeeded',
  exitCode: 0,
  startedAt: '2026-10-15T03:20:00.000Z',
  finishedAt: '2026-10-15T03:21:00.000Z',
  version: '1.2.7',
  outDir: '/srv/uac2/deploy-artifacts/EADAF',
  artifact: {
    dir: '/srv/uac2/deploy-artifacts/EADAF',
    file: 'eadaf-offline-compose-install-amd64-v1.2.7-20261015-0320.tar.gz',
    path: '/srv/uac2/deploy-artifacts/EADAF/eadaf-offline-compose-install-amd64-v1.2.7-20261015-0320.tar.gz',
    size: 12 * 1024 * 1024,
    mtime: '2026-10-15T03:21:00.000Z',
  },
  error: null,
  droppedBefore: 0,
  nextSeq: 10,
  logFile: '/tmp/eadaf-pack-logs/platform-job-1.log',
  meta: {
    kind: 'install',
    arch: 'amd64',
    network: 'offline',
    runtime: 'compose',
    os: 'centos',
    patch: [],
  },
};

/* 1) 历史：新增 / 去重 / 过滤 / 移除 / 清空 */
assert.deepEqual(readPackHistory(), [], '初始历史为空');
upsertPackHistory(toHistoryRecord(platformJob, describePackMeta('platform', platformJob.meta)));
const afterFirst = readPackHistory();
assert.equal(afterFirst.length, 1, '新增一条历史');
assert.equal(afterFirst[0].artifactFile, platformJob.artifact?.file, '产物文件名入库');
assert.equal(afterFirst[0].artifactDir, platformJob.artifact?.dir, '目标目录入库');
assert.equal(afterFirst[0].summary, '安装包 · amd64 · 离线 / Compose · centos', '配置摘要入库');

upsertPackHistory(
  toHistoryRecord({ ...platformJob, status: 'failed' }, '重试'),
);
assert.equal(readPackHistory().length, 1, '同一 jobId 覆盖，不重复');
assert.equal(readPackHistory()[0].status, 'failed', '覆盖后状态更新');
assert.equal(readPackHistory()[0].summary, '重试', '覆盖后摘要更新');

const appJob: PackJob = {
  ...platformJob,
  id: 'job-2',
  kind: 'app',
  label: '发布应用 · fpcu2',
  meta: { kind: 'patch', patch: ['web'], arch: 'arm64', appName: 'fpcu2', applicationCode: 'FPCU' },
};
upsertPackHistory(toHistoryRecord(appJob, describePackMeta('app', appJob.meta)));
assert.equal(readPackHistory('app').length, 1, '按 kind 过滤（app）');
assert.equal(readPackHistory('platform').length, 1, '按 kind 过滤（platform）');
assert.equal(readPackHistory()[0].jobId, 'job-2', '新记录排在最前');
assert.equal(readPackHistory('app')[0].appName, 'fpcu2', '业务应用名入库');

removePackHistory('job-2');
assert.equal(readPackHistory().length, 1, '按 jobId 移除');
clearPackHistory('app');
assert.equal(readPackHistory().length, 1, '清空某 kind 不影响另一 kind');
clearPackHistory();
assert.equal(readPackHistory().length, 0, '全量清空');

/* 2) 脏数据容错 */
store.set(HISTORY_KEY, '{oops');
assert.deepEqual(readPackHistory(), [], '历史 JSON 损坏时降级为空');
store.set(HISTORY_KEY, JSON.stringify([{ foo: 1 }, null, 'x']));
assert.deepEqual(readPackHistory(), [], '历史结构不对时过滤掉');
store.set(APP_DIR_KEY, '[]');
assert.deepEqual(readAppDirMap(), {}, '目录映射为数组时降级为空对象');
store.delete(APP_DIR_KEY);

/* 3) 应用 → 项目目录记忆（多键索引） */
assert.deepEqual(readAppDirMap(), {}, '初始映射为空');
rememberAppDir(['app-id-1', 'FPCU', '生物特征采集设备平台'], '/srv/repos/fpcu2');
const map = readAppDirMap();
assert.equal(map['app-id-1'], '/srv/repos/fpcu2', '按 applicationId 记住');
assert.equal(map.FPCU, '/srv/repos/fpcu2', '按 code 记住');
assert.equal(map['生物特征采集设备平台'], '/srv/repos/fpcu2', '按名称记住');
rememberAppDir(['app-id-2', null, undefined, ''], '/srv/repos/other');
assert.equal(readAppDirMap()['app-id-2'], '/srv/repos/other', '空键被忽略');
assert.equal(listKnownAppDirs().length, 2, '反查用过的应用目录（按目录去重）');

/* 4) 展示辅助：目标目录默认按项目地址拼、示例里不出现具体机器路径 */
assert.equal(joinProjectPath('/srv/uac2', 'deploy-artifacts/EADAF'), '/srv/uac2/deploy-artifacts/EADAF');
assert.equal(joinProjectPath('D:\\DEV\\EADAF', 'deploy-artifacts/APP'), 'D:\\DEV\\EADAF\\deploy-artifacts\\APP');
assert.equal(joinProjectPath('', 'deploy-artifacts/APP'), 'deploy-artifacts/APP');
assert.equal(
  aliasProjectPath('/srv/uac2/deploy-artifacts/APP', '/srv/uac2'),
  '<项目目录>/deploy-artifacts/APP',
);
assert.equal(
  aliasProjectPath('D:\\DEV\\EADAF\\deploy-artifacts\\EADAF', 'D:\\DEV\\EADAF'),
  '<项目目录>/deploy-artifacts/EADAF',
);
assert.equal(aliasProjectPath('/other/path', '/srv/uac2'), '/other/path');
assert.equal(
  describePackMeta('platform', {
    kind: 'patch',
    patch: ['web', 'api'],
    arch: 'amd64',
    network: 'offline',
    runtime: 'compose',
    os: 'centos',
  }),
  '补丁包 · web+api · amd64 · 离线 / Compose · centos',
);
assert.equal(
  describePackMeta('app', { kind: 'install', arch: 'arm64', preset: 'fpcu2' }),
  '安装包 · arm64 · preset fpcu2',
);

/* 类型自检：记录形状与历史存储一致 */
const sample: PackHistoryRecord = readPackHistory()[0] as PackHistoryRecord;
assert.equal(sample, undefined, '清空后没有记录');

console.log('storage 验证通过：打包历史 / 应用目录记忆 / 目标目录拼接');
