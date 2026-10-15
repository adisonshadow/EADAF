import type { ReactNode } from 'react';
import type { AssistantSegment } from '../chat/chatToolSteps';
import AssistantSegments from './AssistantSegments';

export interface AssistantBubbleContentProps {
  content: ReactNode;
  status?: string;
  reasoningContent?: string;
  segments?: AssistantSegment[];
  nextStepPrompts?: Record<string, string | ((context: Record<string, unknown>) => string)>;
}

/**
 * assistant 气泡内容渲染。统一委托 AssistantSegments：
 * 有 segments 时按输出顺序交错展示文本与 ThoughtChain；无则回退为单段 Markdown。
 */
export default function AssistantBubbleContent({
  content,
  status,
  reasoningContent,
  segments,
  nextStepPrompts = {},
}: AssistantBubbleContentProps) {
  return (
    <AssistantSegments
      segments={segments}
      fallbackContent={content}
      status={status}
      reasoningContent={reasoningContent}
      nextStepPrompts={nextStepPrompts}
    />
  );
}
