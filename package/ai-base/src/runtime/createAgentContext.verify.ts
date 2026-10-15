/**
 * node --import tsx src/runtime/createAgentContext.verify.ts
 */
import assert from 'node:assert/strict';
import { createAgentContext } from './createAgentContext';
import { getFunctionCallDef, clearFunctionCalls } from '../registry/functionRegistry';
import type { AgentPlugin } from './types';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  clearFunctionCalls();

  const pack: AgentPlugin = {
    name: 'test-pack',
    inject: ['tools'],
    apply(ctx) {
      ctx.tools.register({
        name: 'demo_ping',
        description: 'ping',
        parameters: { type: 'object', properties: {} },
        handler: async () => ({ ok: true }),
      });
    },
  };

  const handle = createAgentContext({ plugins: [pack] });

  let found = false;
  for (let i = 0; i < 30; i += 1) {
    if (getFunctionCallDef('demo_ping')) {
      found = true;
      break;
    }
    await sleep(10);
  }
  assert.equal(found, true, 'demo_ping should be registered via plugin');

  handle.dispose();
  await sleep(20);

  assert.equal(
    getFunctionCallDef('demo_ping'),
    undefined,
    'demo_ping should be unregistered on dispose',
  );

  console.log('createAgentContext.verify.ts: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
