import type { ToolResponse } from '../types/toolResponse';
import { emitMutationFromToolResult } from '../registry/aiMutationBus';
import {
  formatToolInvokeError,
  logToolInvoke,
  type ToolInvokeLogEntry,
  type ToolInvokeSide,
} from './toolInvokeLogger';
import { normalizeToolResult } from './normalizeToolResult';

export interface ExecuteToolWithEnvelopeOptions {
  side: ToolInvokeSide;
  name: string;
  args: Record<string, unknown>;
  fn: () => Promise<unknown>;
  executionType?: string;
  requiresVerification?: boolean;
  durationMs?: number;
  logContext?: Pick<ToolInvokeLogEntry, 'conversationKey' | 'turnId' | 'round'>;
}

/**
 * 统一 Tool 执行中间层：调用 handler → 规范为 ToolResponse → 写日志 → 触发 mutation。
 * LLM 上下文只消费返回的信封；mutation 仍从原始 handler 返回值提取。
 */
export async function executeToolWithEnvelope(
  options: ExecuteToolWithEnvelopeOptions,
): Promise<ToolResponse> {
  const {
    side,
    name,
    args,
    fn,
    executionType,
    requiresVerification,
    logContext,
  } = options;
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    const rawResult = await fn();
    const durationMs =
      options.durationMs ??
      Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start);

    emitMutationFromToolResult(rawResult);

    const envelope = normalizeToolResult({
      tool: name,
      rawResult,
      durationMs,
      requiresVerification,
    });

    logToolInvoke({
      side,
      name,
      args,
      success: envelope.kind === 'success' && envelope.verified !== false,
      durationMs,
      result: rawResult,
      executionType,
      envelope: {
        ok: envelope.ok,
        verified: envelope.verified,
        kind: envelope.kind,
        error: envelope.error,
      },
      ...logContext,
    });

    return envelope;
  } catch (error) {
    const durationMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start,
    );
    const envelope = normalizeToolResult({
      tool: name,
      thrownError: error,
      durationMs,
      requiresVerification,
    });

    logToolInvoke({
      side,
      name,
      args,
      success: false,
      durationMs,
      error: formatToolInvokeError(error),
      executionType,
      envelope: {
        ok: envelope.ok,
        verified: envelope.verified,
        kind: envelope.kind,
        error: envelope.error,
      },
      ...logContext,
    });

    return envelope;
  }
}
