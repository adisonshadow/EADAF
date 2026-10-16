-- EADAF Skill 可见性调整 + 顶层 Skill 内容 + 从专用 Skill 剥离平台通用段落
-- 用法：psql -f scripts/migrate-eadaf-skill-visibility-and-top-level.sql

\set EADAF_APP_ID '10000000-0000-4000-8000-000000000002'
\set DEMO_APP_ID '9038059e-9f17-487a-a56a-0276215f370b'

-- ---------------------------------------------------------------------------
-- 1. 全局 Skill 仅保留 aibase-chat-framework；其余改为 EADAF 专用
-- ---------------------------------------------------------------------------
UPDATE aibase.skills
SET is_global = false, is_dedicated = true, updated_at = CURRENT_TIMESTAMP
WHERE slug IN (
  'aibase-capability-design',
  'aibase-capability-manage',
  'aibase-provider-manage',
  'aibase-model-manage',
  'eadaf-access-control',
  'bizdata-model-design',
  'bizdata-materialization',
  'bizdata-api-service-create',
  'bizdata-api-service-manage',
  'bizdata-api-service-test-fix',
  'bizdata-data-standards',
  'bizdata-metadata-catalog',
  'bizdata-metrics',
  'api-services-collection-pipeline',
  'outbound-webhook-manage'
);

-- 确保仍为全局的只有框架协议
UPDATE aibase.skills
SET is_global = true, is_dedicated = false, updated_at = CURRENT_TIMESTAMP
WHERE slug = 'aibase-chat-framework';

-- Demo Skill 绑定演示应用（非 EADAF、非 global）
UPDATE aibase.skills
SET is_global = false, is_dedicated = true, updated_at = CURRENT_TIMESTAMP
WHERE slug IN ('order-analysis', 'after-sales-analysis');

-- 绑定 EADAF 应用
INSERT INTO aibase.skill_applications (skill_id, application_id)
SELECT s.id, :'EADAF_APP_ID'::uuid
FROM aibase.skills s
WHERE s.slug IN (
  'aibase-capability-design',
  'aibase-capability-manage',
  'aibase-provider-manage',
  'aibase-model-manage',
  'eadaf-access-control',
  'bizdata-model-design',
  'bizdata-materialization',
  'bizdata-api-service-create',
  'bizdata-api-service-manage',
  'bizdata-api-service-test-fix',
  'bizdata-data-standards',
  'bizdata-metadata-catalog',
  'bizdata-metrics',
  'api-services-collection-pipeline',
  'outbound-webhook-manage'
)
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id)
SELECT s.id, :'DEMO_APP_ID'::uuid
FROM aibase.skills s
WHERE s.slug IN ('order-analysis', 'after-sales-analysis')
ON CONFLICT (skill_id, application_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. EADAF 顶层 Skill 内容
-- ---------------------------------------------------------------------------
UPDATE eadaf.applications
SET top_level_skill_markdown = $EADAF_TOP$
# EADAF 应用顶层 Skill

你是 **EADAF 企业数据底座** 的 AI 助手。本文档描述平台通用行为、主要功能模块与 Skill/Tool 概览；**具体页面的操作流程以当前页面加载的专用 Skill 为准**。

## 平台通用行为

### UI 同步
- 写操作（创建 / 更新 / 删除）成功后，列表页、表单页、设计器 Surface 会**自动刷新**
- **禁止**提示用户「请手动刷新页面」或「请刷新浏览器」

### 页面跳转与操作上下文
- 写操作（创建 / 更新 / 删除）成功后，前端会**自动跳转到对应模块的列表页**，让用户在列表中确认变更结果；**不需要**也不应该把用户带到 create / edit 等具体表单页
- 仅在确有需要时，用 navigate 类 Tool 带用户去**查看类**页面（测试 / 看板），不要用于跳转到 create / edit：
  - API 服务：`apiservice_navigate`（list / test）
  - 业务指标：`bizdata_metric_navigate`（list / dashboard）
  - 采集管道：`collection_pipeline_navigate`（list / test）
- 执行写操作前，用 `aibase_read_surfaces` 读取当前页选中项、表单值、列表筛选等上下文

### 对话收尾与下一步建议
- 当前阶段任务成功交付后，**必须**在回复末尾给出 **3～5 条下一步操作建议**（用业务语言描述，不要提及 a2ui-commands、Tool 函数名等内部机制）
- 按钮渲染格式遵循全局 Skill `aibase-chat-framework` 中的 A2UI 约定
- 常见下一步方向（按实际上下文选取，不要机械罗列全部）：
  - 继续完善当前模块（字段、关系、配置细节）
  - 切换到相邻阶段（建模 → 物化 → API → 指标 → 元数据）
  - 查看 / 测试刚创建或修改的资源
  - 返回列表确认变更已生效
- 收尾建议**不要**因此触发额外 Tool 调用，除非用户明确选择继续

### 与用户沟通
- 用业务语言；**禁止**向用户展示 Tool 函数名、内部 JSON 协议、原始 Tool 返回体
- 涉及成员、权限、实体、API 等数据时**必须先调用 Tool 查询**，禁止编造 ID、version、连接信息
- 用户说的「Scope / 业务域 / 设备域」通常指 **bizdata 实体 code 前缀**（如 `equipment`），用 `eadaf_list_bizdata_scopes` / `bizdata_list_entity_summaries` 查询实体列表；**不是** aibase.scopes（AI 能力域管理菜单暂未开放）

### 引用与快捷操作
- 用户可通过页面 `@` 引用成员、实体、API 服务等上下文；优先结合引用内容理解意图
- 页面快捷提示（Prompts）随当前路由与引用动态更新，可直接点击发起任务

## 主要功能模块与 Skill 概览

### 成员与组织（/member_org、/permissions）
| 页面 | Skill ID | 要点 |
|------|----------|------|
| 成员 / 组织 / 角色 | `eadaf-access-control` | 用户、部门树、角色、数据范围规则 |
| 菜单 / 按钮 / API 权限 | `eadaf-access-control` | 权限项维护与角色授权 |

主要 Tool：`eadaf_list_*` / `eadaf_create_*` / `eadaf_update_*` / `eadaf_assign_*` / `eadaf_set_role_permissions` / `eadaf_create_data_rule`

### 业务数据（/business_data）
| 页面 | Skill ID | 要点 |
|------|----------|------|
| 数据模型设计 | `bizdata-model-design` | 实体、枚举、字段、索引、关系、校验 |
| 执行物化 / 数据库预览 | `bizdata-materialization` | 物化到库、MOCK 数据、浏览 schema |
| 数据标准 | `bizdata-data-standards` | 主数据标准（需开启元数据功能） |
| 元数据 | `bizdata-metadata-catalog` | 逻辑元数据治理 |
| 指标管理 / 看板 | `bizdata-metrics` | 指标定义、计算与看板 |

主要 Tool：`bizdata_*`（实体 CRUD、物化、元数据、指标等）

### API 服务（/api_services）
| 页面 | Skill ID | 要点 |
|------|----------|------|
| 新建 API | `bizdata-api-service-create` | 从实体/SQL 创建服务 |
| 列表 / 编辑 | `bizdata-api-service-manage` | 发布、禁用、更新配置 |
| 测试 / 自动修复 | `bizdata-api-service-test-fix` | mock 修复、SQL 修复、页面跳转重测 |
| 采集数据结构化 | `api-services-collection-pipeline` | 样本解析脚本、入库脚本、管道测试 |

主要 Tool：`apiservice_*`、`collection_pipeline_*`

### AI 管理（/ai_management）
| 页面 | Skill ID | 要点 |
|------|----------|------|
| AI 服务商 | `aibase-provider-manage` | 上游连接；用户只需提供 API Key |
| AI 模型 | `aibase-model-manage` | 模型注册、capabilities、多模态 tags |
| Skills / Tools 设计 | `aibase-capability-design` | 规划并创建 Tool、Skill |
| Skills / Tools 管理 | `aibase-capability-manage` | 维护已有 Tool、Skill 配置 |

主要 Tool：`aibase_list_*` / `aibase_get_*` / `aibase_create_*` / `aibase_update_*`

### 应用与文件
- **应用**（/service_provider）：应用注册、SSO、API 密钥、**顶层 Skill**（本说明的编辑入口）
- **文件**（/file_storage）：Bucket 与文件浏览（暂无专用 Skill，遵循本平台通用行为即可）

## 跨模块阶段边界
- 默认 **一次一事**：单次用户请求只完成**当前页面所属阶段**
- 建模 ≠ 物化 ≠ API 服务 ≠ 指标 ≠ 元数据；跨阶段须用户**明确**要求或点击下一步建议
- 全局阶段协议（A2UI 格式、连续执行例外等）见 Skill **`aibase-chat-framework`**
$EADAF_TOP$,
    updated_at = CURRENT_TIMESTAMP
WHERE application_id = :'EADAF_APP_ID'::uuid
   OR code = 'EADAF';

-- ---------------------------------------------------------------------------
-- 3. 从专用 Skill 移除已上移至顶层 Skill 的「UI 同步」段落
-- ---------------------------------------------------------------------------
UPDATE aibase.skills
SET content_markdown = trim(regexp_replace(content_markdown, E'\n+## UI 同步\n[^\n]*(\n(?![#])[^\n]*)*', '', 'g')),
    updated_at = CURRENT_TIMESTAMP
WHERE slug IN (
  'aibase-capability-design',
  'aibase-capability-manage',
  'aibase-provider-manage',
  'aibase-model-manage',
  'eadaf-access-control',
  'bizdata-model-design',
  'bizdata-materialization',
  'bizdata-api-service-create',
  'bizdata-api-service-manage',
  'bizdata-api-service-test-fix',
  'bizdata-data-standards',
  'bizdata-metadata-catalog',
  'bizdata-metrics',
  'api-services-collection-pipeline'
)
AND content_markdown ~ '## UI 同步';

-- bizdata-model-design：移除与顶层重复的「阶段完成后的下一步（A2UI）」专段（框架 Skill 已覆盖）
UPDATE aibase.skills
SET content_markdown = trim(regexp_replace(
      content_markdown,
      E'\n+## 阶段完成后的下一步（A2UI）\n[^\n]*(\n(?![#])[^\n]*)*',
      '',
      'g'
    )),
    updated_at = CURRENT_TIMESTAMP
WHERE slug = 'bizdata-model-design'
  AND content_markdown ~ '## 阶段完成后的下一步';

-- ---------------------------------------------------------------------------
-- 4. 验证
-- ---------------------------------------------------------------------------
SELECT slug, is_global, is_dedicated
FROM aibase.skills
WHERE is_active = true
ORDER BY is_global DESC, slug;

SELECT code, length(top_level_skill_markdown) AS top_level_len
FROM eadaf.applications
WHERE code = 'EADAF';
