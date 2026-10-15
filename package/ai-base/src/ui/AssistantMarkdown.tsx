import { XMarkdown } from '@ant-design/x-markdown';
import '@ant-design/x-markdown/themes/light.css';
import '@ant-design/x-markdown/themes/dark.css';
import { useAIChatLayout } from '../provider/context';
import { markdownChartComponents } from './gptVisComponents';

interface Props {
  content: string;
  status?: string;
  /** 正文是否处于 SSE 流式接收中（Tool 等待阶段应为 false） */
  contentStreaming?: boolean;
}

export default function AssistantMarkdown({
  content,
  status,
  contentStreaming,
}: Props) {
  const { resolvedTheme } = useAIChatLayout();
  const markdownClassName =
    resolvedTheme === 'dark' ? 'x-markdown-dark' : 'x-markdown-light';
  const mainContentStreaming = contentStreaming ?? (status === 'updating');

  return (
    <XMarkdown
      content={content}
      className={markdownClassName}
      openLinksInNewTab
      paragraphTag="div"
      components={markdownChartComponents}
      dompurifyConfig={{
        ADD_ATTR: ['data-axis-x-title', 'data-axis-y-title', 'data-title'],
      }}
      streaming={{
        hasNextChunk: mainContentStreaming,
        enableAnimation: mainContentStreaming,
        tail: false,
      }}
    />
  );
}
