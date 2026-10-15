import type { OpenAIToolDefinition } from '../types';
import { extractAiChatErrorMessage, readChatErrorMessage } from '../utils/formatAiChatError';
import { sleep } from '../utils/sleep';
import type { EADAFChatMessage } from './EADAFChatProvider';

export interface StreamUpdate {
  content: string;
  reasoningContent: string;
}

export interface ToolCallResult {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface StreamRoundResult {
  content: string;
  reasoningContent: string;
  toolCalls: ToolCallResult[];
  assistantMessage: Record<string, unknown>;
  /**
   * 本轮 LLM 的结束原因（choices[0].finish_reason）。
   * - `stop`：模型主动结束（自然语言收尾）
   * - `tool_calls`：模型要求调用 Tool（本轮含 tool_calls）
   * - `length`：达到 max_tokens 被截断（需续命补全，不能当作完成）
   * - `content_filter` 等：其他原因
   * 流式中可能缺失（部分 Provider 末帧不带 finish_reason），此时为 undefined。
   */
  finishReason?: string;
}

type ToolCallAccumulator = Record<
  number,
  { id?: string; type?: string; function: { name: string; arguments: string } }
>;

function mergeToolCallDelta(
  acc: ToolCallAccumulator,
  deltas?: Array<{ index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }>,
) {
  for (const delta of deltas || []) {
    const index = delta.index ?? 0;
    if (!acc[index]) {
      acc[index] = { type: 'function', function: { name: '', arguments: '' } };
    }
    if (delta.id) acc[index].id = delta.id;
    if (delta.type) acc[index].type = delta.type;
    if (delta.function?.name) acc[index].function.name += delta.function.name;
    if (delta.function?.arguments) acc[index].function.arguments += delta.function.arguments;
  }
}

function toolCallsFromAccumulator(acc: ToolCallAccumulator): ToolCallResult[] {
  return Object.values(acc)
    .filter((item) => item.id && item.function.name)
    .map((item) => ({
      id: item.id!,
      type: item.type || 'function',
      function: item.function,
    }));
}

function parseSsePayload(
  dataStr: string,
  state: { content: string; reasoningContent: string; toolCalls: ToolCallAccumulator; finishReason?: string },
  enableThinking: boolean,
) {
  if (!dataStr || dataStr === '[DONE]') return;

  let parsed: {
    choices?: Array<{
      delta?: {
        content?: string | null;
        reasoning_content?: string;
        tool_calls?: Array<{ index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }>;
      };
      message?: {
        content?: string;
        reasoning_content?: string;
        tool_calls?: ToolCallResult[];
      };
      finish_reason?: string | null;
    }>;
    error?: { message?: string };
  };

  try {
    parsed = JSON.parse(dataStr);
  } catch {
    return;
  }

  if (parsed.error?.message) {
    throw new Error(extractAiChatErrorMessage(parsed.error.message));
  }

  const delta = parsed.choices?.[0]?.delta;
  const message = parsed.choices?.[0]?.message;
  // 末帧（或非流式帧）携带 finish_reason；中途帧为 null/undefined，只在拿到非空值时记录
  const finishReason = parsed.choices?.[0]?.finish_reason;
  if (finishReason) state.finishReason = finishReason;

  if (delta) {
    state.content += delta.content ?? '';
    if (enableThinking) {
      state.reasoningContent += delta.reasoning_content ?? '';
    }
    mergeToolCallDelta(state.toolCalls, delta.tool_calls);
    return;
  }

  if (message) {
    state.content += message.content ?? '';
    if (enableThinking) {
      state.reasoningContent += message.reasoning_content ?? '';
    }
    for (const [index, call] of (message.tool_calls || []).entries()) {
      mergeToolCallDelta(state.toolCalls, [{ index, ...call, function: call.function }]);
    }
  }
}

/** 突发保护 / 限流错误特征：429 状态码，或文案命中 burst / slow down / 限流 等 */
const BURST_ERROR_RE = /burst|slow\s*down|rate\s*limit|too\s*many\s*requests|限流|频繁|请求过多/i;

function isBurstError(status: number, message: string): boolean {
  return status === 429 || BURST_ERROR_RE.test(message);
}

const BURST_MAX_RETRIES = 3;
const BURST_BASE_BACKOFF_MS = 1000;
const BURST_MAX_BACKOFF_MS = 8000;

/** 计算退避时长：优先用 Retry-After 头（秒），否则指数退避 + jitter */
function computeBackoff(attempt: number, response: Response | null): number {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, BURST_MAX_BACKOFF_MS);
    }
  }
  const exp = BURST_BASE_BACKOFF_MS * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(exp + jitter, BURST_MAX_BACKOFF_MS);
}

export async function streamChatRound(
  params: {
    slug: string;
    messages: EADAFChatMessage[];
    tools?: OpenAIToolDefinition[];
    enableThinking?: boolean;
    signal?: AbortSignal;
    apiBase: string;
    getToken: () => string | null;
    /** MS6：贯穿本回合的 turnId，写入请求头供后端关联 */
    turnId?: string;
  },
  onUpdate: (update: StreamUpdate) => void,
): Promise<StreamRoundResult> {
  const enableThinking = Boolean(params.enableThinking);
  const token = params.getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (params.turnId) headers['X-AIBase-TurnId'] = params.turnId;

  // 发请求 + 校验响应头（不含流式读取）封装为可重试单元。
  // 仅在拿到流之前的失败（突发/限流 429）做指数退避重试；
  // 一旦进入流式读取即不再重试。
  const doFetch = () =>
    fetch(`${params.apiBase}/v1/ai/chat/completions`, {
      method: 'POST',
      headers,
      signal: params.signal,
      body: JSON.stringify({
        slug: params.slug,
        messages: params.messages,
        stream: true,
        tools: params.tools?.length ? params.tools : undefined,
        enable_thinking: enableThinking,
      }),
    });

  let response: Response | null = null;
  let lastErrorMessage = '';
  for (let attempt = 0; attempt <= BURST_MAX_RETRIES; attempt += 1) {
    const res = await doFetch();

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && res.body) {
        response = res;
        break;
      }
      // 成功状态但非 SSE（配置错误类），不重试，直接报错
      throw new Error('AI 服务未返回 SSE 流式响应，请检查模型与 Provider 配置');
    }

    lastErrorMessage = await readChatErrorMessage(res);

    // 仅对突发/限流错误重试；其他 HTTP 错误（如 502/404）直接抛出
    if (!isBurstError(res.status, lastErrorMessage) || attempt === BURST_MAX_RETRIES) {
      throw new Error(lastErrorMessage);
    }

    // 退避等待（可被 abort 立即中断），然后进入下一次重试
    await sleep(computeBackoff(attempt, res), params.signal);
  }

  if (!response || !response.body) {
    throw new Error(lastErrorMessage || 'AI 服务请求失败');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state = { content: '', reasoningContent: '', toolCalls: {} as ToolCallAccumulator, finishReason: undefined as string | undefined };
  let buffer = '';

  const emit = () => {
    onUpdate({ content: state.content, reasoningContent: state.reasoningContent });
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      parseSsePayload(trimmed.slice(5).trim(), state, enableThinking);
      emit();
    }
  }

  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith('data:')) {
      parseSsePayload(trimmed.slice(5).trim(), state, enableThinking);
      emit();
    }
  }

  const toolCalls = toolCallsFromAccumulator(state.toolCalls);
  const assistantMessage: Record<string, unknown> = {
    role: 'assistant',
    content: state.content,
    ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
  };

  return {
    content: state.content,
    reasoningContent: state.reasoningContent,
    toolCalls,
    assistantMessage,
    finishReason: state.finishReason,
  };
}
