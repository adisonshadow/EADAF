-- 应用部署（发布平台 / 发布应用）权限限制种子
-- 权限码已在 src/services/builtinApi/catalog.js 登记;
-- 本脚本把整组端点限制为仅超级管理员角色可调用:这些接口会在开发机上真实执行
-- pnpm pack:eadaf / pnpm pack:app（docker 构建 + 读写本机目录），并回显仓库路径。
-- 可重复执行。

START TRANSACTION;

INSERT INTO eadaf.builtin_api_configs (code, access_restriction) VALUES
  ('system:app_deployment:status',        '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb),
  ('system:app_deployment:app_inspect',   '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb),
  ('system:app_deployment:platform_pack', '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb),
  ('system:app_deployment:app_pack',      '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb),
  ('system:app_deployment:job_list',      '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb),
  ('system:app_deployment:job_get',       '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb),
  ('system:app_deployment:job_log',       '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb),
  ('system:app_deployment:job_stream',    '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb),
  ('system:app_deployment:job_cancel',    '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb)
ON CONFLICT (code) DO UPDATE SET access_restriction = EXCLUDED.access_restriction, updated_at = CURRENT_TIMESTAMP;

COMMIT;
