import type { AIBaseSkill, PlanItem, SkillCompletionStrategy } from '../types';
import type { ToolResponse } from '../types/toolResponse';
import { extractA2uiCommandsPayload } from '../a2ui/parseA2uiCommands';
import { getSkillCompletionStrategy } from '../registry/skillPolicyRegistry';
import { needsPostWriteNavigation, WRITE_SUCCESS_NAVIGATE_HINT } from '../navigation/writeNavigateHint';

/**
 * 声明式 auto-continue 策略：取代历史版本里硬编码的 bizdata/apiservice 等业务判定。
 *
 * 判定依据全部来自各 Skill 的 SkillCompletionStrategy（后端声明或前端注册表覆盖）：
 * - requiredTools：本轮结束若仍有未调用的关键 Tool → 续调（mode=all/any）
 * - completionKeywords：文本命中 → 视为任务完成，停止续调（须通过 verification 检查）
 * - blockKeywords：文本命中（如收尾建议句）→ 停止续调
 * - continuousExecution：连续执行型 Skill（test-fix 循环等），对 narration 宽松续调
 * - 另有通用语言模式：进度叙述可触发续调；收尾建议句 / 口头等待确认禁止续调
 *
 * SDK 本身不再包含任何业务工具名集合或中文正则。
 */

export interface AutoContinueContext {
  /** 已加载的 Skill 列表（含 completionStrategy） */
  skills: AIBaseSkill[];
  allowedToolNames: Set<string>;
  invokedToolNames: Set<string>;
  toolsExecuted: number;
  /**
   * 本轮结束时的助手文本（可含多轮累积）。
   * 完成/阻断关键词与虚假成功声称用此字段。
   */
  text: string;
  /**
   * 最近一次 LLM 纯文本轮的输出。
   * 进度叙述 / 等待确认 / 收尾建议等语言模式优先用此字段，
   * 避免「第三步」等早期叙述毒化收尾汇总后仍误触发续调。
   */
  latestText?: string;
  /** 本轮各 Tool 的标准化返回信封 */
  toolOutcomes?: ToolResponse[];
}

/** 合并所有 Skill 的完成策略（取并集；布尔字段任一为真即为真） */
function aggregateStrategies(skills: AIBaseSkill[]): {
  requiredTools: Set<string>;
  completionKeywords: string[];
  blockKeywords: string[];
  claimRules: Array<{ keywords: string[]; requiredTools: string[] }>;
  anyContinuous: boolean;
} {
  const requiredTools = new Set<string>();
  const completionKeywords: string[] = [];
  const blockKeywords: string[] = [];
  const claimRules: Array<{ keywords: string[]; requiredTools: string[] }> = [];
  let anyContinuous = false;

  for (const skill of skills) {
    const strategy = getSkillCompletionStrategy(skill);
    if (!strategy) continue;
    if (strategy.requiredTools) {
      for (const name of strategy.requiredTools) requiredTools.add(name);
    }
    if (strategy.completionKeywords) completionKeywords.push(...strategy.completionKeywords);
    if (strategy.blockKeywords) blockKeywords.push(...strategy.blockKeywords);
    if (strategy.claimRules) claimRules.push(...strategy.claimRules);
    if (strategy.continuousExecution) anyContinuous = true;
  }

  return { requiredTools, completionKeywords, blockKeywords, claimRules, anyContinuous };
}

function hasUnmetClaimRules(
  text: string,
  claimRules: Array<{ keywords: string[]; requiredTools: string[] }>,
  invokedToolNames: Set<string>,
): boolean {
  for (const rule of claimRules) {
    if (!matchesAnyKeyword(text, rule.keywords)) continue;
    if (rule.requiredTools.some((name) => !invokedToolNames.has(name))) return true;
  }
  return false;
}

/** 对已 published 服务重复 publish：业务上可接受，不应触发续调纠正 */
function isBenignPublishOutcome(item: ToolResponse): boolean {
  if (item.meta.tool !== 'apiservice_publish_service') return false;
  const data = item.data as Record<string, unknown> | undefined;
  if (data?.alreadyPublished === true) return true;
  const msg = item.error?.message ?? '';
  return /已是 published|alreadyPublished/i.test(msg);
}

function isFailedToolOutcome(item: ToolResponse): boolean {
  if (item.kind === 'user_choice_request') return false;
  if (isBenignPublishOutcome(item)) return false;
  if (item.kind === 'system_error' || item.ok === false) return true;
  if (item.kind === 'business_error') return true;
  if (item.verified === false) return true;
  return false;
}

function hasFailedToolOutcomes(
  toolNames: string[],
  toolOutcomes: ToolResponse[] = [],
): boolean {
  if (!toolNames.length || !toolOutcomes.length) return false;
  const relevant = toolOutcomes.filter((item) => toolNames.includes(item.meta.tool));
  return relevant.some(isFailedToolOutcome);
}

/** 文本是否命中关键词集合（任一命中即 true，忽略大小写） */
function matchesAnyKeyword(text: string, keywords: string[]): boolean {
  if (!keywords.length) return false;
  const lower = text.toLowerCase();
  return keywords.some((kw) => kw && lower.includes(kw.toLowerCase()));
}

/**
 * 进度叙述检测：模型把步骤用文字写出来（如"第一步…接下来…"），却没真正调用 Tool。
 * 这是语言层面的通用模式（非业务专属），仅在声明了策略的 Skill 上生效时才触发续调。
 */
const PROGRESS_NARRATION_RE =
  /第[一二三四五六七八九十\d]+步|现在进入第?|进入第[三四五]步|最后第?[四五]步|接下来(?!您|可|若|也|建议)/i;

/** 收尾建议句（如下一步建议），命中时禁止续调 —— 通用语言模式 */
const PROGRESS_CLOSING_RE =
  /接下来您(?:可以|若|也)?|建议(?:您|可)|可选(?:操作|步骤)?|如需(?:继续|物化|创建|配置)/i;

/**
 * 口头等待用户确认：命中时禁止续调，避免「确认后我就开始」被 requiredTools 抢跑。
 * 虚假成功纠正（hasPrematureSuccessClaim）仍优先于此规则。
 */
const WAITING_USER_CONFIRMATION_RE =
  /确认后|请(?:您)?确认|等您确认|等待(?:您的?)?确认|需要您确认|是否继续|可以开始吗|同意后再|您确认后/i;

function isWaitingUserConfirmation(text: string): boolean {
  return WAITING_USER_CONFIRMATION_RE.test(text);
}

function hasIncompleteProgressNarration(text: string): boolean {
  if (PROGRESS_CLOSING_RE.test(text)) return false;
  if (isWaitingUserConfirmation(text)) return false;
  return PROGRESS_NARRATION_RE.test(text);
}

/**
 * 按各 Skill 独立判定 requiredTools 是否未满足（保留 all/any 模式，避免跨 Skill 并集后语义错乱）。
 */
function hasUnmetRequiredToolsBySkills(
  skills: AIBaseSkill[],
  invokedToolNames: Set<string>,
): boolean {
  for (const skill of skills) {
    const strategy = getSkillCompletionStrategy(skill);
    const tools = strategy?.requiredTools;
    if (!tools?.length) continue;
    const mode = strategy?.requiredToolsMode ?? 'all';
    if (mode === 'any') {
      if (!tools.some((name) => invokedToolNames.has(name))) return true;
    } else if (tools.some((name) => !invokedToolNames.has(name))) {
      return true;
    }
  }
  return false;
}

function hasUnmetRequiredTools(requiredTools: Set<string>, invokedToolNames: Set<string>): boolean {
  return [...requiredTools].some((name) => !invokedToolNames.has(name));
}

function hasFailedVerification(
  requiredTools: Set<string>,
  toolOutcomes: ToolResponse[] = [],
): boolean {
  if (!toolOutcomes.length) return false;

  const requiredList = [...requiredTools];
  const relevant = requiredList.length
    ? toolOutcomes.filter((item) => requiredList.includes(item.meta.tool))
    : toolOutcomes;

  const targets = relevant.length ? relevant : toolOutcomes;

  return targets.some((item) => {
    if (item.kind === 'user_choice_request') return false;
    if (isBenignPublishOutcome(item)) return false;
    if (item.kind === 'system_error' || item.ok === false) return true;
    if (item.kind === 'business_error') return true;
    if (item.verified === false) return true;
    if (item.verified === undefined && requiredList.includes(item.meta.tool)) {
      // 关键写操作 Tool 无 verified 字段，视为未通过
      return true;
    }
    return false;
  });
}

/**
 * 根据文本声称内容，确定须校验的关键 Tool（claimRules 优先于全局 requiredTools）。
 * 例如声称「全部 published」只须 publish_service，不应再强制 apiservice_run_test。
 */
function getApplicableRequiredTools(
  text: string,
  requiredTools: Set<string>,
  completionKeywords: string[],
  claimRules: Array<{ keywords: string[]; requiredTools: string[] }>,
): Set<string> {
  const applicable = new Set<string>();
  let ruleMatched = false;

  for (const rule of claimRules) {
    if (!matchesAnyKeyword(text, rule.keywords)) continue;
    ruleMatched = true;
    for (const name of rule.requiredTools) applicable.add(name);
  }

  if (ruleMatched) return applicable;
  if (matchesAnyKeyword(text, completionKeywords)) return new Set(requiredTools);
  return new Set();
}

/** 模型声称任务完成，但 Tool 证据不足或未 verified */
function hasPrematureSuccessClaim(
  text: string,
  ctx: AutoContinueContext,
  completionKeywords: string[],
  requiredTools: Set<string>,
  claimRules: Array<{ keywords: string[]; requiredTools: string[] }>,
): boolean {
  const matchedClaimRule = claimRules.some((rule) => matchesAnyKeyword(text, rule.keywords));
  const matchedCompletion = matchesAnyKeyword(text, completionKeywords);
  if (!matchedClaimRule && !matchedCompletion) return false;

  if (ctx.toolsExecuted === 0) return true;

  // claimRules：规则内 requiredTools 仍为全部须调用
  if (matchedClaimRule) {
    const applicableTools = getApplicableRequiredTools(
      text,
      requiredTools,
      completionKeywords,
      claimRules,
    );
    if (applicableTools.size > 0) {
      if (hasUnmetRequiredTools(applicableTools, ctx.invokedToolNames)) return true;
      if (hasFailedVerification(applicableTools, ctx.toolOutcomes)) return true;
      for (const rule of claimRules) {
        if (!matchesAnyKeyword(text, rule.keywords)) continue;
        if (hasFailedToolOutcomes(rule.requiredTools, ctx.toolOutcomes)) return true;
      }
      // claimRules 通过后不提前返回：继续用 completionKeywords + requiredTools 做并列校验
    } else if (hasUnmetClaimRules(text, claimRules, ctx.invokedToolNames)) {
      return true;
    }
  }

  // completionKeywords：按各 Skill 的 requiredToolsMode（all/any）判定，避免单条/批量互斥被当成 AND
  if (matchedCompletion) {
    if (hasUnmetRequiredToolsBySkills(ctx.skills, ctx.invokedToolNames)) return true;
    if (hasFailedVerification(requiredTools, ctx.toolOutcomes)) return true;
  }

  if (hasFailedVerification(new Set(), ctx.toolOutcomes)) return true;
  return false;
}

/** 语言模式判定用的文本：优先最近一轮，避免累积历史毒化 */
function languageProbeText(ctx: AutoContinueContext): string {
  const latest = ctx.latestText?.trim();
  if (latest) return latest;
  return ctx.text;
}

/**
 * 是否应在「本轮只输出文本、未调 Tool」时自动注入续调指令。
 * 全部依据已加载 Skill 的声明式策略判定。
 */
export function shouldAutoContinueAfterTextOnly(ctx: AutoContinueContext): boolean {
  const { text, toolsExecuted, invokedToolNames, skills } = ctx;
  if (!text.trim()) return false;

  const probe = languageProbeText(ctx);
  const { requiredTools, completionKeywords, blockKeywords, claimRules, anyContinuous } =
    aggregateStrategies(skills);

  // A2UI 下一步建议已输出 → 任务已收尾，禁止续调（避免把建议按钮当成待执行步骤）
  if (extractA2uiCommandsPayload(text).hasSteps) return false;
  if (extractA2uiCommandsPayload(probe).hasSteps) return false;

  // ask_user 挂起 → 禁止续调
  if (hasPendingUserChoiceRequest(ctx.toolOutcomes)) return false;

  // 0. 声称成功但未 verified / 未调用关键 Tool → 强制续调纠正
  if (hasPrematureSuccessClaim(text, ctx, completionKeywords, requiredTools, claimRules)) {
    return true;
  }

  // 0.5 口头等待用户确认 → 禁止续调（须在 requiredTools 强制续调之前；看最近一轮话术）
  if (isWaitingUserConfirmation(probe)) return false;

  if (toolsExecuted === 0) return false;

  // 1. 文本命中完成关键词且 verification 通过 → 任务完成，停止续调
  if (matchesAnyKeyword(text, completionKeywords)) return false;
  // 2. 文本命中阻断关键词（收尾建议句）→ 停止续调（优先看最近一轮）
  if (matchesAnyKeyword(probe, blockKeywords) || matchesAnyKeyword(text, blockKeywords)) {
    return false;
  }

  // 3. 各 Skill 的 requiredTools 仍有未满足 → 续调（按 skill 的 all/any 模式）
  if (hasUnmetRequiredToolsBySkills(skills, invokedToolNames)) return true;

  // 4. 进度叙述但未调 Tool：连续执行型 Skill 宽松续调，否则仅在声明了策略时续调
  //    只用最近一轮文本，避免早期「第三步」让收尾汇总误续调
  if (hasIncompleteProgressNarration(probe)) {
    const hasAnyStrategy =
      requiredTools.size > 0 ||
      completionKeywords.length > 0 ||
      blockKeywords.length > 0 ||
      anyContinuous;
    if (hasAnyStrategy || anyContinuous) return true;
  }

  return false;
}

/**
 * 构造续调指令（[系统] 消息）。提示的工具示例从各 Skill 声明的 requiredTools 取，
 * 不再硬编码业务工具名。未声明 requiredTools 时退化为「当前 Skill 允许的 Tool」。
 *
 * 注意：因对话协议限制，此消息以 role=user 注入，但文案必须标明「系统自动续调、非用户发言」，
 * 避免模型回复「您说得对」等把系统消息当成用户纠正。
 */
export function buildAutoContinueNudge(
  allowedToolNames: Set<string>,
  skills: AIBaseSkill[] = [],
  toolOutcomes: ToolResponse[] = [],
  options?: { autoNavigate?: boolean },
): string {
  const { requiredTools } = aggregateStrategies(skills);
  const examples = [...requiredTools];
  if (!examples.length) {
    examples.push(...Array.from(allowedToolNames).slice(0, 4));
  }
  const toolHint = examples.length ? examples.join('、') : '当前 Skill 允许的 Tool';

  const failed = toolOutcomes.find(
    (item) =>
      item.kind !== 'user_choice_request' &&
      (item.kind !== 'success' || item.verified === false || item.ok === false),
  );

  const preface =
    '[系统自动续调·非用户发言] 这不是用户在说话或纠正你。禁止回复「您说得对」「好的我马上」等对用户确认类话术；直接调用 Tool 继续未完成步骤。';

  if (failed?.error?.message) {
    return `${preface} 上一 Tool「${failed.meta.tool}」未通过验证（${failed.error.message}）。禁止向用户声称已成功；请根据 Tool 返回的 ok/verified/kind/error.message 说明失败原因或重试。`;
  }

  if (options?.autoNavigate !== false && needsPostWriteNavigation(toolOutcomes)) {
    return `${preface} ${WRITE_SUCCESS_NAVIGATE_HINT}`;
  }

  if (failed?.error?.message) {
    return `${preface} 上一 Tool「${failed.meta.tool}」未通过验证（${failed.error.message}）。禁止向用户声称已成功；请根据 Tool 返回的 ok/verified/kind/error.message 说明失败原因或重试。`;
  }

  return `${preface} 请立即调用 Tool 完成尚未执行的步骤（如 ${toolHint}），不要只输出步骤说明或虚假成功汇总。必须以 Tool 返回信封中的 ok/verified/kind/error.message 为准汇报结果。`;
}

/* ========================================================================== */
/* 结构化终止（task_complete / update_plan）决策                                */
/*                                                                            */
/* 与传统 auto-continue 的本质区别：信号反转。传统机制「text-only 默认 STOP，  */
/* 靠 policy 抢救续命」；结构化终止「text-only 默认续命，只有 task_complete    */
/* 返回 verified=true 才停」。详见 docs/AIBase 成熟闭环与 Planning next moves 统一方案.md。            */
/* ========================================================================== */

/** 结构化终止下，text-only round 的决策结果 */
export type StructuredTerminationDecision =
  /** task_complete 已通过校验，正常终止 */
  | { action: 'terminate' }
  /** 命中硬停止规则，必须终止（达到上限 / 收敛检测 / 等待用户 / 被截断） */
  | { action: 'hard-stop'; reason: string }
  /** 继续循环，注入 nudge */
  | { action: 'continue' };

export interface StructuredTerminationContext {
  /** 最近一次 task_complete 是否 verified=true（null 表示本回合从未调用） */
  lastTaskCompleteVerified: boolean | null;
  /** 本回合已注入的 nudge 次数 */
  autoContinueNudges: number;
  /** 本回合执行的轮数 */
  round: number;
  /** 最近一次 LLM 的 finish_reason */
  finishReason?: string;
  /** 本轮纯文本（用于检测「等待用户确认」等语言模式） */
  latestText: string;
  /** 收敛检测：最近 N 轮是否出现重复签名 / 重复错误 */
  convergenceDetected: { kind: 'repeat-tool' | 'repeat-error'; detail: string } | null;
  /** 当前 plan（用于判断是否需要继续） */
  plan: PlanItem[];
  /** 当前生效的 completion strategy（合并后） */
  completionStrategy?: SkillCompletionStrategy;
  /** 本回合已执行的 Tool 数 */
  toolsExecuted?: number;
  /** 本回合 Tool 结果，用于判断查询型直接收尾是否安全 */
  toolOutcomes?: ToolResponse[];
}

export const STRUCTURED_MAX_AUTO_CONTINUE_NUDGES = 24;
export const STRUCTURED_MAX_TOOL_ROUNDS = 48;
const STRUCTURED_HARNESS_TOOL_NAMES = new Set([
  'task_complete',
  'update_plan',
  'ask_user',
  'navigate_to_page',
  'skill',
  'run_code',
  'run_subagent',
]);

/** 本轮 Tool 结果中是否存在待用户选择的 ask_user 请求 */
export function hasPendingUserChoiceRequest(toolOutcomes: ToolResponse[] = []): boolean {
  return toolOutcomes.some((item) => item.kind === 'user_choice_request');
}

function hasSuccessfulNonHarnessTool(toolOutcomes: ToolResponse[]): boolean {
  return toolOutcomes.some(
    (item) =>
      item.kind === 'success' &&
      item.ok !== false &&
      !STRUCTURED_HARNESS_TOOL_NAMES.has(item.meta.tool),
  );
}

function shouldDirectTerminateAfterAnswer(ctx: StructuredTerminationContext): boolean {
  if (!ctx.completionStrategy?.allowDirectAnswerTermination) return false;
  if ((ctx.toolsExecuted ?? 0) <= 0) return false;
  if (!ctx.latestText.trim()) return false;
  if (hasIncompleteProgressNarration(ctx.latestText)) return false;
  const toolOutcomes = ctx.toolOutcomes || [];
  if (!toolOutcomes.length) return false;

  // “先失败后重试成功”应允许自然终止：因此只看最后一次非 harness 工具的结果，
  // 而不是把历史失败一律判定为仍未通过。
  const lastNonHarness = [...toolOutcomes]
    .reverse()
    .find((item) => !STRUCTURED_HARNESS_TOOL_NAMES.has(item.meta.tool));

  if (!lastNonHarness) return false;
  if (STRUCTURED_HARNESS_TOOL_NAMES.has(lastNonHarness.meta.tool)) return false;
  if (lastNonHarness.kind !== 'success' || lastNonHarness.ok === false) return false;
  if (lastNonHarness.verified === false) return false;

  // 再加一个轻量防御：至少存在过一次成功的非 harness 工具结果
  if (!hasSuccessfulNonHarnessTool(toolOutcomes)) return false;
  return true;
}

/**
 * 结构化终止下的循环决策。优先级：
 * 1. task_complete verified=true → terminate
 * 2. 硬停止（上限 / 收敛 / 等待用户 / 被截断）→ hard-stop
 * 3. 查询型任务若声明允许直接收尾，且结果已足够回答用户问题 → terminate
 * 4. 否则 → continue（默认续命，反转点）
 *
 * 注意：plan 全 completed 但模型没调 task_complete → 仍然 continue（强制走终止工具）。
 */
export function decideStructuredTermination(
  ctx: StructuredTerminationContext,
): StructuredTerminationDecision {
  // 1. 已通过 task_complete → 正常终止
  if (ctx.lastTaskCompleteVerified === true) {
    return { action: 'terminate' };
  }

  // 1.5 ask_user 挂起：禁止续调 / nudge，等用户在 Choice Card 提交
  if (hasPendingUserChoiceRequest(ctx.toolOutcomes)) {
    return { action: 'hard-stop', reason: 'waiting_user_choice' };
  }

  // 2. 硬停止规则
  if (ctx.round >= STRUCTURED_MAX_TOOL_ROUNDS) {
    return { action: 'hard-stop', reason: `已达结构化终止轮次上限（${STRUCTURED_MAX_TOOL_ROUNDS} 轮）` };
  }
  if (ctx.autoContinueNudges >= STRUCTURED_MAX_AUTO_CONTINUE_NUDGES) {
    return { action: 'hard-stop', reason: `已达自动续调上限（${STRUCTURED_MAX_AUTO_CONTINUE_NUDGES} 次）` };
  }
  if (ctx.convergenceDetected) {
    return {
      action: 'hard-stop',
      reason: `检测到循环（${ctx.convergenceDetected.kind}：${ctx.convergenceDetected.detail}），疑似卡死，停止并请用户介入`,
    };
  }
  // 被截断：finish_reason=length 时不应当作完成，但模型又没继续产出——直接 hard-stop 让用户介入
  if (ctx.finishReason === 'length') {
    return { action: 'hard-stop', reason: '模型输出被 max_tokens 截断（finish_reason=length），请缩小单步范围或提高 token 上限后重试' };
  }
  // 模型明确请求用户确认 → 停，等用户
  if (isWaitingUserConfirmation(ctx.latestText)) {
    return { action: 'hard-stop', reason: '模型请求用户确认，等待用户回复' };
  }

  // 2.5 查询/只读型任务：结果已返回且回答已完成时允许自然结束
  if (shouldDirectTerminateAfterAnswer(ctx)) {
    return { action: 'terminate' };
  }

  // 3. 默认续命（信号反转的核心）
  return { action: 'continue' };
}

/**
 * 基于剩余 plan 构造续调指令。比传统泛泛 nudge 更有方向感，
 * 直接告诉模型「还剩哪些步骤」，治原地打转。
 */
export function buildStructuredNudge(
  plan: PlanItem[],
  toolOutcomes: ToolResponse[] = [],
  options?: { autoNavigate?: boolean },
): string {
  const preface =
    '[系统自动续调·非用户发言] 这不是用户在说话或纠正你。禁止回复「您说得对」「好的我马上」等对用户确认类话术。';

  // 优先：有未 verified 的 Tool → 带具体失败原因催促
  const failed = toolOutcomes.find(
    (item) =>
      item.kind !== 'user_choice_request' &&
      (item.kind !== 'success' || item.verified === false || item.ok === false),
  );
  if (failed?.error?.message) {
    return `${preface} 上一 Tool「${failed.meta.tool}」未通过验证（${failed.error.message}）。禁止向用户声称已成功；请根据返回的 ok/verified/kind/error.message 重试或说明失败。`;
  }

  const navHint =
    options?.autoNavigate !== false && needsPostWriteNavigation(toolOutcomes)
      ? `${WRITE_SUCCESS_NAVIGATE_HINT} 跳转完成后再推进剩余步骤。`
      : '';

  const unfinished = plan.filter((p) => p.status !== 'completed');
  if (unfinished.length === 0) {
    if (navHint) {
      return `${preface} ${navHint} 若任务确已完成，跳转后再调用 task_complete 终止。`;
    }
    // plan 空 / 全完成但没调 task_complete → 强制走终止工具
    return `${preface} 当前没有未完成的 plan 项。若任务确已完成，必须调用 task_complete 终止；禁止用自由文本声称完成。若还有工作，先用 update_plan 补充步骤再推进。`;
  }

  const inProgress = unfinished.filter((p) => p.status === 'in_progress');
  const pending = unfinished.filter((p) => p.status === 'pending');
  const lead = inProgress[0] || pending[0];

  const lines: string[] = [
    `${preface}${navHint ? ` ${navHint}` : ''} 当前 plan 还有 ${unfinished.length} 项未完成：`,
  ];
  unfinished.slice(0, 8).forEach((p, i) => {
    const mark = p.status === 'in_progress' ? '进行中' : '待办';
    lines.push(`${i + 1}. [${mark}] ${p.content}`);
  });
  if (lead) {
    lines.push(`请立即推进第 ${unfinished.indexOf(lead) + 1} 项，不要重复已完成的步骤。全部完成后调用 task_complete 终止。`);
  }
  return lines.join('\n');
}

/**
 * Plan 状态对账（每轮 loop 开头）：根据 toolOutcomes 自动推进 plan 项状态。
 * - plan 项声明 requiresVerification 的 Tool 全部 verified=true → 该项标 completed
 * - 标记 completed 后，下一个 pending 自动升为 in_progress（保持单一 in_progress）
 *
 * 对账是「建议性」的——它修正模型漏标的 completed，但不强制改模型主动设置的 in_progress。
 * 返回对账后的 plan（可能是原数组引用，也可能是新数组）。
 */
export function reconcilePlan(plan: PlanItem[], toolOutcomes: ToolResponse[]): PlanItem[] {
  if (!plan.length) return plan;

  function toolVerified(name: string): boolean {
    const relevant = toolOutcomes.filter((o) => o.meta.tool === name);
    if (relevant.length === 0) return false;
    return relevant.every(
      (o) => o.kind !== 'system_error' && o.ok !== false && o.kind !== 'business_error' && o.verified !== false,
    );
  }

  let changed = false;
  const next = plan.map((item) => {
    if (item.status === 'completed') return item;
    if (item.status === 'in_progress' && item.requiresVerification?.length) {
      if (item.requiresVerification.every(toolVerified)) {
        changed = true;
        return { ...item, status: 'completed' as const };
      }
    }
    return item;
  });

  if (!changed) return plan;

  // 维持单一 in_progress：找第一个 pending 升级
  const hasInProgress = next.some((p) => p.status === 'in_progress');
  if (!hasInProgress) {
    const firstPendingIdx = next.findIndex((p) => p.status === 'pending');
    if (firstPendingIdx >= 0) {
      next[firstPendingIdx] = { ...next[firstPendingIdx], status: 'in_progress' };
    }
  }
  return next;
}
