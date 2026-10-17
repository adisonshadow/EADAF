import type { PlanItem, SkillCompletionStrategy } from '../types';
import type { ToolResponse } from '../types/toolResponse';
import {
  getSessionPlan,
  setSessionPlan,
} from '../memory/sessionWorkingMemory';

/**
 * 结构化终止（task_complete / update_plan）的权威状态载体。
 *
 * 设计动机：builtin Tool 的 handler 通过 `registerFunctionCall` 注册，
 * 签名只能拿到 `args`，无法直接访问 `submitQuery` 闭包。因此用模块级 holder：
 * 每次 turn 开始时由 `useAIBaseChat` 调用 `beginTurn` 注入本回合的上下文
 * （当前 plan、tool outcomes、激活 skill 的完成策略），两个 harness Tool 的
 * handler 通过 `getCurrent()` 读取。
 *
 * plan 同时写入会话级 store（按 conversationKey），跨 turn / ask_user 恢复后仍连续。
 * holder 只保存「最近一次 active turn」的引用；并发 turn 靠 conversationKey 隔离写回。
 */

export interface AgentTurnContext {
  /** 会话键：plan 跨 turn 持久化依据 */
  conversationKey: string;
  /** 当前权威 plan（由 update_plan 维护；与会话 store 同步） */
  plan: PlanItem[];
  /** 本回合已执行的 Tool 结果信封（由 loop 同步写入） */
  toolOutcomes: ToolResponse[];
  /** 已调用过的 Tool functionName 集合 */
  invokedToolNames: Set<string>;
  /** 当前激活 Skill 的完成策略（用于 terminationStrictness / requiredTools） */
  completionStrategy?: SkillCompletionStrategy;
  /**
   * 本回合 LLM 可见的业务 Tool 名（不含 harness）。
   * 用于忽略 plan.requiresVerification 中模型胡填的、当前页根本不存在的 Tool。
   * 可被 expandAvailableTools 就地扩展（同回合 skill 懒加载后立即生效）。
   */
  availableToolNames?: Set<string>;
  /**
   * 与 native 同源分派：run_code 用此调用已授权业务 Tool（含 server_builtin）。
   * 未注入时 run_code 回退为仅 client handler。
   */
  invokeAuthorizedTool?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  /**
   * 本回合 Skill Tool 契约（供 run_code tools.schema / 参数校验）。
   * 优先于空的 function-registry fallback。
   */
  resolveToolBrief?: (name: string) => {
    description: string;
    parameters: Record<string, unknown>;
  } | undefined;
  /**
   * plan 项 → 该项进入 in_progress 时的 `toolOutcomes.length` 游标。
   * 对账时只统计游标之后的成功结果，避免「一个结果反复推进多个 plan 项」。
   */
  planCursors?: Map<string, number>;
}

let current: AgentTurnContext | null = null;

/** 实时 plan 订阅者（UI 侧的任务清单气泡 / 头部按钮用） */
type PlanListener = (conversationKey: string, plan: PlanItem[]) => void;
const planListeners = new Set<PlanListener>();

/**
 * 订阅 plan 变更（update_plan / 自动对账 / 回合初始化）。
 * 返回取消订阅函数。
 */
export function subscribePlan(listener: PlanListener): () => void {
  planListeners.add(listener);
  return () => {
    planListeners.delete(listener);
  };
}

function emitPlan(): void {
  if (!current) return;
  const { conversationKey, plan } = current;
  for (const listener of planListeners) {
    try {
      listener(conversationKey, plan);
    } catch {
      // 单个订阅者异常不影响其它订阅者与主流程
    }
  }
}

/**
 * 同步 plan 游标：新进入 in_progress 的项记录当前 toolOutcomes 长度；
 * 已完成 / 已移除的项清理游标。
 */
function syncPlanCursors(): void {
  if (!current) return;
  const cursors = current.planCursors || new Map<string, number>();
  current.planCursors = cursors;
  const ids = new Set(current.plan.map((item) => item.id));
  for (const id of Array.from(cursors.keys())) {
    if (!ids.has(id)) cursors.delete(id);
  }
  for (const item of current.plan) {
    if (item.status === 'completed') {
      cursors.delete(item.id);
      continue;
    }
    if (item.status === 'in_progress' && !cursors.has(item.id)) {
      cursors.set(item.id, current.toolOutcomes.length);
    }
  }
}

/** 本回合开始时注入上下文。返回的 handle 用于结束时清理。 */
export function beginTurn(ctx: AgentTurnContext): () => void {
  current = ctx;
  // 保证会话 store 与 turn 初始 plan 对齐
  if (ctx.conversationKey) {
    setSessionPlan(ctx.conversationKey, ctx.plan);
  }
  syncPlanCursors();
  emitPlan();
  return () => {
    // 仅在仍是本回合时清理，避免被后开的 turn 误清
    if (current === ctx) current = null;
  };
}

export function getCurrent(): AgentTurnContext | null {
  return current;
}

/**
 * 同回合扩展可见业务 Tool 名（skill 懒加载后、不等 React 重渲染）。
 * 供 run_code / run_subagent / task_complete 与后续 LLM round 同源。
 */
export function expandAvailableTools(names: Iterable<string>): void {
  if (!current?.availableToolNames) return;
  for (const name of names) {
    const n = String(name || '').trim();
    if (n) current.availableToolNames.add(n);
  }
}

export function getPlan(): PlanItem[] {
  if (current) return current.plan;
  return [];
}

/** 读取会话级 plan（跨 turn；无活跃 turn 时也可用） */
export function getPlanForConversation(conversationKey: string): PlanItem[] {
  return getSessionPlan(conversationKey);
}

/**
 * 当前 plan 项进入 in_progress 时的 Tool 结果游标。
 * 无游标（未开始 / 已结束）时返回 0。
 */
export function getPlanCursor(itemId: string): number {
  return current?.planCursors?.get(itemId) ?? 0;
}

/** update_plan handler 写入新的 plan（已做单一 in_progress 等校验） */
export function setPlan(plan: PlanItem[]): void {
  if (!current) return;
  current.plan = plan;
  if (current.conversationKey) {
    setSessionPlan(current.conversationKey, plan);
  }
  syncPlanCursors();
  emitPlan();
}

/** loop 每次执行完 Tool 后同步追加结果，供 task_complete 校验 */
export function recordToolOutcome(outcome: ToolResponse): void {
  current?.toolOutcomes.push(outcome);
}

export function recordInvokedTool(name: string): void {
  current?.invokedToolNames.add(name);
}
