-- aibase-chat-framework + 顶层 Skill：Tool 结果汇报硬约束

UPDATE aibase.skills
SET
    content_markdown = content_markdown || E'

## Tool 结果汇报（硬约束）

- 每次 Tool 调用返回 **ToolResponse 信封**：`ok`、`verified`、`kind`（success / business_error / system_error）、`error.message`、`data`
- **写操作**（创建/更新/删除/发布/测试）：**禁止**在 `verified !== true` 或 `kind !== success` 时向用户声称成功
- `business_error` / `verified: false`：向用户说明 `error.message`，禁止脑补成功或编造 ID/status/preview
- 读操作以 `ok: true` 且 `kind: success` 的数据为准；禁止编造 Tool 未返回的字段
',
    updated_at = CURRENT_TIMESTAMP
WHERE slug = 'aibase-chat-framework'
  AND content_markdown NOT LIKE '%Tool 结果汇报（硬约束）%';

UPDATE eadaf.applications
SET
    top_level_skill_markdown = REPLACE(
        top_level_skill_markdown,
        '- 涉及成员、权限、实体、API 等数据时**必须先调用 Tool 查询**，禁止编造 ID、version、连接信息',
        '- 涉及成员、权限、实体、API 等数据时**必须先调用 Tool 查询**，禁止编造 ID、version、连接信息
- 写操作结果以 Tool 信封 `ok/verified/kind/error.message` 为准；`verified !== true` 时**禁止**声称创建/发布/测试成功'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE top_level_skill_markdown LIKE '%必须先调用 Tool 查询%'
  AND top_level_skill_markdown NOT LIKE '%verified !== true%';
