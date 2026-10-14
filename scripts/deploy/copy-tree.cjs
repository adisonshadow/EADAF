#!/usr/bin/env node
/**
 * scripts/deploy/copy-tree.cjs
 *
 * 复制目录树，支持 rsync 风格的 `--exclude`（按路径段匹配）。
 *
 * 为什么存在：`pack-app.sh` 的 fpcu2 预设在准备构建上下文时原先只依赖 `rsync`，
 * 而 Git for Windows 不自带 rsync，导致 Windows 上 `pnpm pack:app` 直接以
 * 「缺少命令: rsync」失败。这里用 Node 实现等价语义（Node 本来就是打包链路
 * 的硬依赖），保留修改时间与可执行位，并在 rsync 可用时仍优先用 rsync。
 *
 * 用法：
 *   node scripts/deploy/copy-tree.cjs --src <目录> --dest <目录> [--exclude <模式> ...]
 *
 * 排除模式语义（与 pack-app.sh 的 rsync 参数一致）：
 *   - 无斜杠（node_modules、.git、dist）→ 任意层级同名的文件/目录都跳过；
 *   - `**​/xxx`、`**​/xxx/`、`/xxx` → 归一化为同名匹配（同样任意层级）；
 *   - 带斜杠的相对模式（如 build/cache）→ 按相对源目录的路径前缀匹配。
 */
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const options = { src: null, dest: null, excludes: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--src' || arg === '--dest' || arg === '--exclude') {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(`${arg} 缺少取值`);
      }
      i += 1;
      if (arg === '--src') options.src = value;
      else if (arg === '--dest') options.dest = value;
      else options.excludes.push(value);
      continue;
    }
    if (arg.startsWith('--exclude=')) {
      options.excludes.push(arg.slice('--exclude='.length));
      continue;
    }
    if (arg.startsWith('--src=')) {
      options.src = arg.slice('--src='.length);
      continue;
    }
    if (arg.startsWith('--dest=')) {
      options.dest = arg.slice('--dest='.length);
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

/** 归一化排除模式：`**​/dist`、`/dist/`、`dist` 都变成按名字匹配 */
function normalizePattern(raw) {
  let pattern = String(raw || '').trim();
  if (!pattern) return null;
  pattern = pattern.replace(/\\/g, '/');
  pattern = pattern.replace(/^\.\//, '');
  pattern = pattern.replace(/^\*\*\//, '');
  pattern = pattern.replace(/^\/+/, '');
  pattern = pattern.replace(/\/+$/, '');
  if (!pattern) return null;
  return pattern;
}

function buildMatcher(patterns) {
  const named = new Set();
  const relative = [];
  for (const raw of patterns) {
    const pattern = normalizePattern(raw);
    if (!pattern) continue;
    if (pattern.includes('/')) relative.push(pattern);
    else named.add(pattern);
  }
  return function isExcluded(relPath, name) {
    if (named.has(name)) return true;
    for (const pattern of relative) {
      if (relPath === pattern || relPath.startsWith(`${pattern}/`)) return true;
    }
    return false;
  };
}

function copyTree(src, dest, isExcluded) {
  let files = 0;
  let dirs = 0;
  let skipped = 0;

  const walk = (relDir) => {
    const absDir = path.join(src, relDir);
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (isExcluded(rel, entry.name)) {
        skipped += 1;
        continue;
      }
      const from = path.join(src, rel);
      const to = path.join(dest, rel);
      let stat;
      try {
        stat = fs.lstatSync(from);
      } catch {
        continue;
      }

      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(from);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        try {
          fs.symlinkSync(target, to);
        } catch {
          /* Windows 无权限建符号链接时忽略，避免整个打包失败 */
        }
        files += 1;
        continue;
      }

      if (stat.isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        try {
          fs.chmodSync(to, stat.mode & 0o777);
        } catch {
          /* Windows 上 chmod 能力有限 */
        }
        dirs += 1;
        walk(rel);
        continue;
      }

      if (!stat.isFile()) continue; // 跳过设备/管道等特殊文件

      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      try {
        fs.chmodSync(to, stat.mode & 0o777);
      } catch {
        /* 忽略 */
      }
      try {
        fs.utimesSync(to, stat.atime, stat.mtime);
      } catch {
        /* 忽略 */
      }
      files += 1;
    }
  };

  walk('');
  return { files, dirs, skipped };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }
  if (!options.src || !options.dest) {
    process.stderr.write('用法: node copy-tree.cjs --src <目录> --dest <目录> [--exclude <模式> ...]\n');
    return 2;
  }
  const src = path.resolve(options.src);
  const dest = path.resolve(options.dest);
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
    process.stderr.write(`源目录不存在: ${src}\n`);
    return 1;
  }
  fs.mkdirSync(dest, { recursive: true });

  const isExcluded = buildMatcher(options.excludes);
  const result = copyTree(src, dest, isExcluded);
  process.stdout.write(
    `复制目录树完成: ${src} → ${dest}（文件 ${result.files}，目录 ${result.dirs}，排除 ${result.skipped}）\n`,
  );
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { parseArgs, normalizePattern, buildMatcher, copyTree };
