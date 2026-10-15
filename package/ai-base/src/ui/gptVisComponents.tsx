import { CodeHighlighter } from '@ant-design/x';
import { GPTVis } from '@antv/gpt-vis';
import { Skeleton } from 'antd';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';

const VIS_CHART_LANGS = new Set(['vis-chart', 'vis', 'gpt-vis']);

function extractChildText(children: ReactNode): string {
  if (Array.isArray(children) && children.length > 0) {
    const first = children[0];
    if (typeof first === 'string') return first;
    if (typeof first === 'number') return String(first);
  }
  if (typeof children === 'string') return children;
  return '';
}

function parseChartConfig(text: string): Record<string, unknown> | string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('vis ') || trimmed.startsWith('vis\n')) {
    return trimmed;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

interface GptVisContainerProps {
  config: Record<string, unknown> | string | null;
  streamStatus?: string;
  height?: number;
}

function GptVisContainer({ config, streamStatus, height = 320 }: GptVisContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<GPTVis | null>(null);
  const isLoading = streamStatus === 'loading' || !config;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || isLoading || !config) return;

    instanceRef.current?.destroy();
    const width = el.clientWidth > 0 ? el.clientWidth : 560;
    const vis = new GPTVis({ container: el, width, height });
    instanceRef.current = vis;
    vis.render(config);

    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [config, isLoading, height]);

  if (isLoading) {
    return <Skeleton.Image active style={{ width: '100%', maxWidth: 560, height }} />;
  }

  return <div ref={containerRef} style={{ width: '100%', minHeight: height, margin: '12px 0' }} />;
}

function createCustomTagChart(defaultType: string) {
  function MarkdownChart(props: Record<string, unknown>) {
    const streamStatus = String(props.streamStatus || 'done');
    const axisXTitle = String(props['data-axis-x-title'] || '');
    const axisYTitle = String(props['data-axis-y-title'] || '');
    const title = String(props['data-title'] || props.title || '');

    const config = useMemo(() => {
      if (streamStatus === 'loading') return null;
      const raw = extractChildText(props.children as ReactNode);
      if (!raw.trim()) return null;
      try {
        const data = JSON.parse(raw.trim());
        return {
          type: defaultType,
          data,
          ...(axisXTitle ? { axisXTitle } : {}),
          ...(axisYTitle ? { axisYTitle } : {}),
          ...(title ? { title } : {}),
        };
      } catch {
        return null;
      }
    }, [streamStatus, props.children, axisXTitle, axisYTitle, title]);

    if (!config && streamStatus === 'done') {
      return <div className="aibase-chart-parse-error">图表数据解析失败</div>;
    }

    return <GptVisContainer config={config} streamStatus={streamStatus} />;
  }
  MarkdownChart.displayName = `MarkdownChart_${defaultType}`;
  return MarkdownChart;
}

function VisChartCodeBlock(props: Record<string, unknown>) {
  const lang = String(props.lang || '');
  const streamStatus = String(props.streamStatus || 'done');
  const isBlock = props.block === true;
  const code = extractChildText(props.children as ReactNode);

  if (isBlock && (VIS_CHART_LANGS.has(lang) || lang.startsWith('vis'))) {
    const config = streamStatus === 'loading' ? null : parseChartConfig(code);
    return <GptVisContainer config={config} streamStatus={streamStatus} />;
  }

  if (!isBlock) {
    return <code>{code}</code>;
  }

  return <CodeHighlighter lang={lang || undefined}>{code}</CodeHighlighter>;
}
VisChartCodeBlock.displayName = 'VisChartCodeBlock';

export const markdownChartComponents = {
  'custom-line': createCustomTagChart('line'),
  'custom-column': createCustomTagChart('column'),
  'custom-pie': createCustomTagChart('pie'),
  code: VisChartCodeBlock,
};
