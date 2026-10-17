#!/usr/bin/env node
/**
 * 生成「业务应用的业务 API Skill」：把某个应用已发布的 API 目录（api-catalog）
 * 变成一份可直接喂给 AI 的中文接口手册，并可选产出可执行的 SQL 迁移。
 *
 * 为什么需要它：
 *   业务应用（如 app_example 的 YS）的 AI 助手只拿到全局 Skill `aibase-chat-framework`
 *   （唯一业务向 Tool 是 http_request）—— 它不知道本应用有哪些接口、路径怎么写、
 *   响应长什么样，于是一个问题要好几次 http_request 试探。把接口事实写进
 *   「应用顶层 Skill」+ 一个专用 Skill，第一轮就能调对。
 *
 * 用法（仓库根目录或 backend/ 下都行）：
 *   node backend/scripts/gen-app-business-api-skill.js \
 *     --app YS \
 *     --scope sales-demo \
 *     --skill-slug ys-business-api \
 *     --skill-name "雨伞独立站业务 API" \
 *     --skill-id 55555555-5555-4555-8555-5555555555c1 \
 *     --notes docs/app-api-skill/YS.notes.md \
 *     --out   docs/app-api-skill/YS.md \
 *     --sql   backend/scripts/migrate-ys-business-api-skill.sql
 *
 * 参数：
 *   --app          应用 code 或 application_id（必填）
 *   --base         EADAF 后端地址，默认 env EADAF_API_BASE 或 http://127.0.0.1:29526
 *   --token        可选；带 Bearer 令牌（公开目录接口通常不需要）
 *   --notes        可选；人工维护的业务口径 markdown，追加到文末
 *   --out          可选；输出 markdown 路径（不给则只打印摘要）
 *   --sql          可选；输出 SQL 迁移路径（需同时给 --skill-id）
 *   --scope        可选；Skill 归属的 aibase Scope slug（不给则 scope_id 为 NULL）
 *   --skill-slug   专用 Skill 的 slug，默认 <app>-business-api 小写
 *   --skill-name   专用 Skill 的显示名，默认「<应用名> 业务 API」
 *   --skill-id     专用 Skill 的固定 UUID（写 SQL 时必填，保证可重复执行）
 *   --dry-run      只解析并打印摘要，不写文件
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');

/* ------------------------------- CLI ------------------------------- */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

function resolveFromCwd(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function resolveRepoPath(p) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  const fromCwd = path.resolve(process.cwd(), p);
  if (fs.existsSync(fromCwd) || fs.existsSync(path.dirname(fromCwd))) return fromCwd;
  return path.resolve(REPO_ROOT, p);
}

const APP_KEY = typeof args.app === 'string' ? args.app.trim() : '';
const BASE_URL = String(
  (typeof args.base === 'string' && args.base) || process.env.EADAF_API_BASE || 'http://127.0.0.1:29526',
).replace(/\/+$/, '');
const TOKEN = typeof args.token === 'string' ? args.token : process.env.EADAF_API_TOKEN || '';
const NOTES_PATH = resolveRepoPath(typeof args.notes === 'string' ? args.notes : '');
const OUT_PATH = resolveRepoPath(typeof args.out === 'string' ? args.out : '');
const SQL_PATH = resolveRepoPath(typeof args.sql === 'string' ? args.sql : '');
const SCOPE_SLUG = typeof args.scope === 'string' ? args.scope.trim() : '';
const SKILL_SLUG = String(args['skill-slug'] || (APP_KEY ? `${APP_KEY.toLowerCase()}-business-api` : '')).trim();
const SKILL_NAME = typeof args['skill-name'] === 'string' ? args['skill-name'].trim() : '';
const SKILL_ID = typeof args['skill-id'] === 'string' ? args['skill-id'].trim() : '';
const DRY_RUN = args['dry-run'] === true;

if (!APP_KEY) {
  console.error('缺少 --app（应用 code 或 application_id）');
  process.exit(1);
}
if (SQL_PATH && !SKILL_ID) {
  console.error('--sql 需要同时给 --skill-id（固定 UUID，保证迁移可重复执行）');
  process.exit(1);
}
if (SKILL_ID && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(SKILL_ID)) {
  console.error(`--skill-id 不是合法 UUID：${SKILL_ID}`);
  process.exit(1);
}

/* ------------------------------ 抓取数据 ------------------------------ */

async function fetchCatalog() {
  const url = `${BASE_URL}/api/v1/applications-public/${encodeURIComponent(APP_KEY)}/api-catalog`;
  const res = await fetch(url, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`api-catalog 返回非 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`);
  }
  if (!res.ok || json.code !== 200 || !json.data) {
    throw new Error(`获取 api-catalog 失败（HTTP ${res.status}）：${json.message || text.slice(0, 200)}`);
  }
  return json.data;
}

/* ------------------------------ 解析工具 ------------------------------ */

const OPERATION_LABELS = {
  find: '列表查询（分页）',
  findOne: '单条（按条件）',
  findById: '单条（按主键 UUID）',
  count: '计数',
  distinct: '去重取值',
  create: '新建',
  updateOne: '更新（按条件）',
  updateById: '更新（按主键）',
  deleteOne: '删除（按条件）',
  deleteById: '删除（按主键）',
};

function operationLabel(name) {
  return OPERATION_LABELS[name] || name;
}

/** 从 responseInterface 的 TypeScript 里解析记录字段（第一个 interface 块） */
function parseRecordFields(interfaceText) {
  if (!interfaceText) return [];
  const text = String(interfaceText);
  const start = text.indexOf('interface ');
  if (start < 0) return [];
  const bodyStart = text.indexOf('{', start);
  if (bodyStart < 0) return [];
  const bodyEnd = text.indexOf('\n}', bodyStart);
  const block = text.slice(bodyStart + 1, bodyEnd < 0 ? text.length : bodyEnd);

  const fields = [];
  let comment = '';
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('/**')) {
      comment = line.replace(/^\/\*\*/, '').replace(/\*\/$/, '').trim();
      continue;
    }
    const match = /^([A-Za-z_][\w]*)(\?)?:\s*([^;]+);/.exec(line);
    if (!match) continue;
    fields.push({
      name: match[1],
      optional: Boolean(match[2]),
      type: match[3].trim(),
      comment: comment || '',
    });
    comment = '';
  }
  return fields;
}

/** 服务维度的结构化信息 */
function normalizeService(service) {
  const operations = (service.operations || []).map((op) => ({
    operation: op.operation,
    httpMethod: String(op.httpMethod || 'GET').toUpperCase(),
    routePattern: op.routePattern == null ? '' : String(op.routePattern),
    params: Object.keys(op.parametersSchema?.properties || {}),
    required: op.parametersSchema?.required || [],
  }));
  const findOp = operations.find((op) => op.operation === 'find') || operations[0];
  const fields = parseRecordFields(findOp ? (service.operations || []).find((o) => o.operation === findOp.operation)?.responseInterface : '');
  return {
    code: service.code,
    name: service.name,
    description: service.description || '',
    routePath: service.routePath,
    basePath: service.basePath || `/api/v1/data/${service.routePath}`,
    entityCode: service.entityCode || '',
    entityLabel: service.entityLabel || service.name,
    status: service.status,
    operations,
    fields,
  };
}

/* ------------------------------ 生成 Markdown ------------------------------ */

function fmtFieldInline(field) {
  const optional = field.optional ? '?' : '';
  return `\`${field.name}${optional}\``;
}

function buildMarkdown({ application, services, notes, meta }) {
  const serviceCount = services.length;
  const now = meta.generatedAt;
  const lines = [];

  lines.push(`# ${application.name}（${application.code}）业务 API 手册`);
  lines.push('');
  lines.push(
    `> 生成时间 \`${now}\`，来源 \`GET /api/v1/applications-public/${application.code}/api-catalog\`（应用 ID \`${application.application_id}\`）。`,
  );
  lines.push(
    '> 本文件由 `backend/scripts/gen-app-business-api-skill.js` 生成：API 服务有变动就重跑脚本，**不要手改**（人工口径写在 notes 里）。',
  );
  lines.push('');
  lines.push('## 0. 四条铁律（先看这里，能省掉大部分试错）');
  lines.push('');
  lines.push(
    '1. **数据只有一个来源**：平台已发布的业务数据 API，前缀 `/api/v1/data/`。调用时**只写相对路径**，例如 `/api/v1/data/' +
      (services[0]?.routePath || 'YS/order/Order') +
      '?limit=5`。`http_request` 会自动把相对路径指向当前平台，并带上**当前登录用户**的身份；不要自己拼 `Authorization`。',
  );
  lines.push(
    '2. **不要猜地址**：`localhost` / `127.0.0.1` / `192.168.x` / 其它端口、少了 `v1` 的 `/api/...`、`/api/v1/bizdata`、`/api/v1/business-data`、复数或驼峰路径（如 `/YS/orders`）、`/public/applications/...`（那是给人看的文档网页，不是接口）、GraphQL、直连数据库 —— 一律不要试。写成**绝对地址**（`http://host:29526/...`）反而不会带身份，只会拿到 401。',
  );
  lines.push(
    `3. **服务只有下表这 ${serviceCount} 个**，路径逐字照抄；表里没有的实体 / 接口一律不存在。`,
  );
  lines.push(
    '4. **判读响应**：`code === 200` 才有 `data`。列表 → `data.items` + `data.pagination`；单条 → `data.item`。HTTP 200 但 `code !== 200` 也算失败（典型：字段名写错）。',
  );
  lines.push('');
  lines.push('## 1. 服务总览');
  lines.push('');
  lines.push('| 服务 | routePath（接在 `/api/v1/data/` 之后） | 记录字段 |');
  lines.push('| --- | --- | --- |');
  for (const svc of services) {
    const fieldList = svc.fields.map((f) => `\`${f.name}\``).join(' ') || '—';
    lines.push(`| ${svc.name} | \`${svc.routePath}\` | ${fieldList} |`);
  }
  lines.push('');
  lines.push('## 2. 通用调用规则');
  lines.push('');
  lines.push('### 2.1 列表查询 `find`');
  lines.push('');
  lines.push('```http');
  lines.push('GET /api/v1/data/{routePath}?limit=20&skip=0&filter={"字段":"值"}');
  lines.push('```');
  lines.push('');
  lines.push('- `limit` 1–100（默认 20）；`skip` ≥ 0 为偏移量');
  lines.push(
    '- 过滤三种写法等价：`filter={"字段":"值"}`、顶层 `?字段=值`、`?filter[字段]=值`；**只支持等值匹配**，值写 `null` 表示 IS NULL',
  );
  lines.push(
    '- **不支持** `>` `<` `LIKE`、排序、分组、聚合：需要统计 / 排序 / Top-N 时，把数据取回（`limit` 最大 100，多页用 `skip`）在回答里算',
  );
  lines.push('- `data.pagination.total` 是命中总数；要全量就按 `skip += limit` 继续取，直到取满 `total`');
  lines.push('');
  lines.push('### 2.2 单条');
  lines.push('');
  lines.push('```http');
  lines.push('GET /api/v1/data/{routePath}/one?filter={"业务键":"值"}   → data.item（没有则 null）');
  lines.push('GET /api/v1/data/{routePath}/{uuid}                       → data.item');
  lines.push('```');
  lines.push('');
  lines.push('### 2.3 计数');
  lines.push('');
  lines.push(
    '`GET /api/v1/data/{routePath}?limit=1` 后读 `data.pagination.total`。**不要**调 `/count`：该 operation 当前被 `/{id}` 路由抢先匹配，会返回 uuid 解析错误。',
  );
  lines.push('');
  lines.push('## 3. 各服务细节');
  lines.push('');
  services.forEach((svc, index) => {
    lines.push(`### 3.${index + 1} ${svc.name} \`${svc.routePath}\``);
    lines.push('');
    const desc = [svc.description, svc.entityCode ? `实体 \`${svc.entityCode}\`` : ''].filter(Boolean).join('；');
    if (desc) lines.push(`${desc}。`);
    lines.push('');
    const opList = svc.operations
      .map((op) => `\`${op.operation}\`(${op.httpMethod}${op.routePattern ? ` ${op.routePattern}` : ''})`)
      .join('、');
    const countHint = svc.operations.some((op) => op.operation === 'count')
      ? '（`count` 不要直接调，见 §2.3 的替代写法）'
      : '';
    lines.push(`- 可用操作：${opList}${countHint}`);
    if (svc.fields.length) {
      lines.push('- 字段：');
      for (const field of svc.fields) {
        const comment = field.comment ? ` — ${field.comment}` : '';
        const optional = field.optional ? '（可空）' : '';
        lines.push(`  - ${fmtFieldInline(field)}（${field.type}）${optional}${comment}`);
      }
    }
    lines.push('');
  });
  lines.push('## 4. 常见坑（已在本实例实测）');
  lines.push('');
  lines.push('1. 过滤值**大小写敏感**，用数据里实际存储的值；管理台枚举键（如 `OPEN` / `VIP`）不等于数据值，用错会得到 0 条。');
  lines.push('2. `/{id}` 只认 UUID；用业务单号（如 `SO202501001`）请走 `/one?filter={...}`。');
  lines.push('3. `limit > 100` 直接 400。');
  lines.push('4. 金额字段是字符串（如 `"1047.00"`），比较 / 求和前先转数字。');
  lines.push(
    '5. 单次响应过大会被上下文预算裁剪（列表按条截断，还会带 `truncated` 标记）——看起来像"数据不全"其实是自己一次要太多。**先用 `filter` 把范围缩小**（按状态 / 品类 / 会员）再取，别一上来就全表拉。',
  );
  lines.push('6. 业务错误也是 HTTP 200 + `code !== 200`；`http_request` 的返回体外层是 `{ok,status,body}`，业务信封在 `body` 里。');
  lines.push('7. 重复请求同样的 URL 不会得到新结果；换参数或换服务才有意义。');
  lines.push('');

  if (notes && notes.trim()) {
    lines.push('## 5. 本应用口径（人工维护）');
    lines.push('');
    lines.push(notes.trim());
    lines.push('');
  }

  return { markdown: lines.join('\n'), serviceCount };
}

/* ------------------------------ 生成 SQL ------------------------------ */

function sqlTextLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlDollarQuoted(text) {
  const tag = '$eadaf_ai$';
  if (String(text).includes(tag)) {
    throw new Error(`文本里出现了 ${tag}，与 SQL 美元引号冲突，请改用别的内容`);
  }
  return `${tag}${text}${tag}`;
}

function buildSql({ application, markdown, skill }) {
  const parts = [];
  parts.push(`-- ${application.name}（${application.code}）业务 API Skill —— 由 gen-app-business-api-skill.js 生成，勿手改`);
  parts.push('-- 幂等：可重复执行。作用：');
  parts.push('--   1) 写入应用顶层 Skill（随「应用数据导出」一起走，所有页面常驻注入）');
  parts.push('--   2) upsert 专用 Skill（AI 管理 → Skills 可见、可维护）');
  parts.push('--   3) 绑定到本应用（capabilities 只把已绑定的专用 Skill 发给该应用）');
  parts.push('--   4) 给该 Skill 挂 http_request（相对路径调用业务 API 的唯一工具）');
  parts.push('');
  parts.push('BEGIN;');
  parts.push('');
  parts.push(`-- 1) 应用顶层 Skill`);
  parts.push('UPDATE eadaf.applications');
  parts.push(`   SET top_level_skill_markdown = ${sqlDollarQuoted(markdown)},`);
  parts.push('       updated_at = CURRENT_TIMESTAMP');
  parts.push(` WHERE code = ${sqlTextLiteral(application.code)};`);
  parts.push('');
  parts.push('-- 2) 专用 Skill（正文与顶层 Skill 完全一致，避免两处漂移）');
  parts.push('INSERT INTO aibase.skills (');
  parts.push('  id, scope_id, name, slug, description, content_markdown,');
  parts.push('  is_active, is_global, is_dedicated, completion_strategy');
  parts.push(')');
  parts.push('VALUES (');
  parts.push(`  ${sqlTextLiteral(skill.id)},`);
  if (skill.scopeSlug) {
    parts.push(`  (SELECT id FROM aibase.scopes WHERE slug = ${sqlTextLiteral(skill.scopeSlug)}),`);
  } else {
    parts.push('  NULL,');
  }
  parts.push(`  ${sqlTextLiteral(skill.name)},`);
  parts.push(`  ${sqlTextLiteral(skill.slug)},`);
  parts.push(`  ${sqlTextLiteral(skill.description)},`);
  parts.push(`  ${sqlDollarQuoted(markdown)},`);
  parts.push(`  true, false, true, '{"terminationStrictness":"off"}'::jsonb`);
  parts.push(')');
  parts.push('ON CONFLICT (slug) DO UPDATE');
  parts.push('   SET scope_id = EXCLUDED.scope_id,');
  parts.push('       name = EXCLUDED.name,');
  parts.push('       description = EXCLUDED.description,');
  parts.push('       content_markdown = EXCLUDED.content_markdown,');
  parts.push('       is_active = true,');
  parts.push('       is_global = false,');
  parts.push('       is_dedicated = true,');
  parts.push('       completion_strategy = EXCLUDED.completion_strategy,');
  parts.push('       updated_at = CURRENT_TIMESTAMP;');
  parts.push('');
  parts.push('-- 3) Skill ↔ 应用绑定（capabilities 只发已绑定的专用 Skill）');
  parts.push('INSERT INTO aibase.skill_applications (skill_id, application_id)');
  parts.push('SELECT s.id, a.application_id');
  parts.push('  FROM aibase.skills s, eadaf.applications a');
  parts.push(` WHERE s.slug = ${sqlTextLiteral(skill.slug)}`);
  parts.push(`   AND a.code = ${sqlTextLiteral(application.code)}`);
  parts.push('ON CONFLICT (skill_id, application_id) DO NOTHING;');
  parts.push('');
  parts.push('-- 4) Skill → http_request');
  parts.push('INSERT INTO aibase.skill_tools (skill_id, tool_id, sort_order)');
  parts.push('SELECT s.id, t.id, 0');
  parts.push('  FROM aibase.skills s, aibase.tools t');
  parts.push(` WHERE s.slug = ${sqlTextLiteral(skill.slug)} AND t.slug = 'http-request'`);
  parts.push('ON CONFLICT (skill_id, tool_id) DO NOTHING;');
  parts.push('');
  parts.push('COMMIT;');
  parts.push('');
  parts.push('-- 自检');
  parts.push('SELECT s.slug, s.is_dedicated, length(s.content_markdown) AS body_len,');
  parts.push('       (SELECT count(*) FROM aibase.skill_applications sa WHERE sa.skill_id = s.id) AS app_links,');
  parts.push('       (SELECT count(*) FROM aibase.skill_tools st WHERE st.skill_id = s.id) AS tool_links');
  parts.push(`  FROM aibase.skills s WHERE s.slug = ${sqlTextLiteral(skill.slug)};`);
  parts.push('SELECT code, length(coalesce(top_level_skill_markdown, \'\')) AS top_level_len');
  parts.push(`  FROM eadaf.applications WHERE code = ${sqlTextLiteral(application.code)};`);
  parts.push('');
  return parts.join('\n');
}

/* -------------------------------- main -------------------------------- */

async function main() {
  const data = await fetchCatalog();
  const application = {
    application_id: data.application?.application_id || '',
    code: data.application?.code || APP_KEY,
    name: data.application?.name || data.application?.code || APP_KEY,
  };
  const services = (data.services || [])
    .filter((item) => item && item.routePath)
    .map(normalizeService);

  if (!services.length) {
    console.error('该应用没有已发布的业务 API 服务（services 为空），先发布 API 再生成');
    process.exit(1);
  }

  const notes = NOTES_PATH ? fs.readFileSync(NOTES_PATH, 'utf8') : '';
  const { markdown, serviceCount } = buildMarkdown({
    application,
    services,
    notes,
    meta: { generatedAt: data.generatedAt || new Date().toISOString() },
  });

  const skillSlug = SKILL_SLUG || `${application.code.toLowerCase()}-business-api`;
  const skillName = SKILL_NAME || `${application.name} 业务 API`;
  const skill = {
    id: SKILL_ID || null,
    slug: skillSlug,
    name: skillName,
    scopeSlug: SCOPE_SLUG || '',
    description:
      `${application.name} 业务 API 契约（${services.map((s) => s.name).join(' / ')}）：路径、字段、过滤、响应信封；` +
      '正文与「应用顶层 Skill」一致，已常驻提示词，无需再次加载。',
  };

  console.log(`应用：${application.name}（${application.code}）  应用ID：${application.application_id}`);
  console.log(`服务：${serviceCount} 个 → ${services.map((s) => s.routePath).join(', ')}`);
  console.log(`Markdown：${markdown.length} 字符`);
  console.log(`Skill：${skill.slug} / ${skill.name}${skill.id ? ` / ${skill.id}` : ''}`);

  if (DRY_RUN) {
    console.log('\n--- markdown 预览（前 1200 字符）---\n');
    console.log(markdown.slice(0, 1200));
    return;
  }

  if (OUT_PATH) {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, `${markdown}\n`, 'utf8');
    console.log(`✓ 写出 ${path.relative(REPO_ROOT, OUT_PATH)}`);
  }

  if (SQL_PATH) {
    const sql = buildSql({ application, markdown, skill });
    fs.mkdirSync(path.dirname(SQL_PATH), { recursive: true });
    fs.writeFileSync(SQL_PATH, sql, 'utf8');
    console.log(`✓ 写出 ${path.relative(REPO_ROOT, SQL_PATH)}`);
  }
}

main().catch((error) => {
  console.error(`生成失败：${error.message}`);
  process.exit(1);
});
