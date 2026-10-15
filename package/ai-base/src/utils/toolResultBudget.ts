import type { AIBaseTool, FunctionCallDef } from '../types';
import { isToolResponse } from '../types/toolResponse';
import { toToolResponseContextView } from './normalizeToolResult';

/** 单条 Tool 结果序列化 + 超预算裁剪后的信息（用于 tool role 消息 content） */
export interface TrimmedToolResult {
  /** 最终塞进 role:'tool' content 的字符串 */
  content: string;
  /** 是否发生了裁剪 */
  truncated: boolean;
  /** 原始序列化后的字符数 */
  originalChars: number;
  /** 实际生效的预算字符数 */
  budgetChars: number;
}

/** 序列化任意 Tool 结果为字符串（JSON），失败时退化为 String()。 */
function stringifyResult(result: unknown): string {
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function estimateChars(value: unknown): number {
  return stringifyResult(value).length;
}

/**
 * 若 payload（或 ToolResponse.data）含 items 数组，优先按条裁剪，保留 total 等元数据，
 * 避免中段砍 JSON 导致模型误读 total/status。
 */
function tryTruncateListShapedPayload(
  payload: unknown,
  budgetChars: number,
): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  if (!Array.isArray(row.items)) return null;

  const items = row.items as unknown[];
  let lo = 0;
  let hi = items.length;
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = {
      ...row,
      items: items.slice(0, mid),
      returnedCount: mid,
      shownCount: mid,
      truncated: true,
      hint:
        typeof row.hint === 'string' && row.hint.trim()
          ? row.hint
          : `结果超预算已只返回前 ${mid} 条（共 ${items.length} 条本页），请缩小查询范围或分页`,
    };
    if (estimateChars(candidate) <= budgetChars) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const fitted = {
    ...row,
    items: items.slice(0, best),
    returnedCount: best,
    shownCount: best,
    truncated: true,
    hint: `结果超预算已只返回前 ${best} 条（原始本页 ${items.length} 条），请缩小 codePrefix 或使用 page/size`,
  };
  const serialized = stringifyResult(fitted);
  return serialized.length <= budgetChars ? serialized : null;
}

/**
 * 序列化 Tool 结果并按预算截断。
 *
 * - 未超预算：原样返回序列化结果。
 * - 含 items 的列表形：优先裁剪条数，保留 total / statusSummary 等元数据。
 * - 其它：保留头部并追加截断标注。
 */
export function serializeToolResultForContext(
  result: unknown,
  budget: { maxChars: number },
): string {
  const payload = isToolResponse(result) ? toToolResponseContextView(result) : result;
  const serialized = stringifyResult(payload);
  const budgetChars = Math.max(1, Math.floor(budget.maxChars) || 1);

  if (serialized.length <= budgetChars) {
    return serialized;
  }

  if (isToolResponse(result)) {
    const data = (result as { data?: unknown }).data;
    const listCut = tryTruncateListShapedPayload(
      {
        ok: result.ok,
        verified: result.verified,
        kind: result.kind,
        error: result.error,
        meta: result.meta,
        data,
        ...(result.agentHint ? { agentHint: result.agentHint } : {}),
      },
      budgetChars,
    );
    if (listCut) return listCut;

    // data 本身是列表形
    const dataCut = tryTruncateListShapedPayload(data, Math.max(1, budgetChars - 200));
    if (dataCut) {
      const wrapped = stringifyResult({
        ok: result.ok,
        verified: result.verified,
        kind: result.kind,
        error: result.error,
        meta: result.meta,
        data: JSON.parse(dataCut),
        ...(result.agentHint ? { agentHint: result.agentHint } : {}),
      });
      if (wrapped.length <= budgetChars) return wrapped;
    }

    const compact = stringifyResult({
      ok: result.ok,
      verified: result.verified,
      kind: result.kind,
      error: result.error,
      meta: result.meta,
      data: '[truncated]',
      hint: `结果超预算（${serialized.length}>${budgetChars}），已省略 data；请缩小查询或分页`,
      ...(result.agentHint ? { agentHint: result.agentHint } : {}),
    });
    if (compact.length <= budgetChars) return compact;
  } else {
    const listCut = tryTruncateListShapedPayload(payload, budgetChars);
    if (listCut) return listCut;
  }

  const TAIL_RESERVE = 120;
  const headKeep = Math.max(1, budgetChars - TAIL_RESERVE);
  const note = `\n…[truncated: original ${serialized.length} chars, budget ${budgetChars}]`;
  return `${serialized.slice(0, headKeep)}${note}`;
}

/**
 * 解析单次 Tool 调用的结果字符预算（优先级：本地 def > 远端 Tool meta > 全局默认）。
 */
export function resolveToolResultBudget(
  localDef: FunctionCallDef | undefined,
  toolMeta: AIBaseTool | undefined,
  globalDefault: number,
): { maxChars: number } {
  const maxChars =
    localDef?.resultBudget?.maxChars ?? toolMeta?.resultBudget?.maxChars ?? globalDefault;
  return { maxChars };
}
