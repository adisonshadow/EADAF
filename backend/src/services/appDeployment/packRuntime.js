'use strict';

/**
 * 应用部署（打包）运行时探测：仓库根、bash、pnpm、版本号读取、路径形态转换。
 *
 * 为什么单独一层：`pnpm pack:eadaf` / `pnpm pack:app` 本质是 Unix 脚本
 * （scripts/deploy/*.sh），现在改由后端在开发机（DEV 模式）上代跑，因此需要
 * 先确认本机有可用的 bash 与 pnpm；同时要处理 MSYS 路径问题——
 * Git Bash 下脚本内的 `$REPO_ROOT` 是 `/d/DEV/EADAF` 这类路径，
 * 直接交给 Windows 版 Node（require('/d/.../package.json')）必然取不到版本，
 * 反之把 `D:\...` 直接交给 MSYS 脚本又会建出字面量目录名。
 * 故统一在这里做 bash 形态 ↔ 本地路径的转换。
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const IS_WINDOWS = process.platform === 'win32';

const GIT_BASH_HINT =
  '未检测到可用的 bash。请安装 Git for Windows（含 Git Bash）后重试；'
  + '或显式允许 WSL：设置 DEV_RUNNER=wsl 或 ALLOW_WSL=1 后重启后端。';

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function whichAll(names) {
  const exts = IS_WINDOWS ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';') : [''];
  const dirs = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
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

/** Git for Windows 提供的真 bash（MSYS2）；排除 System32 下的 WSL 转发器。 */
function findGitBash() {
  const found = whichAll(['bash']);
  const fromPath = found.get('bash');
  if (fromPath) {
    const lower = fromPath.toLowerCase();
    if (!lower.includes('system32') && !lower.includes('sysnative')) {
      return fromPath;
    }
  }
  const candidates = [
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Git', 'usr', 'bin', 'bash.exe'),
    process.env['ProgramFiles(x86)']
      && path.join(process.env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'),
    process.env.LOCALAPPDATA
      && path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fileExists(candidate)) return candidate;
  }
  return null;
}

function findWsl() {
  const found = whichAll(['wsl']);
  if (found.get('wsl')) return found.get('wsl');
  return fileExists('C:\\Windows\\System32\\wsl.exe') ? 'C:\\Windows\\System32\\wsl.exe' : null;
}

/**
 * 解析可用于执行 .sh 的 bash。
 * @returns {{available: boolean, path: string|null, kind: 'bash'|'git-bash'|'wsl'|null, hint: string|null}}
 */
function resolveBash() {
  if (!IS_WINDOWS) {
    for (const candidate of ['/bin/bash', '/usr/bin/bash', '/usr/local/bin/bash', '/opt/homebrew/bin/bash']) {
      if (fileExists(candidate)) return { available: true, path: candidate, kind: 'bash', hint: null };
    }
    const fromPath = whichAll(['bash']).get('bash');
    if (fromPath) return { available: true, path: fromPath, kind: 'bash', hint: null };
    return { available: false, path: null, kind: null, hint: GIT_BASH_HINT };
  }

  const wantWsl = process.env.DEV_RUNNER === 'wsl' || process.env.ALLOW_WSL === '1';
  if (!wantWsl) {
    const gitBash = findGitBash();
    if (gitBash) return { available: true, path: gitBash, kind: 'git-bash', hint: null };
    const wsl = findWsl();
    return {
      available: false,
      path: wsl,
      kind: null,
      hint: GIT_BASH_HINT,
    };
  }
  const wsl = findWsl();
  if (wsl) return { available: true, path: wsl, kind: 'wsl', hint: null };
  const gitBash = findGitBash();
  if (gitBash) return { available: true, path: gitBash, kind: 'git-bash', hint: null };
  return { available: false, path: null, kind: null, hint: GIT_BASH_HINT };
}

/** 解析 pnpm 可执行文件（Windows 上是 pnpm.cmd）。 */
function resolvePnpm() {
  const fromPath = whichAll(['pnpm']).get('pnpm');
  if (fromPath) return { available: true, path: fromPath };
  return { available: false, path: null };
}

/** 本地 node_modules/.bin（spawn 时不经过 pnpm run，需要手动前置进 PATH）。 */
function localBinDirs() {
  return [path.join(REPO_ROOT, 'node_modules', '.bin'), path.join(REPO_ROOT, 'backend', 'node_modules', '.bin')]
    .filter((dir) => dirExists(dir));
}

/** 执行打包脚本时的子进程环境：前置 bin 目录，其余继承后端进程。 */
function buildSpawnEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  const sep = IS_WINDOWS ? ';' : ':';
  const prefix = localBinDirs().join(sep);
  const current = process.env.PATH || process.env.Path || '';
  env.PATH = prefix ? `${prefix}${sep}${current}` : current;
  if (IS_WINDOWS) env.Path = env.PATH;
  // 避免 pack 过程里 Git Bash 把交互式输出当管道处理时刷 CR
  env.LC_ALL = env.LC_ALL || 'C.UTF-8';
  return env;
}

/** 本地绝对路径 → bash 可识别路径（git-bash: /d/DEV/...；wsl: /mnt/d/DEV/...）。 */
function toBashPath(absPath, bashKind) {
  const normalized = String(absPath || '').replace(/\\/g, '/');
  if (!IS_WINDOWS) return normalized;
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (!match) return normalized;
  const drive = match[1].toLowerCase();
  const rest = match[2];
  if (bashKind === 'wsl') return `/mnt/${drive}/${rest}`;
  return `/${drive}/${rest}`;
}

/** bash 输出里的路径 → 本地绝对路径（仅用于展示日志里解析出的产物路径）。 */
function fromBashPath(bashPath) {
  const text = String(bashPath || '').trim();
  if (!IS_WINDOWS) return text;
  let m = /^\/mnt\/([a-zA-Z])\/(.*)$/.exec(text);
  if (m) return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}`;
  m = /^\/([a-zA-Z])\/(.*)$/.exec(text);
  if (m) return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}`;
  return text;
}

/** 读取某个目录 package.json 的 version；失败返回 null（不抛错，容忍 UTF-8 BOM）。 */
function readPackageVersion(dir) {
  try {
    const raw = fs.readFileSync(path.join(dir, 'package.json'), 'utf8').replace(/^\uFEFF/, '');
    const json = JSON.parse(raw);
    const version = typeof json.version === 'string' ? json.version.trim() : '';
    return version || null;
  } catch {
    return null;
  }
}

module.exports = {
  REPO_ROOT,
  IS_WINDOWS,
  GIT_BASH_HINT,
  fileExists,
  dirExists,
  whichAll,
  resolveBash,
  resolvePnpm,
  localBinDirs,
  buildSpawnEnv,
  toBashPath,
  fromBashPath,
  readPackageVersion,
};
