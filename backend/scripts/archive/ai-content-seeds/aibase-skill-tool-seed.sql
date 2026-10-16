-- AIBase 销售管理系统 Demo 种子数据
-- Scope: sales-demo | Skills: order-analysis, after-sales-analysis | Tools: 8 x server_builtin

-- 停用旧 ERP Demo
UPDATE aibase.scopes SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE slug = 'erp-demo';
UPDATE aibase.tools SET is_active = false, updated_at = CURRENT_TIMESTAMP
WHERE scope_id = (SELECT id FROM aibase.scopes WHERE slug = 'erp-demo');
UPDATE aibase.skills SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE slug = 'erp-assistant';

INSERT INTO aibase.scopes (id, name, slug, description, is_active)
VALUES (
    '33333333-3333-4333-8333-333333333302',
    '销售管理系统 Demo',
    'sales-demo',
    'AIBase_with_example 销售管理系统 Demo Scope，Tool 查询 SQLite 业务库',
    true
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (
    id, scope_id, name, slug, function_name, description,
    execution_type, parameters_schema, review_markdown, server_config, is_active
)
VALUES
    (
        '44444444-4444-4444-8444-444444444411',
        '33333333-3333-4333-8333-333333333302',
        '查询订单详情',
        'sales-get-order',
        'sales_get_order',
        '按订单号查询订单、明细与用户信息',
        'server_builtin',
        '{"type":"object","properties":{"orderNo":{"type":"string","description":"订单号，如 SO202501001"}},"required":["orderNo"]}'::jsonb,
        '## sales_get_order\n\n参数 orderNo，返回订单详情与 order_items。',
        '{"handler":"sales_get_order"}'::jsonb,
        true
    ),
    (
        '44444444-4444-4444-8444-444444444412',
        '33333333-3333-4333-8333-333333333302',
        '搜索订单',
        'sales-search-orders',
        'sales_search_orders',
        '按状态、用户、日期、关键词搜索订单',
        'server_builtin',
        '{"type":"object","properties":{"status":{"type":"string","enum":["pending","paid","shipped","completed","cancelled"]},"userId":{"type":"integer"},"keyword":{"type":"string"},"dateFrom":{"type":"string"},"dateTo":{"type":"string"},"page":{"type":"integer"},"pageSize":{"type":"integer"}}}'::jsonb,
        '## sales_search_orders\n\n支持 status/userId/keyword/dateFrom/dateTo 分页搜索。',
        '{"handler":"sales_search_orders"}'::jsonb,
        true
    ),
    (
        '44444444-4444-4444-8444-444444444413',
        '33333333-3333-4333-8333-333333333302',
        '订单状态统计',
        'sales-order-stats-status',
        'sales_order_stats_by_status',
        '按订单状态汇总数量与金额',
        'server_builtin',
        '{"type":"object","properties":{}}'::jsonb,
        '## sales_order_stats_by_status\n\n返回各 status 的 order_count 与 total_amount。',
        '{"handler":"sales_order_stats_by_status"}'::jsonb,
        true
    ),
    (
        '44444444-4444-4444-8444-444444444414',
        '33333333-3333-4333-8333-333333333302',
        '订单趋势统计',
        'sales-order-stats-period',
        'sales_order_stats_by_period',
        '按日/周/月统计近 N 天订单趋势',
        'server_builtin',
        '{"type":"object","properties":{"days":{"type":"integer","description":"统计天数，默认30"},"groupBy":{"type":"string","enum":["day","week","month"],"description":"聚合粒度"}}}'::jsonb,
        '## sales_order_stats_by_period\n\n参数 days、groupBy(day|week|month)。',
        '{"handler":"sales_order_stats_by_period"}'::jsonb,
        true
    ),
    (
        '44444444-4444-4444-8444-444444444415',
        '33333333-3333-4333-8333-333333333302',
        '投诉列表',
        'sales-list-complaints',
        'sales_list_complaints',
        '按类型、状态、订单号查询投诉列表',
        'server_builtin',
        '{"type":"object","properties":{"type":{"type":"string","enum":["quality","logistics","service","refund"]},"status":{"type":"string","enum":["open","processing","resolved","closed"]},"orderNo":{"type":"string"},"page":{"type":"integer"},"pageSize":{"type":"integer"}}}'::jsonb,
        '## sales_list_complaints\n\n分页返回投诉及关联订单、用户。',
        '{"handler":"sales_list_complaints"}'::jsonb,
        true
    ),
    (
        '44444444-4444-4444-8444-444444444416',
        '33333333-3333-4333-8333-333333333302',
        '投诉详情',
        'sales-get-complaint',
        'sales_get_complaint',
        '按投诉 ID 查询详情',
        'server_builtin',
        '{"type":"object","properties":{"id":{"type":"integer","description":"投诉 ID"}},"required":["id"]}'::jsonb,
        '## sales_get_complaint\n\n参数 id，返回投诉与订单、用户信息。',
        '{"handler":"sales_get_complaint"}'::jsonb,
        true
    ),
    (
        '44444444-4444-4444-8444-444444444417',
        '33333333-3333-4333-8333-333333333302',
        '投诉类型统计',
        'sales-complaint-stats-type',
        'sales_complaint_stats_by_type',
        '按投诉类型汇总数量',
        'server_builtin',
        '{"type":"object","properties":{}}'::jsonb,
        '## sales_complaint_stats_by_type\n\n返回 quality/logistics/service/refund 分布。',
        '{"handler":"sales_complaint_stats_by_type"}'::jsonb,
        true
    ),
    (
        '44444444-4444-4444-8444-444444444418',
        '33333333-3333-4333-8333-333333333302',
        '投诉状态统计',
        'sales-complaint-stats-status',
        'sales_complaint_stats_by_status',
        '按投诉处理状态汇总数量',
        'server_builtin',
        '{"type":"object","properties":{}}'::jsonb,
        '## sales_complaint_stats_by_status\n\n返回 open/processing/resolved/closed 分布。',
        '{"handler":"sales_complaint_stats_by_status"}'::jsonb,
        true
    )
ON CONFLICT (slug) DO UPDATE SET
    scope_id = EXCLUDED.scope_id,
    name = EXCLUDED.name,
    function_name = EXCLUDED.function_name,
    description = EXCLUDED.description,
    execution_type = EXCLUDED.execution_type,
    parameters_schema = EXCLUDED.parameters_schema,
    review_markdown = EXCLUDED.review_markdown,
    server_config = EXCLUDED.server_config,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active)
VALUES
    (
        '55555555-5555-4555-8555-555555555511',
        '33333333-3333-4333-8333-333333333302',
        '订单分析',
        'order-analysis',
        '销售 Demo 订单查询与统计分析',
        E'# 订单分析 Skill\n\n你是销售管理系统的订单分析助手，数据来自 SQLite 业务库。\n\n## 能力\n\n- 查询单笔订单：使用 `sales_get_order`\n- 搜索订单：使用 `sales_search_orders`\n- 状态汇总：使用 `sales_order_stats_by_status`\n- 趋势分析：使用 `sales_order_stats_by_period`\n\n## 回答要求\n\n- 使用中文，结论清晰\n- 涉及金额保留两位小数\n- 无数据时说明可能原因\n\n## 报告与可视化\n\n当用户要求**报告**、**统计分析**、**趋势**或**分布**时，除文字与表格外，必须根据 Tool 返回数据插入 1～2 个 GPT-Vis 图表，禁止编造数值。\n\n### 图表语法（标签与 JSON 同一行，标签内不要空行）\n\n**折线/趋势**（`sales_order_stats_by_period`，time=period，value=order_count 或 total_amount）：\n\n<custom-line data-axis-x-title="周期" data-axis-y-title="订单数">[{"time":"2025-01","value":5}]</custom-line>\n\n**柱状对比**（`sales_order_stats_by_status`，category=status，value=order_count）：\n\n<custom-column data-axis-x-title="状态" data-axis-y-title="订单数">[{"category":"paid","value":12}]</custom-column>\n\n**饼图占比**（如按状态金额占比，category=status，value=total_amount）：\n\n<custom-pie title="订单状态分布">[{"category":"paid","value":1200.5}]</custom-pie>\n\n也可使用 language 为 `vis-chart` 的代码块，内容为单行 JSON，例如 {"type":"line","data":[{"time":"2025-01","value":5}],"axisXTitle":"周期","axisYTitle":"订单数"}。',
        true
    ),
    (
        '55555555-5555-4555-8555-555555555512',
        '33333333-3333-4333-8333-333333333302',
        '售后分析',
        'after-sales-analysis',
        '销售 Demo 投诉查询与统计分析',
        E'# 售后分析 Skill\n\n你是销售管理系统的售后分析助手，处理订单投诉相关咨询。\n\n## 能力\n\n- 投诉列表：使用 `sales_list_complaints`\n- 投诉详情：使用 `sales_get_complaint`\n- 类型分布：使用 `sales_complaint_stats_by_type`\n- 状态分布：使用 `sales_complaint_stats_by_status`\n\n## 回答要求\n\n- 使用中文\n- 说明投诉类型 quality/logistics/service/refund 的含义\n- 对 open 状态投诉提示需跟进\n\n## 报告与可视化\n\n当用户要求**报告**、**统计分析**或**分布**时，除文字与表格外，必须根据 Tool 返回数据插入 1～2 个 GPT-Vis 图表，禁止编造数值。\n\n### 图表语法（标签与 JSON 同一行，标签内不要空行）\n\n**饼图**（`sales_complaint_stats_by_type`，category=type，value=complaint_count）：\n\n<custom-pie title="投诉类型分布">[{"category":"quality","value":3}]</custom-pie>\n\n**柱状图**（`sales_complaint_stats_by_status`，category=status，value=complaint_count）：\n\n<custom-column data-axis-x-title="处理状态" data-axis-y-title="投诉数">[{"category":"open","value":2}]</custom-column>\n\n也可使用 language 为 `vis-chart` 的代码块，内容为单行 JSON，例如 {"type":"pie","data":[{"category":"quality","value":3}],"title":"投诉类型分布"}。',
        true
    )
ON CONFLICT (slug) DO UPDATE SET
    scope_id = EXCLUDED.scope_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    content_markdown = EXCLUDED.content_markdown,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

DELETE FROM aibase.skill_tools
WHERE skill_id IN (
    SELECT id FROM aibase.skills WHERE slug IN ('order-analysis', 'after-sales-analysis', 'erp-assistant')
);

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
VALUES
    ('66666666-6666-4666-8666-666666666611', '55555555-5555-4555-8555-555555555511', '44444444-4444-4444-8444-444444444411', 0),
    ('66666666-6666-4666-8666-666666666612', '55555555-5555-4555-8555-555555555511', '44444444-4444-4444-8444-444444444412', 1),
    ('66666666-6666-4666-8666-666666666613', '55555555-5555-4555-8555-555555555511', '44444444-4444-4444-8444-444444444413', 2),
    ('66666666-6666-4666-8666-666666666614', '55555555-5555-4555-8555-555555555511', '44444444-4444-4444-8444-444444444414', 3),
    ('66666666-6666-4666-8666-666666666621', '55555555-5555-4555-8555-555555555512', '44444444-4444-4444-8444-444444444415', 0),
    ('66666666-6666-4666-8666-666666666622', '55555555-5555-4555-8555-555555555512', '44444444-4444-4444-8444-444444444416', 1),
    ('66666666-6666-4666-8666-666666666623', '55555555-5555-4555-8555-555555555512', '44444444-4444-4444-8444-444444444417', 2),
    ('66666666-6666-4666-8666-666666666624', '55555555-5555-4555-8555-555555555512', '44444444-4444-4444-8444-444444444418', 3)
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

-- SSO 应用 AIBase_with_example（redirect_uri 需在管理台按需调整）
DELETE FROM eadaf.applications
WHERE code = 'AIBase_with_example'
  AND application_id = '77777777-7777-7777-8777-777777777701';

INSERT INTO eadaf.applications (
    application_id, name, code, status, sso_enabled, sso_config, description
)
VALUES (
    '9038059e-9f17-487a-a56a-0276215f370b',
    'EADAF AIBase 演示',
    'AIBase_with_example',
    'ACTIVE',
    true,
    '{
        "protocol": "OIDC",
        "redirect_uri": "http://localhost:9529/auth/callback",
        "redirect_mode": "HEADER_REDIRECT",
        "base_url": "http://localhost:9526"
    }'::jsonb,
    'AIBase_with_example Vite 业务系统接入样板'
)
ON CONFLICT (code) DO UPDATE SET
    application_id = EXCLUDED.application_id,
    name = EXCLUDED.name,
    status = EXCLUDED.status,
    sso_enabled = EXCLUDED.sso_enabled,
    sso_config = EXCLUDED.sso_config,
    description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;
