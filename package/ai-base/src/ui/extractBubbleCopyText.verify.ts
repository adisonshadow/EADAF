import assert from 'node:assert/strict';
import { extractBubbleCopyText } from './extractBubbleCopyText';

assert.equal(extractBubbleCopyText('正在思考中...'), '');
assert.equal(extractBubbleCopyText('正在生成回复...'), '');
assert.equal(extractBubbleCopyText('你好，世界'), '你好，世界');

// content 是整轮累加正文：即使 segments 只有最后一轮，也要复制全文
assert.equal(
  extractBubbleCopyText('第一段长文\n\n第二段长文\n\n收尾一句', [
    { kind: 'text', id: 't1', content: '第一段长文' },
    { kind: 'tool', id: 'tool-1', step: { id: 's1', functionName: 'x', displayName: 'X', status: 'success' } },
    { kind: 'text', id: 't2', content: '收尾一句' },
  ]),
  '第一段长文\n\n第二段长文\n\n收尾一句',
);

// 无 content 时回退拼接全部文本段（不是只取最后一段）
assert.equal(
  extractBubbleCopyText('', [
    { kind: 'text', id: 't1', content: '第一段' },
    { kind: 'tool', id: 'tool-1', step: { id: 's1', functionName: 'x', displayName: 'X', status: 'success' } },
    { kind: 'text', id: 't2', content: '第二段' },
  ]),
  '第一段\n\n第二段',
);

// 只剥 a2ui 围栏，正文里的 "steps" JSON 不得误删
const withLooseSteps = [
  '前面很长的说明',
  '',
  '{"steps":[{"id":"n1","label":"下一步"}]}',
  '',
  '后面还有一段',
].join('\n');
assert.equal(extractBubbleCopyText(withLooseSteps), withLooseSteps);

assert.equal(
  extractBubbleCopyText('可见正文\n\n```a2ui-commands\n{"steps":[{"id":"n1","label":"下一步"}]}\n```'),
  '可见正文',
);

assert.equal(extractBubbleCopyText(null), '');
assert.equal(extractBubbleCopyText({ foo: 1 }), '');

console.log('extractBubbleCopyText.verify.ts ok');
