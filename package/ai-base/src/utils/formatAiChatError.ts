function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractNestedMessage(value: unknown, depth = 0): string | null {
  if (depth > 4 || value == null) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = tryParseJson(trimmed);
    if (parsed) return extractNestedMessage(parsed, depth + 1);
    return trimmed;
  }

  if (typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  if (typeof record.message === 'string') {
    const nested = extractNestedMessage(record.message, depth + 1);
    if (nested) return nested;
  }

  if (record.error) {
    const nested = extractNestedMessage(record.error, depth + 1);
    if (nested) return nested;
  }

  return null;
}

/** 尽量只保留最内层 error.message，不做翻译 */
export function extractAiChatErrorMessage(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : String(raw ?? '').trim();
  if (!text) return 'Request failed';

  const parsed = tryParseJson(text);
  if (parsed) {
    const nested = extractNestedMessage(parsed);
    if (nested) return nested;
  }

  return text;
}

const BURST_ERROR_RE = /burst|slow\s*down|rate\s*limit|too\s*many\s*requests|限流|频繁|请求过多/i;

/**
 * 判断错误信息是否为突发保护 / 限流类（来自上游 Provider 或后端本地限流）。
 * 用于在 UI 层给出更友好的提示，而非原样透传英文 Provider 文案。
 */
export function isBurstErrorMessage(message: string): boolean {
  return BURST_ERROR_RE.test(message) || /\b429\b/.test(message);
}

/** 对突发/限流错误返回友好的中文提示；其他错误原样返回 */
export function friendlifyBurstError(message: string): string {
  if (isBurstErrorMessage(message)) {
    return '上游 AI 服务请求过于频繁（触发突发保护），已自动退避重试仍失败，请稍后重试或减少连续操作。';
  }
  return message;
}

export async function readChatErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const json = (await response.json()) as {
        error?: { message?: string };
        message?: string;
      };
      return extractAiChatErrorMessage(
        json.error?.message || json.message || `HTTP ${response.status}`,
      );
    } catch {
      return `HTTP ${response.status}`;
    }
  }

  try {
    const text = (await response.text()).trim();
    return extractAiChatErrorMessage(text || `HTTP ${response.status}`);
  } catch {
    return `HTTP ${response.status}`;
  }
}
