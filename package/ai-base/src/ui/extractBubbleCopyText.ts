import type { AssistantSegment } from '../chat/chatToolSteps';
import { planningNextMovesToMarkdown } from './planningNextMovesToMarkdown';

const LOADING_PLACEHOLDERS = new Set(['正在思考中...', '正在生成回复...']);
const A2UI_FENCE_RE = /```a2ui-commands\s*[\s\S]*?```/gi;

/** 复制时只剥 a2ui 围栏，不用松散 "steps" JSON 解析（会误删整轮正文） */
function stripA2uiFences(raw: string): string {
  const text = raw.replace(A2UI_FENCE_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!text || LOADING_PLACEHOLDERS.has(text)) return '';
  return text;
}

function collectSegmentCopyText(segments?: AssistantSegment[]): string {
  if (!segments?.length) return '';
  const parts: string[] = [];
  for (const seg of segments) {
    if (seg.kind === 'planning') {
      const md = planningNextMovesToMarkdown(seg).trim();
      if (md) parts.push(md);
      continue;
    }
    if (seg.kind !== 'text' || seg.id === 'context-prep') continue;
    const text = stripA2uiFences(seg.content);
    if (text) parts.push(text);
  }
  return parts.join('\n\n');
}

/**
 * 提取 assistant 气泡可复制正文。
 * content 是整轮累加文本（权威来源）；segments 仅作补全（规划 / 缺 content 的历史消息）。
 */
export function extractBubbleCopyText(
  content: unknown,
  segments?: AssistantSegment[],
): string {
  const fromContent = typeof content === 'string' ? stripA2uiFences(content) : '';
  const fromSegments = collectSegmentCopyText(segments);
  if (fromContent.length >= fromSegments.length) return fromContent;
  return fromSegments;
}
