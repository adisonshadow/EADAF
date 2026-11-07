-- 为 aibase.models 增加 per-model 限流配置列。
-- 结构: { "maxConcurrent": number|null, "requestsPerMinute": number|null }，均可空（=不限流）。
-- 用于在上游 AI Provider（豆包/Seed 等突发保护严格的模型）前加护栏。
ALTER TABLE aibase.models
ADD COLUMN IF NOT EXISTS rate_limit JSONB;
