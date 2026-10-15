import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Table, Typography, Empty, Alert } from 'antd';
import type { ToolDisplay } from '../types/toolResponse';
import { payloadToPreviewText } from './payloadToPreviewText';
import './ToolResultSurface.css';

const { Text, Paragraph } = Typography;

function rowsToColumns(rows: unknown[]): { title: string; dataIndex: string; key: string; ellipsis: boolean }[] {
  const first = rows.find((r) => r && typeof r === 'object' && !Array.isArray(r)) as
    | Record<string, unknown>
    | undefined;
  if (!first) {
    return [{ title: 'value', dataIndex: 'value', key: 'value', ellipsis: true }];
  }
  return Object.keys(first)
    .filter((k) => !k.startsWith('_'))
    .slice(0, 12)
    .map((key) => ({ title: key, dataIndex: key, key, ellipsis: true }));
}

function renderPayloadJson(payload: unknown, previewLines?: number) {
  const text = payloadToPreviewText(payload, previewLines);
  return (
    <pre className="aibase-tool-surface-json">
      <code>{text}</code>
    </pre>
  );
}

function EntityView({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return renderPayloadJson(payload);
  }
  const row = payload as Record<string, unknown>;
  const entries = Object.entries(row)
    .filter(([, value]) => value !== undefined)
    .slice(0, 40);
  return (
    <dl className="aibase-tool-surface-entity">
      {entries.map(([key, value]) => (
        <div key={key} className="aibase-tool-surface-entity-row">
          <dt>{key}</dt>
          <dd>
            {typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
              ? String(value)
              : renderPayloadJson(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PlanningView({ payload }: { payload: unknown }) {
  const items =
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { items?: unknown }).items)
      ? ((payload as { items: Array<{ id?: string; label?: string; status?: string }> }).items)
      : [];
  if (!items.length) {
    const msg =
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { message?: string }).message === 'string'
        ? (payload as { message: string }).message
        : '任务清单已更新';
    return <Paragraph className="aibase-tool-surface-status">{msg}</Paragraph>;
  }
  return (
    <ul className="aibase-tool-surface-plan">
      {items.map((item, index) => {
        const status = String(item.status || 'pending');
        return (
          <li key={item.id || String(index)} className={`aibase-plan-item is-${status}`}>
            <span className="aibase-plan-item-icon" aria-hidden>
              {status === 'in_progress' ? (
                <span className="aibase-plan-dot-pulse" />
              ) : status === 'completed' ? (
                <svg className="aibase-plan-check" viewBox="0 0 16 16" width="14" height="14">
                  <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="M4.8 8.2 L7 10.3 L11.3 5.7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <span className="aibase-plan-dot-empty" />
              )}
            </span>
            <span className="aibase-plan-item-label">
              {status === 'in_progress' ? (
                <span className="aibase-text-shine">{item.label || item.id}</span>
              ) : (
                item.label || item.id
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export interface ToolResultSurfaceProps {
  display?: ToolDisplay;
}

class SurfaceErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ToolResultSurface] render failed', error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="aibase-tool-surface">
          <Alert type="warning" showIcon message="结果无法展示" description="已跳过损坏的工具结果，对话可继续。" />
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * 纯 body 渲染器：按 display.kind 选组件。
 * 折叠 / 标题栏由 InvocationCard 负责，此处不再套 Collapse、不重复 title。
 */
function ToolResultSurfaceInner({ display }: ToolResultSurfaceProps) {
  if (!display) return null;
  if (display.visibility === 'result_hidden') return null;

  const body = (() => {
    switch (display.kind) {
      case 'table': {
        const payload = display.payload as { rows?: unknown[]; total?: number; truncated?: boolean };
        const rows = Array.isArray(payload?.rows) ? payload.rows : [];
        if (!rows.length) {
          return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无数据" />;
        }
        const dataSource = rows.map((row, index) => {
          if (row && typeof row === 'object' && !Array.isArray(row)) {
            return { key: index, ...(row as object) };
          }
          return { key: index, value: row };
        });
        return (
          <>
            <Table
              size="small"
              pagination={rows.length > 10 ? { pageSize: 10, size: 'small' } : false}
              columns={rowsToColumns(rows)}
              dataSource={dataSource}
              scroll={{ x: true }}
            />
            {payload?.truncated ? (
              <Text type="secondary" className="aibase-tool-surface-hint">
                仅展示前 {rows.length} 条
              </Text>
            ) : null}
          </>
        );
      }
      case 'entity':
        return <EntityView payload={display.payload} />;
      case 'planning':
        return <PlanningView payload={display.payload} />;
      case 'empty': {
        const msg =
          display.payload &&
          typeof display.payload === 'object' &&
          typeof (display.payload as { message?: string }).message === 'string'
            ? (display.payload as { message: string }).message
            : '无数据';
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={msg} />;
      }
      case 'status': {
        const msg =
          display.payload &&
          typeof display.payload === 'object' &&
          typeof (display.payload as { message?: string }).message === 'string'
            ? (display.payload as { message: string }).message
            : '完成';
        return <Paragraph className="aibase-tool-surface-status">{msg}</Paragraph>;
      }
      case 'error': {
        const payload = (display.payload || {}) as {
          message?: string;
          hint?: string;
          code?: string;
        };
        return (
          <Alert
            type="error"
            showIcon
            message={payload.message || '执行失败'}
            description={payload.hint || (payload.code ? `code: ${payload.code}` : undefined)}
          />
        );
      }
      case 'json':
      default:
        return renderPayloadJson(display.payload);
    }
  })();

  return <div className="aibase-tool-surface aibase-tool-surface--body-only">{body}</div>;
}

/**
 * 按 display.kind 渲染用户可见结果正文（不按 tool 名特判）。
 * 单条 Surface 渲染失败不得打崩整页对话。
 */
export default function ToolResultSurface(props: ToolResultSurfaceProps) {
  return (
    <SurfaceErrorBoundary>
      <ToolResultSurfaceInner {...props} />
    </SurfaceErrorBoundary>
  );
}
