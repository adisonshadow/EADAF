import { getUserHabit, setUserHabit } from '../storage/userHabit';

/**
 * AI 助手运行偏好（模块级 store，与 autoNavigate / theme 同模式）。
 * config 默认值 ← userHabit 覆盖（改过一次不回弹）。
 */

export const TOOL_CONCURRENCY_HABIT_KEY = 'chat.toolConcurrency';
export const DECISION_PREFERENCE_HABIT_KEY = 'chat.decisionPreference';
export const REASONING_DISPLAY_MODE_HABIT_KEY = 'chat.reasoningDisplayMode';

/** 同一步内最多同时运行的并行 Tool 数 */
export const DEFAULT_TOOL_CONCURRENCY = 10;
export const MIN_TOOL_CONCURRENCY = 1;
export const MAX_TOOL_CONCURRENCY = 32;

/**
 * 面临抉择时倾向：
 * - user：优先 ask_user，让用户选
 * - ai：优先由 AI 自行决断（危险/不可逆仍建议 ask_user）
 */
export type DecisionPreference = 'user' | 'ai';

export const DEFAULT_DECISION_PREFERENCE: DecisionPreference = 'user';

/**
 * 思考内容显示方式：
 * - collapsed：只显示「深度思考」标题（blink），正文折叠，点击展开
 * - preview3：只滚动显示最后 3 行，点击展开全部
 * - full：流式过程展开全文（结束后自动折叠，与历史行为一致）
 */
export type ReasoningDisplayMode = 'collapsed' | 'preview3' | 'full';

export const DEFAULT_REASONING_DISPLAY_MODE: ReasoningDisplayMode = 'collapsed';

type NumberListener = (value: number) => void;
type DecisionListener = (value: DecisionPreference) => void;
type ReasoningDisplayListener = (value: ReasoningDisplayMode) => void;

const toolConcurrencyListeners = new Set<NumberListener>();
const decisionPreferenceListeners = new Set<DecisionListener>();
const reasoningDisplayModeListeners = new Set<ReasoningDisplayListener>();

function clampConcurrency(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TOOL_CONCURRENCY;
  return Math.min(MAX_TOOL_CONCURRENCY, Math.max(MIN_TOOL_CONCURRENCY, Math.round(value)));
}

function normalizeDecisionPreference(value: unknown, fallback: DecisionPreference): DecisionPreference {
  if (value === 'user' || value === 'ai') return value;
  return fallback;
}

export function normalizeReasoningDisplayMode(
  value: unknown,
  fallback: ReasoningDisplayMode = DEFAULT_REASONING_DISPLAY_MODE,
): ReasoningDisplayMode {
  if (value === 'collapsed' || value === 'preview3' || value === 'full') return value;
  return fallback;
}

/** 读取并行 Tool 上限 */
export function getToolConcurrency(configDefault = DEFAULT_TOOL_CONCURRENCY): number {
  const stored = getUserHabit<unknown>(TOOL_CONCURRENCY_HABIT_KEY, configDefault);
  if (typeof stored === 'number') return clampConcurrency(stored);
  if (typeof stored === 'string' && stored.trim() && !Number.isNaN(Number(stored))) {
    return clampConcurrency(Number(stored));
  }
  return clampConcurrency(configDefault);
}

/** 写入并行 Tool 上限 */
export function setToolConcurrency(value: number): void {
  const next = clampConcurrency(value);
  setUserHabit(TOOL_CONCURRENCY_HABIT_KEY, next);
  toolConcurrencyListeners.forEach((listener) => listener(next));
}

export function subscribeToolConcurrency(listener: NumberListener): () => void {
  toolConcurrencyListeners.add(listener);
  return () => toolConcurrencyListeners.delete(listener);
}

/** 读取抉择倾向 */
export function getDecisionPreference(
  configDefault: DecisionPreference = DEFAULT_DECISION_PREFERENCE,
): DecisionPreference {
  const stored = getUserHabit<unknown>(DECISION_PREFERENCE_HABIT_KEY, configDefault);
  return normalizeDecisionPreference(stored, configDefault);
}

/** 写入抉择倾向 */
export function setDecisionPreference(value: DecisionPreference): void {
  const next = normalizeDecisionPreference(value, DEFAULT_DECISION_PREFERENCE);
  setUserHabit(DECISION_PREFERENCE_HABIT_KEY, next);
  decisionPreferenceListeners.forEach((listener) => listener(next));
}

export function subscribeDecisionPreference(listener: DecisionListener): () => void {
  decisionPreferenceListeners.add(listener);
  return () => decisionPreferenceListeners.delete(listener);
}

/** 读取思考内容显示方式 */
export function getReasoningDisplayMode(
  configDefault: ReasoningDisplayMode = DEFAULT_REASONING_DISPLAY_MODE,
): ReasoningDisplayMode {
  const stored = getUserHabit<unknown>(REASONING_DISPLAY_MODE_HABIT_KEY, configDefault);
  return normalizeReasoningDisplayMode(stored, configDefault);
}

/** 写入思考内容显示方式 */
export function setReasoningDisplayMode(value: ReasoningDisplayMode): void {
  const next = normalizeReasoningDisplayMode(value, DEFAULT_REASONING_DISPLAY_MODE);
  setUserHabit(REASONING_DISPLAY_MODE_HABIT_KEY, next);
  reasoningDisplayModeListeners.forEach((listener) => listener(next));
}

export function subscribeReasoningDisplayMode(listener: ReasoningDisplayListener): () => void {
  reasoningDisplayModeListeners.add(listener);
  return () => reasoningDisplayModeListeners.delete(listener);
}

/**
 * 把偏好解析成 Think 展开态 / 是否裁成 3 行预览。
 * userOverride：用户点过标题后的显式展开；null 表示跟模式默认走。
 */
export function resolveReasoningView(
  mode: ReasoningDisplayMode,
  isStreaming: boolean,
  userOverride: boolean | null,
): { thinkExpanded: boolean; previewClipped: boolean } {
  if (mode === 'collapsed') {
    return { thinkExpanded: userOverride ?? false, previewClipped: false };
  }
  if (mode === 'preview3') {
    return { thinkExpanded: true, previewClipped: userOverride !== true };
  }
  if (userOverride !== null) {
    return { thinkExpanded: userOverride, previewClipped: false };
  }
  return { thinkExpanded: isStreaming, previewClipped: false };
}

/** ask_user 协议段落：按抉择倾向切换措辞 */
export function buildAskUserProtocol(preference: DecisionPreference): string {
  if (preference === 'ai') {
    return (
      '### ask_user —— 向用户询问并确认选择（mid-task HITL）\n' +
      '- **当前偏好：让 AI 自己抉择**。常规方案取舍、命名/默认值、可逆操作路径，由你自行选定并继续执行，不必事事 ask_user\n' +
      '- 仍须调用 ask_user 的情况：不可逆删除、高风险写操作、明确冲突的多路径、用户已要求确认、或你对关键事实无把握\n' +
      '- mode=single（单选，默认允许「其他」自定义）或 multi（多选）；options 通常 2–5 项（推荐 3）\n' +
      '- 调用后循环会挂起；用户提交后注入【用户选择】并续跑\n' +
      '- 与 a2ui-commands「下一步建议」不同：ask_user 是任务中途决策门；下一步建议仅用于阶段完成后的可选动作\n'
    );
  }
  return (
    '### ask_user —— 向用户询问并确认选择（mid-task HITL）\n' +
    '- **当前偏好：让用户抉择**。方案取舍、危险写操作前、多路径决策时，**必须**调用 ask_user 展示结构化选择题并暂停\n' +
    '- mode=single（单选，默认允许「其他」自定义）或 multi（多选）；options 通常 2–5 项（推荐 3）\n' +
    '- **禁止**仅用「请确认后回复」「是否继续」等口头话术代替 ask_user（口头等待仅作兜底）\n' +
    '- 调用后循环会挂起；用户在卡片中提交后，系统会注入【用户选择】消息并续跑——据此继续执行\n' +
    '- 与 a2ui-commands「下一步建议」不同：ask_user 是任务中途决策门；下一步建议仅用于阶段完成后的可选动作\n'
  );
}
