#!/usr/bin/env node
'use strict';

/**
 * env 配置一致性检查 + `.env.example` 生成器（防"配置漂移"）。
 *
 * 它解决的正是"备份脚本连到 25432"那一类 bug 的成因：键在多个文件里各写一遍、
 * 有人读了没人写、写了没人读、默认值三处不一致。
 *
 * 检查项：
 *   1) 死键        env 文件里定义、但代码/脚本/compose 都不读的键                → 失败
 *   2) 示例过期    `.env.example` 与生成结果不一致                              → 失败
 *   3) NODE_ENV    不该写在 env 文件里（由启动命令 cross-env/pm2/compose 决定）  → 失败
 *   4) 未文档化    代码读取、但 env 文件与 `.env.example` 都没有的键            → 提示
 *   5) 多重定义    同一个键出现在多个 env 文件（模式/个人覆盖属预期）           → 提示
 *   6) 默认值漂移  compose/脚本里的 `${KEY:-默认}` 与 env 文件里的值不一致      → 提示
 *   7) 生产缺键    `.env.production` 相对 `.env.development` 缺哪些键           → 提示
 *
 * 用法：
 *   node scripts/check-env.cjs                # 检查（有失败项则退出码 1）
 *   node scripts/check-env.cjs --json         # 机器可读，便于 CI
 *   node scripts/check-env.cjs --fix-example  # 重新生成 .env.example
 */

const fs = require('fs');
const path = require('path');
const { envFileCandidates } = require('../src/config/envFiles');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');
const EXAMPLE_FILE = path.join(BACKEND_ROOT, '.env.example');
const SOURCE_FILE = path.join(BACKEND_ROOT, '.env.development');

/**
 * `.env.example` 相对 `.env.development` 的**有意差异**（生成时生效，勿在示例文件里手改）。
 * 目前只有一处：示例里把 SSO TTL 注释掉，避免老应用照抄后被打到 15m 而没实现静默刷新。
 */
const EXAMPLE_OVERRIDES = {
  SSO_ACCESS_TOKEN_TTL: {
    commented: true,
    lead: [
      '# SSO 访问令牌有效期（可选）。不设时沿用 JWT_EXPIRES_IN。',
      '# 收紧到 15m 前请确认接入方已实现 401 TOKEN_EXPIRED 的静默刷新（POST /api/v1/auth/refresh）。',
    ],
  },
};

const EXAMPLE_HEADER = [
  '# ⚠️ 本文件由 `pnpm --filter ./backend config:example` 从 .env.development 生成，请勿手工编辑。',
  '# 默认值改 .env.development（入库）；个人/机器差异写 .env.development.local（不入库）。',
  '',
];

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 由 OS / 启动器 / 测试进程提供，不属于应用配置（不要求写进 env 文件） */
const KNOWN_EXTERNAL_KEYS = new Set([
  'PATH', 'Path', 'PATHEXT', 'ProgramFiles', 'LOCALAPPDATA', 'APPDATA', 'HOME', 'TMPDIR',
  'NO_COLOR', 'ALLOW_WSL', 'DEV_RUNNER', 'NODE_ENV',
  'TEST_JWT_SECRET', 'TEST_JWT_REFRESH_SECRET',
]);

/** 逐行解析：把「空行 + 注释」当作紧随其后那个键的说明块保留下来 */
function parseEnvWithComments(text) {
  const entries = [];
  let lead = [];
  for (const line of text.split('\n')) {
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) {
      lead.push(line);
      continue;
    }
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m) {
      entries.push({ lead, key: m[1], value: m[2] });
      lead = [];
      continue;
    }
    lead.push(line);
  }
  return { entries, trailing: lead };
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

/** 生成 .env.example 的内容（确定性：同样的输入必然得到同样的字节） */
function renderExample(sourceText) {
  const { entries, trailing } = parseEnvWithComments(sourceText);
  const out = [...EXAMPLE_HEADER];
  for (const entry of entries) {
    if (entry.key === 'NODE_ENV') continue; // 由启动命令决定，不写进 env 文件
    const override = EXAMPLE_OVERRIDES[entry.key];
    const lead = override?.lead ?? entry.lead;
    // 去掉说明块里多余的前导空行（文件被删掉 NODE_ENV 后开头可能留空行）
    while (lead.length && lead[0].trim() === '' && out.length <= EXAMPLE_HEADER.length) lead.shift();
    out.push(...lead);
    out.push(`${override?.commented ? '# ' : ''}${entry.key}=${entry.value}`);
  }
  out.push(...trailing);
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')}\n`;
}

/** 递归收集需要扫描"谁在读这个键"的文件 */
function collectUsageFiles() {
  const files = [];
  const roots = ['backend/src', 'backend/scripts', 'scripts', 'frontend/config'];
  const exts = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.sh']);
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (exts.has(path.extname(entry.name))) files.push(full);
    }
  };
  roots.forEach((r) => walk(path.join(REPO_ROOT, r)));
  for (const extra of [
    'backend/docker-compose.yml',
    'backend/docker-compose_with_MySQL.yml',
    'eadaf-runtime/docker-compose.yml',
    'backend/ecosystem.config.cjs',
    'frontend/ecosystem.config.cjs',
    'backend/package.json',
  ]) {
    const full = path.join(REPO_ROOT, extra);
    if (fs.existsSync(full)) files.push(full);
  }
  return files;
}

function collectUsage(files) {
  // anywhere：宽松判定"这个键到底有没有人读"，用于抓死键（宁多勿漏，避免误报）
  // app：只看后端应用 backend/src 的 process.env，用于"未文档化"提示（脚本自己的临时变量不算配置）
  const anywhere = new Set();
  const app = new Set();

  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const ext = path.extname(file);
    const isApp = file.startsWith(path.join(BACKEND_ROOT, 'src') + path.sep);

    if (['.js', '.cjs', '.mjs', '.ts', '.tsx'].includes(ext)) {
      // 只认 process.env.X：JS 模板字符串 ${...} 不是环境变量
      for (const m of text.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        anywhere.add(m[1]);
        if (isApp) app.add(m[1]);
      }
    } else if (ext === '.sh' || ext === '.yml' || ext === '.yaml') {
      for (const m of text.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)) anywhere.add(m[1]);
    } else if (path.basename(file) === 'package.json') {
      for (const m of text.matchAll(/\b([A-Z][A-Z0-9_]{2,})=/g)) anywhere.add(m[1]);
    }
  }
  return { anywhere, app };
}

/** compose / 脚本里的 `${KEY:-默认}`，用于发现"第三套默认值" */
function collectDefaults(files) {
  const defaults = new Map(); // KEY → [{ file, value }]
  for (const file of files) {
    if (!/\.ya?ml$/.test(file)) continue; // 只比 compose：脚本里的端口默认值属另一语境（且常是变量）
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const m of text.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*):-([^}]*)\}/g)) {
      const [, key, value] = m;
      const trimmed = value.trim();
      if (trimmed.includes('$')) continue; // 动态默认值（${K:-$OTHER}）不参与比较
      if (!defaults.has(key)) defaults.set(key, []);
      const entry = { file: path.relative(REPO_ROOT, file), value: trimmed };
      const list = defaults.get(key);
      if (!list.some((d) => d.file === entry.file && d.value === entry.value)) list.push(entry);
    }
  }
  return defaults;
}

/** 解析"被文档化"的键：含注释形式 `# KEY=`（可选键的惯例写法） */
function parseDocumentedKeys(file) {
  const text = readIfExists(file);
  if (text === null) return new Set();
  const keys = new Set();
  for (const line of text.split('\n')) {
    const m = /^\s*#?\s*([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (m) keys.add(m[1]);
  }
  return keys;
}

function parseSimpleEnv(file) {
  const text = readIfExists(file);
  if (text === null) return null;
  const out = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/\s+#.*$/, '').trim();
  }
  return out;
}

function main(argv) {
  const args = argv.slice(2);
  const fixExample = args.includes('--fix-example');
  const asJson = args.includes('--json');

  const sourceText = readIfExists(SOURCE_FILE);
  if (sourceText === null) {
    process.stderr.write(`找不到 ${path.relative(REPO_ROOT, SOURCE_FILE)}（唯一文档源）\n`);
    return 2;
  }

  const expectedExample = renderExample(sourceText);
  const currentExample = readIfExists(EXAMPLE_FILE);

  if (fixExample) {
    if (currentExample !== expectedExample) {
      fs.writeFileSync(EXAMPLE_FILE, expectedExample, 'utf8');
      process.stdout.write(`已重新生成 ${path.relative(REPO_ROOT, EXAMPLE_FILE)}\n`);
    } else {
      process.stdout.write(`${path.relative(REPO_ROOT, EXAMPLE_FILE)} 已是最新\n`);
    }
    return 0;
  }

  const candidates = envFileCandidates({ backendRoot: BACKEND_ROOT, nodeEnv: process.env.NODE_ENV || 'development' });
  const existingEnvFiles = candidates.filter((f) => fs.existsSync(f));
  const envFileKeys = new Map(); // KEY → [file...]
  for (const file of existingEnvFiles) {
    const parsed = parseSimpleEnv(file) || {};
    for (const key of Object.keys(parsed)) {
      if (!envFileKeys.has(key)) envFileKeys.set(key, []);
      envFileKeys.get(key).push(path.relative(REPO_ROOT, file));
    }
  }

  const usageFiles = collectUsageFiles();
  const { anywhere: usedKeys, app: appKeys } = collectUsage(usageFiles);
  const defaults = collectDefaults(usageFiles);
  const dev = parseSimpleEnv(SOURCE_FILE) || {};
  const prodFile = path.join(BACKEND_ROOT, '.env.production');
  const prod = parseSimpleEnv(prodFile);
  const documentedKeys = new Set([...parseDocumentedKeys(EXAMPLE_FILE), ...parseDocumentedKeys(SOURCE_FILE)]);

  const problems = [];
  const notes = [];

  // 1) 死键
  const deadKeys = [...envFileKeys.keys()].filter((k) => !usedKeys.has(k));
  for (const key of deadKeys) {
    problems.push({ kind: 'dead-key', message: `${key} 定义在 ${envFileKeys.get(key).join(', ')}，但代码/脚本/compose 都不读它` });
  }

  // 2) 示例过期
  if (currentExample !== expectedExample) {
    problems.push({
      kind: 'example-outdated',
      message: '.env.example 与生成结果不一致（跑 `pnpm --filter ./backend config:example` 重新生成；不要手改该文件）',
    });
  }

  // 3) NODE_ENV 不应出现在 env 文件里
  for (const [key, files] of envFileKeys) {
    if (key === 'NODE_ENV') {
      problems.push({ kind: 'node-env-in-file', message: `NODE_ENV 写在 ${files.join(', ')}（应由启动命令决定：cross-env / pm2 / compose）` });
    }
  }

  // 4) 代码读、但没有文档化的键（可按需补进 .env.development，属可选项）
  const undocumented = [...appKeys]
    .filter((k) => !KNOWN_EXTERNAL_KEYS.has(k) && !documentedKeys.has(k))
    .sort();
  if (undocumented.length) {
    notes.push(`未文档化 ${undocumented.length} 个键（backend/src 读取、但 env 文件与 .env.example 都没写，依赖代码默认值）：${undocumented.join(', ')}`);
  }

  // 5) 多重定义
  const duplicated = [...envFileKeys.entries()].filter(([, files]) => files.length > 1);
  if (duplicated.length) {
    notes.push(`多重定义 ${duplicated.length} 个键（模式文件/个人覆盖属预期，仅提示）：${duplicated.slice(0, 8).map(([k, f]) => `${k}(${f.length})`).join(', ')}${duplicated.length > 8 ? ' …' : ''}`);
  }

  // 6) 默认值漂移：compose/脚本的 :-默认 与 env 文件里的值不一致
  for (const [key, list] of defaults) {
    const envValue = dev[key];
    if (envValue === undefined) continue;
    for (const { file, value } of list) {
      if (value !== '' && value !== envValue) {
        notes.push(`默认值漂移：${file} 里 \${${key}:-${value}} 与 .env.development 的 ${key}=${envValue} 不一致`);
      }
    }
  }

  // 7) 生产文件缺键
  if (prod) {
    const missing = Object.keys(dev).filter((k) => prod[k] === undefined && k !== 'NODE_ENV');
    if (missing.length) {
      notes.push(`.env.production 缺 ${missing.length} 个键（将回落到代码默认值）：${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' …' : ''}`);
    }
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify({
      envFiles: existingEnvFiles.map((f) => path.relative(REPO_ROOT, f)),
      scannedFiles: usageFiles.length,
      problems,
      notes,
      summary: { envKeys: envFileKeys.size, appKeys: appKeys.size, referencedKeys: usedKeys.size, problems: problems.length, notes: notes.length },
    }, null, 2)}\n`);
  } else {
    process.stdout.write(`env 检查（扫描 ${usageFiles.length} 个文件；env 键 ${envFileKeys.size} 个 / 应用读到 ${appKeys.size} 个 / 任意引用 ${usedKeys.size} 个）\n`);
    process.stdout.write(`加载的文件：${existingEnvFiles.map((f) => path.relative(REPO_ROOT, f)).join(' → ') || '(无)'}\n`);
    if (problems.length) {
      process.stdout.write(`\n❌ 必须修复 ${problems.length} 项：\n`);
      problems.forEach((p) => process.stdout.write(`   - [${p.kind}] ${p.message}\n`));
    } else {
      process.stdout.write('\n✅ 无必须修复项\n');
    }
    if (notes.length) {
      process.stdout.write(`\n⚠️  提示 ${notes.length} 项：\n`);
      notes.forEach((n) => process.stdout.write(`   - ${n}\n`));
    }
  }

  return problems.length ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv);
}

module.exports = { renderExample, parseEnvWithComments, EXAMPLE_HEADER, EXAMPLE_OVERRIDES };
