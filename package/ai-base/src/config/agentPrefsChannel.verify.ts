/**
 * agentPrefsChannel 回归
 * node --import tsx src/config/agentPrefsChannel.verify.ts
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_DECISION_PREFERENCE,
  DEFAULT_REASONING_DISPLAY_MODE,
  DEFAULT_TOOL_CONCURRENCY,
  DECISION_PREFERENCE_HABIT_KEY,
  REASONING_DISPLAY_MODE_HABIT_KEY,
  TOOL_CONCURRENCY_HABIT_KEY,
  buildAskUserProtocol,
  getDecisionPreference,
  getReasoningDisplayMode,
  getToolConcurrency,
  normalizeReasoningDisplayMode,
  resolveReasoningView,
  setDecisionPreference,
  setReasoningDisplayMode,
  setToolConcurrency,
} from './agentPrefsChannel';
import { getUserHabit, setUserHabit } from '../storage/userHabit';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
};

store.clear();

assert.equal(getToolConcurrency(), DEFAULT_TOOL_CONCURRENCY);
assert.equal(getDecisionPreference(), DEFAULT_DECISION_PREFERENCE);
assert.equal(getReasoningDisplayMode(), DEFAULT_REASONING_DISPLAY_MODE);
assert.equal(normalizeReasoningDisplayMode('nope'), DEFAULT_REASONING_DISPLAY_MODE);
assert.equal(normalizeReasoningDisplayMode('preview3'), 'preview3');

setToolConcurrency(10);
assert.equal(getToolConcurrency(), 10);
assert.equal(getUserHabit(TOOL_CONCURRENCY_HABIT_KEY, 6), 10);

setToolConcurrency(100);
assert.equal(getToolConcurrency(), 32, '上限 32');
setToolConcurrency(0);
assert.equal(getToolConcurrency(), 1, '下限 1');

setDecisionPreference('ai');
assert.equal(getDecisionPreference(), 'ai');
assert.equal(getUserHabit(DECISION_PREFERENCE_HABIT_KEY, 'user'), 'ai');

const aiProtocol = buildAskUserProtocol('ai');
assert.ok(aiProtocol.includes('让 AI 自己抉择'));
assert.ok(!aiProtocol.includes('必须**调用 ask_user'));

const userProtocol = buildAskUserProtocol('user');
assert.ok(userProtocol.includes('让用户抉择'));
assert.ok(userProtocol.includes('必须**调用 ask_user'));

setDecisionPreference('user');
setToolConcurrency(DEFAULT_TOOL_CONCURRENCY);
setUserHabit(TOOL_CONCURRENCY_HABIT_KEY, DEFAULT_TOOL_CONCURRENCY);

setReasoningDisplayMode('preview3');
assert.equal(getReasoningDisplayMode(), 'preview3');
assert.equal(getUserHabit(REASONING_DISPLAY_MODE_HABIT_KEY, 'collapsed'), 'preview3');
setReasoningDisplayMode('collapsed');
assert.equal(getReasoningDisplayMode(), 'collapsed');

{
  const collapsed = resolveReasoningView('collapsed', true, null);
  assert.equal(collapsed.thinkExpanded, false);
  assert.equal(collapsed.previewClipped, false);
  const collapsedOpen = resolveReasoningView('collapsed', true, true);
  assert.equal(collapsedOpen.thinkExpanded, true);

  const preview = resolveReasoningView('preview3', true, null);
  assert.equal(preview.thinkExpanded, true);
  assert.equal(preview.previewClipped, true);
  const previewOpen = resolveReasoningView('preview3', false, true);
  assert.equal(previewOpen.thinkExpanded, true);
  assert.equal(previewOpen.previewClipped, false);

  const fullStreaming = resolveReasoningView('full', true, null);
  assert.equal(fullStreaming.thinkExpanded, true);
  assert.equal(fullStreaming.previewClipped, false);
  const fullDone = resolveReasoningView('full', false, null);
  assert.equal(fullDone.thinkExpanded, false);
}

console.log('agentPrefsChannel.verify.ts: all assertions passed');
