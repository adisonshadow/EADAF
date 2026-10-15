import { readAllAISurfaces } from './aiSurfaceRegistry';
import {
  getFunctionCallDef,
  registerFunctionCalls,
  unregisterFunctionCalls,
} from './functionRegistry';
import { getCurrent, getPlan, setPlan } from './agentPlanState';
import { getToolContract } from './toolContractRegistry';
import { navigateToPage } from '../navigation/navigationChannel';
import { loadSkillBodyBySlug } from './skillBodyChannel';
import { runJavaScriptCode } from '../runtime/runJavaScript';
import { runSubagentFanout, runSubagentSequence } from '../runtime/runSubagent';
import { resolveRunnableClientToolNames } from '../runtime/resolveRunnableClientTools';
import {
  getActiveConversationKey,
  getActiveTurnId,
} from '../observability/turnTrace';
import type { PlanItem, NavigationRequest } from '../types';
import { distillSessionSummary } from '../memory/sessionSummary';
import type { ToolResponse } from '../types/toolResponse';
import { formatPlanListDisplayName } from '../utils/toolDisplayName';
import { validateToolArgs } from '../utils/validateToolArgs';
import {
  ASK_USER_TOOL,
  type AskUserArgs,
  type UserChoiceOption,
  type UserChoiceRequest,
} from '../chat/userChoice';
import {
  buildTaskCompleteDeliveryData,
  type TaskCompleteDeliveryData,
} from '../chat/emitTaskCompleteDelivery';

const BUILTIN_TOOL_NAME = 'aibase_read_surfaces';

/** 结构化终止机制注入的 harness Tool 名 */
export const TASK_COMPLETE_TOOL = 'task_complete';
export const UPDATE_PLAN_TOOL = 'update_plan';
/** AI 决策跳转 harness Tool 名（语义路由清单非空时注入） */
export const NAVIGATE_TO_PAGE_TOOL = 'navigate_to_page';
/** 按需加载 Skill 正文 */
export const SKILL_TOOL = 'skill';
/** 编排已注册 Tool 的脚本执行（JS；Python 走后端） */
export const RUN_CODE_TOOL = 'run_code';
/** 批量 fan-out / 顺序委托（隔离 Turn 轨迹） */
export const RUN_SUBAGENT_TOOL = 'run_subagent';
export { ASK_USER_TOOL };
export const HARNESS_TOOL_NAMES = new Set([
  TASK_COMPLETE_TOOL,
  UPDATE_PLAN_TOOL,
  ASK_USER_TOOL,
  NAVIGATE_TO_PAGE_TOOL,
  SKILL_TOOL,
  RUN_CODE_TOOL,
  RUN_SUBAGENT_TOOL,
]);

/* -------------------------------------------------------------------------- */
/* update_plan —— 结构化任务清单维护                                            */
/* -------------------------------------------------------------------------- */

/**
 * 校验 plan 合法性：
 * - id 唯一
 * - 同时只有一个 in_progress
 * - status 取值合法
 * 返回错误消息，合法时返回 null。
 */
function validatePlan(plan: PlanItem[]): string | null {
  if (!Array.isArray(plan)) return 'plan 必须为数组';
  const ids = new Set<string>();
  let inProgress = 0;
  for (const item of plan) {
    if (!item.id || typeof item.id !== 'string') return '每个 plan 项须有 string 类型 id';
    if (ids.has(item.id)) return `plan 项 id 重复：${item.id}`;
    ids.add(item.id);
    if (!item.content || typeof item.content !== 'string') return `plan 项 ${item.id} 须有 content`;
    if (!['pending', 'in_progress', 'completed'].includes(item.status)) {
      return `plan 项 ${item.id} 的 status 非法：${item.status}`;
    }
    if (item.status === 'in_progress') inProgress += 1;
  }
  if (inProgress > 1) return '同时只能有一个任务处于 in_progress';
  return null;
}

/**
 * merge=true 时基于现有 plan 增量更新（按 id 合并）；false 时全量替换。
 * 合并时保留未提及项，状态以新值为准。
 */
function mergePlan(current: PlanItem[], incoming: PlanItem[]): PlanItem[] {
  const map = new Map<string, PlanItem>();
  for (const item of current) map.set(item.id, item);
  for (const item of incoming) {
    map.set(item.id, { ...map.get(item.id), ...item });
  }
  return Array.from(map.values());
}

function handleUpdatePlan(args: {
  plan?: PlanItem[];
  merge?: boolean;
}): ToolResponse<{ plan: PlanItem[]; mode: 'create' | 'update' }> {
  const incoming = Array.isArray(args.plan) ? args.plan : [];
  const error = validatePlan(incoming);
  if (error) {
    const existing = getPlan();
    return {
      ok: true,
      verified: false,
      kind: 'business_error',
      error: { code: 'INVALID_PLAN', message: error },
      data: { plan: existing, mode: existing.length > 0 ? 'update' : 'create' },
      meta: { tool: UPDATE_PLAN_TOOL },
    };
  }

  const merge = args.merge !== false; // 默认 merge
  const current = getPlan();
  const next = merge && current.length ? mergePlan(current, incoming) : incoming;
  setPlan(next);

  const isUpdate = current.length > 0;
  const mode = isUpdate ? 'update' : 'create';
  const items = next.map((p) => ({
    id: p.id,
    label: p.content,
    status: p.status,
  }));
  const title = formatPlanListDisplayName(next, mode);

  return {
    ok: true,
    verified: true,
    kind: 'success',
    data: { plan: next, mode },
    display: {
      kind: 'planning',
      payload: { items, message: title },
      // 首次生成展开；后续更新默认折叠（标题栏由 InvocationCard 负责）
      collapsed: isUpdate,
      visibility: isUpdate ? 'transient' : 'sticky',
    },
    meta: { tool: UPDATE_PLAN_TOOL },
  };
}

/* -------------------------------------------------------------------------- */
/* task_complete —— 终止校验（拒绝/通过）                                       */
/* -------------------------------------------------------------------------- */

function isVerifiedOutcome(item: ToolResponse): boolean {
  if (item.kind === 'system_error' || item.ok === false) return false;
  if (item.kind === 'business_error') return false;
  if (item.verified === false) return false;
  return true;
}

/**
 * 终止校验：按 terminationStrictness 返回未完成项。
 * - off：无条件通过
 * - plan-only：只检查 plan 无 pending/in_progress
 * - strict（默认）：plan + 关键 Tool verified + successCriteria
 */
function collectIncomplete(
  plan: PlanItem[],
  ctx: NonNullable<ReturnType<typeof getCurrent>>,
  criteriaSatisfied?: boolean,
): { incomplete: string[]; reason: string } | null {
  // 查询/只读型：允许直接收尾时，只验 plan，不按写操作清单卡死
  // （避免模型在 plan.requiresVerification 中胡填 bizdata/apiservice 等无关 Tool）
  const allowDirect = Boolean(ctx.completionStrategy?.allowDirectAnswerTermination);
  const strictness = allowDirect
    ? 'plan-only'
    : (ctx.completionStrategy?.terminationStrictness ?? 'strict');

  if (strictness === 'off') return null;

  const incomplete: string[] = [];

  // 层 1：plan 未全部完成
  const unfinished = plan.filter((p) => p.status !== 'completed');
  if (unfinished.length > 0) {
    for (const p of unfinished) {
      incomplete.push(`[${p.status}] ${p.content}`);
    }
  }

  if (strictness === 'plan-only') {
    return incomplete.length ? { incomplete, reason: 'plan 尚有未完成任务' } : null;
  }

  // strict：层 2 —— 关键 Tool（plan 项声明 requiresVerification 的）须全部 verified
  const requiredToolNames = new Set<string>();
  const available = ctx.availableToolNames;
  for (const p of plan) {
    for (const name of p.requiresVerification || []) {
      // 忽略当前页 Tool 池里根本不存在的名字（模型胡填）
      if (available && available.size > 0 && !available.has(name)) continue;
      requiredToolNames.add(name);
    }
  }
  // 兼容：也把 skill 声明的 requiredTools 纳入
  for (const name of ctx.completionStrategy?.requiredTools || []) {
    requiredToolNames.add(name);
  }
  if (requiredToolNames.size > 0) {
    for (const name of requiredToolNames) {
      const relevant = ctx.toolOutcomes.filter((o) => o.meta.tool === name);
      if (relevant.length === 0) {
        incomplete.push(`关键 Tool 未调用：${name}`);
      } else if (!relevant.some(isVerifiedOutcome)) {
        const failed = relevant.find((o) => !isVerifiedOutcome(o));
        incomplete.push(
          `关键 Tool 未通过验证：${name}${failed?.error?.message ? `（${failed.error.message}）` : ''}`,
        );
      }
    }
  }

  // strict：层 3 —— successCriteria（由模型在 args.criteriaSatisfied 声明）
  const criteria = ctx.completionStrategy?.successCriteria;
  if (criteria && criteria.length > 0 && !criteriaSatisfied) {
    incomplete.push('successCriteria 未全部满足');
  }

  return incomplete.length ? { incomplete, reason: '任务尚未通过验收' } : null;
}

function handleTaskComplete(args: {
  summary?: string;
  next_steps?: Array<{ id: string; label: string }>;
  criteriaSatisfied?: boolean;
}): ToolResponse<{ incomplete?: string[] } | TaskCompleteDeliveryData> {
  const delivery = buildTaskCompleteDeliveryData(args);
  const ctx = getCurrent();
  if (!ctx) {
    // 非活跃 turn 调用（理论上不应发生）：宽松放行，避免阻塞
    return {
      ok: true,
      verified: true,
      kind: 'success',
      data: delivery,
      meta: { tool: TASK_COMPLETE_TOOL },
    };
  }

  const result = collectIncomplete(getPlan(), ctx, args.criteriaSatisfied);
  if (result) {
    return {
      ok: true,
      verified: false,
      kind: 'business_error',
      error: {
        code: 'TASK_INCOMPLETE',
        message: `${result.reason}：${result.incomplete.join('；')}`,
        hint: '请先完成上述任务并通过验证，再调用 task_complete。禁止用自由文本声称完成。',
      },
      data: { incomplete: result.incomplete },
      meta: { tool: TASK_COMPLETE_TOOL },
    };
  }

  // L4：任务验收通过后蒸馏会话摘要并清空 L3 plan（facts 保留）
  if (ctx.conversationKey) {
    distillSessionSummary(ctx.conversationKey, {
      deliverySummary: delivery.summary,
      clearPlan: true,
    });
  }
  ctx.plan = [];

  return {
    ok: true,
    verified: true,
    kind: 'success',
    data: delivery,
    meta: { tool: TASK_COMPLETE_TOOL },
  };
}

/* -------------------------------------------------------------------------- */
/* ask_user —— mid-task HITL 选择门                                            */
/* -------------------------------------------------------------------------- */

function normalizeAskUserArgs(args: AskUserArgs):
  | { ok: true; request: UserChoiceRequest }
  | { ok: false; message: string } {
  const question = String(args.question || '').trim();
  if (!question) return { ok: false, message: 'question 不能为空' };

  const mode = args.mode === 'multi' ? 'multi' : 'single';
  const rawOptions = Array.isArray(args.options) ? args.options : [];
  if (rawOptions.length < 1) return { ok: false, message: 'options 至少需要 1 项' };

  const options: UserChoiceOption[] = [];
  const ids = new Set<string>();
  for (const item of rawOptions) {
    const id = String(item?.id || '').trim();
    const label = String(item?.label || '').trim();
    if (!id || !label) return { ok: false, message: '每个 option 须有 id 与 label' };
    if (ids.has(id)) return { ok: false, message: `option id 重复：${id}` };
    ids.add(id);
    const description = item?.description != null ? String(item.description).trim() : '';
    options.push(description ? { id, label, description } : { id, label });
  }

  const allowCustom =
    typeof args.allowCustom === 'boolean' ? args.allowCustom : mode === 'single';
  const minSelect =
    mode === 'multi'
      ? Math.max(1, Math.min(options.length, Number(args.minSelect) || 1))
      : 1;
  let maxSelect: number | undefined;
  if (mode === 'multi') {
    const rawMax = args.maxSelect != null ? Number(args.maxSelect) : options.length;
    maxSelect = Math.max(minSelect, Math.min(options.length, rawMax || options.length));
  }

  return {
    ok: true,
    request: {
      requestId: `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      question,
      mode,
      options,
      allowCustom,
      minSelect,
      ...(maxSelect != null ? { maxSelect } : {}),
    },
  };
}

function handleAskUser(args: AskUserArgs): ToolResponse<UserChoiceRequest> {
  const normalized = normalizeAskUserArgs(args);
  if (!normalized.ok) {
    return {
      ok: true,
      verified: false,
      kind: 'business_error',
      error: {
        code: 'INVALID_ASK_USER',
        message: normalized.message,
        hint: '请修正 question / options 后重试 ask_user。',
      },
      meta: { tool: ASK_USER_TOOL },
    };
  }

  return {
    ok: true,
    verified: true,
    kind: 'user_choice_request',
    data: normalized.request,
    meta: { tool: ASK_USER_TOOL },
  };
}

/**
 * navigate_to_page 的 OpenAI function 定义。
 * 注意：**不进入** HARNESS_OPENAI_TOOLS —— 它在 `AIChatConfig.semanticRoutes` 非空时
 * 由 useAIBaseChat 与 harness 并列单独注入（不依赖 Skill、不依赖结构化终止开关）。
 */
export const NAVIGATE_TO_PAGE_OPENAI_TOOL = {
  type: 'function' as const,
  function: {
    name: NAVIGATE_TO_PAGE_TOOL,
    description:
      '按语义路由清单跳转到业务页面。写操作成功且结果需在另一页呈现时必须立刻调用' +
      '（创建后进带 id 的编辑/详情；跨步骤工作流如实体→API 每完成一个里程碑跳一次）。' +
      'path 必须使用「可用页面」清单中的模板路径（含 :param 占位符时用 params 传参，禁止拼接 URL）。' +
      '仅当已在目标页、或同类型批量创建尚未收尾时不要跳。禁止因为「后面还有步骤」而整段不跳。' +
      '若返回 navigated=false（reason=disabled/invalid_target），不要重试本工具，向用户说明原因。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '语义清单中的页面路径模板，如 /member_org/member/:id/edit',
        },
        params: {
          type: 'object',
          description: '路径参数（按清单中该路径声明的 params 提供），如 { id: "u-42" }',
          additionalProperties: true,
        },
      },
      required: ['path'],
    },
  },
};

/* -------------------------------------------------------------------------- */
/* navigate_to_page —— AI 决策跳转（替代旧硬编码跳转桥）                          */
/* -------------------------------------------------------------------------- */

/**
 * 跳转请求 → Tool 信封。
 * disabled / invalid_target / no_handler 一律返回 `kind: success`（verified=true）的
 * 信封并在 data 中携带拒绝原因：
 * - 不触发 auto-continue 把跳转失败当作「关键 Tool 未通过验证」重试；
 * - AI 读取 data.reason / data.message 向用户说明（如提示开启自动跳转）。
 */
async function handleNavigateToPage(args: NavigationRequest): Promise<ToolResponse> {
  const result = await navigateToPage(args);
  if (result.navigated) {
    return {
      ok: true,
      verified: true,
      kind: 'success',
      data: { navigated: true, path: result.path },
      meta: { tool: NAVIGATE_TO_PAGE_TOOL },
    };
  }
  return {
    ok: true,
    verified: true,
    kind: 'success',
    data: {
      navigated: false,
      reason: result.reason,
      message: result.message,
    },
    meta: { tool: NAVIGATE_TO_PAGE_TOOL },
  };
}

async function handleSkillLoad(args: {
  slug?: string;
  name?: string;
}): Promise<ToolResponse> {
  const slug = String(args.slug || args.name || '').trim();
  if (!slug) {
    return {
      ok: false,
      kind: 'business_error',
      error: {
        code: 'INVALID_ARGS',
        message: '缺少 slug（或 name）',
        category: 'invalid_args',
        retryable: true,
        hint: '请传入目录中的精确 skill slug',
      },
      agentHint: '请按 Skill 目录中的 slug 调用 skill 工具',
      meta: { tool: SKILL_TOOL },
    };
  }
  try {
    const body = await loadSkillBodyBySlug(slug);
    if (!body) {
      return {
        ok: false,
        kind: 'business_error',
        error: {
          code: 'NOT_FOUND',
          message: `未找到 Skill：${slug}`,
          category: 'not_found',
          retryable: false,
        },
        meta: { tool: SKILL_TOOL },
      };
    }
    const grantedTools = (body.skill?.tools || [])
      .map((t) => String(t.functionName || '').trim())
      .filter(Boolean);
    const wrapped = `<skill_content name="${body.slug}">\n# ${body.name}\n\n${body.contentMarkdown}\n</skill_content>`;
    return {
      ok: true,
      kind: 'success',
      data: {
        slug: body.slug,
        name: body.name,
        description: body.description,
        content: wrapped,
        /** 本 Skill 授予的 Tool；后续 round 已同步扩展 schema，请直接 native 调用，勿用 run_code 探路 */
        grantedTools,
      },
      agentHint:
        grantedTools.length > 0
          ? `Skill 已加载；已授予 Tool：${grantedTools.slice(0, 20).join(', ')}${grantedTools.length > 20 ? '…' : ''}。请直接调用这些业务 Tool，禁止用 run_code/run_subagent 探测可用 Tool。`
          : 'Skill 已加载；请按 SOP 直接调用已可见的业务 Tool，禁止用 run_code 探路。',
      display: {
        kind: 'status',
        payload: { message: body.name || body.slug },
        visibility: 'result_hidden',
      },
      meta: { tool: SKILL_TOOL },
    };
  } catch (err) {
    return {
      ok: false,
      kind: 'system_error',
      error: {
        code: 'SYSTEM_ERROR',
        message: err instanceof Error ? err.message : '加载 Skill 失败',
        category: 'unknown',
        retryable: true,
      },
      meta: { tool: SKILL_TOOL },
    };
  }
}

async function handleRunCode(args: {
  language?: string;
  source?: string;
  timeoutMs?: number;
}): Promise<ToolResponse> {
  const language = String(args.language || 'javascript').toLowerCase();
  const source = String(args.source || '');

  if (language === 'python') {
    return {
      ok: false,
      kind: 'business_error',
      error: {
        code: 'UNSUPPORTED',
        message: '浏览器侧暂不执行 Python；请改用 language=javascript，或直接调用业务 Tool',
        category: 'invalid_args',
        retryable: true,
        hint: '复杂编排优先用 javascript + await tools.xxx(args)',
      },
      agentHint: '请改用 javascript，或直接调用已注册的业务 Tool',
      meta: { tool: RUN_CODE_TOOL },
    };
  }

  if (language !== 'javascript' && language !== 'js' && language !== 'typescript' && language !== 'ts') {
    return {
      ok: false,
      kind: 'business_error',
      error: {
        code: 'INVALID_ARGS',
        message: `不支持的 language: ${language}`,
        category: 'invalid_args',
        retryable: true,
      },
      meta: { tool: RUN_CODE_TOOL },
    };
  }

  try {
    const turn = getCurrent();
    const includeServer = Boolean(turn?.invokeAuthorizedTool);
    // 有 turn dispatcher 时与 native 同源（含 server_builtin）；否则仅 client
    const { toolNames, contracts } = resolveRunnableClientToolNames(
      turn?.availableToolNames,
      { includeAuthorizedServerTools: includeServer },
    );

    const { value } = await runJavaScriptCode(
      source,
      async (name, toolArgs) => {
        if (!toolNames.includes(name)) {
          throw new Error(
            `未授权或不在本回合可编排名: ${name}。请直接 native 调用业务 Tool，或 tools.list() 查看可编排名。`,
          );
        }
        const parameters =
          getToolContract(name)?.parameters ||
          turn?.resolveToolBrief?.(name)?.parameters ||
          (getFunctionCallDef(name)?.parameters as Record<string, unknown> | undefined) ||
          { type: 'object', properties: {} };
        const validation = validateToolArgs(toolArgs || {}, parameters);
        if (!validation.valid) {
          throw new Error(`参数校验失败: ${validation.message}`);
        }
        if (turn?.invokeAuthorizedTool) {
          return turn.invokeAuthorizedTool(name, toolArgs || {});
        }
        const def = getFunctionCallDef(name);
        if (!def) {
          throw new Error(
            `未授权或不在本回合可编排名: ${name}（无 turn dispatcher 时仅能编排已注册 client Tool）`,
          );
        }
        return def.handler(toolArgs);
      },
      {
        timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
        toolNames,
        contracts: contracts.map((c) => ({
          name: c.name,
          description: c.description,
          parameters: c.parameters,
        })),
      },
    );
    return {
      ok: true,
      kind: 'success',
      data: { language: 'javascript', value },
      display: {
        kind: 'json',
        payload: value,
        collapsed: true,
      },
      agentHint:
        toolNames.length === 0
          ? '沙箱内暂无可编排业务 Tool。请直接调用 native 业务 Tool（勿用 run_code 探路）。'
          : undefined,
      meta: { tool: RUN_CODE_TOOL },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'run_code 执行失败';
    const isInvalidArgs = message.includes('参数校验失败');
    return {
      ok: false,
      kind: 'business_error',
      error: {
        code: isInvalidArgs ? 'INVALID_ARGS' : 'RUN_CODE_FAILED',
        message,
        category: isInvalidArgs ? 'invalid_args' : 'unknown',
        retryable: true,
        hint: isInvalidArgs
          ? '请 tools.schema(toolName) 查看必填参数后重试'
          : '有专用业务 Tool 请直接 native 调用；run_code 仅编排本回合已授权业务 Tool（含 server_builtin，不含 http_request/harness）',
      },
      agentHint: isInvalidArgs
        ? '参数错误：先 tools.schema(name) 读取 required，修正后再 await tools.name(args)。'
        : 'run_code 失败：请直接调用业务 Tool，或 tools.list() 后编排已授权名。禁止用本工具探路。',
      meta: { tool: RUN_CODE_TOOL },
    };
  }
}

export const SKILL_OPENAI_TOOL = {
  type: 'function' as const,
  function: {
    name: SKILL_TOOL,
    description:
      '按需加载某个 Skill 的完整正文（SOP）。目录中仅有摘要；当任务匹配某 Skill 描述或用户点名时，先调用本工具再执行业务动作。' +
      '成功后返回 grantedTools，且同回合后续轮次已扩展可见 Tool schema——请直接 native 调用业务 Tool，禁止再用 run_code 探测。' +
      'slug 必须与目录中的精确名称一致。',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Skill slug，如 bizdata-model-design' },
        name: { type: 'string', description: '同 slug（兼容别名）' },
      },
    },
  },
};

export const RUN_CODE_OPENAI_TOOL = {
  type: 'function' as const,
  function: {
    name: RUN_CODE_TOOL,
    description:
      '可选：用短脚本编排本回合已授权业务 Tool（含 server_builtin）或做数据计算（默认 javascript）。' +
      '有专用业务 Tool 时优先直接 native 调用；禁止用本工具探路或 tools.list()「发现」能力。' +
      '禁止编排 http_request 与 harness（skill/ask_user/task_complete/run_code 等）。' +
      '脚本内：await tools.tool_name(args)、tools.list()、tools.schema(name?)。调用前 tools.schema 读必填字段。' +
      'tools 不是数组：禁止 tools.filter/map/find。正确：const names = tools.list(); names.filter(...); await tools[name](args)。' +
      '禁止重新声明 tools。禁止任意网络与磁盘访问。',
    parameters: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['javascript', 'python'],
          description: '脚本语言；浏览器侧当前仅 javascript',
        },
        source: {
          type: 'string',
          description: '脚本正文。JS 示例：const r = await tools.uac_list_users({}); return r;',
        },
        timeoutMs: { type: 'integer', description: '可选超时毫秒，默认 12000' },
      },
      required: ['source'],
    },
  },
};

export const RUN_SUBAGENT_OPENAI_TOOL = {
  type: 'function' as const,
  function: {
    name: RUN_SUBAGENT_TOOL,
    description:
      '批量 fan-out 或顺序委托：在隔离子 Turn 内编排**已授权** client Tool（不启动嵌套 LLM）。' +
      'mode=fanout：对 items 并发调用同一 tool；mode=sequence：按 steps 串行调用。' +
      '适合「为每个实体创建 API」类批量任务。禁止用本工具探测或绕过 Skill 授权；有专用业务 Tool 时优先直接 native 调用。',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['fanout', 'sequence'],
          description: 'fanout=批量并发；sequence=顺序步骤',
        },
        goal: { type: 'string', description: '子任务目标（写入回放轨迹）' },
        tool: {
          type: 'string',
          description: 'fanout：要对每项调用的 Tool functionName',
        },
        items: {
          type: 'array',
          description: 'fanout：每项为 tool 参数对象（可与 baseArgs 合并）',
          items: { type: 'object' },
        },
        baseArgs: {
          type: 'object',
          description: 'fanout：合并到每项参数上的公共字段',
        },
        maxConcurrency: {
          type: 'integer',
          description: 'fanout 并发上限，默认 4，最大 8',
        },
        steps: {
          type: 'array',
          description: 'sequence：有序步骤',
          items: {
            type: 'object',
            properties: {
              tool: { type: 'string' },
              args: { type: 'object' },
            },
            required: ['tool'],
          },
        },
      },
      required: ['mode', 'goal'],
    },
  },
};

async function handleRunSubagent(args: {
  mode?: string;
  goal?: string;
  tool?: string;
  items?: Record<string, unknown>[];
  baseArgs?: Record<string, unknown>;
  maxConcurrency?: number;
  steps?: Array<{ tool: string; args?: Record<string, unknown> }>;
}): Promise<ToolResponse> {
  const mode = String(args.mode || '').trim();
  const goal = String(args.goal || '').trim();
  if (!goal) {
    return {
      ok: false,
      kind: 'business_error',
      error: {
        code: 'INVALID_ARGS',
        message: 'goal 不能为空',
        category: 'invalid_args',
        retryable: true,
      },
      meta: { tool: RUN_SUBAGENT_TOOL },
    };
  }

  const parentTurnId = getActiveTurnId() || undefined;
  const conversationKey = getActiveConversationKey();

  try {
    if (mode === 'fanout') {
      const data = await runSubagentFanout({
        goal,
        tool: String(args.tool || ''),
        items: Array.isArray(args.items) ? args.items : [],
        baseArgs: args.baseArgs,
        maxConcurrency: args.maxConcurrency,
        parentTurnId,
        conversationKey,
      });
      return {
        ok: data.failCount === 0,
        kind: data.failCount === 0 ? 'success' : 'business_error',
        verified: data.failCount === 0,
        data,
        display: {
          kind: 'status',
          title: `subagent fanout：成功 ${data.okCount} / 失败 ${data.failCount}`,
          payload: { message: data.childTurnId },
        },
        error:
          data.failCount > 0
            ? {
                code: 'SUBAGENT_PARTIAL_FAILURE',
                message: `${data.failCount} 项失败，详见 results`,
                category: 'unknown',
                retryable: true,
              }
            : undefined,
        meta: { tool: RUN_SUBAGENT_TOOL },
      };
    }

    if (mode === 'sequence') {
      const data = await runSubagentSequence({
        goal,
        steps: Array.isArray(args.steps) ? args.steps : [],
        parentTurnId,
        conversationKey,
      });
      return {
        ok: data.ok,
        kind: data.ok ? 'success' : 'business_error',
        verified: data.ok,
        data,
        display: {
          kind: 'status',
          title: data.ok ? 'subagent sequence 完成' : 'subagent sequence 中断',
          payload: { message: data.childTurnId },
        },
        error: data.ok
          ? undefined
          : {
              code: 'SUBAGENT_STEP_FAILED',
              message: '顺序步骤未全部成功',
              category: 'unknown',
              retryable: true,
            },
        meta: { tool: RUN_SUBAGENT_TOOL },
      };
    }

    return {
      ok: false,
      kind: 'business_error',
      error: {
        code: 'INVALID_ARGS',
        message: `非法 mode=${mode}，期望 fanout|sequence`,
        category: 'invalid_args',
        retryable: true,
      },
      meta: { tool: RUN_SUBAGENT_TOOL },
    };
  } catch (err) {
    return {
      ok: false,
      kind: 'business_error',
      error: {
        code: 'SUBAGENT_FAILED',
        message: err instanceof Error ? err.message : 'run_subagent 失败',
        category: 'unknown',
        retryable: true,
      },
      meta: { tool: RUN_SUBAGENT_TOOL },
    };
  }
}

/* -------------------------------------------------------------------------- */
/* 注册 / 注销                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * harness Tool 的 OpenAI function 定义。
 * update_plan / task_complete 仅在 enableStructuredTermination 时注入；
 * ask_user 始终注入（mid-task HITL，与结构化终止开关无关）。
 */
export const ASK_USER_OPENAI_TOOL = {
  type: 'function' as const,
  function: {
    name: ASK_USER_TOOL,
    description:
      '向用户展示结构化选择题并暂停 Agent，直到用户在聊天卡片中确认选择。' +
      '用于方案取舍、危险写操作前确认、多路径决策。禁止仅用「请确认后回复」代替本 Tool。' +
      'mode=single 为单选（默认允许自定义「其他」）；mode=multi 为多选（默认不允许自定义）。' +
      '调用后循环会挂起；用户提交后系统会注入【用户选择】消息并续跑。',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '展示给用户的问题（简洁明确）',
        },
        mode: {
          type: 'string',
          enum: ['single', 'multi'],
          description: 'single=单选；multi=多选',
        },
        options: {
          type: 'array',
          description: '候选项，通常 2–5 个（推荐 3）',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '稳定 id（如 opt_a）' },
              label: { type: 'string', description: '按钮/选项主文案' },
              description: { type: 'string', description: '可选补充说明' },
            },
            required: ['id', 'label'],
          },
        },
        allowCustom: {
          type: 'boolean',
          description: '是否显示「其他」自由输入。single 默认 true，multi 默认 false',
        },
        minSelect: {
          type: 'number',
          description: 'multi 最少选择数，默认 1',
        },
        maxSelect: {
          type: 'number',
          description: 'multi 最多选择数，默认等于 options 长度',
        },
      },
      required: ['question', 'mode', 'options'],
    },
  },
};

export const HARNESS_OPENAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: UPDATE_PLAN_TOOL,
      description:
        '维护结构化任务清单（Plan）。任务开始时拆解为 3-7 个里程碑步骤；每完成一步或状态变化时增量更新。' +
        '同一时间只能有一个任务处于 in_progress。merge=true（默认）按 id 增量合并，false 时全量替换。',
      parameters: {
        type: 'object',
        properties: {
          plan: {
            type: 'array',
            description: '任务清单',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: '任务唯一 id（稳定标识，如 t1/t2）' },
                content: { type: 'string', description: '任务描述（做什么）' },
                status: {
                  type: 'string',
                  enum: ['pending', 'in_progress', 'completed'],
                  description: '当前状态',
                },
                requiresVerification: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '完成该任务须调用的关键 Tool functionName 列表',
                },
              },
              required: ['id', 'content', 'status'],
            },
          },
          merge: {
            type: 'boolean',
            description: '是否增量合并（默认 true）。false 时全量替换清单。',
          },
        },
        required: ['plan'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: TASK_COMPLETE_TOOL,
      description:
        '声明整个任务完成并终止本轮 Agent 循环。调用前必须确保：plan 全部 completed、关键 Tool 全部 verified=true、successCriteria 全部满足。' +
        '禁止用自由文本声称完成——必须调用本 Tool。校验不通过时会返回未完成项，须继续推进后重试。',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: '面向用户的交付总结（做了什么、验证结果、注意事项）',
          },
          next_steps: {
            type: 'array',
            description: '可选的下一步建议（渲染为可点击按钮）',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string', description: '按钮文案（<30 字）' },
              },
              required: ['id', 'label'],
            },
          },
          criteriaSatisfied: {
            type: 'boolean',
            description: '声明 successCriteria 是否全部满足（strict 模式下必填且须为 true）',
          },
        },
        required: ['summary'],
      },
    },
  },
  ASK_USER_OPENAI_TOOL,
];

export function registerBuiltinTools(): void {
  // 批量注册：4 个内置 Tool 一次性注册，notifyRegistryChange 只触发一次，
  // 避免冷启动 4 次注册 → 4 次 setLocalToolVersion → 4 次重渲染 → 4 次 openaiTools 重算。
  registerFunctionCalls([
    {
      name: BUILTIN_TOOL_NAME,
      description: '读取当前页面已注册的 AI Surface 快照（选中实体、表单状态等页面上下文）',
      parameters: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            description: '可选，按 domain 过滤，如 bizdata、aibase',
          },
          surfaceId: {
            type: 'string',
            description: '可选，指定 Surface id',
          },
        },
      },
      handler: async (args) => {
        let snapshots = await readAllAISurfaces();
        const domain = args.domain as string | undefined;
        const surfaceId = args.surfaceId as string | undefined;
        if (domain) {
          snapshots = snapshots.filter((item) => item.domain === domain);
        }
        if (surfaceId) {
          snapshots = snapshots.filter((item) => item.id === surfaceId);
        }
        return { surfaces: snapshots, count: snapshots.length };
      },
    },
    {
      name: UPDATE_PLAN_TOOL,
      description: HARNESS_OPENAI_TOOLS[0].function.description,
      parameters: HARNESS_OPENAI_TOOLS[0].function.parameters,
      handler: async (args) => handleUpdatePlan(args as { plan?: PlanItem[]; merge?: boolean }),
    },
    {
      name: TASK_COMPLETE_TOOL,
      description: HARNESS_OPENAI_TOOLS[1].function.description,
      parameters: HARNESS_OPENAI_TOOLS[1].function.parameters,
      handler: async (args) =>
        handleTaskComplete(args as {
          summary?: string;
          next_steps?: Array<{ id: string; label: string }>;
          criteriaSatisfied?: boolean;
        }),
    },
    {
      name: ASK_USER_TOOL,
      description: ASK_USER_OPENAI_TOOL.function.description,
      parameters: ASK_USER_OPENAI_TOOL.function.parameters,
      handler: async (args) => handleAskUser(args as AskUserArgs),
    },
    {
      name: NAVIGATE_TO_PAGE_TOOL,
      description: NAVIGATE_TO_PAGE_OPENAI_TOOL.function.description,
      parameters: NAVIGATE_TO_PAGE_OPENAI_TOOL.function.parameters,
      handler: async (args) => handleNavigateToPage(args as unknown as NavigationRequest),
    },
    {
      name: SKILL_TOOL,
      description: SKILL_OPENAI_TOOL.function.description,
      parameters: SKILL_OPENAI_TOOL.function.parameters,
      handler: async (args) => handleSkillLoad(args as { slug?: string; name?: string }),
    },
    {
      name: RUN_CODE_TOOL,
      description: RUN_CODE_OPENAI_TOOL.function.description,
      parameters: RUN_CODE_OPENAI_TOOL.function.parameters,
      handler: async (args) =>
        handleRunCode(args as { language?: string; source?: string; timeoutMs?: number }),
    },
    {
      name: RUN_SUBAGENT_TOOL,
      description: RUN_SUBAGENT_OPENAI_TOOL.function.description,
      parameters: RUN_SUBAGENT_OPENAI_TOOL.function.parameters,
      handler: async (args) =>
        handleRunSubagent(
          args as {
            mode?: string;
            goal?: string;
            tool?: string;
            items?: Record<string, unknown>[];
            baseArgs?: Record<string, unknown>;
            maxConcurrency?: number;
            steps?: Array<{ tool: string; args?: Record<string, unknown> }>;
          },
        ),
    },
  ]);
}

export function unregisterBuiltinTools(): void {
  unregisterFunctionCalls([
    BUILTIN_TOOL_NAME,
    UPDATE_PLAN_TOOL,
    TASK_COMPLETE_TOOL,
    ASK_USER_TOOL,
    NAVIGATE_TO_PAGE_TOOL,
    SKILL_TOOL,
    RUN_CODE_TOOL,
    RUN_SUBAGENT_TOOL,
  ]);
}
