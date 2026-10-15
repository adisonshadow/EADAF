import { Think } from '@ant-design/x';
import { XMarkdown } from '@ant-design/x-markdown';
import '@ant-design/x-markdown/themes/light.css';
import '@ant-design/x-markdown/themes/dark.css';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { resolveReasoningView } from '../config/agentPrefsChannel';
import { useAIChatLayout } from '../provider/context';

const STREAMING_STATUSES = new Set(['loading', 'updating']);

interface Props {
  reasoningContent?: string;
  status?: string;
  /** 正文已开始输出时停止深度思考 blink（与历史行为一致） */
  contentStarted?: boolean;
}

export default function AssistantReasoning({
  reasoningContent,
  status,
  contentStarted = false,
}: Props) {
  const { resolvedTheme, reasoningDisplayMode } = useAIChatLayout();
  const markdownClassName =
    resolvedTheme === 'dark' ? 'x-markdown-dark' : 'x-markdown-light';
  const isStreaming = status ? STREAMING_STATUSES.has(status) : false;
  const reasoningStreaming =
    isStreaming && !contentStarted && !!reasoningContent?.trim();

  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUserOverride(null);
  }, [reasoningDisplayMode]);

  useEffect(() => {
    if (reasoningDisplayMode === 'full' && !isStreaming) {
      setUserOverride(null);
    }
  }, [reasoningDisplayMode, isStreaming]);

  const { thinkExpanded, previewClipped } = resolveReasoningView(
    reasoningDisplayMode,
    isStreaming,
    userOverride,
  );

  useLayoutEffect(() => {
    if (!previewClipped) return;
    const el = previewRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [previewClipped, reasoningContent]);

  if (!reasoningContent) return null;

  return (
    <Think
      title={
        isStreaming ? <span className="aibase-text-shine">深度思考</span> : '思考过程'
      }
      loading={reasoningStreaming}
      expanded={thinkExpanded}
      onExpand={(next) => {
        if (reasoningDisplayMode === 'preview3') {
          setUserOverride((prev) => (prev === true ? null : true));
          return;
        }
        setUserOverride(next);
      }}
      blink={reasoningStreaming}
      style={{ marginBottom: 8 }}
    >
      <div
        ref={previewRef}
        className={previewClipped ? 'aibase-reasoning-preview' : undefined}
        onClick={
          previewClipped
            ? (event) => {
                event.stopPropagation();
                setUserOverride(true);
              }
            : undefined
        }
      >
        <XMarkdown
          content={reasoningContent}
          className={markdownClassName}
          openLinksInNewTab
          escapeRawHtml
          streaming={{
            hasNextChunk: isStreaming,
            enableAnimation: true,
          }}
        />
      </div>
    </Think>
  );
}
