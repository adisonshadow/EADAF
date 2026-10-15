/**
 * 回归场景：Planning next moves markdown 渲染确定性断言
 * node --import tsx src/ui/planningNextMovesToMarkdown.verify.ts
 */
import assert from 'node:assert/strict';
import { planningNextMovesToMarkdown } from './planningNextMovesToMarkdown';

// 场景 P1：有 hint，且 items 超过 6 条时只取前 6 条
{
  const md = planningNextMovesToMarkdown({
    kind: 'planning',
    id: 'p1',
    title: '接下来您可以：',
    items: [
      { id: 'i1', label: '维护结构化任务清单', status: 'completed' },
      { id: 'i2', label: '规划下一步', status: 'in_progress' },
      { id: 'i3', label: '执行工具 A', status: 'pending' },
      { id: 'i4', label: '执行工具 B', status: 'pending' },
      { id: 'i5', label: '校验', status: 'completed' },
      { id: 'i6', label: '交付', status: 'in_progress' },
      { id: 'i7', label: '不应展示', status: 'pending' },
    ],
    hint: '  因最近一次工具失败，将重试关键步骤  ',
  });

  const expected = [
    '**接下来您可以：**',
    '- 已完成：维护结构化任务清单',
    '- 进行中：规划下一步',
    '- 待办：执行工具 A',
    '- 待办：执行工具 B',
    '- 已完成：校验',
    '- 进行中：交付',
    '',
    '> 因最近一次工具失败，将重试关键步骤',
  ].join('\n');

  assert.equal(md, expected);
}

// 场景 P2：无 hint，且 items 为空
{
  const md = planningNextMovesToMarkdown({
    kind: 'planning',
    id: 'p2',
    title: '接下来您可以：',
    items: [],
  });

  const expected = ['**接下来您可以：**', '- 无计划项'].join('\n');
  assert.equal(md, expected);
}

console.log('planningNextMovesToMarkdown 回归断言通过');

