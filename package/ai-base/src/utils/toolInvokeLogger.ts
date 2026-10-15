export type ToolInvokeSide = 'client' | 'server';

export interface ToolInvokeLogEntry {
  side: ToolInvokeSide;
  name: string;
  args: Record<string, unknown>;
  success: boolean;
  durationMs: number;
  result?: unknown;
  error?: string;
  executionType?: string;
  conversationKey?: string;
  turnId?: string;
  round?: number;
  envelope?: {
    ok: boolean;
    verified?: boolean;
    kind: string;
    error?: { code?: string; message: string; hint?: string };
  };
}

export type ToolInvokeLogger = (entry: ToolInvokeLogEntry) => void;
export type ToolInvokeListener = (entry: ToolInvokeLogEntry) => void;

function stringifyDetail(detail: unknown): string {
  if (detail == null) return '';
  try {
    const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
    return text === '{}' || text === 'null' ? '' : text;
  } catch {
    return String(detail);
  }
}

/** 从 axios / 业务异常中提取可读错误信息 */
export function formatToolInvokeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const anyErr = error as Error & {
    response?: { status?: number; data?: { message?: string; data?: unknown } };
    info?: { code?: number; message?: string; data?: unknown };
  };

  if (anyErr.info?.message?.trim()) {
    const code = anyErr.info.code;
    let text = code ? `[HTTP ${code}] ${anyErr.info.message}` : anyErr.info.message;
    const detail = stringifyDetail(anyErr.info.data);
    if (detail) text += ` | ${detail}`;
    return text;
  }

  const data = anyErr.response?.data;
  if (data && typeof data === 'object' && typeof data.message === 'string' && data.message.trim()) {
    const status = anyErr.response?.status;
    let text = status ? `[HTTP ${status}] ${data.message}` : data.message;
    const detail = stringifyDetail(data.data);
    if (detail) text += ` | ${detail}`;
    return text;
  }

  return error.message;
}

let toolInvokeLogger: ToolInvokeLogger | null = null;
const toolInvokeListeners = new Set<ToolInvokeListener>();

export function setToolInvokeLogger(logger: ToolInvokeLogger | null) {
  toolInvokeLogger = logger;
}

/** 订阅 Tool 调用完成事件（含 success/error/result），production 可用 */
export function subscribeToolInvoke(listener: ToolInvokeListener): () => void {
  toolInvokeListeners.add(listener);
  return () => toolInvokeListeners.delete(listener);
}

function notifyToolInvoke(entry: ToolInvokeLogEntry): void {
  toolInvokeLogger?.(entry);
  toolInvokeListeners.forEach((listener) => {
    try {
      listener(entry);
    } catch {
      // ignore
    }
  });
}

export function logToolInvoke(entry: ToolInvokeLogEntry) {
  notifyToolInvoke(entry);
}

import { emitMutationFromToolResult } from '../registry/aiMutationBus';

export async function withToolInvokeLog<T>(
  side: ToolInvokeSide,
  name: string,
  args: Record<string, unknown>,
  fn: () => Promise<T>,
  meta?: Pick<ToolInvokeLogEntry, 'executionType'>,
): Promise<T> {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const result = await fn();
    logToolInvoke({
      side,
      name,
      args,
      success: true,
      durationMs: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start),
      result,
      executionType: meta?.executionType,
    });
    emitMutationFromToolResult(result);
    return result;
  } catch (error) {
    logToolInvoke({
      side,
      name,
      args,
      success: false,
      durationMs: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start),
      error: formatToolInvokeError(error),
      executionType: meta?.executionType,
    });
    throw error;
  }
}
