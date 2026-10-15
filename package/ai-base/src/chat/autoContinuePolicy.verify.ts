/**
 * 回归场景验证（node --import tsx src/chat/autoContinuePolicy.verify.ts）
 */
import assert from 'node:assert/strict';
import {
  buildAutoContinueNudge,
  shouldAutoContinueAfterTextOnly,
  type AutoContinueContext,
  decideStructuredTermination,
  buildStructuredNudge,
  reconcilePlan,
  STRUCTURED_MAX_AUTO_CONTINUE_NUDGES,
  STRUCTURED_MAX_TOOL_ROUNDS,
} from './autoContinuePolicy';
import { WRITE_SUCCESS_NAVIGATE_HINT } from '../navigation/writeNavigateHint';
import { aggregateToolResults } from '../utils/aggregateToolResults';
import { extractA2uiCommandsPayload } from '../a2ui/parseA2uiCommands';
import type { AIBaseSkill, PlanItem, SkillCompletionStrategy } from '../types';
import type { ToolResponse } from '../types/toolResponse';
import {
  resolveTerminationCompletionStrategy,
  clearSkillCompletionPolicies,
} from '../registry/skillPolicyRegistry';
import { beginTurn, setPlan } from '../registry/agentPlanState';
import {
  registerBuiltinTools,
  unregisterBuiltinTools,
  TASK_COMPLETE_TOOL,
} from '../registry/builtinTools';
import { invokeFunctionCall, clearFunctionCalls } from '../registry/functionRegistry';

function makeSkill(slug: string, strategy?: SkillCompletionStrategy): AIBaseSkill {
  return {
    id: slug,
    name: slug,
    slug,
    contentMarkdown: '',
    completionStrategy: strategy,
  };
}

function ctx(partial: Partial<AutoContinueContext> & Pick<AutoContinueContext, 'text'>): AutoContinueContext {
  return {
    skills: [
      makeSkill('bizdata-model-design', {
        requiredTools: ['bizdata_validate_model'],
        completionKeywords: ['建模完成', '校验通过', '任务完成'],
        blockKeywords: ['接下来您可以', '建议您'],
      }),
    ],
    allowedToolNames: new Set([
      'bizdata_create_entity',
      'bizdata_validate_model',
      'bizdata_list_entity_summaries',
    ]),
    invokedToolNames: new Set<string>(),
    toolsExecuted: 1,
    toolOutcomes: [],
    ...partial,
  };
}

// 场景 A：建模-only — 校验完成后含「接下来您可以」不应 auto-continue
{
  const c = ctx({
    text: '全部实体建模完成，校验均已通过。接下来您可以执行物化或创建 API。',
    invokedToolNames: new Set(['bizdata_validate_model', 'bizdata_create_entity']),
    toolsExecuted: 5,
    toolOutcomes: [
      {
        ok: true,
        verified: true,
        kind: 'success',
        meta: { tool: 'bizdata_validate_model' },
      },
    ],
  });
  assert.equal(shouldAutoContinueAfterTextOnly(c), false, '场景 A：建模完成后不应继续');
}

// 场景 A2：已探路但口头等待确认 → 不得因 unmet requiredTools 抢跑
{
  const c = ctx({
    text: '方案已梳理完毕。确认后我就开始建模实现。',
    latestText: '方案已梳理完毕。确认后我就开始建模实现。',
    invokedToolNames: new Set(['bizdata_list_entity_summaries']),
    toolsExecuted: 2,
  });
  assert.equal(
    shouldAutoContinueAfterTextOnly(c),
    false,
    '场景 A2：确认前不应 auto-continue',
  );
}

// 场景 A3：同条件但进度叙述且无确认话术 → 仍应续调（只说不做）
{
  const c = ctx({
    text: '现在进入第三步：创建实体与字段',
    latestText: '现在进入第三步：创建实体与字段',
    invokedToolNames: new Set(['bizdata_list_entity_summaries']),
    toolsExecuted: 2,
  });
  assert.equal(
    shouldAutoContinueAfterTextOnly(c),
    true,
    '场景 A3：只说不做的进度叙述仍应续调',
  );
}

// 场景 A4：声称建模完成但未调 validate → 仍应续调（虚假成功优先于确认话术）
{
  const c = ctx({
    text: '建模完成，校验通过。确认后可继续物化。',
    latestText: '建模完成，校验通过。确认后可继续物化。',
    invokedToolNames: new Set(['bizdata_list_entity_summaries']),
    toolsExecuted: 1,
  });
  assert.equal(
    shouldAutoContinueAfterTextOnly(c),
    true,
    '场景 A4：虚假完成声称仍应续调纠正',
  );
}

// 场景 A5：累积文本含「第三步」，但最近一轮已是收尾汇总 → 不应续调
{
  const c = ctx({
    text: '第三步：批量创建服务\n\n没有被修改的现有 API、实体、枚举：本次全部为新增操作，未改动已有的任何内容。',
    latestText: '没有被修改的现有 API、实体、枚举：本次全部为新增操作，未改动已有的任何内容。',
    skills: [
      makeSkill('bizdata-api-service-create', {
        requiredTools: ['apiservice_create_service', 'apiservice_create_services_batch'],
        requiredToolsMode: 'any',
        completionKeywords: ['创建成功', '已成功创建'],
      }),
    ],
    invokedToolNames: new Set(['apiservice_create_services_batch']),
    toolsExecuted: 8,
    toolOutcomes: [
      {
        ok: true,
        verified: true,
        kind: 'success',
        meta: { tool: 'apiservice_create_services_batch' },
      },
    ],
  });
  assert.equal(
    shouldAutoContinueAfterTextOnly(c),
    false,
    '场景 A5：收尾汇总不应被早期进度叙述毒化',
  );
}

// 场景 A6：create requiredToolsMode=any — 只调了 batch 后不应因缺少单条 create 而续调
{
  const c = ctx({
    text: '批量创建完成，共 4 个服务。',
    latestText: '批量创建完成，共 4 个服务。',
    skills: [
      makeSkill('bizdata-api-service-create', {
        requiredTools: ['apiservice_create_service', 'apiservice_create_services_batch'],
        requiredToolsMode: 'any',
        completionKeywords: ['创建成功', '已成功创建', '批量创建完成'],
      }),
    ],
    invokedToolNames: new Set(['apiservice_create_services_batch']),
    toolsExecuted: 4,
    toolOutcomes: [
      {
        ok: true,
        verified: true,
        kind: 'success',
        meta: { tool: 'apiservice_create_services_batch' },
      },
    ],
  });
  assert.equal(
    shouldAutoContinueAfterTextOnly(c),
    false,
    '场景 A6：any 模式下 batch 即可满足 requiredTools',
  );
}

// 场景 A7：create requiredToolsMode=any — 两个写 Tool 都未调 → 应续调
{
  const c = ctx({
    text: '接下来创建服务',
    latestText: '接下来创建服务',
    skills: [
      makeSkill('bizdata-api-service-create', {
        requiredTools: ['apiservice_create_service', 'apiservice_create_services_batch'],
        requiredToolsMode: 'any',
      }),
    ],
    invokedToolNames: new Set(['apiservice_list_services']),
    toolsExecuted: 1,
  });
  assert.equal(
    shouldAutoContinueAfterTextOnly(c),
    true,
    '场景 A7：any 模式下两个写 Tool 都未调应续调',
  );
}

// 场景 B：声称成功但 Tool 未 verified → 应续调纠正
{
  const c = ctx({
    text: 'API 服务已创建成功，发布完成。',
    skills: [
      makeSkill('bizdata-api-service-create', {
        requiredTools: ['apiservice_create_service'],
        completionKeywords: ['创建成功', '发布成功'],
      }),
    ],
    invokedToolNames: new Set(['apiservice_create_service']),
    toolsExecuted: 1,
    toolOutcomes: [
      {
        ok: true,
        verified: false,
        kind: 'business_error',
        error: { message: '列表中未找到服务' },
        meta: { tool: 'apiservice_create_service' },
      },
    ],
  });
  assert.equal(shouldAutoContinueAfterTextOnly(c), true, '场景 B：虚假成功应续调');
}

// 场景 C：收尾句「接下来您可以」不触发 auto-continue
{
  const c = ctx({
    text: '索引与关系已补齐。接下来您可以继续完善其他实体。',
    invokedToolNames: new Set(['bizdata_validate_model']),
    toolsExecuted: 3,
  });
  assert.equal(shouldAutoContinueAfterTextOnly(c), false, '场景 C：收尾引导不应继续');
}

// 场景 D：API test-fix 连续执行 — 写了步骤但未调 run_test 应继续
{
  const apiCtx: AutoContinueContext = {
    skills: [
      makeSkill('bizdata-api-service-test-fix', {
        continuousExecution: true,
      }),
    ],
    allowedToolNames: new Set([
      'apiservice_run_test',
      'apiservice_set_test_params',
      'apiservice_get_service',
    ]),
    invokedToolNames: new Set(['apiservice_update_service']),
    toolsExecuted: 2,
    text: '第三步：运行 apiservice_run_test 验证修复结果',
    latestText: '第三步：运行 apiservice_run_test 验证修复结果',
    toolOutcomes: [],
  };
  assert.equal(shouldAutoContinueAfterTextOnly(apiCtx), true, '场景 D：test-fix 步骤叙述应继续');
}

// 场景 E：声称已发布但未调用 publish → 应续调
{
  const c = ctx({
    text: 'fmms 域全部已发布，0 draft ✅',
    invokedToolNames: new Set(['apiservice_run_test', 'apiservice_list_services']),
    toolsExecuted: 10,
    toolOutcomes: [
      {
        ok: true,
        verified: true,
        kind: 'success',
        meta: { tool: 'apiservice_run_test' },
      },
    ],
    skills: [
      makeSkill('bizdata-api-service-manage', {
        requiredTools: ['apiservice_run_test'],
        completionKeywords: ['全部已发布', '0 draft'],
        claimRules: [
          {
            keywords: ['已发布', '全部已发布', '0 draft'],
            requiredTools: ['apiservice_publish_service'],
          },
        ],
      }),
    ],
  });
  assert.equal(
    shouldAutoContinueAfterTextOnly(c),
    true,
    '场景 E：声称已发布但未调用 publish 应续调',
  );
}

// 场景 F：发布任务完成（已调 publish、未调 run_test）→ 不应续调
{
  const c = ctx({
    text: '📦 发布结果\n4 个服务全部 published，fmms:production 域下 draft 已清零',
    invokedToolNames: new Set([
      'apiservice_list_draft_services',
      'apiservice_publish_service',
      'apiservice_run_test',
    ]),
    toolsExecuted: 12,
    toolOutcomes: [
      {
        ok: true,
        verified: true,
        kind: 'success',
        meta: { tool: 'apiservice_publish_service' },
      },
      {
        ok: true,
        verified: true,
        kind: 'success',
        meta: { tool: 'apiservice_list_draft_services' },
      },
    ],
    skills: [
      makeSkill('bizdata-api-service-manage', {
        completionKeywords: ['全部 published', 'draft 已清零'],
        claimRules: [
          {
            keywords: ['全部 published', 'draft 已清零'],
            requiredTools: ['apiservice_publish_service'],
          },
        ],
      }),
    ],
  });
  assert.equal(
    shouldAutoContinueAfterTextOnly(c),
    false,
    '场景 F：发布完成后不应因缺少 run_test 而续调',
  );
}

// 场景 G：含 A2UI 下一步建议 → 不应续调
{
  const c = ctx({
    text: '发布完成。\n\n```a2ui-commands\n{"steps":[{"id":"test","label":"运行全量测试"}]}\n```',
    invokedToolNames: new Set(['apiservice_publish_service']),
    toolsExecuted: 5,
    skills: [
      makeSkill('bizdata-api-service-manage', {
        completionKeywords: ['发布完成'],
      }),
    ],
  });
  assert.equal(shouldAutoContinueAfterTextOnly(c), false, '场景 G：A2UI 下一步建议不应续调');
}

// 场景 H：publish 返回 alreadyPublished → 声称全部 published 时不应续调
{
  const c = ctx({
    text: '4 个服务全部 published，draft 已清零',
    invokedToolNames: new Set(['apiservice_publish_service', 'apiservice_list_draft_services']),
    toolsExecuted: 8,
    toolOutcomes: [
      {
        ok: false,
        verified: false,
        kind: 'business_error',
        error: { message: '服务「svc-a」已是 published，未产生 draft→published 变更' },
        data: { alreadyPublished: true },
        meta: { tool: 'apiservice_publish_service' },
      },
    ],
    skills: [
      makeSkill('bizdata-api-service-manage', {
        completionKeywords: ['全部 published', 'draft 已清零'],
        claimRules: [
          {
            keywords: ['全部 published', 'draft 已清零'],
            requiredTools: ['apiservice_publish_service'],
          },
        ],
      }),
    ],
  });
  assert.equal(
    shouldAutoContinueAfterTextOnly(c),
    false,
    '场景 H：alreadyPublished 不应触发续调',
  );
}

// auto-continue nudge 未 verified 时包含错误信息，且标明非用户发言
{
  const nudge = buildAutoContinueNudge(new Set(['apiservice_create_service']), [], [
    {
      ok: true,
      verified: false,
      kind: 'business_error',
      error: { message: '列表中未找到服务' },
      meta: { tool: 'apiservice_create_service' },
    },
  ]);
  assert.match(nudge, /禁止向用户声称已成功/);
  assert.match(nudge, /列表中未找到服务/);
  assert.match(nudge, /非用户发言/);
  assert.match(nudge, /禁止回复「您说得对」/);
}

// A2UI 解析：流式未闭合块不露出 JSON
{
  const streaming = extractA2uiCommandsPayload(
    '建模已完成。\n\n```a2ui-commands\n{"steps":[{"id":"materialize","label":"执行物化"}',
  );
  assert.equal(streaming.isStreamingBlock, true);
  assert.equal(streaming.displayText.includes('a2ui-commands'), false);
}

// A2UI 解析：完整块剥离并解析 steps
{
  const parsed = extractA2uiCommandsPayload(
    '完成。\n\n```a2ui-commands\n{"steps":[{"id":"materialize","label":"执行物化"}]}\n```',
  );
  assert.equal(parsed.hasSteps, true);
  assert.equal(parsed.steps[0]?.id, 'materialize');
  assert.equal(parsed.displayText.includes('a2ui-commands'), false);
}

console.log('autoContinuePolicy + A2UI 回归场景全部通过');

/* ========================================================================== */
/* 结构化终止（task_complete / update_plan）回归场景                            */
/* ========================================================================== */

// 场景 S1：task_complete verified=true → terminate
{
  const d = decideStructuredTermination({
    lastTaskCompleteVerified: true,
    autoContinueNudges: 0,
    round: 5,
    latestText: '任务完成',
    convergenceDetected: null,
    plan: [],
  });
  assert.equal(d.action, 'terminate');
}

// 场景 S2：未调 task_complete、plan 还有 pending → continue（默认续命，反转点）
{
  const plan: PlanItem[] = [
    { id: 't1', content: '建实体', status: 'completed' },
    { id: 't2', content: '加字段', status: 'in_progress' },
  ];
  const d = decideStructuredTermination({
    lastTaskCompleteVerified: null,
    autoContinueNudges: 0,
    round: 3,
    latestText: '正在处理',
    convergenceDetected: null,
    plan,
  });
  assert.equal(d.action, 'continue');
}

// 场景 S3：plan 全 completed 但没调 task_complete → 仍 continue（强制走终止工具）
{
  const plan: PlanItem[] = [{ id: 't1', content: '建实体', status: 'completed' }];
  const d = decideStructuredTermination({
    lastTaskCompleteVerified: null,
    autoContinueNudges: 0,
    round: 3,
    latestText: '全部完成了',
    convergenceDetected: null,
    plan,
  });
  assert.equal(d.action, 'continue');
}

// 场景 S4：收敛检测（repeat-tool）→ hard-stop
{
  const d = decideStructuredTermination({
    lastTaskCompleteVerified: null,
    autoContinueNudges: 1,
    round: 4,
    latestText: '',
    convergenceDetected: { kind: 'repeat-tool', detail: '连续 3 次调用 run_test::{"id":1}' },
    plan: [],
  });
  assert.equal(d.action, 'hard-stop');
  assert.match((d as { reason: string }).reason, /循环/);
}

// 场景 S5：finish_reason=length → hard-stop（被截断不当成完成）
{
  const d = decideStructuredTermination({
    lastTaskCompleteVerified: null,
    autoContinueNudges: 0,
    round: 2,
    finishReason: 'length',
    latestText: '',
    convergenceDetected: null,
    plan: [],
  });
  assert.equal(d.action, 'hard-stop');
  assert.match((d as { reason: string }).reason, /截断/);
}

// 场景 S6：模型请求用户确认 → hard-stop（等待用户）
{
  const d = decideStructuredTermination({
    lastTaskCompleteVerified: null,
    autoContinueNudges: 0,
    round: 2,
    latestText: '请确认后我再继续',
    convergenceDetected: null,
    plan: [],
  });
  assert.equal(d.action, 'hard-stop');
}

// 场景 S6b：ask_user / user_choice_request → hard-stop（waiting_user_choice）
{
  const d = decideStructuredTermination({
    lastTaskCompleteVerified: null,
    autoContinueNudges: 0,
    round: 2,
    latestText: '请从以下方案中选择',
    convergenceDetected: null,
    plan: [{ id: 't1', content: '选型', status: 'in_progress' }],
    toolOutcomes: [
      {
        ok: true,
        verified: true,
        kind: 'user_choice_request',
        meta: { tool: 'ask_user' },
        data: {
          requestId: 'ask-1',
          question: '选哪个？',
          mode: 'single',
          options: [{ id: 'a', label: 'A' }],
          allowCustom: true,
          minSelect: 1,
        },
      },
    ],
  });
  assert.equal(d.action, 'hard-stop');
  assert.equal((d as { reason: string }).reason, 'waiting_user_choice');
}

// 场景 S6c：传统 auto-continue 路径遇到 user_choice_request → 禁止续调
{
  const c = ctx({
    text: '请选择方案',
    latestText: '请选择方案',
    toolsExecuted: 2,
    invokedToolNames: new Set(['ask_user']),
    toolOutcomes: [
      {
        ok: true,
        verified: true,
        kind: 'user_choice_request',
        meta: { tool: 'ask_user' },
        data: { requestId: 'r1', question: 'q', mode: 'multi', options: [] },
      },
    ],
  });
  assert.equal(shouldAutoContinueAfterTextOnly(c), false, 'user_choice_request 不得 auto-continue');
}

// 场景 S7：达到 nudge 上限 → hard-stop
{
  const d = decideStructuredTermination({
    lastTaskCompleteVerified: null,
    autoContinueNudges: STRUCTURED_MAX_AUTO_CONTINUE_NUDGES,
    round: 10,
    latestText: '',
    convergenceDetected: null,
    plan: [],
  });
  assert.equal(d.action, 'hard-stop');
}

// 场景 S8：达到轮次上限 → hard-stop
{
  const d = decideStructuredTermination({
    lastTaskCompleteVerified: null,
    autoContinueNudges: 0,
    round: STRUCTURED_MAX_TOOL_ROUNDS,
    latestText: '',
    convergenceDetected: null,
    plan: [],
  });
  assert.equal(d.action, 'hard-stop');
}

// 场景 S8b：查询型 Skill 允许直接收尾，成功回答后直接 terminate
{
  const d = decideStructuredTermination({
    lastTaskCompleteVerified: null,
    autoContinueNudges: 0,
    round: 1,
    latestText: '系统中共有 2 名成员：admin、test。',
    convergenceDetected: null,
    plan: [],
    completionStrategy: {
      terminationStrictness: 'plan-only',
      allowDirectAnswerTermination: true,
    },
    toolsExecuted: 2,
    toolOutcomes: [
      { ok: true, kind: 'success', meta: { tool: 'uac_list_users' }, data: [{ username: 'admin' }] },
      { ok: true, kind: 'success', meta: { tool: 'uac_list_users' }, data: [{ username: 'test' }] },
    ],
  });
  assert.equal(d.action, 'terminate');
}

// 场景 S8c：查询型 Skill 若仍是进度叙述，则不得直接 terminate
{
  const d = decideStructuredTermination({
    lastTaskCompleteVerified: null,
    autoContinueNudges: 0,
    round: 1,
    latestText: '现在进入第二步：整理成员列表',
    convergenceDetected: null,
    plan: [],
    completionStrategy: {
      terminationStrictness: 'plan-only',
      allowDirectAnswerTermination: true,
    },
    toolsExecuted: 1,
    toolOutcomes: [{ ok: true, kind: 'success', meta: { tool: 'uac_list_users' }, data: [] }],
  });
  assert.equal(d.action, 'continue');
}

// 场景 S8d：成员列表查询——先失败后重试成功，若最新工具成功则应直接 terminate
{
  const d = decideStructuredTermination({
    lastTaskCompleteVerified: null,
    autoContinueNudges: 0,
    round: 2,
    latestText: '系统中共有 2 名成员：admin、test。',
    convergenceDetected: null,
    plan: [],
    completionStrategy: {
      terminationStrictness: 'plan-only',
      allowDirectAnswerTermination: true,
    },
    toolsExecuted: 2,
    toolOutcomes: [
      { ok: false, verified: false, kind: 'system_error', meta: { tool: 'uac_list_users' }, error: { message: 'HTTP 500' } },
      { ok: true, verified: true, kind: 'success', meta: { tool: 'uac_list_users' }, data: [{ username: 'admin' }] },
    ],
  });
  assert.equal(d.action, 'terminate');
}

// 场景 S8e：成员列表查询——最新非 harness 工具仍失败，则不应 terminate（应继续等待/驱动下一步）
{
  const d = decideStructuredTermination({
    lastTaskCompleteVerified: null,
    autoContinueNudges: 0,
    round: 2,
    latestText: '系统中共有 2 名成员：admin、test。',
    convergenceDetected: null,
    plan: [],
    completionStrategy: {
      terminationStrictness: 'plan-only',
      allowDirectAnswerTermination: true,
    },
    toolsExecuted: 2,
    toolOutcomes: [
      { ok: true, verified: true, kind: 'success', meta: { tool: 'uac_list_users' }, data: [{ username: 'admin' }] },
      { ok: false, verified: false, kind: 'system_error', meta: { tool: 'uac_list_users' }, error: { message: 'HTTP 500' } },
    ],
  });
  assert.equal(d.action, 'continue');
}

// 场景 S9：buildStructuredNudge 基于剩余 plan 给方向
{
  const plan: PlanItem[] = [
    { id: 't1', content: '建实体', status: 'completed' },
    { id: 't2', content: '加字段', status: 'in_progress' },
    { id: 't3', content: '校验', status: 'pending' },
  ];
  const nudge = buildStructuredNudge(plan, []);
  assert.match(nudge, /还有 2 项未完成/);
  assert.match(nudge, /\[进行中\] 加字段/);
  assert.match(nudge, /task_complete/);
}

// 场景 S10：buildStructuredNudge —— plan 全完成但没调 task_complete，强制终止工具
{
  const nudge = buildStructuredNudge([], []);
  assert.match(nudge, /task_complete/);
}

// 场景 S10b：写成功且未 navigate → nudge 必须提醒跳转（不恢复硬跳）
{
  const nudge = buildStructuredNudge(
    [{ id: 't1', content: '建 API', status: 'in_progress' }],
    [
      {
        ok: true,
        verified: true,
        kind: 'success',
        meta: { tool: 'bizdata_create_entity' },
      },
      {
        ok: true,
        verified: true,
        kind: 'success',
        meta: { tool: 'apiservice_create_service' },
        data: { id: 's-1' },
      },
    ],
    { autoNavigate: true },
  );
  assert.ok(nudge.includes(WRITE_SUCCESS_NAVIGATE_HINT));
  assert.match(nudge, /建 API/);
}

// 场景 S10c：自动跳转关闭时不在 nudge 里催跳
{
  const nudge = buildStructuredNudge(
    [],
    [
      {
        ok: true,
        verified: true,
        kind: 'success',
        meta: { tool: 'apiservice_create_service' },
      },
    ],
    { autoNavigate: false },
  );
  assert.equal(nudge.includes(WRITE_SUCCESS_NAVIGATE_HINT), false);
  assert.match(nudge, /task_complete/);
}

// 场景 S11：reconcilePlan —— 关键 Tool 全 verified → 该项升 completed，下一 pending 升 in_progress
{
  const plan: PlanItem[] = [
    { id: 't1', content: '建实体', status: 'completed' },
    { id: 't2', content: '校验', status: 'in_progress', requiresVerification: ['bizdata_validate_model'] },
    { id: 't3', content: '物化', status: 'pending' },
  ];
  const outcomes: ToolResponse[] = [
    { ok: true, verified: true, kind: 'success', meta: { tool: 'bizdata_validate_model' } },
  ];
  const next = reconcilePlan(plan, outcomes);
  assert.equal(next[1].status, 'completed');
  assert.equal(next[2].status, 'in_progress'); // 自动升 in_progress（维持单一）
}

// 场景 S12：reconcilePlan —— 关键 Tool 未 verified → 不升 completed
{
  const plan: PlanItem[] = [
    { id: 't1', content: '校验', status: 'in_progress', requiresVerification: ['run_test'] },
  ];
  const outcomes: ToolResponse[] = [
    { ok: true, verified: false, kind: 'business_error', meta: { tool: 'run_test' }, error: { message: 'fail' } },
  ];
  const next = reconcilePlan(plan, outcomes);
  assert.equal(next[0].status, 'in_progress'); // 未通过，保持
}

// 场景 S13：reconcilePlan —— 无变化时返回原引用（零开销）
{
  const plan: PlanItem[] = [{ id: 't1', content: 'x', status: 'pending' }];
  const next = reconcilePlan(plan, []);
  assert.equal(next, plan); // 同一引用
}

/* ========================================================================== */
/* 阶段 E：同性质批量结果聚合                                                    */
/* ========================================================================== */

function toolMsg(name: string, id: string, envelope: Partial<ToolResponse>) {
  return {
    role: 'tool' as const,
    tool_call_id: id,
    name,
    content: JSON.stringify({ ok: true, kind: 'success', meta: { tool: name }, ...envelope }),
  };
}

// 场景 E1：4 个同名 run_test 全成功 → 前 3 条压成状态，最后 1 条带摘要
{
  const msgs = [
    toolMsg('apiservice_run_test', 'c1', { verified: true }),
    toolMsg('apiservice_run_test', 'c2', { verified: true }),
    toolMsg('apiservice_run_test', 'c3', { verified: true }),
    toolMsg('apiservice_run_test', 'c4', { verified: true }),
  ];
  const out = aggregateToolResults(msgs as never, {
    resultAggregation: { tools: ['apiservice_run_test'], minBatchSize: 3 },
  });
  assert.equal(out.length, 4); // 数量不变（协议要求）
  assert.match(String(out[0].content), /\[批量聚合 #1\/4 ok\]/);
  assert.match(String(out[3].content), /汇总/);
  assert.match(String(out[3].content), /"passed":4/);
}

// 场景 E2：3 个同名，部分失败 → 摘要含 failures
{
  const msgs = [
    toolMsg('apiservice_run_test', 'c1', { verified: true }),
    toolMsg('apiservice_run_test', 'c2', { verified: false, kind: 'business_error', error: { message: 'SQL 错误' } }),
    toolMsg('apiservice_run_test', 'c3', { verified: true }),
  ];
  const out = aggregateToolResults(msgs as never, {
    resultAggregation: { tools: ['apiservice_run_test'], minBatchSize: 3 },
  });
  assert.match(String(out[2].content), /"failed":1/);
  assert.match(String(out[2].content), /SQL 错误/);
}

// 场景 E3：同名但未达阈值（2 < 3）→ 原样返回
{
  const msgs = [
    toolMsg('apiservice_run_test', 'c1', { verified: true }),
    toolMsg('apiservice_run_test', 'c2', { verified: true }),
  ];
  const out = aggregateToolResults(msgs as never, {
    resultAggregation: { tools: ['apiservice_run_test'], minBatchSize: 3 },
  });
  assert.equal(out, msgs); // 同引用，未处理
}

// 场景 E4：tool 不在配置列表 → 原样返回
{
  const msgs = [
    toolMsg('bizdata_list_entity_summaries', 'c1', { verified: true }),
    toolMsg('bizdata_list_entity_summaries', 'c2', { verified: true }),
    toolMsg('bizdata_list_entity_summaries', 'c3', { verified: true }),
  ];
  const out = aggregateToolResults(msgs as never, {
    resultAggregation: { tools: ['apiservice_run_test'], minBatchSize: 3 },
  });
  assert.equal(out, msgs);
}

// 场景 E5：无 resultAggregation 配置 → 原样返回
{
  const msgs = [toolMsg('apiservice_run_test', 'c1', { verified: true })];
  const out = aggregateToolResults(msgs as never, undefined);
  assert.equal(out, msgs);
}

/* -------------------------------------------------------------------------- */
/* 终止策略选取：禁止跨 Skill 并集 requiredTools                                 */
/* -------------------------------------------------------------------------- */

// 场景 T1：多 Skill 并存时只取页面 preferred slug，不并集写操作 requiredTools
{
  clearSkillCompletionPolicies();
  const skills = [
    makeSkill('aibase-chat-framework', { terminationStrictness: 'plan-only' }),
    makeSkill('bizdata-model-design', {
      terminationStrictness: 'strict',
      requiredTools: ['bizdata_validate_model'],
      successCriteria: ['校验通过'],
    }),
    makeSkill('bizdata-materialization', {
      terminationStrictness: 'strict',
      requiredTools: ['bizdata_execute_materialization'],
    }),
    makeSkill('uac-access-control', {
      terminationStrictness: 'plan-only',
      allowDirectAnswerTermination: true,
    }),
    makeSkill('bizdata-api-service-create', {
      terminationStrictness: 'strict',
      requiredTools: ['apiservice_create_service', 'apiservice_create_services_batch'],
    }),
    makeSkill('bizdata-metrics', {
      terminationStrictness: 'strict',
      requiredTools: ['bizdata_save_metric'],
    }),
  ];
  const strategy = resolveTerminationCompletionStrategy(skills, ['uac-access-control']);
  assert.equal(strategy?.terminationStrictness, 'plan-only');
  assert.equal(strategy?.allowDirectAnswerTermination, true);
  assert.equal(strategy?.requiredTools, undefined);
  assert.equal(strategy?.successCriteria, undefined);
}

// 场景 T2：无 preferred 时跳过框架 Skill，取第一个业务 Skill
{
  clearSkillCompletionPolicies();
  const skills = [
    makeSkill('aibase-chat-framework', { terminationStrictness: 'plan-only' }),
    makeSkill('bizdata-model-design', {
      terminationStrictness: 'strict',
      requiredTools: ['bizdata_validate_model'],
    }),
  ];
  const strategy = resolveTerminationCompletionStrategy(skills);
  assert.equal(strategy?.terminationStrictness, 'strict');
  assert.deepEqual(strategy?.requiredTools, ['bizdata_validate_model']);
}

// 场景 T3：查询型 uac — task_complete 不得因胡填的写操作 requiresVerification 失败
await (async () => {
  clearFunctionCalls();
  registerBuiltinTools();
  const end = beginTurn({
    conversationKey: 'verify-auto-continue-t3',
    plan: [],
    toolOutcomes: [
      {
        ok: true,
        kind: 'success',
        verified: true,
        meta: { tool: 'uac_list_departments' },
        data: [],
      },
    ],
    invokedToolNames: new Set(['uac_list_departments']),
    completionStrategy: {
      terminationStrictness: 'plan-only',
      allowDirectAnswerTermination: true,
    },
    availableToolNames: new Set(['uac_list_departments', 'uac_list_users']),
  });
  setPlan([
    {
      id: 't1',
      content: '查询组织架构部门树',
      status: 'completed',
      requiresVerification: [
        'bizdata_validate_model',
        'bizdata_execute_materialization',
        'apiservice_run_test',
        'apiservice_create_service',
      ],
    },
  ]);
  const result = await invokeFunctionCall(TASK_COMPLETE_TOOL, {
    summary: '已查询部门树',
    criteriaSatisfied: true,
  });
  assert.equal(result?.verified, true, '查询型 allowDirect 时 task_complete 应通过');
  assert.notEqual((result as ToolResponse | undefined)?.error?.code, 'TASK_INCOMPLETE');
  end();
  unregisterBuiltinTools();
  clearFunctionCalls();
})();

console.log('结构化终止 + 批量聚合 回归场景全部通过');
