import type { EADAFChatMessage } from './EADAFChatProvider';

/** 估算上下文上限（字符数，约 30k tokens） */
export const MAX_CONTEXT_CHARS = 120_000;

/** 超过该比例时自动整理历史消息 */
export const COMPACT_THRESHOLD = 0.85;

/** 整理后保留的最近消息条数（约 6 轮对话） */
export const KEEP_RECENT_MESSAGES = 12;

/** 单张图片折算字符（约 1.5k tokens × 4）——禁止按 base64 全文计数 */
export const MULTIMODAL_IMAGE_CHARS = 6_000;
/** 单段音频折算字符 */
export const MULTIMODAL_AUDIO_CHARS = 4_000;
/** 其它非文本 part 折算字符 */
export const MULTIMODAL_OTHER_CHARS = 2_000;

function estimateMultimodalPart(part: Record<string, unknown>): number {
  const type = String(part.type || '');
  if (type === 'text' || type === 'input_text') {
    const text = typeof part.text === 'string' ? part.text : '';
    return text.length;
  }
  if (
    type === 'image_url' ||
    type === 'input_image' ||
    type === 'image' ||
    part.image_url != null
  ) {
    return MULTIMODAL_IMAGE_CHARS;
  }
  if (type === 'input_audio' || type === 'audio' || part.input_audio != null) {
    return MULTIMODAL_AUDIO_CHARS;
  }
  return MULTIMODAL_OTHER_CHARS;
}

/**
 * 估算单条消息占用的「等效字符」。
 * 多模态数组按固定 token 折算，避免 base64 把预算打穿。
 */
export function estimateMessageChars(message: EADAFChatMessage): number {
  const content = message.content;
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    return content.reduce((sum, part) => {
      if (part && typeof part === 'object') {
        return sum + estimateMultimodalPart(part as Record<string, unknown>);
      }
      return sum + String(part ?? '').length;
    }, 0);
  }
  return JSON.stringify(content ?? '').length;
}

export function estimateMessagesChars(messages: EADAFChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateMessageChars(message), 0);
}

export function getContextUsagePercent(
  messages: EADAFChatMessage[],
  systemPrompt?: string,
): number {
  let total = systemPrompt?.length ?? 0;
  total += estimateMessagesChars(messages);
  return Math.min(100, Math.round((total / MAX_CONTEXT_CHARS) * 100));
}

export interface CompactHistoryResult {
  /** 仅用于 API 请求的视图（可含摘要 system 消息）；不代表应删除持久化历史 */
  history: EADAFChatMessage[];
  compacted: boolean;
  trimmedCount: number;
  /** 被裁出的早期消息摘要（结构化，替代英文 notice） */
  summary?: string;
}

function summarizeTrimmedMessages(trimmed: EADAFChatMessage[]): string {
  const lines: string[] = [];
  let userCount = 0;
  let assistantCount = 0;
  const snippets: string[] = [];

  for (const msg of trimmed) {
    if (msg.role === 'user') {
      userCount += 1;
      const text =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? '[多模态消息]'
            : '';
      const flat = text.replace(/\s+/g, ' ').trim();
      if (flat && snippets.length < 4) {
        snippets.push(`用户: ${flat.slice(0, 80)}${flat.length > 80 ? '…' : ''}`);
      }
    } else if (msg.role === 'assistant') {
      assistantCount += 1;
      const text = typeof msg.content === 'string' ? msg.content.replace(/\s+/g, ' ').trim() : '';
      if (text && snippets.length < 6) {
        snippets.push(`助手: ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`);
      }
    }
  }

  lines.push(
    `[上下文已压缩] 已整理较早 ${trimmed.length} 条消息（用户 ${userCount} / 助手 ${assistantCount}），以下为要点；完整历史仍保留在本地，仅本轮请求视图缩短。`,
  );
  if (snippets.length) {
    lines.push('要点：');
    for (const s of snippets) lines.push(`- ${s}`);
  }
  lines.push('请基于上述要点与后续最近消息继续，勿假设早期细节已丢失于存储。');
  return lines.join('\n');
}

/**
 * 上下文过长时裁剪 **API 请求用的历史视图**，插入结构化摘要。
 * **非破坏**：调用方不得用返回结果覆盖/删除 IndexedDB 中的完整对话。
 */
export function compactHistoryForApi(history: EADAFChatMessage[]): CompactHistoryResult {
  const usage = estimateMessagesChars(history);
  if (usage < MAX_CONTEXT_CHARS * COMPACT_THRESHOLD) {
    return { history, compacted: false, trimmedCount: 0 };
  }

  const kept = history.slice(-KEEP_RECENT_MESSAGES);
  const removed = history.slice(0, Math.max(0, history.length - KEEP_RECENT_MESSAGES));
  const trimmedCount = removed.length;
  if (trimmedCount <= 0) {
    return { history, compacted: false, trimmedCount: 0 };
  }

  const summary = summarizeTrimmedMessages(removed);
  const notice: EADAFChatMessage = {
    role: 'system',
    content: summary,
  };

  return {
    history: [notice, ...kept],
    compacted: true,
    trimmedCount,
    summary,
  };
}

/**
 * Turn 内压缩：较早轮次的 tool 结果降级为短摘要，保留最近 keepRecent 条 tool 消息全文。
 * 不改变消息条数 / tool_call_id 对应关系。
 */
export function compactTurnToolMessages<
  T extends { role: string; content?: unknown; name?: string; tool_call_id?: string },
>(messages: T[], keepRecentToolMessages = 8): T[] {
  const toolIndices: number[] = [];
  messages.forEach((m, i) => {
    if (m.role === 'tool') toolIndices.push(i);
  });
  if (toolIndices.length <= keepRecentToolMessages) return messages;

  const dropCount = toolIndices.length - keepRecentToolMessages;
  const toCompact = new Set(toolIndices.slice(0, dropCount));
  return messages.map((msg, i) => {
    if (!toCompact.has(i)) return msg;
    const name = msg.name || 'tool';
    const id = msg.tool_call_id ? ` #${msg.tool_call_id.slice(-6)}` : '';
    return {
      ...msg,
      content: `[早期工具结果已降级] ${name}${id}：详情见工作记忆事实层；完整证据在本地轨迹。`,
    };
  });
}
