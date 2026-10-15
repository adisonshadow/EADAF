import type { PlanningNextMovesSegment } from '../chat/chatToolSteps';

const statusLabel = (s: string) => {
  switch (s) {
    case 'in_progress':
      return '进行中';
    case 'completed':
      return '已完成';
    case 'pending':
    default:
      return '待办';
  }
};

/**
 * Planning next moves 段的确定性 markdown 渲染（用于 UI 回归断言）。
 * 注意：尽量保持与 AssistantSegments 里的展示格式一致。
 */
export function planningNextMovesToMarkdown(segment: PlanningNextMovesSegment): string {
  const items = segment.items?.length
    ? segment.items
        .slice(0, 6)
        .map((it) => `- ${statusLabel(it.status)}：${it.label}`)
        .join('\n')
    : '- 无计划项';

  const hint = segment.hint?.trim();
  return hint ? `**${segment.title}**\n${items}\n\n> ${hint}` : `**${segment.title}**\n${items}`;
}

