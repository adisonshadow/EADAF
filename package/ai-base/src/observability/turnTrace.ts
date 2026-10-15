/**
 * Turn 回放轨迹（MS6）：工具调用、信封摘要、终止 reason。
 * 内存 ring buffer；供调试面板与 getTurnTrace 查询。
 */

export type TurnTraceEventKind =
  | 'turn_start'
  | 'llm_round'
  | 'tool'
  | 'termination'
  | 'subagent'
  | 'turn_end';

export interface TurnTraceToolSummary {
  name: string;
  ok: boolean;
  verified?: boolean;
  kind?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface TurnTraceEvent {
  at: number;
  kind: TurnTraceEventKind;
  round?: number;
  /** 终止：terminate | continue | hard-stop */
  action?: string;
  reason?: string;
  tool?: TurnTraceToolSummary;
  /** subagent / 其它元数据 */
  meta?: Record<string, unknown>;
}

export interface TurnTraceRecord {
  turnId: string;
  conversationKey?: string;
  parentTurnId?: string;
  startedAt: number;
  endedAt?: number;
  skillSlugs?: string[];
  events: TurnTraceEvent[];
  /** 终态摘要，便于列表展示 */
  lastTermination?: { action: string; reason?: string };
}

const MAX_TURNS = 40;
const MAX_EVENTS_PER_TURN = 200;

const turns = new Map<string, TurnTraceRecord>();
const order: string[] = [];
const listeners = new Set<() => void>();

/** 当前用户提交回合的 turnId（供 run_subagent 挂 parent） */
let activeTurnId: string | null = null;
let activeConversationKey: string | undefined;

export function setActiveTurnContext(
  turnId: string | null,
  conversationKey?: string,
): void {
  activeTurnId = turnId;
  activeConversationKey = conversationKey;
}

export function getActiveTurnId(): string | null {
  return activeTurnId;
}

export function getActiveConversationKey(): string | undefined {
  return activeConversationKey;
}

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

function trimOrder(): void {
  while (order.length > MAX_TURNS) {
    const oldest = order.shift();
    if (oldest) turns.delete(oldest);
  }
}

export function beginTurnTrace(options: {
  turnId: string;
  conversationKey?: string;
  parentTurnId?: string;
  skillSlugs?: string[];
}): TurnTraceRecord {
  const record: TurnTraceRecord = {
    turnId: options.turnId,
    conversationKey: options.conversationKey,
    parentTurnId: options.parentTurnId,
    startedAt: Date.now(),
    skillSlugs: options.skillSlugs,
    events: [
      {
        at: Date.now(),
        kind: 'turn_start',
        meta: options.parentTurnId ? { parentTurnId: options.parentTurnId } : undefined,
      },
    ],
  };
  if (!turns.has(options.turnId)) {
    order.push(options.turnId);
  }
  turns.set(options.turnId, record);
  trimOrder();
  notify();
  return record;
}

export function appendTurnEvent(turnId: string, event: Omit<TurnTraceEvent, 'at'> & { at?: number }): void {
  const record = turns.get(turnId);
  if (!record) return;
  record.events.push({ ...event, at: event.at ?? Date.now() });
  if (record.events.length > MAX_EVENTS_PER_TURN) {
    record.events.splice(0, record.events.length - MAX_EVENTS_PER_TURN);
  }
  if (event.kind === 'termination' && event.action) {
    record.lastTermination = { action: event.action, reason: event.reason };
  }
  notify();
}

export function endTurnTrace(turnId: string, meta?: Record<string, unknown>): void {
  const record = turns.get(turnId);
  if (!record) return;
  record.endedAt = Date.now();
  record.events.push({ at: Date.now(), kind: 'turn_end', meta });
  notify();
}

export function getTurnTrace(turnId: string): TurnTraceRecord | undefined {
  return turns.get(turnId);
}

export function listRecentTurnTraces(limit = 20): TurnTraceRecord[] {
  const n = Math.max(1, Math.min(limit, MAX_TURNS));
  return order
    .slice(-n)
    .map((id) => turns.get(id))
    .filter(Boolean)
    .reverse() as TurnTraceRecord[];
}

export function clearTurnTraces(): void {
  turns.clear();
  order.length = 0;
  notify();
}

export function subscribeTurnTraces(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 从 tool invoke 日志写入轨迹（若带 turnId） */
export function recordToolInvokeOnTrace(entry: {
  turnId?: string;
  round?: number;
  name: string;
  success: boolean;
  durationMs: number;
  args?: Record<string, unknown>;
  envelope?: {
    ok: boolean;
    verified?: boolean;
    kind: string;
    error?: { code?: string; message: string };
  };
  error?: string;
}): void {
  if (!entry.turnId) return;
  if (entry.name.startsWith('ai_termination_reason:')) {
    const action = entry.name.slice('ai_termination_reason:'.length);
    const reasonFromArgs =
      typeof entry.args?.reason === 'string' ? entry.args.reason : undefined;
    appendTurnEvent(entry.turnId, {
      kind: 'termination',
      round: entry.round,
      action,
      reason: entry.error || reasonFromArgs,
    });
    return;
  }
  appendTurnEvent(entry.turnId, {
    kind: 'tool',
    round: entry.round,
    tool: {
      name: entry.name,
      ok: entry.success,
      verified: entry.envelope?.verified,
      kind: entry.envelope?.kind,
      durationMs: entry.durationMs,
      errorCode: entry.envelope?.error?.code,
      errorMessage: entry.envelope?.error?.message || entry.error,
    },
  });
}
