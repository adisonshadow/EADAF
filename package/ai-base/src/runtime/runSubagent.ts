import { getFunctionCallDef } from '../registry/functionRegistry';
import { beginTurnTrace, appendTurnEvent, endTurnTrace } from '../observability/turnTrace';
import type { ToolResponse } from '../types/toolResponse';
import { getCurrent } from '../registry/agentPlanState';
import { assertRunnableClientTool } from './resolveRunnableClientTools';

export interface SubagentFanoutItemResult {
  index: number;
  ok: boolean;
  value?: unknown;
  error?: string;
  durationMs: number;
}

export interface RunSubagentFanoutOptions {
  goal: string;
  /** 每项作为 tool 参数（或与 baseArgs 合并） */
  items: Record<string, unknown>[];
  tool: string;
  baseArgs?: Record<string, unknown>;
  maxConcurrency?: number;
  parentTurnId?: string;
  conversationKey?: string;
  /** 覆盖默认 invoke（默认走 functionRegistry） */
  invokeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

export interface RunSubagentSequenceOptions {
  goal: string;
  steps: Array<{ tool: string; args?: Record<string, unknown> }>;
  parentTurnId?: string;
  conversationKey?: string;
  invokeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

function createChildTurnId(parentTurnId?: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return parentTurnId ? `${parentTurnId}:sub-${suffix}` : `sub-${Date.now()}-${suffix}`;
}

async function defaultInvoke(name: string, args: Record<string, unknown>): Promise<unknown> {
  assertRunnableClientTool(name, getCurrent()?.availableToolNames);
  const def = getFunctionCallDef(name);
  if (!def) {
    throw new Error(`未注册的 client Tool: ${name}（run_subagent 当前仅编排浏览器已注册 Tool）`);
  }
  return def.handler(args);
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * 批量 fan-out：对 items 并发调用同一 Tool，写入子 Turn 轨迹。
 */
export async function runSubagentFanout(
  options: RunSubagentFanoutOptions,
): Promise<{
  childTurnId: string;
  goal: string;
  tool: string;
  results: SubagentFanoutItemResult[];
  okCount: number;
  failCount: number;
}> {
  const tool = String(options.tool || '').trim();
  const items = Array.isArray(options.items) ? options.items : [];
  if (!tool) throw new Error('tool 不能为空');
  if (!items.length) throw new Error('items 不能为空');
  // 默认路径强制授权；自定义 invokeTool（测试）自行负责
  if (!options.invokeTool) {
    assertRunnableClientTool(tool, getCurrent()?.availableToolNames);
  }

  const childTurnId = createChildTurnId(options.parentTurnId);
  const invoke = options.invokeTool || defaultInvoke;
  const concurrency = Math.max(1, Math.min(options.maxConcurrency ?? 4, 8));

  beginTurnTrace({
    turnId: childTurnId,
    conversationKey: options.conversationKey,
    parentTurnId: options.parentTurnId,
    skillSlugs: [],
  });
  appendTurnEvent(childTurnId, {
    kind: 'subagent',
    meta: { mode: 'fanout', goal: options.goal, tool, itemCount: items.length, concurrency },
  });

  const results = await runWithConcurrency(items, concurrency, async (item, index) => {
    const started = Date.now();
    const args = { ...(options.baseArgs || {}), ...(item || {}) };
    try {
      const value = await invoke(tool, args);
      const durationMs = Date.now() - started;
      const envelope = value as ToolResponse | undefined;
      const ok =
        envelope && typeof envelope === 'object' && 'ok' in envelope
          ? envelope.ok !== false && envelope.kind !== 'business_error'
          : true;
      appendTurnEvent(childTurnId, {
        kind: 'tool',
        tool: {
          name: tool,
          ok,
          verified: envelope && typeof envelope === 'object' ? envelope.verified : undefined,
          kind: envelope && typeof envelope === 'object' ? envelope.kind : undefined,
          durationMs,
          errorMessage:
            envelope && typeof envelope === 'object' ? envelope.error?.message : undefined,
        },
        meta: { index },
      });
      return { index, ok, value, durationMs };
    } catch (err) {
      const durationMs = Date.now() - started;
      const error = err instanceof Error ? err.message : String(err);
      appendTurnEvent(childTurnId, {
        kind: 'tool',
        tool: { name: tool, ok: false, durationMs, errorMessage: error },
        meta: { index },
      });
      return { index, ok: false, error, durationMs };
    }
  });

  const okCount = results.filter((r) => r.ok).length;
  endTurnTrace(childTurnId, { mode: 'fanout', okCount, failCount: results.length - okCount });

  return {
    childTurnId,
    goal: options.goal,
    tool,
    results,
    okCount,
    failCount: results.length - okCount,
  };
}

/**
 * 顺序委托：在隔离子 Turn 内按 steps 串行调用 Tool（不启动嵌套 LLM）。
 */
export async function runSubagentSequence(
  options: RunSubagentSequenceOptions,
): Promise<{
  childTurnId: string;
  goal: string;
  steps: Array<{ tool: string; ok: boolean; value?: unknown; error?: string; durationMs: number }>;
  ok: boolean;
}> {
  const steps = Array.isArray(options.steps) ? options.steps : [];
  if (!steps.length) throw new Error('steps 不能为空');

  const childTurnId = createChildTurnId(options.parentTurnId);
  const invoke = options.invokeTool || defaultInvoke;

  beginTurnTrace({
    turnId: childTurnId,
    conversationKey: options.conversationKey,
    parentTurnId: options.parentTurnId,
  });
  appendTurnEvent(childTurnId, {
    kind: 'subagent',
    meta: { mode: 'sequence', goal: options.goal, stepCount: steps.length },
  });

  const out: Array<{
    tool: string;
    ok: boolean;
    value?: unknown;
    error?: string;
    durationMs: number;
  }> = [];

  for (const step of steps) {
    const tool = String(step.tool || '').trim();
    const started = Date.now();
    if (!tool) {
      out.push({ tool: '', ok: false, error: 'step.tool 为空', durationMs: 0 });
      break;
    }
    try {
      const value = await invoke(tool, step.args || {});
      const durationMs = Date.now() - started;
      const envelope = value as ToolResponse | undefined;
      const ok =
        envelope && typeof envelope === 'object' && 'ok' in envelope
          ? envelope.ok !== false && envelope.kind !== 'business_error'
          : true;
      appendTurnEvent(childTurnId, {
        kind: 'tool',
        tool: {
          name: tool,
          ok,
          verified: envelope && typeof envelope === 'object' ? envelope.verified : undefined,
          kind: envelope && typeof envelope === 'object' ? envelope.kind : undefined,
          durationMs,
        },
      });
      out.push({ tool, ok, value, durationMs });
      if (!ok) break;
    } catch (err) {
      const durationMs = Date.now() - started;
      const error = err instanceof Error ? err.message : String(err);
      appendTurnEvent(childTurnId, {
        kind: 'tool',
        tool: { name: tool, ok: false, durationMs, errorMessage: error },
      });
      out.push({ tool, ok: false, error, durationMs });
      break;
    }
  }

  const ok = out.length === steps.length && out.every((s) => s.ok);
  endTurnTrace(childTurnId, { mode: 'sequence', ok });
  return { childTurnId, goal: options.goal, steps: out, ok };
}
