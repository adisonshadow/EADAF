-- 增量：为 skills 表增加声明式 auto-continue 策略字段
-- 用法：psql -f scripts/migrate-skill-completion-strategy.sql
--
-- completion_strategy (JSONB) 取代前端 SDK 内硬编码的业务判定（bizdata/apiservice 等）：
-- {
--   "requiredTools": ["bizdata_validate_model"],      // 必须全部调用过才算完成
--   "completionKeywords": ["建模完成", "校验通过"],     // 文本命中即视为任务完成
--   "blockKeywords": ["接下来您可以", "建议您"],        // 文本命中即禁止续调
--   "continuousExecution": true                       // 连续执行型（test-fix 循环等）
-- }
-- 该字段可为空（老数据不受影响），前端 registerSkillCompletionPolicy 提供覆盖兜底。

ALTER TABLE aibase.skills
  ADD COLUMN IF NOT EXISTS completion_strategy JSONB DEFAULT NULL;

COMMENT ON COLUMN aibase.skills.completion_strategy IS
  '声明式 auto-continue 策略：{requiredTools[], completionKeywords[], blockKeywords[], continuousExecution}。空表示无策略，由前端注册表兜底。';
