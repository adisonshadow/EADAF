import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  CodeOutlined,
  DownOutlined,
  InfoCircleFilled,
  LoadingOutlined,
  NodeIndexOutlined,
  RightOutlined,
  RocketOutlined,
  TableOutlined,
  ToolOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { ChatToolStep } from '../../chat/chatToolSteps';
import {
  getInvocationPresentation,
  surfacesRegistry,
} from '../../runtime/surfacesRegistry';
import type { InvocationIcon, InvocationPresentation } from '../../runtime/surfacesTypes';
import ToolResultSurface from '../ToolResultSurface';
import { payloadToPreviewText } from '../payloadToPreviewText';
import './InvocationCard.css';

const LINE_HEIGHT_PX = 18;

function cx(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

function resolveIcon(icon: InvocationIcon, className?: string) {
  const props = { className };
  switch (icon) {
    case 'skill':
      return <RocketOutlined {...props} />;
    case 'http':
      return <ApiOutlined {...props} />;
    case 'code':
      return <CodeOutlined {...props} />;
    case 'plan':
      return <UnorderedListOutlined {...props} />;
    case 'table':
      return <TableOutlined {...props} />;
    case 'write':
      return <ToolOutlined {...props} />;
    case 'nav':
      return <NodeIndexOutlined {...props} />;
    default:
      return <ToolOutlined {...props} />;
  }
}

function StatusIcon({
  status,
  icon,
  hovering,
  expanded,
}: {
  status: ChatToolStep['status'];
  icon: InvocationIcon;
  hovering: boolean;
  expanded: boolean;
}) {
  if (hovering) {
    return expanded ? (
      <DownOutlined className="aibase-inv-icon-chevron" />
    ) : (
      <RightOutlined className="aibase-inv-icon-chevron" />
    );
  }
  if (status === 'loading') {
    return <LoadingOutlined className="aibase-inv-icon-running" spin />;
  }
  if (status === 'success') {
    return <CheckCircleFilled className="aibase-inv-icon-success" />;
  }
  if (status === 'business_error') {
    return <InfoCircleFilled className="aibase-inv-icon-business-error" />;
  }
  if (status === 'error') {
    return <CloseCircleFilled className="aibase-inv-icon-error" />;
  }
  return resolveIcon(icon, 'aibase-inv-icon-base');
}

function formatDisplayName(title: string, subtitle?: string): string {
  if (!subtitle) return title;
  return `${title} · ${subtitle}`;
}

function InBlock({ label, value }: { label: string; value: unknown }) {
  const text =
    typeof value === 'string' ? value : payloadToPreviewText(value);
  return (
    <div className="aibase-inv-pane">
      <div className="aibase-inv-pane-label">{label}</div>
      <pre className="aibase-inv-pane-body">
        <code>{text}</code>
      </pre>
    </div>
  );
}

function ContentBody({
  step,
  presentation,
}: {
  step: ChatToolStep;
  presentation: InvocationPresentation;
}) {
  const mode = presentation.contentMode;
  const args = step.args;
  const display = step.display;
  const CustomKind = display?.kind
    ? surfacesRegistry.getKindComponent(display.kind)
    : undefined;

  const out = CustomKind && display ? (
    <CustomKind display={display} />
  ) : (
    <ToolResultSurface display={display} />
  );

  if (mode === 'request_response') {
    const data =
      display?.payload && typeof display.payload === 'object'
        ? (display.payload as Record<string, unknown>)
        : null;
    const method =
      (typeof args?.method === 'string' && args.method.toUpperCase()) ||
      (typeof data?.method === 'string' && String(data.method).toUpperCase()) ||
      'GET';
    const path =
      (typeof args?.path === 'string' && args.path) ||
      (typeof data?.path === 'string' && String(data.path)) ||
      (typeof args?.url === 'string' && args.url) ||
      '';
    const status = typeof data?.status === 'number' ? data.status : undefined;
    return (
      <div className="aibase-inv-content-mode">
        <InBlock label="请求" value={`${method} ${path}`} />
        {display?.visibility !== 'result_hidden' ? (
          <div className="aibase-inv-pane">
            <div className="aibase-inv-pane-label">
              响应{status != null ? ` · ${status}` : ''}
            </div>
            <div className="aibase-inv-pane-body-wrap">{out}</div>
          </div>
        ) : null}
      </div>
    );
  }

  if (mode === 'in_out') {
    const code =
      typeof args?.code === 'string'
        ? args.code
        : typeof args?.script === 'string'
          ? args.script
          : args;
    return (
      <div className="aibase-inv-content-mode">
        {args ? <InBlock label="输入" value={code} /> : null}
        {display?.visibility !== 'result_hidden' ? (
          <div className="aibase-inv-pane">
            <div className="aibase-inv-pane-label">输出</div>
            <div className="aibase-inv-pane-body-wrap">{out}</div>
          </div>
        ) : null}
      </div>
    );
  }

  // name_output：仅 OUT（标题栏已有 name）
  if (display?.visibility === 'result_hidden') return null;
  return <div className="aibase-inv-content-mode">{out}</div>;
}

export interface InvocationCardProps {
  step: ChatToolStep;
}

/**
 * 统一 Tool/Action 调用卡片：标题栏 + 可折叠内容区。
 * 折叠策略完全由 presentation 清单驱动。
 */
export default function InvocationCard({ step }: InvocationCardProps) {
  const presentation = useMemo(
    () => step.presentation || getInvocationPresentation(step.functionName),
    [step.presentation, step.functionName],
  );

  const title = step.title || presentation.title;
  const subtitle = step.subtitle;
  const loading = step.status === 'loading';

  const defaultCollapsed = loading
    ? presentation.collapseDuring
    : (step.display?.collapsed ?? presentation.collapseAfter);

  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const [hovering, setHovering] = useState(false);

  // 状态变化时按清单重置折叠（用户手动展开后，下一状态仍可再收）
  useEffect(() => {
    setExpanded(!defaultCollapsed);
  }, [defaultCollapsed, step.status, step.id]);

  const previewLines =
    step.display?.previewLines ?? presentation.collapsedPreviewLines;
  const hideOut = step.display?.visibility === 'result_hidden';
  const showIn =
    (presentation.contentMode === 'in_out' ||
      presentation.contentMode === 'request_response') &&
    !!step.args;
  const showBody = (!hideOut && !!step.display) || showIn;

  const toggle = useCallback(() => {
    if (!showBody) return;
    setExpanded((v) => !v);
  }, [showBody]);
  // 折叠且 previewLines>0：同一份内容做 max-height 裁切，不另渲截断 JSON
  const collapsedPreview =
    !expanded && previewLines > 0 && showBody;
  const fullyCollapsed = !expanded && previewLines <= 0;

  const durationTip =
    typeof step.durationMs === 'number'
      ? `${step.durationMs}ms`
      : loading
        ? '执行中…'
        : undefined;

  const headerTitle = (
    <span className={cx('aibase-inv-title', loading && 'aibase-text-shine')}>
      {title}
      {subtitle ? (
        <>
          <span className="aibase-inv-sep"> · </span>
          <span className="aibase-inv-subtitle">{subtitle}</span>
        </>
      ) : null}
    </span>
  );

  return (
    <div
      className={cx(
        'aibase-invocation-card',
        step.status === 'business_error' && 'is-business-error',
        step.status === 'error' && 'is-error',
        loading && 'is-loading',
        expanded && 'is-expanded',
      )}
    >
      <Tooltip title={durationTip} placement="topLeft">
        <button
          type="button"
          className="aibase-inv-header"
          aria-expanded={expanded}
          onClick={toggle}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <span className="aibase-inv-icon-slot t-icon-swap" data-state={hovering ? 'b' : 'a'}>
            <span className="t-icon" data-icon="a">
              <StatusIcon
                status={step.status}
                icon={presentation.icon}
                hovering={false}
                expanded={expanded}
              />
            </span>
            <span className="t-icon" data-icon="b">
              <StatusIcon
                status={step.status}
                icon={presentation.icon}
                hovering
                expanded={expanded}
              />
            </span>
          </span>
          {headerTitle}
        </button>
      </Tooltip>

      {showBody && !fullyCollapsed ? (
        <div
          className={cx('aibase-inv-panel', collapsedPreview && 'is-preview')}
          style={
            collapsedPreview
              ? {
                  maxHeight: previewLines * LINE_HEIGHT_PX + 8,
                }
              : {
                  maxHeight: presentation.maxHeight,
                }
          }
        >
          <div
            className="aibase-inv-panel-scroll"
            style={
              expanded
                ? { maxHeight: presentation.maxHeight, overflow: 'auto' }
                : collapsedPreview
                  ? { maxHeight: previewLines * LINE_HEIGHT_PX + 8, overflow: 'hidden' }
                  : undefined
            }
          >
            <ContentBody step={step} presentation={presentation} />
          </div>
          {collapsedPreview ? <div className="aibase-inv-fade" aria-hidden /> : null}
        </div>
      ) : null}

      {/* 无障碍：保留完整 displayName 文本供复制提取 */}
      <span className="aibase-inv-sr-only">
        {step.displayName || formatDisplayName(title, subtitle)}
      </span>
    </div>
  );
}
