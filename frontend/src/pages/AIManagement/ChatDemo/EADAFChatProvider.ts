import {
  AbstractChatProvider,
  XRequest,
  type TransformMessage,
  type XRequestOptions,
} from '@ant-design/x-sdk';
import { resolveStreamApiUrl } from '@/constants/env';
import { extractAiChatErrorMessage, withBrowserProviderApiKeyBody } from '@eadaf/ai-base';

/** XRequest SSE 流式单元：每个 data 行被包裹为 { data: string } */
type SseChunk = { data?: string };

export interface EADAFChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoningContent?: string;
}

export interface EADAFChatInput {
  query?: string;
  slug?: string;
  messages?: EADAFChatMessage[];
  stream?: boolean;
  enableThinking?: boolean;
}

const PLACEHOLDER_CONTENT = '正在思考中...';

function isPlaceholderContent(content?: string) {
  return !content || content === PLACEHOLDER_CONTENT;
}

export class EADAFChatProvider extends AbstractChatProvider<
  EADAFChatMessage,
  EADAFChatInput,
  SseChunk
> {
  transformParams(
    requestParams: Partial<EADAFChatInput>,
    options: XRequestOptions<EADAFChatInput, SseChunk, EADAFChatMessage>,
  ): EADAFChatInput {
    const history = this.getMessages().map(({ role, content }) => ({ role, content }));

    return {
      ...(options?.params || {}),
      slug: requestParams.slug,
      messages: history,
      stream: true,
      ...(requestParams.enableThinking ? { enable_thinking: true } : { enable_thinking: false }),
    };
  }

  transformLocalMessage(requestParams: Partial<EADAFChatInput>): EADAFChatMessage {
    return {
      role: 'user',
      content: requestParams.query || '',
    };
  }

  transformMessage(info: TransformMessage<EADAFChatMessage, SseChunk>): EADAFChatMessage {
    const { originMessage, chunk } = info;

    const prevContent = isPlaceholderContent(originMessage?.content)
      ? ''
      : (originMessage?.content ?? '');
    const prevReasoning = originMessage?.reasoningContent ?? '';

    const pack = (content: string, reasoningContent?: string): EADAFChatMessage => ({
      role: 'assistant',
      content,
      ...(reasoningContent ? { reasoningContent } : {}),
    });

    if (!chunk) {
      return pack(prevContent, prevReasoning || undefined);
    }

    const dataStr = String(chunk.data ?? '').trim();
    if (!dataStr || dataStr === '[DONE]') {
      return pack(prevContent, prevReasoning || undefined);
    }

    let parsed: {
      choices?: Array<{
        delta?: {
          content?: string | null;
          reasoning_content?: string;
          role?: string;
        };
        message?: {
          content?: string;
          reasoning_content?: string;
          role?: string;
        };
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

    if (delta) {
      const newContent = prevContent + (delta.content ?? '');
      const newReasoning = prevReasoning + (delta.reasoning_content ?? '');
      return pack(newContent, newReasoning || undefined);
    }

    if (message) {
      const newContent = prevContent + (message.content ?? '');
      const newReasoning = prevReasoning + (message.reasoning_content ?? '');
      return pack(newContent, newReasoning || undefined);
    }

    return pack(prevContent, prevReasoning || undefined);
  }
}

export function createEADAFChatProvider() {
  return new EADAFChatProvider({
    request: XRequest<EADAFChatInput, SseChunk, EADAFChatMessage>(
      resolveStreamApiUrl('/api/v1/ai/chat/completions'),
      {
        manual: true,
        headers: {
          'Content-Type': 'application/json',
        },
        middlewares: {
          onRequest: async (url, init) => {
            const token = localStorage.getItem('token');
            const headers = new Headers(init.headers as HeadersInit);
            if (token) {
              headers.set('Authorization', `Bearer ${token}`);
            }
            const body = withBrowserProviderApiKeyBody(typeof init.body === 'string' ? init.body : undefined);
            const headerRecord: Record<string, string> = {};
            headers.forEach((value, key) => {
              headerRecord[key] = value;
            });
            return [url, { ...init, headers: headerRecord, ...(body !== undefined ? { body } : {}) }];
          },
        },
        params: {
          stream: true,
        },
        timeout: 120000,
        streamTimeout: 120000,
      },
    ),
  });
}
