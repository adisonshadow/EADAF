/**
 * ask_user / 用户选择文案格式化回归（node --import tsx src/chat/userChoice.verify.ts）
 */
import assert from 'node:assert/strict';
import {
  formatUserChoiceMessage,
  isUserChoiceRequestData,
  type UserChoiceRequest,
} from './userChoice';
import {
  registerBuiltinTools,
  unregisterBuiltinTools,
  ASK_USER_TOOL,
} from '../registry/builtinTools';
import { invokeFunctionCall, clearFunctionCalls } from '../registry/functionRegistry';
import type { ToolResponse } from '../types/toolResponse';

const request: UserChoiceRequest = {
  requestId: 'ask-test',
  question: '选用哪种建模方案？',
  mode: 'single',
  options: [
    { id: 'opt_a', label: '方案 A', description: '最小字段' },
    { id: 'opt_b', label: '方案 B' },
  ],
  allowCustom: true,
  minSelect: 1,
};

assert.equal(isUserChoiceRequestData(request), true);
assert.equal(isUserChoiceRequestData({ foo: 1 }), false);

{
  const msg = formatUserChoiceMessage(request, {
    selectedIds: ['opt_b'],
  });
  assert.match(msg, /【用户选择】/);
  assert.match(msg, /题：选用哪种建模方案？/);
  assert.match(msg, /模式：单选/);
  assert.match(msg, /已选：opt_b（方案 B）/);
  assert.match(msg, /自定义：（无）/);
}

{
  const msg = formatUserChoiceMessage(
    { ...request, mode: 'multi' },
    { selectedIds: ['opt_a', 'opt_b'], customText: '再加一个索引' },
  );
  assert.match(msg, /模式：多选/);
  assert.match(msg, /opt_a（方案 A：最小字段）/);
  assert.match(msg, /opt_b（方案 B）/);
  assert.match(msg, /自定义：再加一个索引/);
}

await (async () => {
  clearFunctionCalls();
  registerBuiltinTools();

  const bad = (await invokeFunctionCall(ASK_USER_TOOL, {
    question: '',
    mode: 'single',
    options: [],
  })) as ToolResponse | undefined;
  assert.equal(bad?.kind, 'business_error');

  const ok = (await invokeFunctionCall(ASK_USER_TOOL, {
    question: '选一个',
    mode: 'single',
    options: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
  })) as ToolResponse | undefined;
  assert.equal(ok?.kind, 'user_choice_request');
  assert.equal(ok?.verified, true);
  assert.equal(isUserChoiceRequestData(ok?.data), true);
  const data = ok?.data as UserChoiceRequest;
  assert.equal(data.allowCustom, true);
  assert.equal(data.options.length, 2);

  const multi = (await invokeFunctionCall(ASK_USER_TOOL, {
    question: '多选',
    mode: 'multi',
    options: [
      { id: 'x', label: 'X' },
      { id: 'y', label: 'Y' },
      { id: 'z', label: 'Z' },
    ],
    minSelect: 2,
  })) as ToolResponse | undefined;
  assert.equal(multi?.kind, 'user_choice_request');
  const multiData = multi?.data as UserChoiceRequest;
  assert.equal(multiData.allowCustom, false);
  assert.equal(multiData.minSelect, 2);
  assert.equal(multiData.maxSelect, 3);

  unregisterBuiltinTools();
  clearFunctionCalls();
})();

console.log('userChoice 格式化 / ask_user schema 回归全部通过');
