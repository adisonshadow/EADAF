-- 把历史遗留的 UAC / UAC2 / uac 命名统一为 EADAF（schema + 存库的 AI 文本）
--
-- 背景：项目历经 UAC → UAC2 → EADAF；代码已改名，但库里还留着
--   · schema `uac`（20 张表）
--   · AI Tool 的函数名 `uac_*`（20 个，client 类型，前端按同名注册）
--   · Skill / Scope / 应用顶层 Skill 的文本里写着 EUAC / UAC / uac_
--
-- 幂等：可重复执行；schema 改名只在"uac 存在且 eadaf 不存在"时发生。
-- **执行前请先备份**：bash backend/scripts/backup-db-now.sh
-- 用法：psql -f backend/scripts/migrate-uac-to-eadaf.sql
--      （或 pnpm --filter ./backend migrate-uac-to-eadaf）

BEGIN;

-- 1) schema 改名（Postgres 会自动改写表/序列/索引/约束/触发器/函数所属命名空间与跨 schema 外键）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'uac')
     AND NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'eadaf') THEN
    ALTER SCHEMA uac RENAME TO eadaf;
    RAISE NOTICE 'schema 已改名：uac → eadaf';
  ELSE
    RAISE NOTICE 'schema 无需改名（uac 不存在或 eadaf 已存在）';
  END IF;
END $$;

-- 文本归一化表达式（按顺序：EUAC → UAC → uac- 前缀/下划线/点 → 独立小写 uac）
CREATE OR REPLACE FUNCTION pg_temp.eadafify(txt text) RETURNS text AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(
                   regexp_replace(coalesce(txt, ''), 'EUAC', 'EADAF', 'g'),
                 'UAC', 'EADAF', 'g'),
               'eadaf-access-control', 'eadaf-access-control', 'g'),
             'uac_', 'eadaf_', 'g'),
           'uac\.', 'eadaf.', 'g'),
         '\muac\M', 'eadaf', 'g');
$$ LANGUAGE sql IMMUTABLE;

-- 2) AI Tool：函数名 + 文本
UPDATE aibase.tools t
   SET function_name = pg_temp.eadafify(function_name),
       name = pg_temp.eadafify(name),
       description = pg_temp.eadafify(description),
       review_markdown = pg_temp.eadafify(review_markdown),
       updated_at = now()
 WHERE to_jsonb(t)::text ~* 'uac';

-- 2b) Tool 的 slug（如 uac-list-users → eadaf-list-users）
UPDATE aibase.tools t
   SET slug = replace(slug, 'uac-', 'eadaf-'),
       updated_at = now()
 WHERE slug ~* 'uac';

-- 3) Skill：slug + 文本
UPDATE aibase.skills s
   SET slug = replace(slug, 'uac-', 'eadaf-'),
       name = pg_temp.eadafify(name),
       description = pg_temp.eadafify(description),
       content_markdown = pg_temp.eadafify(content_markdown),
       updated_at = now()
 WHERE to_jsonb(s)::text ~* 'uac';

-- 4) Scope：文本（slug 里没有 uac）
UPDATE aibase.scopes sc
   SET name = pg_temp.eadafify(name),
       description = pg_temp.eadafify(description),
       updated_at = now()
 WHERE to_jsonb(sc)::text ~* 'uac';

-- 5) 应用上的顶层 Skill 文本与展示名（不改 code：应用 code 会进 API 路径）
UPDATE eadaf.applications a
   SET name = pg_temp.eadafify(name),
       top_level_skill_markdown = pg_temp.eadafify(top_level_skill_markdown),
       updated_at = now()
 WHERE to_jsonb(a)::text ~* 'uac';

-- 5b) 应用描述文本
UPDATE eadaf.applications a
   SET description = pg_temp.eadafify(description),
       updated_at = now()
 WHERE description ~* 'uac';

-- 5c) 业务数据的 Scope 文档文本（bizdata schema，不受 schema 改名影响）
UPDATE bizdata.scope_docs d
   SET content_markdown = pg_temp.eadafify(content_markdown),
       updated_at = now()
 WHERE to_jsonb(d)::text ~ 'EUAC|UAC|uac_|uac\.|uac-';

-- 6) 历史演示应用的应用码（EUAC_AIBase → EADAF_AIBase）
--    注意：应用 code 会进 API 路径（/api/v1/data/<code>/...），改名会影响调用方；
--    已确认本库中除该行自身外无其它引用。
UPDATE eadaf.applications
   SET code = 'EADAF_AIBase',
       updated_at = now()
 WHERE code = 'EUAC_AIBase';

COMMIT;

-- 执行后自检（应全为 0）
--   SELECT count(*) FROM aibase.tools t   WHERE to_jsonb(t)::text  ~* 'uac';
--   SELECT count(*) FROM aibase.skills s  WHERE to_jsonb(s)::text  ~* 'uac';
--   SELECT count(*) FROM aibase.scopes sc WHERE to_jsonb(sc)::text ~* 'uac';
--   SELECT count(*) FROM eadaf.applications a WHERE to_jsonb(a)::text ~* 'uac';
