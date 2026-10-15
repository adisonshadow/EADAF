import type { EADAFChatMessage } from './EADAFChatProvider';

export interface RetryTurnIndex {
  userIndex: number;
  assistantIndex: number;
}

export function findRetryTurn(
  messages: Array<{ id: string | number; message: { role: string } }>,
  assistantId: string,
): RetryTurnIndex | null {
  const assistantIndex = messages.findIndex((item) => String(item.id) === assistantId);
  if (assistantIndex < 0) return null;
  for (let i = assistantIndex - 1; i >= 0; i -= 1) {
    if (messages[i]?.message.role === 'user') {
      return { userIndex: i, assistantIndex };
    }
  }
  return null;
}

function readTextFromContent(content: EADAFChatMessage['content'] | undefined): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      if (part.type === 'text' && typeof part.text === 'string') return part.text;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function stripAttachmentPrefix(text: string): string {
  return text.replace(/^\[附件: [^\]]+\]\n?/, '').trim();
}

export interface UserRetryPayload {
  apiText: string;
  displayText: string;
}

/** 从被重试的 user 消息还原提交文案（附件无法复用，仅保留文本） */
export function resolveUserRetryPayload(message: EADAFChatMessage): UserRetryPayload | null {
  const displayRaw = readTextFromContent(message.content);
  const apiFromStored = message.apiContent != null ? readTextFromContent(message.apiContent) : '';
  const displayText = stripAttachmentPrefix(displayRaw) || stripAttachmentPrefix(apiFromStored);
  const apiText = apiFromStored || displayText;
  if (!apiText) return null;
  return { apiText, displayText: displayText || apiText };
}
