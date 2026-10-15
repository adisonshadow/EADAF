import type { PlanningNextMovesSegment } from '../chat/chatToolSteps';

/**
 * Planning next moves 过程态：标题与 in_progress 任务名扫光，非执行内容本身。
 */
export default function PlanningNextMovesBlock({ segment }: { segment: PlanningNextMovesSegment }) {
  const active = segment.items.some((item) => item.status === 'in_progress');
  return (
    <div className="aibase-planning-next-moves">
      <div className={active ? 'aibase-text-shine' : 'aibase-planning-next-moves-title'}>
        {segment.title}
      </div>
      <ul className="aibase-planning-next-moves-list">
        {segment.items.map((item) => (
          <li key={item.id} className={`is-${item.status}`}>
            <span className={item.status === 'in_progress' ? 'aibase-text-shine' : undefined}>
              {item.label || item.id}
            </span>
          </li>
        ))}
      </ul>
      {segment.hint ? <div className="aibase-planning-next-moves-hint">{segment.hint}</div> : null}
    </div>
  );
}
