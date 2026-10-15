import type { SkillCompletionStrategy } from '../types';
import type { ToolResponse } from '../types/toolResponse';

/**
 * 聚合器操作的最小消息结构（与 EADAFChatMessage 的 role:'tool' 子集结构兼容）。
 * 不直接 import EADAFChatMessage，避免把 chat/EADAFChatProvider（含既有类型错误）
 * 拉进公开 DTS 图。调用方传入真实的 role:'tool' 消息即可（结构子类型兼容）。
 */
interface ToolResultMessage {
  // 放宽为 string：EADAFChatMessage.role 是联合类型，聚合器只在运行时按 name 分组，
  // 不依赖 role 字面量。调用方约定只传入 role:'tool' 的消息。
  role: string;
  tool_call_id?: string;
  name?: string;
  content: unknown;
}

/**
 * 同性质批量 Tool 调用结果聚合（阶段 E）。
 *
 * 解决的问题：同一轮 LLM 一次 emit 多个同名 Tool 调用（如批量 run_test 6 个 API），
 * 原实现把 6 条全量结果都塞进 loopMessages，导致上下文膨胀 + payload 过大。
 *
 * 约束：OpenAI 协议要求每个 tool_calls[].id 必须有对应 role:'tool' 消息（数量不可变）。
 * 因此本聚合器**不改消息数量**，而是：
 *   - 同名批次达到阈值时，把前 N-1 条的 content 压成一行状态（"batch #k: ok/failed"）
 *   - 最后一条承载完整聚合摘要（{ total, passed, failed, failures:[...] }）
 *   - 不达阈值（< minBatchSize）或不在配置 tools 列表内的，原样返回
 *
 * UI 段（assistantSegments）不受影响——用户仍看到每个 Tool 的独立 step。
 */

interface AggregationConfig {
  tools: string[];
  minBatchSize: number;
}

function resolveConfig(
  strategy: SkillCompletionStrategy | undefined,
): AggregationConfig | null {
  const agg = strategy?.resultAggregation;
  if (!agg || !agg.tools?.length) return null;
  return {
    tools: agg.tools,
    minBatchSize: Math.max(2, Math.floor(agg.minBatchSize ?? 3)),
  };
}

/** 尝试从 role:'tool' 消息的 content（序列化信封）还原出 ToolResponse。 */
function parseEnvelope(content: string): ToolResponse | null {
  if (!content) return null;
  try {
    const obj = JSON.parse(content);
    if (
      obj &&
      typeof obj === 'object' &&
      typeof obj.ok === 'boolean' &&
      typeof obj.kind === 'string'
    ) {
      return obj as ToolResponse;
    }
  } catch {
    // content 可能是被 serializeToolResultForContext 裁剪过的非完整 JSON，跳过
  }
  return null;
}

function isOk(envelope: ToolResponse | null): boolean {
  if (!envelope) return false;
  if (envelope.kind === 'system_error' || envelope.ok === false) return false;
  if (envelope.kind === 'business_error') return false;
  if (envelope.verified === false) return false;
  return true;
}

/**
 * 聚合同一轮的 toolMessages。
 * 返回新的消息数组（同长度、同 tool_call_id 顺序），其中命中聚合批次的 content 被压缩。
 * 不命中时返回原数组引用（零开销）。
 *
 * 泛型保留输入元素类型（如 EADAFChatMessage），仅替换 content 字段，
 * 这样调用方回灌 loopMessages 时类型不变。
 */
/**
 * @param envelopesByCallId 可选：序列化前的结构化信封（按 tool_call_id）。
 *   优先于解析 content——避免预算裁剪后的残缺 JSON 把成功计成 failed。
 */
export function aggregateToolResults<T extends ToolResultMessage>(
  toolMessages: T[],
  strategy: SkillCompletionStrategy | undefined,
  envelopesByCallId?: Map<string, ToolResponse>,
): T[] {
  const config = resolveConfig(strategy);
  if (!config) return toolMessages;

  // 按工具名分组，记录每个 name 的索引列表
  const groups = new Map<string, number[]>();
  toolMessages.forEach((msg, idx) => {
    const name = (msg as { name?: string }).name;
    if (!name || !config.tools.includes(name)) return;
    const list = groups.get(name);
    if (list) list.push(idx);
    else groups.set(name, [idx]);
  });

  let changed = false;
  const result: T[] = toolMessages.slice();

  for (const [name, indices] of groups) {
    if (indices.length < config.minBatchSize) continue;

    // 优先用结构化信封；否则再尝试解析 content
    const parsed = indices.map((idx) => {
      const msg = toolMessages[idx];
      const callId = (msg as { tool_call_id?: string }).tool_call_id;
      const fromMap =
        callId && envelopesByCallId?.has(callId)
          ? envelopesByCallId.get(callId) ?? null
          : null;
      const content = typeof msg.content === 'string' ? msg.content : '';
      return { idx, envelope: fromMap ?? parseEnvelope(content), raw: msg };
    });

    const total = parsed.length;
    const failures = parsed.filter((p) => !isOk(p.envelope));
    const passed = total - failures.length;

    // 每条都压成简短状态；最后一条额外带聚合摘要
    parsed.forEach((p, i) => {
      const isLast = i === parsed.length - 1;
      const status = isOk(p.envelope) ? 'ok' : 'failed';
      const err = !isOk(p.envelope) && p.envelope?.error?.message
        ? `：${p.envelope.error.message}`
        : '';

      if (isLast) {
        // 最后一条承载完整摘要
        const summary = {
          aggregated: true,
          tool: name,
          total,
          passed,
          failed: failures.length,
          ...(failures.length
            ? {
                failures: failures.slice(0, 5).map((f) => ({
                  tool_call_id: (f.raw as { tool_call_id?: string }).tool_call_id,
                  error: f.envelope?.error?.message ?? f.envelope?.kind ?? 'unknown',
                })),
              }
            : {}),
        };
        result[p.idx] = {
          ...p.raw,
          content: `[批量聚合 #${i + 1}/${total} ${status}${err}] 汇总：${JSON.stringify(summary)}`,
        };
      } else {
        result[p.idx] = {
          ...p.raw,
          content: `[批量聚合 #${i + 1}/${total} ${status}${err}]`,
        };
      }
    });

    changed = true;
  }

  return changed ? result : toolMessages;
}
