import {
  AbstractChatProvider,
  XRequest,
  type TransformMessage,
  type XRequestOptions,
} from '@ant-design/x-sdk';
import { extractAiChatErrorMessage } from '../utils/formatAiChatError';
import type { AssistantSegment } from './chatToolSteps';

type SseChunk = { data?: string };

export interface EADAFChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | Array<Record<string, unknown>>;
  /** 发给模型的原始多模态内容；UI 展示用 content 字符串 */
  apiContent?: string | Array<Record<string, unknown>>;
  reasoningContent?: string;
  tool_call_id?: string;
  name?: string;
  attachments?: Array<{ uid: string; name: string; mimeType?: string; modality?: string }>;
  /**
   * assistant 回复的有序 segment 视图（文本段 / 工具段），按 AI 输出顺序排列。
   * content 字段仍保留完整累加文本（兼容历史摘要/上下文压缩），segments 仅供 UI 渲染。
   */
  segments?: AssistantSegment[];
}

export interface EADAFChatInput {
  query?: string;
  slug?: string;
  messages?: EADAFChatMessage[];
  stream?: boolean;
  tools?: object[];
  systemPrompt?: string;
  enableThinking?: boolean;
}

const PLACEHOLDER = '正在思考中...';

function contentAsText(content: EADAFChatMessage['content'] | undefined): string {
  return typeof content === 'string' ? content : '';
}

function isPlaceholder(content?: EADAFChatMessage['content']) {
  const text = contentAsText(content);
  return !text || text === PLACEHOLDER;
}

export class EADAFChatProvider extends AbstractChatProvider<EADAFChatMessage, EADAFChatInput, SseChunk> {
  transformParams(
    requestParams: Partial<EADAFChatInput>,
    options: XRequestOptions<EADAFChatInput, SseChunk, EADAFChatMessage>,
  ): EADAFChatInput {
    const history = this.getMessages().map(({ role, content, apiContent, tool_call_id, name }) => ({
      role,
      content: apiContent ?? content,
      ...(tool_call_id ? { tool_call_id } : {}),
      ...(name ? { name } : {}),
    }));

    const messages = requestParams.systemPrompt
      ? [{ role: 'system' as const, content: requestParams.systemPrompt }, ...history]
      : history;

    return {
      ...(options?.params || {}),
      slug: requestParams.slug,
      messages,
      stream: true,
      tools: requestParams.tools,
      ...(requestParams.enableThinking ? { enable_thinking: true } : { enable_thinking: false }),
    };
  }

  transformLocalMessage(requestParams: Partial<EADAFChatInput>): EADAFChatMessage {
    return { role: 'user', content: requestParams.query || '' };
  }

  transformMessage(info: TransformMessage<EADAFChatMessage, SseChunk>): EADAFChatMessage {
    const { originMessage, chunk } = info;
    const prevContent = isPlaceholder(originMessage?.content) ? '' : contentAsText(originMessage?.content);
    const prevReasoning = originMessage?.reasoningContent ?? '';

    const pack = (content: string, reasoningContent?: string): EADAFChatMessage => ({
      role: 'assistant',
      content,
      ...(reasoningContent ? { reasoningContent } : {}),
    });

    if (!chunk) return pack(prevContent, prevReasoning || undefined);

    const dataStr = String(chunk.data ?? '').trim();
    if (!dataStr || dataStr === '[DONE]') return pack(prevContent, prevReasoning || undefined);

    let parsed: {
      choices?: Array<{
        delta?: { content?: string | null; reasoning_content?: string; tool_calls?: unknown[] };
        message?: { content?: string; reasoning_content?: string; tool_calls?: unknown[] };
      }>;
      error?: { message?: string };
    };

    try {
      parsed = JSON.parse(dataStr);
    } catch {
      return pack(prevContent, prevReasoning || undefined);
    }

    if (parsed?.error?.message) {
      return { role: 'assistant', content: extractAiChatErrorMessage(parsed.error.message) };
    }

    const delta = parsed?.choices?.[0]?.delta;
    const message = parsed?.choices?.[0]?.message;
    const source = delta || message;

    if (source) {
      const newContent = prevContent + (source.content ?? '');
      const newReasoning = prevReasoning + (source.reasoning_content ?? '');
      return pack(newContent, newReasoning || undefined);
    }

    return pack(prevContent, prevReasoning || undefined);
  }
}

export function createEADAFChatProvider(apiBase: string, getToken: () => string | null) {
  return new EADAFChatProvider({
    request: XRequest<EADAFChatInput, SseChunk, EADAFChatMessage>(`${apiBase}/v1/ai/chat/completions`, {
      manual: true,
      headers: { 'Content-Type': 'application/json' },
      middlewares: {
        onRequest: async (url, init) => {
          const token = getToken();
          const headers: Record<string, string> = {
            ...(init.headers as Record<string, string>),
          };
          if (token) headers.Authorization = `Bearer ${token}`;
          return [url, { ...init, headers }] as [string, typeof init];
        },
      },
      params: { stream: true },
      timeout: 120000,
      streamTimeout: 120000,
    }),
  });
}
