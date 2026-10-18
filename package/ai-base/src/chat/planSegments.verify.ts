/**
 * 任务清单卡回归：每个进度快照一张卡、进行中只出现在最后一张、结束不留进行中样式。
 * node --import tsx src/chat/planSegments.verify.ts
 */
import assert from 'node:assert/strict';
import type { AssistantSegment } from './chatToolSteps';
import type { PlanItem } from '../types';
import {
  appendPlanSnapshot,
  finalizePlanSnapshots,
  isPlanCardSegment,
  planStepProgress,
  toPlanItemsView,
} from './planSegments';

function planCardSegments(segments: AssistantSegment[]) {
  return segments.filter(isPlanCardSegment);
}

function itemsOf(segment: AssistantSegment) {
  if (!isPlanCardSegment(segment)) throw new Error('不是任务清单卡');
  const payload = segment.step.display?.payload as {
    items: Array<{ id: string; label: string; status: string }>;
  };
  return payload.items;
}

function statusLine(segment: AssistantSegment): string {
  return itemsOf(segment)
    .map((item) => (item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '⊙' : '〇'))
    .join('');
}

function textSegment(id: string): AssistantSegment {
  return { kind: 'text', id, content: 'hi' };
}

const step1: PlanItem[] = [
  { id: 't1', content: '任务1', status: 'in_progress' },
  { id: 't2', content: '任务2', status: 'pending' },
  { id: 't3', content: '任务3', status: 'pending' },
];
const step2: PlanItem[] = [
  { id: 't1', content: '任务1', status: 'completed' },
  { id: 't2', content: '任务2', status: 'in_progress' },
  { id: 't3', content: '任务3', status: 'pending' },
];
const step3: PlanItem[] = [
  { id: 't1', content: '任务1', status: 'completed' },
  { id: 't2', content: '任务2', status: 'completed' },
  { id: 't3', content: '任务3', status: 'in_progress' },
];
const stepAllDone: PlanItem[] = step3.map((item) => ({ ...item, status: 'completed' as const }));

// 1) (x/y) = 当前进行中第几项 / 总数；全部完成即 y/y
assert.equal(planStepProgress(step1).label, '(1/3)');
assert.equal(planStepProgress(step2).label, '(2/3)');
assert.equal(planStepProgress(step3).label, '(3/3)');
assert.equal(planStepProgress(stepAllDone).label, '(3/3)');
assert.equal(planStepProgress([]).label, '(0/0)');
// 模型没标 in_progress（全是 pending）时按「下一个待办是第几项」显示，不出现 (0/3)
assert.equal(
  planStepProgress([
    { id: 't1', content: '任务1', status: 'pending' },
    { id: 't2', content: '任务2', status: 'pending' },
    { id: 't3', content: '任务3', status: 'pending' },
  ]).label,
  '(1/3)',
);

// 2) 模型显式 update_plan：每次调用都留一张快照卡，且卡片默认展开 + sticky
{
  let segments: AssistantSegment[] = [textSegment('text-1')];
  segments = appendPlanSnapshot(segments, step1, { mode: 'create', source: 'tool' });
  assert.equal(planCardSegments(segments).length, 1);
  const first = planCardSegments(segments)[0];
  assert.equal(first.step.title, '生成任务清单');
  assert.equal(first.step.subtitle, '(1/3)');
  assert.equal(first.step.displayName, '生成任务清单 · (1/3)');
  assert.equal(first.step.display?.collapsed, false);
  assert.equal(first.step.display?.visibility, 'sticky');
  assert.equal(statusLine(first), '⊙〇〇');

  segments = appendPlanSnapshot(segments, step2, { mode: 'update', source: 'tool' });
  const cards = planCardSegments(segments);
  assert.equal(cards.length, 2, '第二次 update_plan 必须新增一张卡');
  assert.equal(cards[1].step.title, '更新任务清单');
  assert.equal(cards[1].step.subtitle, '(2/3)');
  assert.equal(statusLine(cards[1]), '✓⊙〇');
  // 历史卡冻结：进行中项一旦被新计划标完成 → ✓，不再转圈
  assert.equal(statusLine(cards[0]), '✓〇〇');
  assert.equal(cards[0].step.subtitle, '(1/3)', '历史卡的 (x/y) 停留在它自己的快照');
}

// 3) 同一份清单被反复 merge（状态没变）→ 不堆叠多余的卡
{
  let segments: AssistantSegment[] = [];
  segments = appendPlanSnapshot(segments, step2, { mode: 'update', source: 'tool' });
  const before = segments;
  segments = appendPlanSnapshot(segments, step2, { mode: 'update', source: 'tool' });
  assert.equal(segments, before, '状态完全一致时零开销返回原引用');
  assert.equal(planCardSegments(segments).length, 1);
}

// 4) 自动对账：有新的一步开始 → 新增卡；最后一项收尾（没有新的进行中项）→ 就地刷新最后一张
{
  let segments: AssistantSegment[] = [textSegment('text-1')];
  segments = appendPlanSnapshot(segments, step1, { mode: 'create', source: 'tool' });
  segments = appendPlanSnapshot(segments, step2, { source: 'reconcile' });
  segments = appendPlanSnapshot(segments, step3, { source: 'reconcile' });
  let cards = planCardSegments(segments);
  assert.equal(cards.length, 3, '每一步推进各一张卡');
  assert.deepEqual(cards.map(statusLine), ['✓〇〇', '✓✓〇', '✓✓⊙']);

  // 最后一项完成：没有新的进行中项 → 就地更新第 3 张，不新增
  segments = appendPlanSnapshot(segments, stepAllDone, { source: 'reconcile' });
  cards = planCardSegments(segments);
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map(statusLine), ['✓〇〇', '✓✓〇', '✓✓✓']);
  assert.deepEqual(cards.map((card) => card.step.subtitle), ['(1/3)', '(2/3)', '(3/3)']);
  // 全程只有最后一张允许出现进行中样式
  assert.equal(
    cards.reduce(
      (count, card) => count + itemsOf(card).filter((item) => item.status === 'in_progress').length,
      0,
    ),
    0,
  );
}

// 5) 结束定稿：最后一张刷成最终 plan，且任何卡片都不允许残留进行中
{
  let segments: AssistantSegment[] = [];
  segments = appendPlanSnapshot(segments, step1, { mode: 'create', source: 'tool' });
  segments = appendPlanSnapshot(segments, step2, { source: 'reconcile' });
  // 回合在「任务2 进行中」时被打断（用户取消 / 报错 / 等待用户选择）
  const settled = finalizePlanSnapshots(segments, step2);
  const cards = planCardSegments(settled);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map(statusLine), ['✓〇〇', '✓〇〇']);
  assert.equal(
    cards.every((card) => itemsOf(card).every((item) => item.status !== 'in_progress')),
    true,
    '对话结束后不允许还有进行中的任务 item',
  );
}

// 6) 完成态的收尾：最后一张直接是全部 ✓
{
  let segments: AssistantSegment[] = [];
  segments = appendPlanSnapshot(segments, step1, { mode: 'create', source: 'tool' });
  segments = appendPlanSnapshot(segments, step2, { source: 'reconcile' });
  segments = appendPlanSnapshot(segments, step3, { source: 'reconcile' });
  const settled = finalizePlanSnapshots(segments, stepAllDone);
  const cards = planCardSegments(settled);
  assert.deepEqual(cards.map(statusLine), ['✓〇〇', '✓✓〇', '✓✓✓']);
  assert.deepEqual(cards.map((card) => card.step.subtitle), ['(1/3)', '(2/3)', '(3/3)']);
}

// 7) 纯函数：不就地改写入参
{
  const segments: AssistantSegment[] = [textSegment('text-1')];
  const next = appendPlanSnapshot(segments, step1, { mode: 'create', source: 'tool' });
  assert.equal(segments.length, 1);
  assert.equal(next.length, 2);
  assert.notEqual(next, segments);
}

// 8) 空 plan / 没有清单卡时不做任何事
{
  const segments: AssistantSegment[] = [textSegment('text-1')];
  assert.equal(appendPlanSnapshot(segments, []), segments);
  assert.equal(finalizePlanSnapshots(segments, step1), segments);
}

// 9) 卡片 id 唯一（同回合多次调用不能互相覆盖）
{
  const a = appendPlanSnapshot([], step1, { mode: 'create', source: 'tool' });
  const b = appendPlanSnapshot(a, step2, { mode: 'update', source: 'tool' });
  const ids = b.filter(isPlanCardSegment).map((segment) => segment.id);
  assert.equal(new Set(ids).size, ids.length);
}

// 10) toPlanItemsView 保留顺序与状态
assert.deepEqual(
  toPlanItemsView(step2).map((item) => `${item.id}:${item.status}`),
  ['t1:completed', 't2:in_progress', 't3:pending'],
);

console.log('planSegments.verify.ts: 任务清单快照卡 / 冻结进行中 / 结束定稿 回归通过');
