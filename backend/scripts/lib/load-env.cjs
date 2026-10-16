#!/usr/bin/env node
'use strict';

/**
 * env 解析的**唯一实现** —— 后端应用与 shell 脚本共用。
 *
 * 背景：应用走 `src/config/envFiles.js` 的级联（`.env` → `.env.{NODE_ENV}` → `.env.{NODE_ENV}.local`，
 * 后者覆盖前者，真实环境变量最优先），而 `backend/scripts/env.sh` 原先只 `source .env.{NODE_ENV}`，
 * 于是同一个库在两处解析出不同的值（备份脚本连到 25432 就是这么来的）。
 * 现在 shell 脚本改为调用本脚本，加载顺序与优先级只有这一份定义。
 *
 * 用法：
 *   node scripts/lib/load-env.cjs --export            # 输出 export K='v'（供 shell eval；只含文件里定义、且当前环境未设置的键）
 *   node scripts/lib/load-env.cjs --export --fail-if-none   # 一个 env 文件都没找到时退出码 3（供脚本给出友好提示）
 *   node scripts/lib/load-env.cjs --json              # 输出「有效值」JSON（含真实环境变量覆盖）
 *   node scripts/lib/load-env.cjs --value API_PORT    # 输出某个键的有效值
 *   node scripts/lib/load-env.cjs --dotenv            # 输出 KEY=value（文件值，供 docker compose --env-file 用）
 *   node scripts/lib/load-env.cjs --files             # 输出实际加载到的文件（相对 backend/）
 *
 * 优先级（与 `src/config/index.js` 一致）：
 *   真实环境变量 > .env.{NODE_ENV}.local > .env.{NODE_ENV} > .env
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { envFileCandidates } = require('../../src/config/envFiles');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const NODE_ENV = String(process.env.NODE_ENV || 'development').trim() || 'development';

const EXIT_NO_ENV_FILES = 3;
const SHELL_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 按应用的同一套级联解析出「文件值」（后者覆盖前者）与加载到的文件列表 */
function resolveEnvFiles() {
  const fileValues = {};
  const loadedFiles = [];
  for (const file of envFileCandidates({ backendRoot: BACKEND_ROOT, nodeEnv: NODE_ENV })) {
    if (!fs.existsSync(file)) continue;
    Object.assign(fileValues, dotenv.parse(fs.readFileSync(file)));
    loadedFiles.push(path.relative(BACKEND_ROOT, file) || path.basename(file));
  }
  return { fileValues, loadedFiles };
}

/** 有效值 = 文件值 再被真实环境变量覆盖（与后端进程看到的完全一致） */
function resolveEffective() {
  const { fileValues, loadedFiles } = resolveEnvFiles();
  return { values: { ...fileValues, ...process.env }, fileValues, loadedFiles };
}

/** Bash 单引号转义：内部单引号写成 '\'' */
const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

function main(argv) {
  const args = argv.slice(2);
  const { values, fileValues, loadedFiles } = resolveEffective();

  if (!loadedFiles.length && args.includes('--fail-if-none')) {
    process.stderr.write(
      `未找到任何 env 文件（期望 ${envFileCandidates({ backendRoot: BACKEND_ROOT, nodeEnv: NODE_ENV })
        .map((f) => path.relative(BACKEND_ROOT, f))
        .join(' / ')}）\n`,
    );
    return EXIT_NO_ENV_FILES;
  }

  if (args.includes('--files')) {
    process.stdout.write(`${loadedFiles.join('\n')}${loadedFiles.length ? '\n' : ''}`);
    return 0;
  }

  if (args.includes('--dotenv')) {
    // 只输出文件里定义的值（合并后），不含进程环境；供 `docker compose --env-file` 使用。
    // 值里含空白 / # / 引号时用双引号包裹并转义，避免 compose 解析歧义。
    const lines = Object.entries(fileValues)
      .filter(([key]) => SHELL_IDENT.test(key))
      .map(([key, value]) => {
        const raw = String(value);
        const needsQuote = /[\s#"'$]/.test(raw);
        return `${key}=${needsQuote ? `"${raw.replace(/([\\"])/g, '\\$1')}"` : raw}`;
      });
    process.stdout.write(`${lines.join('\n')}${lines.length ? '\n' : ''}`);
    return 0;
  }

  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(values, null, 2)}\n`);
    return 0;
  }

  const valueIndex = args.indexOf('--value');
  if (valueIndex >= 0) {
    const key = args[valueIndex + 1];
    if (!key) {
      process.stderr.write('--value 需要一个键名\n');
      return 2;
    }
    if (values[key] !== undefined) process.stdout.write(`${values[key]}\n`);
    return 0;
  }

  if (args.includes('--export')) {
    // 只输出「文件里定义、且当前环境未设置」的键：
    // 这样 shell 里 eval 之后，真实环境变量依然优先（与后端一致），也不会覆盖调用方显式传入的值。
    const lines = Object.entries(fileValues)
      .filter(([key]) => SHELL_IDENT.test(key) && process.env[key] === undefined)
      .map(([key, value]) => `export ${key}=${shellQuote(value)}`);
    process.stdout.write(`${lines.join('\n')}${lines.length ? '\n' : ''}`);
    return 0;
  }

  // 默认：KEY=value（便于 grep / 人工查看）
  const lines = Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv);
}

module.exports = { resolveEnvFiles, resolveEffective, BACKEND_ROOT, NODE_ENV, EXIT_NO_ENV_FILES };
