import { presentToolCall } from '../runtime/surfacesRegistry';
import { UPDATE_PLAN_TOOL } from '../registry/builtinTools';
import type { PlanItem } from '../types';
import type { AssistantSegment, ChatToolStep, PlanningItemView } from './chatToolSteps';
import { upsertSegment } from './chatToolSteps';

/** 首次生成清单卡的标题 */
export const PLAN_CARD_TITLE = '生成任务清单';
/** 后续更新清单卡的标题 */
export const PLAN_CARD_TITLE_UPDATE = '更新任务清单';

/** 折叠后仍保留的预览行数（清单卡默认展开，用户手动收起时留 3 行） */
const PLAN_PREVIEW_LINES = 3;

/** 清单卡对应的 segment 形态（tool 段 + planning 展示） */
type PlanCardSegment = Extract<AssistantSegment, { kind: 'tool' }>;

export function toPlanItemsView(plan: PlanItem[]): PlanningItemView[] {
  return plan.map((item) => ({
    id: item.id,
    label: item.content,
    status: item.status,
  }));
}

/**
 * 清单卡副标题 `(x/y)`：
 * - y = 清单总项数
 * - x = 当前进行中的第几项；没有进行中项时，取「下一个待办是第几项」
 *   （全部完成时就是 y/y，所以 (3/3) 一定表示三步都已完成或正在做最后一步）
 *
 * 这样「生成任务清单 (1/3) → 更新任务清单 (2/3) → 更新任务清单 (3/3)」与卡片里
 * 「已完成 ✓ / 进行中 ⊙ / 待办 〇」的分布始终自洽。
 */
export function planStepProgress(plan: PlanItem[]): {
  completed: number;
  total: number;
  step: number;
  label: string;
} {
  const total = plan.length;
  const completed = plan.filter((item) => item.status === 'completed').length;
  const activeIndex = plan.findIndex((item) => item.status === 'in_progress');
  const activeStep = activeIndex >= 0 ? activeIndex + 1 : 0;
  let step: number;
  if (activeStep > 0) {
    step = Math.max(activeStep, completed);
  } else if (completed >= total) {
    step = total;
  } else {
    // 模型没标 in_progress：按「已完成的下一项」显示，避免出现 (0/3) 这种空进度
    step = completed + 1;
  }
  return { completed, total, step, label: `(${step}/${total})` };
}

/** 是否为「任务清单」卡（update_plan 与自动对账都写 planning 展示） */
export function isPlanCardSegment(segment: AssistantSegment): segment is PlanCardSegment {
  return segment.kind === 'tool' && segment.step.display?.kind === 'planning';
}

/** 读取清单卡当前的条目（副本，便于纯函数式改写） */
function planCardItems(segment: PlanCardSegment): PlanningItemView[] {
  const payload = segment.step.display?.payload;
  if (!payload || typeof payload !== 'object') return [];
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    const row = (item && typeof item === 'object' ? item : {}) as {
      id?: unknown;
      label?: unknown;
      status?: unknown;
    };
    const status =
      row.status === 'completed' || row.status === 'in_progress' ? row.status : 'pending';
    return {
      id: typeof row.id === 'string' ? row.id : String(index),
      label: typeof row.label === 'string' ? row.label : '',
      status,
    };
  });
}

/** 状态指纹：id + 状态 + 文案完全一致才算「同一份清单」 */
function planSignature(items: PlanningItemView[]): string {
  return items.map((item) => `${item.id}:${item.status}:${item.label}`).join('|');
}

function planCardIndexes(segments: AssistantSegment[]): number[] {
  const indexes: number[] = [];
  segments.forEach((segment, index) => {
    if (isPlanCardSegment(segment)) indexes.push(index);
  });
  return indexes;
}

function lastPlanCardIndex(segments: AssistantSegment[]): number {
  const indexes = planCardIndexes(segments);
  return indexes.length ? indexes[indexes.length - 1] : -1;
}

/**
 * 冻结一张历史清单卡：卡里残留的「进行中」一律收敛掉。
 * - 新计划里该项已完成 → ✓
 * - 否则（该步没做完 / 清单被重写）→ 〇
 *
 * 保证「历史卡永远不会一直转圈」，只有最新一张（live）卡允许出现进行中样式。
 */
function freezePlanCard(segment: PlanCardSegment, plan: PlanItem[]): PlanCardSegment {
  const items = planCardItems(segment);
  if (!items.length) return segment;
  const byId = new Map(plan.map((item) => [item.id, item]));
  let changed = false;
  const frozen = items.map((item) => {
    if (item.status !== 'in_progress') return item;
    changed = true;
    const next = byId.get(item.id);
    return {
      ...item,
      status: next?.status === 'completed' ? ('completed' as const) : ('pending' as const),
    };
  });
  if (!changed) return segment;
  const payload =
    segment.step.display && typeof segment.step.display.payload === 'object'
      ? (segment.step.display.payload as Record<string, unknown>)
      : {};
  return {
    ...segment,
    step: {
      ...segment.step,
      display: segment.step.display
        ? {
            ...segment.step.display,
            payload: { ...payload, items: frozen },
          }
        : undefined,
    },
  };
}

/** 用最新 plan 重写一张清单卡的条目 / 副标题（保持标题与位置） */
function rewritePlanCard(
  segment: PlanCardSegment,
  plan: PlanItem[],
  titleOverride?: string,
): PlanCardSegment {
  const title = titleOverride || segment.step.title || PLAN_CARD_TITLE;
  const items = toPlanItemsView(plan);
  const { label } = planStepProgress(plan);
  const payload =
    segment.step.display && typeof segment.step.display.payload === 'object'
      ? (segment.step.display.payload as Record<string, unknown>)
      : {};
  return {
    ...segment,
    step: {
      ...segment.step,
      title,
      subtitle: label,
      displayName: `${title} · ${label}`,
      presentation: segment.step.presentation
        ? { ...segment.step.presentation, title }
        : segment.step.presentation,
      display: segment.step.display
        ? {
            ...segment.step.display,
            payload: { ...payload, items, message: `${title} · ${label}` },
          }
        : undefined,
    },
  };
}

let planCardSeq = 0;

/** 清单卡 id：必须全局唯一（同一回合多次 update_plan / 对账都不能互相覆盖） */
function nextPlanCardId(): string {
  planCardSeq += 1;
  return `plan-card-${Date.now().toString(36)}-${planCardSeq}`;
}

/**
 * 造一张清单卡（标题 + `(x/y)` + 条目列表）。
 *
 * 与普通 Tool 卡的区别：
 * - 始终以展开态出现，用户直接在对话里看到条目，不用点开
 * - `visibility: sticky`：下一条 Tool 开始时不自动收起（清单是进度信息，不是过程噪音）
 */
function buildPlanCardStep(plan: PlanItem[], title: string): ChatToolStep {
  const items = toPlanItemsView(plan);
  const { label } = planStepProgress(plan);
  const basePresentation = presentToolCall(UPDATE_PLAN_TOOL, {
    mode: 'update',
    plan,
  }).presentation;
  return {
    id: nextPlanCardId(),
    functionName: UPDATE_PLAN_TOOL,
    displayName: `${title} · ${label}`,
    title,
    subtitle: label,
    presentation: {
      ...basePresentation,
      title,
      collapseDuring: false,
      collapseAfter: false,
      collapsedPreviewLines: PLAN_PREVIEW_LINES,
    },
    status: 'success',
    durationMs: 0,
    display: {
      kind: 'planning',
      payload: { items, message: `${title} · ${label}` },
      collapsed: false,
      previewLines: PLAN_PREVIEW_LINES,
      visibility: 'sticky',
    },
  };
}

export interface PlanSnapshotOptions {
  /** 本次是首次生成还是进度更新（决定标题文案） */
  mode?: 'create' | 'update';
  /**
   * 触发来源：
   * - `tool`：模型显式调用 update_plan（每次调用都应留下一个进度快照）
   * - `reconcile`：每轮工具结束后的自动对账（只在「有新的一步开始了」时新增快照，
   *   否则就地刷新最后一张，避免最后一步跑完时多出一张无意义的卡）
   */
  source?: 'tool' | 'reconcile';
}

/**
 * 把最新 plan 落成对话里的「任务清单」卡。
 *
 * 规则（对应 UI 三条约定的「进行中只允许出现在最后一张」）：
 * 1. 状态与最后一张卡完全一致 → 不重复出卡（模型反复 merge 同状态时不会堆叠）
 * 2. 需要新快照 → 先把历史卡全部冻结（残留 in_progress 收敛成 ✓ / 〇），再追加新卡
 * 3. 无需新快照（例如最后一项刚完成、没有新的进行中项）→ 就地刷新最后一张
 *
 * 纯函数：输入输出都是 segments 数组，便于单测（见 planSegments.verify.ts）。
 */
export function appendPlanSnapshot(
  segments: AssistantSegment[],
  plan: PlanItem[],
  options: PlanSnapshotOptions = {},
): AssistantSegment[] {
  if (!plan.length) return segments;

  const source = options.source ?? 'reconcile';
  const title = options.mode === 'create' ? PLAN_CARD_TITLE : PLAN_CARD_TITLE_UPDATE;
  const signature = planSignature(toPlanItemsView(plan));

  const lastIndex = lastPlanCardIndex(segments);
  const lastSegment = lastIndex >= 0 ? segments[lastIndex] : undefined;
  const lastItems =
    lastSegment && isPlanCardSegment(lastSegment) ? planCardItems(lastSegment) : [];

  // 1) 同一份清单（含状态）已经在对话里了
  if (lastSegment && planSignature(lastItems) === signature) return segments;

  const lastActiveId = lastItems.find((item) => item.status === 'in_progress')?.id;
  const nextActiveId = plan.find((item) => item.status === 'in_progress')?.id;
  const startsNewStep = Boolean(nextActiveId) && nextActiveId !== lastActiveId;
  const shouldAppend = lastIndex < 0 || source === 'tool' || startsNewStep;

  // 3) 就地刷新最后一张（它的标题保持生成 / 更新不变）
  if (!shouldAppend) {
    const lastTitle =
      lastSegment && isPlanCardSegment(lastSegment) ? lastSegment.step.title : title;
    return segments.map((segment, index) => {
      if (!isPlanCardSegment(segment)) return segment;
      if (index === lastIndex) return rewritePlanCard(segment, plan, lastTitle);
      return freezePlanCard(segment, plan);
    });
  }

  // 2) 追加新快照：历史卡一律冻结，只有新卡是 live
  const frozen = segments.map((segment) =>
    isPlanCardSegment(segment) ? freezePlanCard(segment, plan) : segment,
  );
  const card = buildPlanCardStep(plan, title);
  return upsertSegment(frozen, { kind: 'tool', id: card.id, step: card });
}

/**
 * 回合结束（success / error / abort / 等待用户选择）时的收尾：
 * - 最后一张卡刷成最终 plan（丢掉「还在跑」的错觉）
 * - **所有**清单卡里不允许再出现进行中样式（最后一项若仍未完成 → 〇）
 *
 * 进行中状态的权威来源仍在会话级 store（头部「计划」Popover 不受影响）。
 */
export function finalizePlanSnapshots(
  segments: AssistantSegment[],
  plan: PlanItem[],
): AssistantSegment[] {
  const lastIndex = lastPlanCardIndex(segments);
  if (lastIndex < 0) return segments;
  return segments.map((segment, index) => {
    if (!isPlanCardSegment(segment)) return segment;
    const rebuilt =
      index === lastIndex && plan.length
        ? rewritePlanCard(segment, plan, segment.step.title || PLAN_CARD_TITLE_UPDATE)
        : segment;
    return freezePlanCard(rebuilt, plan);
  });
}
