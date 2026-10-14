'use strict';

/**
 * 应用部署（导航「应用部署」）后端能力：
 * - 状态探测：DEV 模式、平台/应用默认版本（各自 package.json）、bash / pnpm 可用性、脚本与输出目录；
 * - 应用目录校验：读 eadaf.app.yaml + 应用 package.json，给「发布应用」页预填参数；
 * - 触发打包：拼装 pack-eadaf.sh / pack-app.sh 参数后交给 packJobService 执行。
 *
 * 前置条件：仅 DEV 模式（后端 NODE_ENV=development）可用，服务端强制校验。
 */

const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { isPlatformDevMode } = require('../../utils/ssoRedirectUri');
const packJobService = require('./packJobService');
const {
  REPO_ROOT,
  resolveBash,
  resolvePnpm,
  readPackageVersion,
  fileExists,
  dirExists,
} = require('./packRuntime');

const execFileAsync = promisify(execFile);

const PLATFORM_SCRIPT = 'scripts/deploy/pack-eadaf.sh';
const APP_SCRIPT = 'scripts/deploy/pack-app.sh';
const MANIFEST_READER = path.join(REPO_ROOT, 'scripts', 'deploy', 'read-app-manifest.cjs');
const PLATFORM_DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'packages', 'EADAF');
const APP_DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'packages', 'APP');

const ENUMS = {
  network: ['offline', 'online'],
  runtime: ['compose', 'k8s'],
  os: ['centos', 'ubuntu', 'debian'],
  arch: ['amd64', 'arm64'],
  kind: ['install', 'upgrade', 'patch'],
  patch: ['web', 'api'],
};
const DEFAULT_WEB_PORT = 9527;
const DEFAULT_API_PORT = 9526;

let exitHookInstalled = false;

function installExitHook() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  // 后端进程退出时顺手结束仍在跑的打包子进程，避免留下孤儿 docker build
  process.on('exit', () => packJobService.shutdown());
}

function bad(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function pickEnum(value, allowed, field, fallback) {
  const raw = value === undefined || value === null || value === '' ? fallback : String(value).trim().toLowerCase();
  if (!allowed.includes(raw)) {
    throw bad(`${field} 只能是 ${allowed.join(' / ')}，收到「${value}」`);
  }
  return raw;
}

function normalizeVersion(value, fallback) {
  const raw = value === undefined || value === null || String(value).trim() === ''
    ? fallback
    : String(value).trim();
  if (!raw) throw bad('版本不能为空');
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(raw)) {
    throw bad('版本只能包含字母、数字与 . _ + -（不能有空格或引号）');
  }
  return raw;
}

function normalizePort(value, fallback, field) {
  const raw = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(raw) || raw < 1 || raw > 65535) {
    throw bad(`${field} 需要 1~65535 的整数端口`);
  }
  return raw;
}

function normalizePatchParts(value, kind) {
  if (kind !== 'patch') return [];
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const parts = [];
  for (const item of list) {
    const part = String(item).trim().toLowerCase();
    if (!part) continue;
    if (!ENUMS.patch.includes(part)) throw bad(`补丁种类只能是 web / api，收到「${item}」`);
    if (part === 'bizdata') throw bad('数据补丁已停用，请改用「应用数据导出/导入」');
    if (!parts.includes(part)) parts.push(part);
  }
  if (!parts.length) throw bad('补丁包需要选择补丁种类（web / api）');
  return parts;
}

function normalizeDir(value, field, fallback) {
  const raw = String(value === undefined || value === null ? '' : value).trim() || fallback;
  if (!raw) throw bad(`${field} 不能为空`);
  const abs = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(REPO_ROOT, raw);
  return abs;
}

function assertDevMode() {
  if (!isPlatformDevMode()) {
    throw Object.assign(
      new Error('发布平台 / 发布应用仅在 DEV 模式（后端 NODE_ENV=development）下可用'),
      { status: 403 },
    );
  }
}

/** 「应用部署」页初始化数据：DEV 模式、默认版本、bash/pnpm、脚本与输出目录。 */
function getStatus() {
  const bash = resolveBash();
  const pnpm = resolvePnpm();
  const platformVersion = readPackageVersion(REPO_ROOT);
  const devMode = isPlatformDevMode();
  const running = packJobService.runningJob();

  return {
    devMode,
    devModeHint: devMode
      ? null
      : '当前后端不是 DEV 模式（NODE_ENV 应为 development），发布平台 / 发布应用已停用。',
    repoRoot: REPO_ROOT,
    host: { platform: process.platform, arch: process.arch, node: process.version },
    bash,
    pnpm,
    platform: {
      version: platformVersion,
      versionSource: platformVersion ? 'package.json（仓库根）' : '未取到 package.json version',
      packageJson: path.join(REPO_ROOT, 'package.json'),
      script: PLATFORM_SCRIPT,
      defaultOutDir: PLATFORM_DEFAULT_OUT_DIR,
      packCommand: 'pnpm pack:eadaf',
      defaultWebPort: DEFAULT_WEB_PORT,
      defaultApiPort: DEFAULT_API_PORT,
    },
    app: {
      script: APP_SCRIPT,
      defaultOutDir: APP_DEFAULT_OUT_DIR,
      packCommand: 'pnpm pack:app',
      manifestFileName: 'eadaf.app.yaml',
      defaultWebPort: DEFAULT_WEB_PORT,
      defaultApiPort: DEFAULT_API_PORT,
    },
    enums: ENUMS,
    runningJob: running ? packJobService.getJob(running.id) : null,
  };
}

/** 校验应用目录并读取 eadaf.app.yaml + 应用 package.json（版本以 package.json 为准）。 */
async function inspectAppDir(rawDir) {
  const appDir = normalizeDir(rawDir, '应用目录', null);
  if (!dirExists(appDir)) throw bad(`应用目录不存在或不是目录：${appDir}`);

  const manifestPath = path.join(appDir, 'eadaf.app.yaml');
  if (!fileExists(manifestPath)) {
    throw bad(`应用目录缺少 eadaf.app.yaml：${manifestPath}`);
  }

  let manifest = {};
  try {
    const { stdout } = await execFileAsync(process.execPath, [MANIFEST_READER, manifestPath], {
      cwd: appDir,
      maxBuffer: 1024 * 1024,
    });
    manifest = JSON.parse(stdout);
  } catch (error) {
    const detail = (error.stderr || error.message || '').toString().trim().split('\n').slice(0, 3).join(' ');
    throw bad(`读取 eadaf.app.yaml 失败：${detail}`);
  }

  const appPackageVersion = readPackageVersion(appDir);
  const manifestVersion = manifest.version ? String(manifest.version).trim() : null;
  const appVersion = appPackageVersion || manifestVersion || '0.0.0';
  const versionSource = appPackageVersion
    ? 'package.json（应用仓库根）'
    : manifestVersion
      ? 'eadaf.app.yaml（回退）'
      : '默认 0.0.0';

  return {
    appDir,
    manifestPath,
    manifest,
    appName: manifest.name || path.basename(appDir),
    applicationCode: manifest.applicationCode || null,
    preset: manifest.preset || null,
    appVersion,
    appPackageVersion,
    manifestVersion,
    versionSource,
    appPackageJson: path.join(appDir, 'package.json'),
    webPort: manifest.webPort ? Number(manifest.webPort) : null,
    apiPort: manifest.apiPort ? Number(manifest.apiPort) : null,
  };
}

function startPlatformPack(input = {}) {
  assertDevMode();
  installExitHook();

  const network = pickEnum(input.network, ENUMS.network, '网络', 'offline');
  const runtime = pickEnum(input.runtime, ENUMS.runtime, '运行方式', 'compose');
  const osName = pickEnum(input.os, ENUMS.os, '发行版', 'centos');
  const arch = pickEnum(input.arch, ENUMS.arch, '架构', 'amd64');
  const kind = pickEnum(input.kind, ENUMS.kind, '种类', 'install');
  const patchParts = normalizePatchParts(input.patch, kind);
  const webPort = kind === 'install' ? normalizePort(input.webPort, DEFAULT_WEB_PORT, '前端端口') : null;
  const apiPort = kind === 'install' ? normalizePort(input.apiPort, DEFAULT_API_PORT, '后端端口') : null;
  const version = normalizeVersion(input.version, readPackageVersion(REPO_ROOT) || '0.0.0');
  const outDir = normalizeDir(input.outDir, '输出目录', PLATFORM_DEFAULT_OUT_DIR);

  const scriptArgs = ['--network', network, '--runtime', runtime, '--os', osName, '--arch', arch, '--kind', kind];
  if (patchParts.length) scriptArgs.push('--patch', patchParts.join(','));
  if (kind === 'install') scriptArgs.push('--web-port', String(webPort), '--api-port', String(apiPort));
  scriptArgs.push('--version', version, '--out', outDir, '--non-interactive', '--yes');

  return packJobService.startJob({
    kind: 'platform',
    label: `发布平台 · ${kind}${patchParts.length ? `(${patchParts.join('+')})` : ''} · ${arch}`,
    scriptRel: PLATFORM_SCRIPT,
    scriptArgs,
    bashPathArgIndexes: [scriptArgs.indexOf(outDir)],
    version,
    outDir,
    pnpmCommand: `pnpm pack:eadaf -- ${scriptArgs.join(' ')}`,
    env: { EADAF_PACK_NONINTERACTIVE: '1' },
    meta: { network, runtime, os: osName, arch, kind, patch: patchParts, webPort, apiPort },
  });
}

async function startAppPack(input = {}) {
  assertDevMode();
  installExitHook();

  const inspected = await inspectAppDir(input.appDir);
  const arch = pickEnum(input.arch, ENUMS.arch, '架构', 'amd64');
  const kind = pickEnum(input.kind, ENUMS.kind, '种类', 'install');
  const patchParts = normalizePatchParts(input.patch, kind);
  const webPort = kind === 'install'
    ? normalizePort(input.webPort, inspected.webPort || DEFAULT_WEB_PORT, '应用前端端口')
    : null;
  const apiPort = kind === 'install'
    ? normalizePort(input.apiPort, inspected.apiPort || DEFAULT_API_PORT, '应用后端端口')
    : null;
  const version = normalizeVersion(input.version, inspected.appVersion);
  const outDir = normalizeDir(input.outDir, '输出目录', APP_DEFAULT_OUT_DIR);

  const scriptArgs = ['--app-dir', inspected.appDir, '--arch', arch, '--kind', kind];
  if (patchParts.length) scriptArgs.push('--patch', patchParts.join(','));
  if (kind === 'install') scriptArgs.push('--web-port', String(webPort), '--api-port', String(apiPort));
  scriptArgs.push('--version', version, '--out', outDir, '--non-interactive', '--yes');

  return packJobService.startJob({
    kind: 'app',
    label: `发布应用 · ${inspected.appName} · ${kind}${patchParts.length ? `(${patchParts.join('+')})` : ''} · ${arch}`,
    scriptRel: APP_SCRIPT,
    scriptArgs,
    bashPathArgIndexes: [scriptArgs.indexOf(inspected.appDir), scriptArgs.indexOf(outDir)],
    version,
    outDir,
    pnpmCommand: `pnpm pack:app -- ${scriptArgs.join(' ')}`,
    env: {},
    meta: {
      appName: inspected.appName,
      applicationCode: inspected.applicationCode,
      preset: inspected.preset,
      appDir: inspected.appDir,
      versionSource: inspected.versionSource,
      arch,
      kind,
      patch: patchParts,
      webPort,
      apiPort,
    },
  });
}

module.exports = {
  ENUMS,
  PLATFORM_DEFAULT_OUT_DIR,
  APP_DEFAULT_OUT_DIR,
  assertDevMode,
  getStatus,
  inspectAppDir,
  startPlatformPack,
  startAppPack,
};
