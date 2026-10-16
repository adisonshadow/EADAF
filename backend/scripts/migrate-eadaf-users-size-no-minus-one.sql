-- 纠正  用户列表 Tool 描述：/api/v1/users 不支持 size=-1（会 500），应使用 1–500

UPDATE aibase.tools
SET
  description = '分页列出系统用户，支持 username/name/status 筛选。禁止 size=-1；拉较多数据用 page=1&size=500，或改用 uac_filter_users',
  parameters_schema = '{"type":"object","properties":{"page":{"type":"integer","description":"页码，从 1 起"},"size":{"type":"integer","description":"每页条数，1–500；禁止 -1","minimum":1,"maximum":500},"username":{"type":"string"},"name":{"type":"string"},"status":{"type":"string","enum":["ACTIVE","DISABLED","ARCHIVED"]}}}'::jsonb,
  review_markdown = E'## uac_list_users\n\n- **禁止** `size=-1`（用户接口不支持，会 HTTP 500）\n- 拉较多数据：`page=1&size=500`\n- 按条件检索优先 `uac_filter_users`（内部固定 size=500）',
  updated_at = CURRENT_TIMESTAMP
WHERE function_name = 'uac_list_users';

UPDATE aibase.tools
SET
  description = '按过滤项检索用户，返回命中项（内部固定 page=1&size=500）。勿传 size=-1',
  review_markdown = E'## uac_filter_users\n\n参数全可选；不传则返回最多 500 条。返回 { items, total }。\n\n- 字段名用 camelCase（departmentId/userId）\n- **禁止**对用户接口使用 size=-1',
  updated_at = CURRENT_TIMESTAMP
WHERE function_name = 'uac_filter_users';

UPDATE aibase.skills
SET
  content_markdown = replace(
    content_markdown,
    E'## 创建用户\n',
    E'## 列出用户\n- 用 `uac_list_users` 或 `uac_filter_users`\n- **禁止**传 `size=-1`（用户接口会 500；与角色列表不同）\n- 正确示例：`page=1, size=500`\n\n## 创建用户\n'
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE slug = 'uac-access-control'
  AND content_markdown NOT LIKE '%禁止%传%size=-1%';
