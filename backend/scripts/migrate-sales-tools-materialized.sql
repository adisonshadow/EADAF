-- 销售 Demo（app_example）的 AI 工具切到 **EADAF 物化表**：修正 Scope/Skill 文案与两个工具的入参类型。
--
-- 背景：这些 Tool 原先查本地 SQLite 演示库（backend/data/sales-demo.db），与页面读的物化表
-- 是两份数据。现在 handler 直连 bizdata_mat.ys_*，入参里的整数主键要改成 UUID/姓名。
--
-- 幂等：可重复执行；只动 sales-demo Scope 下的对象，不影响其它 Scope 与业务应用 Skill。
-- 已有实例执行本文件即可；新装实例由 aibase-ai-seed.sql 直接带新文案（本文件为 no-op）。

BEGIN;

UPDATE aibase.scopes
   SET description = 'EADAF_AIBase 销售管理系统 Demo Scope，Tool 查询 EADAF 物化表（bizdata_mat.ys_*，与页面/API 服务同源）',
       updated_at = now()
 WHERE slug = 'sales-demo';

UPDATE aibase.skills
   SET content_markdown = replace(
         content_markdown,
         '数据来自 SQLite 业务库',
         '数据来自 EADAF 物化表（bizdata_mat.ys_*，与页面/API 服务同源）'
       ),
       updated_at = now()
 WHERE scope_id = (SELECT id FROM aibase.scopes WHERE slug = 'sales-demo')
   AND content_markdown LIKE '%SQLite%';

UPDATE aibase.tools
   SET description = '按投诉 ID（UUID）或订单号查询投诉详情',
       parameters_schema = '{"type":"object","required":["id"],"properties":{"id":{"type":"string","description":"投诉 ID（UUID，来自 sales_list_complaints）或订单号，如 SO202501001"}}}'::jsonb,
       review_markdown = '## sales_get_complaint\n\n参数 id：投诉 UUID（来自 sales_list_complaints）或订单号；返回投诉、订单与会员信息。',
       updated_at = now()
 WHERE function_name = 'sales_get_complaint';

UPDATE aibase.tools
   SET description = '按状态、会员、日期、关键词搜索订单（数据来自 EADAF 物化表）',
       parameters_schema = '{"type":"object","properties":{"page":{"type":"integer"},"pageSize":{"type":"integer"},"status":{"enum":["pending","paid","shipped","completed","cancelled"],"type":"string"},"userId":{"type":"string","description":"会员 ID（UUID）或姓名"},"memberId":{"type":"string","description":"与 userId 等价"},"keyword":{"type":"string"},"dateFrom":{"type":"string"},"dateTo":{"type":"string"}}}'::jsonb,
       review_markdown = '## sales_search_orders\n\n支持 status/userId(会员 ID 或姓名)/keyword/dateFrom/dateTo 分页搜索，返回订单与会员姓名。',
       updated_at = now()
 WHERE function_name = 'sales_search_orders';

COMMIT;
