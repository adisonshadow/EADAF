import type { ActionPayload } from '@ant-design/x-card';
import { useCallback, useMemo, type ReactNode } from 'react';
import NextStepA2uiDeck, { NextStepStreamingPlaceholder } from '../a2ui/NextStepA2uiDeck';
import { extractA2uiCommandsPayload } from '../a2ui/parseA2uiCommands';
import type { AssistantSegment } from '../chat/chatToolSteps';
import { pickNextStepsForRender } from '../chat/emitTaskCompleteDelivery';
import { sendMockUserMessage } from '../utils/aiChatBridge';
import AssistantMarkdown from './AssistantMarkdown';
import AssistantReasoning from './AssistantReasoning';
import PlanningNextMovesBlock from './PlanningNextMovesBlock';
import ToolInvokeSteps from './ToolInvokeSteps';
import UserChoiceCard from './UserChoiceCard';

const LOADING_PLACEHOLDERS = new Set(['正在思考中...', '正在生成回复...']);

function hasRealText(text: string | undefined): boolean {
  const trimmed = text?.trim() ?? '';
  return Boolean(trimmed) && !LOADING_PLACEHOLDERS.has(trimmed);
}

export interface AssistantSegmentsProps {
  segments?: AssistantSegment[];
  /** 兜底：当无 segment（如历史消息）时回退展示的完整文本。 */
  fallbackContent: ReactNode;
  status?: string;
  reasoningContent?: string;
  nextStepPrompts?: Record<string, string | ((context: Record<string, unknown>) => string)>;
}

/** 单个文本段经 a2ui 指令抽取后的渲染数据 */
interface TextSegmentView {
  id: string;
  displayText: string;
  isStreamingBlock: boolean;
  hasSteps: boolean;
  steps: ReturnType<typeof extractA2uiCommandsPayload>['steps'];
}

/**
 * 按 AI 输出顺序渲染 assistant 回复：遍历 segments，文本段渲染为 Markdown，
 * 工具段渲染为单条 InvocationCard，二者自然交错。
 *
 * 与旧实现（所有 Tool 堆在文字上方）的区别：顺序由 segments 数组决定，
 * 不再由「先 ToolInvokeSteps 后 AssistantMarkdown」的固定布局决定。
 */
export default function AssistantSegments({
  segments,
  fallbackContent,
  status,
  reasoningContent,
  nextStepPrompts = {},
}: AssistantSegmentsProps) {
  const hasActiveTool = segments?.some(
    (seg) => seg.kind === 'tool' && seg.step.status === 'loading',
  );

  const handleNextStepAction = useCallback(
    (payload: ActionPayload) => {
      const resolver = nextStepPrompts[payload.name];
      if (!resolver) {
        const labelCtx = payload.context?.label as { value?: string } | undefined;
        const label = labelCtx?.value?.trim();
        if (label) sendMockUserMessage(label);
        return;
      }
      const messageText =
        typeof resolver === 'function' ? resolver(payload.context ?? {}) : resolver;
      if (messageText.trim()) sendMockUserMessage(messageText);
    },
    [nextStepPrompts],
  );

  // 一次性把所有文本段做 a2ui 指令解析（useMemo 不能放在循环/条件里，故提到顶层）
  const textViews = useMemo<TextSegmentView[]>(() => {
    if (!segments?.length) return [];
    return segments
      .filter((seg): seg is Extract<AssistantSegment, { kind: 'text' }> => seg.kind === 'text')
      .map((seg) => {
        const parsed = extractA2uiCommandsPayload(seg.content);
        return {
          id: seg.id,
          displayText: parsed.displayText,
          isStreamingBlock: parsed.isStreamingBlock,
          hasSteps: parsed.hasSteps,
          steps: parsed.steps,
        };
      });
  }, [segments]);

  // 无 segment 视图时回退到整体文本（历史消息/降级路径）；同样提到顶层以遵守 Hooks 规则
  const fallbackParsed = useMemo(() => {
    if (segments?.length) return null;
    const text =
      typeof fallbackContent === 'string' ? fallbackContent : String(fallbackContent ?? '');
    return extractA2uiCommandsPayload(text);
  }, [segments, fallbackContent]);

  const hasVisibleContent = useMemo(() => {
    if (hasRealText(fallbackParsed?.displayText)) return true;
    if (textViews.some((view) => hasRealText(view.displayText))) return true;
    return (segments ?? []).some(
      (seg) => seg.kind === 'text' && 'content' in seg && hasRealText(seg.content),
    );
  }, [fallbackParsed, textViews, segments]);

  const reasoning = (
    <AssistantReasoning
      reasoningContent={reasoningContent}
      status={status}
      contentStarted={hasVisibleContent}
    />
  );

  if (fallbackParsed) {
    return (
      <>
        {reasoning}
        <AssistantMarkdown
          content={fallbackParsed.displayText}
          status={status}
          contentStreaming={status === 'updating' && !hasActiveTool}
        />
        {fallbackParsed.isStreamingBlock ? <NextStepStreamingPlaceholder /> : null}
        {!fallbackParsed.isStreamingBlock && fallbackParsed.hasSteps ? (
          <NextStepA2uiDeck steps={fallbackParsed.steps} onAction={handleNextStepAction} />
        ) : null}
      </>
    );
  }

  // next_steps segment 优先；无则降级解析末条文本 a2ui-commands（历史/未开结构化终止）
  const lastText = textViews[textViews.length - 1];
  const picked = pickNextStepsForRender(
    segments,
    !lastText?.isStreamingBlock && lastText?.hasSteps ? lastText.steps : undefined,
  );
  const showStreamingPlaceholder =
    picked.source == null && Boolean(lastText?.isStreamingBlock);

  return (
    <>
      {reasoning}
      {(segments ?? []).map((segment) => {
        if (segment.kind === 'tool') {
          return <ToolInvokeSteps key={segment.id} step={segment.step} />;
        }
        if (segment.kind === 'planning') {
          return <PlanningNextMovesBlock key={segment.id} segment={segment} />;
        }
        if (segment.kind === 'user_choice') {
          return <UserChoiceCard key={segment.id} segment={segment} />;
        }
        if (segment.kind === 'next_steps') {
          // 统一在末尾渲染一次 Deck，避免与围栏降级重复
          return null;
        }
        if (segment.id === 'context-prep' && 'content' in segment) {
          return (
            <div key={segment.id} className="aibase-context-prep">
              <span className="aibase-text-shine">{segment.content}</span>
            </div>
          );
        }
        const view = textViews.find((v) => v.id === segment.id);
        return (
          <AssistantMarkdown
            key={segment.id}
            content={view?.displayText ?? ('content' in segment ? segment.content : '')}
            status={status}
            contentStreaming={status === 'updating' && !hasActiveTool}
          />
        );
      })}
      {showStreamingPlaceholder ? <NextStepStreamingPlaceholder /> : null}
      {picked.steps.length > 0 ? (
        <NextStepA2uiDeck steps={picked.steps} onAction={handleNextStepAction} />
      ) : null}
    </>
  );
}
