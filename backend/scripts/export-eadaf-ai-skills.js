#!/usr/bin/env node
/**
 * 从当前库导出「EADAF 全局 + EADAF 专用」Skill/Tool/Scope，生成可重复执行的 upsert SQL。
 *
 * 范围：
 * - is_global = true
 * - 或 is_dedicated = true 且 skill_applications 绑定应用 code=EADAF
 * 不含业务应用专用 Skill（如 SFDEP / sales-demo）。
 *
 * 用法（在 backend 目录）：
 *   node scripts/export-eadaf-ai-skills.js
 *   node scripts/export-eadaf-ai-skills.js --stdout
 *
 * 默认写入 scripts/migrate-eadaf-ai-skills.sql，供 init-db 与服务器 pnpm migrate-eadaf-ai-skills。
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(__dirname, 'migrate-eadaf-ai-skills.sql');
const NODE_ENV = process.env.NODE_ENV || 'development';
const envFile = path.join(ROOT, `.env.${NODE_ENV}`);
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString('hex')}'`;
  if (typeof value === 'object') {
    return `${sqlString(JSON.stringify(value))}::jsonb`;
  }
  return sqlString(String(value));
}

function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

const EADAF_SKILL_SQL = `
SELECT s.id, s.scope_id, s.name, s.slug, s.description, s.content_markdown, s.is_active,
       s.is_global, s.is_dedicated, s.completion_strategy, s.created_at, s.updated_at
FROM aibase.skills s
WHERE s.is_global = true
   OR (
     s.is_dedicated = true
     AND EXISTS (
       SELECT 1
       FROM aibase.skill_applications sa
       JOIN eadaf.applications a ON a.application_id = sa.application_id
       WHERE sa.skill_id = s.id AND a.code = 'EADAF'
     )
   )
ORDER BY s.slug
`;

async function main() {
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '25432', 10),
    database: process.env.POSTGRES_DATABASE || 'eadaf_db',
    user: process.env.POSTGRES_USER || 'my_name',
    password: process.env.POSTGRES_PASSWORD || '123456',
  });
  await client.connect();

  const skills = (await client.query(EADAF_SKILL_SQL)).rows;
  const skillIds = skills.map((s) => s.id);
  const skillSlugs = skills.map((s) => s.slug);

  const skillTools = skillIds.length
    ? (
      await client.query(
        `SELECT st.id, st.skill_id, st.tool_id, st.sort_order, s.slug AS skill_slug, t.function_name
         FROM aibase.skill_tools st
         JOIN aibase.skills s ON s.id = st.skill_id
         JOIN aibase.tools t ON t.id = st.tool_id
         WHERE st.skill_id = ANY($1::uuid[])
         ORDER BY s.slug, st.sort_order, t.function_name`,
        [skillIds],
      )
    ).rows
    : [];

  const toolIds = [...new Set(skillTools.map((r) => r.tool_id))];
  const tools = toolIds.length
    ? (
      await client.query(
        `SELECT t.id, t.scope_id, t.name, t.slug, t.function_name, t.description, t.execution_type,
                t.parameters_schema, t.review_markdown, t.server_config, t.is_active,
                t.created_at, t.updated_at, sc.slug AS scope_slug
         FROM aibase.tools t
         JOIN aibase.scopes sc ON sc.id = t.scope_id
         WHERE t.id = ANY($1::uuid[])
         ORDER BY t.function_name`,
        [toolIds],
      )
    ).rows
    : [];

  const scopeIds = [...new Set([
    ...skills.map((s) => s.scope_id).filter(Boolean),
    ...tools.map((t) => t.scope_id),
  ])];
  const scopes = scopeIds.length
    ? (
      await client.query(
        `SELECT id, name, slug, description, is_active, created_at, updated_at
         FROM aibase.scopes WHERE id = ANY($1::uuid[]) ORDER BY slug`,
        [scopeIds],
      )
    ).rows
    : [];

  const scopeById = new Map(scopes.map((s) => [s.id, s.slug]));
  const dedicatedSlugs = skills.filter((s) => s.is_dedicated).map((s) => s.slug);

  const topLevel = (
    await client.query(
      `SELECT top_level_skill_markdown
       FROM eadaf.applications
       WHERE code = 'EADAF'
         AND top_level_skill_markdown IS NOT NULL
         AND btrim(top_level_skill_markdown) <> ''`,
    )
  ).rows;

  await client.end();

  const out = [];
  out.push(`-- migrate-eadaf-ai-skills.sql`);
  out.push(`-- EADAF 全局 + EADAF 专用 Skill/Tool/Scope 幂等 upsert（不 TRUNCATE，不删业务应用 Skill）。`);
  out.push(`-- 由 scripts/export-eadaf-ai-skills.js 从现库导出。本地改完 Skill 后重新导出并在服务器执行。`);
  out.push(`-- 生成时间: ${new Date().toISOString()}`);
  out.push(`-- scopes=${scopes.length} tools=${tools.length} skills=${skills.length} skill_tools=${skillTools.length}`);
  out.push(``);
  out.push(`BEGIN;`);
  out.push(``);

  out.push(`-- ===== scopes =====`);
  if (!scopes.length) out.push(`-- (no scopes)`);
  for (const row of scopes) {
    out.push(`INSERT INTO aibase.scopes (id, name, slug, description, is_active, created_at, updated_at)`);
    out.push(`VALUES (${sqlLiteral(row.id)}, ${sqlLiteral(row.name)}, ${sqlLiteral(row.slug)}, ${sqlLiteral(row.description)}, ${sqlLiteral(row.is_active)}, ${sqlLiteral(row.created_at)}, ${sqlLiteral(row.updated_at)})`);
    out.push(`ON CONFLICT (slug) DO UPDATE SET`);
    out.push(`  name = EXCLUDED.name,`);
    out.push(`  description = EXCLUDED.description,`);
    out.push(`  is_active = EXCLUDED.is_active,`);
    out.push(`  updated_at = CURRENT_TIMESTAMP;`);
    out.push(``);
  }

  out.push(`-- ===== tools（按 function_name upsert，scope 按 slug 解析） =====`);
  if (!tools.length) out.push(`-- (no tools)`);
  for (const row of tools) {
    const scopeSlug = row.scope_slug || scopeById.get(row.scope_id);
    out.push(`INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)`);
    out.push(`VALUES (`);
    out.push(`  ${sqlLiteral(row.id)},`);
    out.push(`  (SELECT id FROM aibase.scopes WHERE slug = ${sqlLiteral(scopeSlug)}),`);
    out.push(`  ${sqlLiteral(row.name)}, ${sqlLiteral(row.slug)}, ${sqlLiteral(row.function_name)},`);
    out.push(`  ${sqlLiteral(row.description)}, ${sqlLiteral(row.execution_type)},`);
    out.push(`  ${sqlLiteral(row.parameters_schema)}, ${sqlLiteral(row.review_markdown)}, ${sqlLiteral(row.server_config)},`);
    out.push(`  ${sqlLiteral(row.is_active)}, ${sqlLiteral(row.created_at)}, ${sqlLiteral(row.updated_at)}`);
    out.push(`)`);
    out.push(`ON CONFLICT (function_name) DO UPDATE SET`);
    out.push(`  name = EXCLUDED.name,`);
    out.push(`  slug = EXCLUDED.slug,`);
    out.push(`  description = EXCLUDED.description,`);
    out.push(`  execution_type = EXCLUDED.execution_type,`);
    out.push(`  parameters_schema = EXCLUDED.parameters_schema,`);
    out.push(`  review_markdown = EXCLUDED.review_markdown,`);
    out.push(`  server_config = EXCLUDED.server_config,`);
    out.push(`  is_active = EXCLUDED.is_active,`);
    out.push(`  scope_id = EXCLUDED.scope_id,`);
    out.push(`  updated_at = CURRENT_TIMESTAMP;`);
    out.push(``);
  }

  out.push(`-- ===== skills（按 slug upsert） =====`);
  if (!skills.length) out.push(`-- (no skills)`);
  for (const row of skills) {
    const scopeSlug = scopeById.get(row.scope_id);
    const scopeExpr = scopeSlug
      ? `(SELECT id FROM aibase.scopes WHERE slug = ${sqlLiteral(scopeSlug)})`
      : 'NULL';
    out.push(`INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)`);
    out.push(`VALUES (`);
    out.push(`  ${sqlLiteral(row.id)},`);
    out.push(`  ${scopeExpr},`);
    out.push(`  ${sqlLiteral(row.name)}, ${sqlLiteral(row.slug)}, ${sqlLiteral(row.description)},`);
    out.push(`  ${sqlLiteral(row.content_markdown)}, ${sqlLiteral(row.is_active)},`);
    out.push(`  ${sqlLiteral(row.is_global)}, ${sqlLiteral(row.is_dedicated)}, ${sqlLiteral(row.completion_strategy)},`);
    out.push(`  ${sqlLiteral(row.created_at)}, ${sqlLiteral(row.updated_at)}`);
    out.push(`)`);
    out.push(`ON CONFLICT (slug) DO UPDATE SET`);
    out.push(`  name = EXCLUDED.name,`);
    out.push(`  description = EXCLUDED.description,`);
    out.push(`  content_markdown = EXCLUDED.content_markdown,`);
    out.push(`  is_active = EXCLUDED.is_active,`);
    out.push(`  is_global = EXCLUDED.is_global,`);
    out.push(`  is_dedicated = EXCLUDED.is_dedicated,`);
    out.push(`  completion_strategy = EXCLUDED.completion_strategy,`);
    out.push(`  scope_id = EXCLUDED.scope_id,`);
    out.push(`  updated_at = CURRENT_TIMESTAMP;`);
    out.push(``);
  }

  out.push(`-- ===== skill_tools（按 skill.slug + tool.function_name 对齐） =====`);
  if (!skillTools.length) out.push(`-- (no skill_tools)`);
  for (const row of skillTools) {
    out.push(`INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)`);
    out.push(`SELECT ${sqlLiteral(row.id)}, s.id, t.id, ${sqlLiteral(row.sort_order)}`);
    out.push(`FROM aibase.skills s`);
    out.push(`JOIN aibase.tools t ON t.function_name = ${sqlLiteral(row.function_name)}`);
    out.push(`WHERE s.slug = ${sqlLiteral(row.skill_slug)}`);
    out.push(`ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;`);
    out.push(``);
  }

  if (skillSlugs.length && skillTools.length) {
    const keepValues = skillTools
      .map((r) => `(${sqlLiteral(r.skill_slug)}, ${sqlLiteral(r.function_name)})`)
      .join(',\n  ');
    out.push(`-- 收敛本批 Skill 的 Tool 绑定（删除本地已去掉的关系，不碰其他应用 Skill）`);
    out.push(`DELETE FROM aibase.skill_tools st`);
    out.push(`USING aibase.skills s`);
    out.push(`WHERE st.skill_id = s.id`);
    out.push(`  AND s.slug IN (${skillSlugs.map((slug) => sqlLiteral(slug)).join(', ')})`);
    out.push(`  AND NOT EXISTS (`);
    out.push(`    SELECT 1`);
    out.push(`    FROM (VALUES`);
    out.push(`  ${keepValues}`);
    out.push(`    ) AS keep(skill_slug, tool_fn)`);
    out.push(`    JOIN aibase.tools t ON t.function_name = keep.tool_fn`);
    out.push(`    WHERE keep.skill_slug = s.slug AND t.id = st.tool_id`);
    out.push(`  );`);
    out.push(``);
  }

  if (dedicatedSlugs.length) {
    out.push(`-- ===== skill_applications：专用 Skill 绑定 EADAF =====`);
    for (const slug of dedicatedSlugs) {
      out.push(`INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)`);
      out.push(`SELECT s.id, a.application_id, CURRENT_TIMESTAMP`);
      out.push(`FROM aibase.skills s`);
      out.push(`JOIN eadaf.applications a ON a.code = 'EADAF'`);
      out.push(`WHERE s.slug = ${sqlLiteral(slug)}`);
      out.push(`ON CONFLICT (skill_id, application_id) DO NOTHING;`);
      out.push(``);
    }
  }

  if (topLevel.length) {
    out.push(`-- EADAF 顶层 Skill Markdown`);
    out.push(`UPDATE eadaf.applications`);
    out.push(`SET top_level_skill_markdown = ${sqlLiteral(topLevel[0].top_level_skill_markdown)},`);
    out.push(`    updated_at = CURRENT_TIMESTAMP`);
    out.push(`WHERE code = 'EADAF';`);
    out.push(``);
  }

  out.push(`COMMIT;`);
  out.push(``);

  const sql = out.join('\n');
  if (process.argv.includes('--stdout')) {
    process.stdout.write(sql);
    return;
  }
  fs.writeFileSync(OUT_FILE, sql, 'utf8');
  process.stderr.write(`已写入 ${OUT_FILE}（skills=${skills.length} tools=${tools.length}）\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
