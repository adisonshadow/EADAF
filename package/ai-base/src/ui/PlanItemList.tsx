import type { PlanningItemView } from '../chat/chatToolSteps';

export interface PlanItemListProps {
  items: PlanningItemView[];
  /** 额外 className（例如放到头部 Popover 里时收紧边距） */
  className?: string;
}

/**
 * 任务清单列表（单一渲染源）：
 * - 对话里的「任务清单」调用卡片正文（ToolResultSurface · planning）
 * - 头部「计划」按钮的实时 Popover
 * 两处共用同一份标记与样式（`.aibase-tool-surface-plan` / `.aibase-plan-item`）。
 */
export default function PlanItemList({ items, className }: PlanItemListProps) {
  if (!items.length) return null;
  return (
    <ul className={className ? `aibase-tool-surface-plan ${className}` : 'aibase-tool-surface-plan'}>
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
