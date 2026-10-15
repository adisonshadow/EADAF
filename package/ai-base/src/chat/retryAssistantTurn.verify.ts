import assert from 'node:assert/strict';
import { findRetryTurn, resolveUserRetryPayload } from './retryAssistantTurn';

const messages = [
  { id: 'u1', message: { role: 'user' } },
  { id: 'a1', message: { role: 'assistant' } },
  { id: 'u2', message: { role: 'user' } },
  { id: 'a2', message: { role: 'assistant' } },
];

assert.deepEqual(findRetryTurn(messages, 'a2'), { userIndex: 2, assistantIndex: 3 });
assert.deepEqual(findRetryTurn(messages, 'a1'), { userIndex: 0, assistantIndex: 1 });
assert.equal(findRetryTurn(messages, 'missing'), null);
assert.equal(findRetryTurn([{ id: 'a0', message: { role: 'assistant' } }], 'a0'), null);

assert.deepEqual(
  resolveUserRetryPayload({ role: 'user', content: '显示文案', apiContent: '发给模型的原文' }),
  { apiText: '发给模型的原文', displayText: '显示文案' },
);

assert.deepEqual(
  resolveUserRetryPayload({ role: 'user', content: '[附件: a.png]\n看这张图' }),
  { apiText: '看这张图', displayText: '看这张图' },
);

assert.deepEqual(
  resolveUserRetryPayload({
    role: 'user',
    content: '多模态',
    apiContent: [
      { type: 'text', text: '第一部分' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,xx' } },
      { type: 'text', text: '第二部分' },
    ],
  }),
  { apiText: '第一部分\n第二部分', displayText: '多模态' },
);

assert.equal(resolveUserRetryPayload({ role: 'user', content: '' }), null);

console.log('retryAssistantTurn.verify.ts ok');
