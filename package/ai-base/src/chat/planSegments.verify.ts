import assert from 'node:assert/strict';
import type { AssistantSegment, ChatToolStep } from './chatToolSteps';
import type { PlanItem } from '../types';
import { isPlanCardSegment, planProgress, syncPlanSegments, toPlanItemsView } from './planSegments';
import { UPDATE_PLAN_TOOL } from '../registry/builtinTools';

function planCard(id: string, plan: PlanItem[], collapsed: boolean): AssistantSegment {
  const step: ChatToolStep = {
    id,
    functionName: UPDATE_PLAN_TOOL,
    displayName: `生成任务清单`,
    title: '生成任务清单',
    status: 'success',
    display: {
      kind: 'planning',
      payload: { items: toPlanItemsView(plan), message: '生成任务清单' },
      collapsed,
    },
  };
  return { kind: 'tool', id, step };
}

function textSegment(id: string): AssistantSegment {
  return { kind: 'text', id, content: 'hi' };
}

const step1: PlanItem[] = [
  { id: 't1', content: '查订单', status: 'in_progress' },
  { id: 't2', content: '汇总', status: 'pending' },
];
const step1Done: PlanItem[] = [
  { id: 't1', content: '查订单', status: 'completed' },
  { id: 't2', content: '汇总', status: 'in_progress' },
];

// 1) 进度文案
assert.deepEqual(planProgress(step1Done), { completed: 1, total: 2, label: '(1/2)' });

// 2) 已有展开的清单卡 → 就地更新并收起
{
  const segments: AssistantSegment[] = [
    textSegment('text-1'),
    planCard('plan-1', step1, false),
  ];
  const next = syncPlanSegments(segments, step1Done);
  assert.equal(next.length, segments.length); // 不新增卡
  const card = next[1];
  assert.ok(isPlanCardSegment(card));
  assert.equal(card.step.display?.collapsed, true);
  assert.equal(card.step.subtitle, '(1/2)');
  assert.equal(card.step.displayName, '生成任务清单 · (1/2)');
  const payload = card.step.display?.payload as { items: Array<{ id: string; status: string }> };
  assert.equal(payload.items[0].status, 'completed');
  assert.equal(payload.items[1].status, 'in_progress');
  // 原数组未被就地改写（纯函数）
  assert.equal((segments[1] as Extract<AssistantSegment, { kind: 'tool' }>).step.display?.collapsed, false);
}

// 3) 多张清单卡（历史展开 + 新卡）→ 全部收起，只有最后一张刷新进度
{
  const segments: AssistantSegment[] = [
    planCard('plan-1', step1, false),
    textSegment('text-1'),
    planCard('plan-2', step1Done, false),
  ];
  const nextPlan: PlanItem[] = [
    { id: 't1', content: '查订单', status: 'completed' },
    { id: 't2', content: '汇总', status: 'completed' },
  ];
  const next = syncPlanSegments(segments, nextPlan);
  assert.equal(next.length, 3); // 不新增卡
  const [first, , last] = next;
  assert.ok(isPlanCardSegment(first) && isPlanCardSegment(last));
  assert.equal(first.step.display?.collapsed, true); // 历史卡也收起
  assert.equal(last.step.display?.collapsed, true);
  assert.equal(last.step.subtitle, '(2/2)');
  const lastPayload = last.step.display?.payload as { items: Array<{ status: string }> };
  assert.equal(lastPayload.items[1].status, 'completed');
}

// 4) 当前消息里没有清单卡（plan 来自上一回合）→ 补一张折叠卡
{
  const segments: AssistantSegment[] = [textSegment('text-1')];
  const next = syncPlanSegments(segments, step1Done);
  assert.equal(next.length, 2);
  const card = next[1];
  assert.ok(isPlanCardSegment(card));
  assert.equal(card.step.display?.collapsed, true);
  assert.equal(card.step.subtitle, '(1/2)');
  assert.equal(card.step.title, '任务清单');
}

// 5) 空 plan → 原引用返回（零开销）
{
  const segments: AssistantSegment[] = [textSegment('text-1')];
  assert.equal(syncPlanSegments(segments, []), segments);
}

console.log('planSegments.verify.ts: 任务清单卡就地更新 / 自动收起 回归通过');
