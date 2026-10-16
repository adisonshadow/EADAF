import { registerSkillCompletionPolicy } from '@eadaf/ai-base';

/**
 * EADAF 业务 Skill 的声明式完成策略覆盖。
 *
 * DB `completion_strategy` 为权威源（见 aibase-ai-seed.sql）；
 * 此处仅注册前端仍需覆盖的关键词 / claimRules / continuousExecution 等。
 * 覆盖与 DB 浅合并，覆盖字段优先。
 *
 * 在 AIChatClientToolsRegistrar 启动时调用一次即可。
 */

/** 通用：收尾建议句，禁止 auto-continue 当成任务完成 */
const BLOCK_SUGGEST_NEXT = [
  '接下来您可以',
  '建议您',
  '可选操作',
  '确认后',
  '请确认',
  '是否继续',
] as const;

/** 不含「请确认」类（管理页常用「发布结果/下一步建议」） */
const BLOCK_SUGGEST_SOFT = ['接下来您可以', '建议您', '可选操作'] as const;

/** 写操作常见「等用户确认」话术 */
const BLOCK_WAIT_CONFIRM = [
  '等您确认',
  '等待确认',
  '需要您确认',
] as const;

/** 建模：禁止 delete+create 改 Scope */
const BLOCK_MODEL_RECREATE = [
  '删除重建',
  'delete + create',
  'delete+create',
] as const;

export function registerEadafSkillCompletionPolicies(): void {
  registerSkillCompletionPolicy('eadaf-access-control', {
    terminationStrictness: 'plan-only',
    allowDirectAnswerTermination: true,
    blockKeywords: [...BLOCK_SUGGEST_NEXT],
  });

  registerSkillCompletionPolicy('bizdata-data-standards', {
    terminationStrictness: 'plan-only',
    allowDirectAnswerTermination: true,
    blockKeywords: [...BLOCK_SUGGEST_NEXT],
  });

  registerSkillCompletionPolicy('bizdata-metadata-catalog', {
    terminationStrictness: 'plan-only',
    allowDirectAnswerTermination: true,
    blockKeywords: [...BLOCK_SUGGEST_NEXT],
  });

  registerSkillCompletionPolicy('bizdata-model-design', {
    requiredTools: ['bizdata_validate_model'],
    completionKeywords: [
      '建模完成',
      '校验通过',
      '任务完成',
      '全部实体',
      '每个实体',
      '本阶段',
      '当前阶段',
    ],
    blockKeywords: [...BLOCK_MODEL_RECREATE, ...BLOCK_SUGGEST_NEXT, ...BLOCK_WAIT_CONFIRM],
  });

  registerSkillCompletionPolicy('bizdata-materialization', {
    requiredTools: ['bizdata_execute_materialization'],
    completionKeywords: [
      '物化完成',
      '物化成功',
      '执行成功',
      '已完成物化',
      '本阶段',
      '当前阶段',
    ],
    blockKeywords: [...BLOCK_WAIT_CONFIRM, ...BLOCK_SUGGEST_NEXT],
  });

  registerSkillCompletionPolicy('bizdata-api-service-create', {
    requiredTools: ['apiservice_create_service', 'apiservice_create_services_batch'],
    requiredToolsMode: 'any',
    completionKeywords: ['已发布', '发布成功', '创建成功', '已成功创建'],
    blockKeywords: [...BLOCK_SUGGEST_NEXT],
    // 声称创建/发布成功时，须先读过实体字段（与 requiredTools 并列校验）
    claimRules: [
      {
        keywords: ['已发布', '发布成功', '创建成功', '已成功创建'],
        requiredTools: ['bizdata_get_entity'],
      },
    ],
  });

  registerSkillCompletionPolicy('bizdata-api-service-manage', {
    completionKeywords: [
      '测试通过',
      '测试成功',
      '发布成功',
      '已发布',
      '全部已发布',
      '全部 published',
      '0 draft',
      'draft 已清零',
      'draft 已处理',
      'draft已处理',
    ],
    blockKeywords: ['发布结果', '下一步建议', ...BLOCK_SUGGEST_SOFT],
    claimRules: [
      {
        keywords: ['测试通过', '测试成功'],
        requiredTools: ['apiservice_run_test'],
      },
      {
        keywords: [
          '已发布',
          '发布成功',
          'published',
          '全部 published',
          '全部已发布',
          '0 draft',
          'draft 已清零',
          'draft 已处理',
          'draft已处理',
        ],
        requiredTools: ['apiservice_publish_service'],
      },
      {
        keywords: ['测试并发布', '未发布的', '待发布', '找出所有未发布'],
        requiredTools: ['apiservice_list_draft_services'],
      },
    ],
  });

  registerSkillCompletionPolicy('bizdata-api-service-test-fix', {
    continuousExecution: true,
    blockKeywords: [...BLOCK_SUGGEST_SOFT, '如需继续'],
  });

  registerSkillCompletionPolicy('api-services-collection-pipeline', {
    completionKeywords: ['创建完成', '已创建', '管道已创建', '发布成功', '测试通过'],
    claimRules: [
      {
        keywords: ['创建完成', '已创建', '管道已创建', '新建成功'],
        requiredTools: ['collection_pipeline_upsert'],
      },
      {
        keywords: ['测试通过', '测试成功'],
        requiredTools: ['collection_pipeline_run_test'],
      },
      {
        keywords: ['发布成功', '已发布'],
        requiredTools: ['collection_pipeline_publish'],
      },
    ],
  });

  registerSkillCompletionPolicy('bizdata-metrics', {
    completionKeywords: [
      '创建成功',
      '已创建',
      '卡片已创建',
      '看板已就绪',
      '全部卡片',
      '指标已保存',
    ],
    claimRules: [
      {
        keywords: ['指标已创建', '指标创建成功', '指标已保存', '新建指标成功'],
        requiredTools: ['bizdata_metric_upsert'],
      },
      {
        keywords: [
          '卡片已创建',
          '看板卡片',
          '指标卡片已',
          '看板已就绪',
          '全部卡片',
          '张卡片',
          '张看板卡片',
        ],
        requiredTools: ['bizdata_metric_card_upsert'],
      },
      {
        keywords: ['执行成功', '已执行指标', '计算完成'],
        requiredTools: ['bizdata_metric_execute'],
      },
      {
        keywords: ['批量执行成功', '批量已执行'],
        requiredTools: ['bizdata_metric_execute_batch'],
      },
    ],
  });
}
