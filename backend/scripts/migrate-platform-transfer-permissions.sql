-- EADAF 平台导出/导入 权限限制种子
-- 三个内置 API 权限码已在 src/services/builtinApi/catalog.js 登记;
-- 本脚本将其访问限制配置为仅超级管理员角色可调用(导出文件包含明文密钥)。
-- 可重复执行。

START TRANSACTION;

INSERT INTO eadaf.builtin_api_configs (code, access_restriction) VALUES
  ('system:platform_transfer:export',  '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb),
  ('system:platform_transfer:preview', '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb),
  ('system:platform_transfer:import',  '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb)
ON CONFLICT (code) DO UPDATE SET access_restriction = EXCLUDED.access_restriction, updated_at = CURRENT_TIMESTAMP;

COMMIT;
