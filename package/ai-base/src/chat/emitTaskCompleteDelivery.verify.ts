/**
 * task_complete 交付链路（下一步建议）回归
 * node --import tsx src/chat/emitTaskCompleteDelivery.verify.ts
 */
import assert from 'node:assert/strict';
import {
  applyTaskCompleteDelivery,
  buildTaskCompleteDeliveryData,
  NEXT_STEPS_SEGMENT_ID,
  normalizeNextSteps,
  pickNextStepsForRender,
  TASK_COMPLETE_SUMMARY_SEGMENT_ID,
} from './emitTaskCompleteDelivery';
import type { AssistantSegment } from './chatToolSteps';

{
  const data = buildTaskCompleteDeliveryData({
    summary: '  已完成建模  ',
    next_steps: [
      { id: 'materialize', label: '执行物化' },
      { id: 'bad', label: '' },
      { id: '', label: '无 id' },
      { id: 'long', label: '一二三四五六七八九十壹贰叁肆伍陆柒捌玖廿卅甲乙丙丁戊己庚辛壬' },
      { id: 'create_api', label: '创建 CRUD API' },
      { id: 'extra1', label: '多余1' },
      { id: 'extra2', label: '多余2' },
      { id: 'extra3', label: '多余3' },
      { id: 'extra4', label: '多余4' },
    ],
  });
  assert.equal(data.summary, '已完成建模');
  assert.equal(data.next_steps.length, 5);
  assert.deepEqual(data.next_steps[0], { id: 'materialize', label: '执行物化' });
  assert.equal(data.next_steps.some((s) => s.id === 'long'), false);
  assert.equal(data.next_steps.some((s) => s.id === 'bad'), false);
}

{
  assert.deepEqual(normalizeNextSteps(null), []);
  assert.deepEqual(normalizeNextSteps('x'), []);
  const empty = buildTaskCompleteDeliveryData({ summary: '仅总结' });
  assert.equal(empty.summary, '仅总结');
  assert.deepEqual(empty.next_steps, []);
}

{
  // 无正文时用 summary 补 text + next_steps segment
  const segs = applyTaskCompleteDelivery([], {
    summary: '校验通过，阶段结束',
    next_steps: [
      { id: 'materialize', label: '执行物化' },
      { id: 'create_api', label: '创建 CRUD API' },
    ],
  });
  const text = segs.find((s) => s.kind === 'text');
  const next = segs.find((s) => s.kind === 'next_steps');
  assert.ok(text);
  assert.equal(text?.id, TASK_COMPLETE_SUMMARY_SEGMENT_ID);
  assert.equal(text && 'content' in text ? text.content : '', '校验通过，阶段结束');
  assert.ok(next);
  assert.equal(next?.id, NEXT_STEPS_SEGMENT_ID);
  assert.equal(next && next.kind === 'next_steps' ? next.steps.length : 0, 2);
}

{
  // 已有正文时不重复补 summary
  const prior: AssistantSegment[] = [
    { kind: 'text', id: 'text-round-2', content: '模型已校验通过。' },
  ];
  const segs = applyTaskCompleteDelivery(prior, {
    summary: '不应覆盖已有正文',
    next_steps: [{ id: 'refine', label: '继续完善字段' }],
  });
  assert.equal(segs.filter((s) => s.kind === 'text').length, 1);
  assert.equal(
    segs.find((s) => s.kind === 'text' && 'content' in s)?.content,
    '模型已校验通过。',
  );
  assert.ok(segs.some((s) => s.kind === 'next_steps'));
}

{
  // 无围栏、仅有 segment → 出按钮
  const segs: AssistantSegment[] = [
    { kind: 'text', id: 't1', content: '完成。' },
    {
      kind: 'next_steps',
      id: NEXT_STEPS_SEGMENT_ID,
      steps: [{ id: 'materialize', label: '执行物化' }],
    },
  ];
  const picked = pickNextStepsForRender(segs, undefined);
  assert.equal(picked.source, 'segment');
  assert.equal(picked.steps.length, 1);
  assert.equal(picked.steps[0]?.label, '执行物化');
}

{
  // 双路径并存：只取 segment，不叠加围栏
  const segs: AssistantSegment[] = [
    {
      kind: 'next_steps',
      id: NEXT_STEPS_SEGMENT_ID,
      steps: [{ id: 'from_tool', label: '来自 Tool' }],
    },
  ];
  const fence = [
    { id: 'from_fence', label: '来自围栏' },
    { id: 'other', label: '另一条' },
  ];
  const picked = pickNextStepsForRender(segs, fence);
  assert.equal(picked.source, 'segment');
  assert.equal(picked.steps.length, 1);
  assert.equal(picked.steps[0]?.id, 'from_tool');
}

{
  // 仅围栏降级
  const picked = pickNextStepsForRender(
    [{ kind: 'text', id: 't1', content: '完成' }],
    [{ id: 'legacy', label: '历史围栏建议' }],
  );
  assert.equal(picked.source, 'fence');
  assert.equal(picked.steps[0]?.id, 'legacy');
}

console.log('emitTaskCompleteDelivery.verify.ts ok');
