import { presentToolCall } from '../runtime/surfacesRegistry';
import { UPDATE_PLAN_TOOL } from '../registry/builtinTools';
import type { PlanItem } from '../types';
import type { AssistantSegment, ChatToolStep, PlanningItemView } from './chatToolSteps';
import { upsertSegment } from './chatToolSteps';

/** 任务清单卡的标题文案（对话里显示为「任务清单 · (1/3)」） */
export const PLAN_CARD_TITLE = '任务清单';

export function toPlanItemsView(plan: PlanItem[]): PlanningItemView[] {
  return plan.map((item) => ({
    id: item.id,
    label: item.content,
    status: item.status,
  }));
}

export function planProgress(plan: PlanItem[]): { completed: number; total: number; label: string } {
  const completed = plan.filter((item) => item.status === 'completed').length;
  return { completed, total: plan.length, label: `(${completed}/${plan.length})` };
}

/** 是否为「任务清单」卡（update_plan 与自动对账都写 planning 展示） */
export function isPlanCardSegment(
  segment: AssistantSegment,
): segment is Extract<AssistantSegment, { kind: 'tool' }> {
  return segment.kind === 'tool' && segment.step.display?.kind === 'planning';
}

function buildPlanCard(plan: PlanItem[]): ChatToolStep {
  const items = toPlanItemsView(plan);
  const { label } = planProgress(plan);
  const id = `plan-progress-${Date.now()}`;
  const planPresentation = presentToolCall(UPDATE_PLAN_TOOL, { mode: 'update', plan }).presentation;
  return {
    id,
    functionName: UPDATE_PLAN_TOOL,
    displayName: `${PLAN_CARD_TITLE} · ${label}`,
    title: PLAN_CARD_TITLE,
    subtitle: label,
    presentation: {
      ...planPresentation,
      title: PLAN_CARD_TITLE,
      collapseAfter: true,
      collapsedPreviewLines: 0,
    },
    status: 'success',
    durationMs: 0,
    display: {
      kind: 'planning',
      payload: { items, message: `${PLAN_CARD_TITLE} · ${label}` },
      // 进度卡一律以折叠态出现：用户要看再点开
      collapsed: true,
      visibility: 'transient',
    },
  };
}

/**
 * 把最新 plan 写进对话里的「任务清单」卡，并让它自动收起。
 *
 * - 当前消息里已有清单卡：就地更新条目状态 + 副标题 `(已完成/总数)`，**全部历史清单卡一起收起**
 *   （否则第一张会一直停在生成时的展开态、状态也停在旧值）
 * - 当前消息里没有（plan 来自上一回合）：补一张折叠的进度卡
 *
 * 纯函数：输入输出都是 segments 数组，便于单测（见 planSegments.verify.ts）。
 */
export function syncPlanSegments(
  segments: AssistantSegment[],
  plan: PlanItem[],
): AssistantSegment[] {
  if (!plan.length) return segments;
  const items = toPlanItemsView(plan);
  const { label } = planProgress(plan);

  let targetIndex = -1;
  segments.forEach((segment, index) => {
    if (isPlanCardSegment(segment)) targetIndex = index;
  });

  if (targetIndex < 0) {
    const card = buildPlanCard(plan);
    return upsertSegment(segments, { kind: 'tool', id: card.id, step: card });
  }

  const target = segments[targetIndex];
  if (!isPlanCardSegment(target) || !target.step.display) return segments;
  const title = target.step.title || PLAN_CARD_TITLE;
  const prevPayload =
    target.step.display.payload && typeof target.step.display.payload === 'object'
      ? (target.step.display.payload as Record<string, unknown>)
      : {};

  return segments.map((segment, index) => {
    if (!isPlanCardSegment(segment) || !segment.step.display) return segment;
    if (index !== targetIndex) {
      return { ...segment, step: { ...segment.step, display: { ...segment.step.display, collapsed: true } } };
    }
    return {
      ...segment,
      step: {
        ...segment.step,
        subtitle: label,
        displayName: `${title} · ${label}`,
        display: {
          ...segment.step.display,
          payload: { ...prevPayload, items, message: `${title} · ${label}` },
          collapsed: true,
        },
      },
    };
  });
}
