/**
 * MS6 turnTrace / toolMetrics / run_subagent
 * node --import tsx src/observability/observability.verify.ts
 */
import assert from 'node:assert/strict';
import {
  beginTurnTrace,
  appendTurnEvent,
  endTurnTrace,
  getTurnTrace,
  listRecentTurnTraces,
  clearTurnTraces,
  recordToolInvokeOnTrace,
} from './turnTrace';
import {
  recordToolMetricSample,
  getToolMetrics,
  resetToolMetrics,
} from './toolMetrics';
import { runSubagentFanout, runSubagentSequence } from '../runtime/runSubagent';
import { ensureObservabilityBridge } from './bridge';
import { logToolInvoke } from '../utils/toolInvokeLogger';
import { registerFunctionCall, unregisterFunctionCall } from '../registry/functionRegistry';

clearTurnTraces();
resetToolMetrics();

{
  beginTurnTrace({ turnId: 'turn-a', conversationKey: 'c1', skillSlugs: ['s1'] });
  recordToolInvokeOnTrace({
    turnId: 'turn-a',
    round: 1,
    name: 'demo_list',
    success: true,
    durationMs: 12,
    envelope: { ok: true, kind: 'success', verified: true },
  });
  recordToolInvokeOnTrace({
    turnId: 'turn-a',
    round: 2,
    name: 'ai_termination_reason:terminate',
    success: false,
    durationMs: 0,
    args: {},
  });
  endTurnTrace('turn-a');
  const t = getTurnTrace('turn-a');
  assert.ok(t);
  assert.equal(t!.lastTermination?.action, 'terminate');
  assert.ok(t!.events.some((e) => e.kind === 'tool' && e.tool?.name === 'demo_list'));
  assert.ok(listRecentTurnTraces(5).some((x) => x.turnId === 'turn-a'));
}

{
  recordToolMetricSample({ name: 'demo_list', success: true, durationMs: 10 });
  recordToolMetricSample({ name: 'demo_list', success: false, durationMs: 30 });
  const m = getToolMetrics().find((x) => x.name === 'demo_list');
  assert.ok(m);
  assert.equal(m!.calls, 2);
  assert.equal(m!.successes, 1);
  assert.ok(m!.p95Ms >= 10);
}

{
  const dispose = ensureObservabilityBridge();
  logToolInvoke({
    side: 'client',
    name: 'bridged_tool',
    args: {},
    success: true,
    durationMs: 5,
    turnId: 'turn-a',
    round: 3,
    envelope: { ok: true, kind: 'success' },
  });
  assert.ok(getToolMetrics().some((x) => x.name === 'bridged_tool'));
  dispose();
}

registerFunctionCall({
  name: 'ms6_echo',
  description: 'echo',
  parameters: { type: 'object', properties: { n: { type: 'number' } } },
  handler: async (args) => ({ ok: true, kind: 'success', data: args, meta: { tool: 'ms6_echo' } }),
});

{
  const fan = await runSubagentFanout({
    goal: 'echo all',
    tool: 'ms6_echo',
    items: [{ n: 1 }, { n: 2 }],
    parentTurnId: 'turn-a',
    maxConcurrency: 2,
  });
  assert.equal(fan.okCount, 2);
  assert.ok(fan.childTurnId.includes('turn-a:sub-'));
  const child = getTurnTrace(fan.childTurnId);
  assert.ok(child?.parentTurnId === 'turn-a');
}

{
  const seq = await runSubagentSequence({
    goal: 'two steps',
    steps: [
      { tool: 'ms6_echo', args: { n: 1 } },
      { tool: 'ms6_echo', args: { n: 2 } },
    ],
    parentTurnId: 'turn-a',
  });
  assert.equal(seq.ok, true);
  assert.equal(seq.steps.length, 2);
}

unregisterFunctionCall('ms6_echo');
clearTurnTraces();
resetToolMetrics();

console.log('observability.verify.ts: all assertions passed');
