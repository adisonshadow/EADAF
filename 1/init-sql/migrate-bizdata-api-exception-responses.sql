-- API 异常响应模板表（bizdata schema）
-- 全局共享的异常响应契约（401/403/404/409/500 等），用于 apis.json 与 API 文档页展示

CREATE TABLE IF NOT EXISTS bizdata.api_exception_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code INTEGER NOT NULL UNIQUE,
    title VARCHAR(128) NOT NULL,
    description TEXT,
    schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    example JSONB,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_exception_responses_code ON bizdata.api_exception_responses (code);
CREATE INDEX IF NOT EXISTS idx_api_exception_responses_enabled ON bizdata.api_exception_responses (is_enabled);

-- 种子数据：标准异常响应模板（幂等，仅在不存在时插入）
INSERT INTO bizdata.api_exception_responses (code, title, description, schema, example, is_enabled, sort_order)
SELECT * FROM (VALUES
  (
    401,
    '未授权',
    '请求未携带有效的认证凭证，或凭证已过期。请在请求头中携带有效的 Authorization Bearer Token。',
    '{"type":"object","properties":{"code":{"type":"integer","example":401},"message":{"type":"string","example":"未授权，请先登录"}},"required":["code","message"]}'::jsonb,
    '{"code":401,"message":"未授权，请先登录"}'::jsonb,
    TRUE,
    10
  ),
  (
    403,
    '禁止访问',
    '已认证但无权访问该资源。当前用户角色/组织不在该 API 的访问限制允许范围内。',
    '{"type":"object","properties":{"code":{"type":"integer","example":403},"message":{"type":"string","example":"无权访问该资源"}},"required":["code","message"]}'::jsonb,
    '{"code":403,"message":"无权访问该资源"}'::jsonb,
    TRUE,
    20
  ),
  (
    404,
    '资源不存在',
    '请求的资源不存在。可能是 ID 错误、资源已删除，或路径（routePath）未匹配到已发布的 API 服务。',
    '{"type":"object","properties":{"code":{"type":"integer","example":404},"message":{"type":"string","example":"资源不存在"}},"required":["code","message"]}'::jsonb,
    '{"code":404,"message":"资源不存在"}'::jsonb,
    TRUE,
    30
  ),
  (
    409,
    '冲突',
    '请求与服务器当前状态冲突（如唯一约束冲突、资源已存在、并发版本不匹配）。',
    '{"type":"object","properties":{"code":{"type":"integer","example":409},"message":{"type":"string","example":"资源已存在，操作冲突"}},"required":["code","message"]}'::jsonb,
    '{"code":409,"message":"资源已存在，操作冲突"}'::jsonb,
    TRUE,
    40
  ),
  (
    500,
    '服务器错误',
    '服务器内部错误。可能是 SQL 执行失败、数据库连接异常或未知的服务端异常。',
    '{"type":"object","properties":{"code":{"type":"integer","example":500},"message":{"type":"string","example":"服务器内部错误"}},"required":["code","message"]}'::jsonb,
    '{"code":500,"message":"服务器内部错误"}'::jsonb,
    TRUE,
    50
  )
) AS t(code, title, description, schema, example, is_enabled, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM bizdata.api_exception_responses WHERE code = t.code);
