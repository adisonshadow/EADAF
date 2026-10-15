import type { NextStepItem } from '../a2ui/parseA2uiCommands';
import type { AssistantSegment } from './chatToolSteps';
import { upsertSegment } from './chatToolSteps';

export const NEXT_STEPS_SEGMENT_ID = 'next-steps-latest';
export const TASK_COMPLETE_SUMMARY_SEGMENT_ID = 'task-complete-summary';

const MAX_NEXT_STEPS = 5;
const MAX_LABEL_LEN = 29;

/** 规范化 task_complete.next_steps（去空、label 长度、最多 5 条） */
export function normalizeNextSteps(raw: unknown): NextStepItem[] {
  if (!Array.isArray(raw)) return [];
  const out: NextStepItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const label = typeof rec.label === 'string' ? rec.label.trim() : '';
    if (!id || !label || label.length > MAX_LABEL_LEN) continue;
    out.push({ id, label });
    if (out.length >= MAX_NEXT_STEPS) break;
  }
  return out;
}

export interface TaskCompleteDeliveryData {
  summary?: string;
  next_steps: NextStepItem[];
}

/** 从 task_complete args 生成回传给 UI / 模型的 data */
export function buildTaskCompleteDeliveryData(args: {
  summary?: string;
  next_steps?: unknown;
}): TaskCompleteDeliveryData {
  const summary = typeof args.summary === 'string' ? args.summary.trim() : '';
  const next_steps = normalizeNextSteps(args.next_steps);
  return {
    ...(summary ? { summary } : {}),
    next_steps,
  };
}

function hasNonEmptyTextSegment(segments: AssistantSegment[] | undefined): boolean {
  if (!segments?.length) return false;
  return segments.some(
    (seg) => seg.kind === 'text' && typeof seg.content === 'string' && seg.content.trim().length > 0,
  );
}

/**
 * 验收通过后写入交付 segment：
 * - next_steps → kind: 'next_steps'（按钮）
 * - 若尚无正文，用 summary 补一条 text（兜底）
 */
export function applyTaskCompleteDelivery(
  segments: AssistantSegment[] | undefined,
  data: unknown,
): AssistantSegment[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return segments ?? [];
  }
  const row = data as Record<string, unknown>;
  const nextSteps = normalizeNextSteps(row.next_steps);
  const summary = typeof row.summary === 'string' ? row.summary.trim() : '';

  let next = segments ? [...segments] : [];

  if (summary && !hasNonEmptyTextSegment(next)) {
    next = upsertSegment(next, {
      kind: 'text',
      id: TASK_COMPLETE_SUMMARY_SEGMENT_ID,
      content: summary,
    });
  }

  if (nextSteps.length > 0) {
    next = upsertSegment(next, {
      kind: 'next_steps',
      id: NEXT_STEPS_SEGMENT_ID,
      steps: nextSteps,
    });
  }

  return next;
}

/**
 * UI 选源：优先 task_complete 写入的 next_steps segment；
 * 否则降级到正文 a2ui-commands 围栏解析结果。二者不叠加。
 */
export function pickNextStepsForRender(
  segments: AssistantSegment[] | undefined,
  fenceSteps: NextStepItem[] | undefined,
): { source: 'segment' | 'fence' | null; steps: NextStepItem[] } {
  const seg = segments?.find(
    (item): item is Extract<AssistantSegment, { kind: 'next_steps' }> =>
      item.kind === 'next_steps',
  );
  if (seg?.steps?.length) {
    return { source: 'segment', steps: seg.steps };
  }
  if (fenceSteps?.length) {
    return { source: 'fence', steps: fenceSteps };
  }
  return { source: null, steps: [] };
}
