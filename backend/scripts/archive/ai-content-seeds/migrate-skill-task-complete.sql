-- 结构化终止（task_complete / update_plan）机制：为各业务 Skill 声明 completion_strategy。
--
-- 配合前端 SDK 的 AIChatConfig.enableStructuredTermination 灰度开关使用。
-- 字段含义（见 package/ai-base/src/types.ts SkillCompletionStrategy）：
--   terminationStrictness: 'strict' | 'plan-only' | 'off'（默认 strict）
--     - strict：task_complete 须通过三层校验（plan 全完成 + 关键 Tool verified + successCriteria）
--     - plan-only：只校验 plan 全 completed
--     - off：task_complete 无条件通过（向后兼容纯对话型 Skill）
--   successCriteria: 可验证的成功标准（strict 模式第三层依据）
--   requiredTools: 关键 Tool（strict 模式第二层依据）
--   resultAggregation: 同性质批量调用结果聚合（阶段 E）
--
-- 注：completion_strategy 为 JSONB 透传字段（migrate-skill-completion-strategy.sql 已建列），
--     后端 skillController 原样下发，前端 SDK 读取。本脚本只填数据，不改 schema。
--     幂等：ON CONFLICT (slug) DO UPDATE，可重复执行。

-- ============================================================
-- 写操作型 Skill（strict）：这些是「过早/迟迟结束」最痛的场景
-- ============================================================

-- API 服务测试自动修复：连续执行型（test-fix 循环），收敛检测兜底
UPDATE aibase.skills SET completion_strategy = '{"terminationStrictness":"strict","continuousExecution":true,"requiredTools":["apiservice_run_test"],"successCriteria":["apiservice_run_test 返回 success=true 且 verified=true"],"resultAggregation":{"tools":["apiservice_run_test"],"minBatchSize":3}}'::jsonb, updated_at = CURRENT_TIMESTAMP
WHERE slug = 'bizdata-api-service-test-fix';

-- API 服务管理：按声称匹配 Tool（claimRules），禁止全局强制 run_test（否则仅发布/列表任务会被误伤）
UPDATE aibase.skills SET completion_strategy = '{"terminationStrictness":"strict","successCriteria":["相关 API 已按声称完成测试或发布并 verified"],"resultAggregation":{"tools":["apiservice_run_test"],"minBatchSize":3},"claimRules":[{"keywords":["测试通过","测试成功"],"requiredTools":["apiservice_run_test"]},{"keywords":["已发布","发布成功","published","全部 published","全部已发布","0 draft","draft 已清零","draft 已处理","draft已处理"],"requiredTools":["apiservice_publish_service"]},{"keywords":["测试并发布","未发布的","待发布","找出所有未发布"],"requiredTools":["apiservice_list_draft_services"]}]}'::jsonb, updated_at = CURRENT_TIMESTAMP
WHERE slug = 'bizdata-api-service-manage';

-- API 服务创建
UPDATE aibase.skills SET completion_strategy = '{"terminationStrictness":"strict","requiredTools":["apiservice_create_service"],"successCriteria":["apiservice_create_service 返回 _verification.verified=true"]}'::jsonb, updated_at = CURRENT_TIMESTAMP
WHERE slug = 'bizdata-api-service-create';

-- 业务数据模型设计
UPDATE aibase.skills SET completion_strategy = '{"terminationStrictness":"strict","requiredTools":["bizdata_validate_model"],"successCriteria":["bizdata_validate_model 返回校验通过"],"completionKeywords":["建模完成","校验通过"]}'::jsonb, updated_at = CURRENT_TIMESTAMP
WHERE slug = 'bizdata-model-design';

-- 业务数据物化
UPDATE aibase.skills SET completion_strategy = '{"terminationStrictness":"strict","successCriteria":["物化执行返回成功"]}'::jsonb, updated_at = CURRENT_TIMESTAMP
WHERE slug = 'bizdata-materialization';

-- 采集数据结构化
UPDATE aibase.skills SET completion_strategy = '{"terminationStrictness":"strict","successCriteria":["采集脚本已 upsert 且测试读取到数据"]}'::jsonb, updated_at = CURRENT_TIMESTAMP
WHERE slug = 'api-services-collection-pipeline';

-- 提交外部API管理（Outbound Webhook）
UPDATE aibase.skills SET completion_strategy = '{"terminationStrictness":"strict","successCriteria":["webhook 已创建/测试/发布并 verified"]}'::jsonb, updated_at = CURRENT_TIMESTAMP
WHERE slug = 'outbound-webhook-manage';

-- 业务指标
UPDATE aibase.skills SET completion_strategy = '{"terminationStrictness":"strict","requiredTools":["bizdata_save_metric"],"successCriteria":["bizdata_save_metric 返回 verified=true"]}'::jsonb, updated_at = CURRENT_TIMESTAMP
WHERE slug = 'bizdata-metrics';

-- ============================================================
-- 查询/只读型 Skill：多为列表/详情查询，无需写操作验收
-- ============================================================

UPDATE aibase.skills SET completion_strategy = '{"terminationStrictness":"plan-only"}'::jsonb, updated_at = CURRENT_TIMESTAMP
WHERE slug IN (
  'aibase-capability-design',
  'aibase-capability-manage',
  'aibase-provider-manage',
  'aibase-model-manage'
);

-- 列表/目录类查询：拿到结果即可交付结束（允许 direct-answer terminate）
UPDATE aibase.skills SET completion_strategy = '{"terminationStrictness":"plan-only","allowDirectAnswerTermination":true}'::jsonb, updated_at = CURRENT_TIMESTAMP
WHERE slug IN (
  'bizdata-data-standards',
  'bizdata-metadata-catalog'
);

-- 成员/权限查询经常是“拿到列表即可交付”的轻量任务，允许查询成功后直接收尾
UPDATE aibase.skills SET completion_strategy = '{"terminationStrictness":"plan-only","allowDirectAnswerTermination":true}'::jsonb, updated_at = CURRENT_TIMESTAMP
WHERE slug = 'eadaf-access-control';

-- ============================================================
-- 纯对话/分析型 Skill（off）：demo 演示用，无需 plan / 验收
-- ============================================================

UPDATE aibase.skills SET completion_strategy = '{"terminationStrictness":"off"}'::jsonb, updated_at = CURRENT_TIMESTAMP
WHERE slug IN (
  'order-analysis',
  'after-sales-analysis'
);

-- 框架 Skill 的 completion_strategy 由 migrate-aibase-chat-framework-skill.sql 单独维护（plan-only）。
