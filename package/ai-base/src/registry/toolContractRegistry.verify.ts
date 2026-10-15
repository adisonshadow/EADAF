/**
 * node --import tsx src/registry/toolContractRegistry.verify.ts
 */
import assert from 'node:assert/strict';
import {
  clearToolContractSources,
  ensureFunctionRegistryContractSource,
  getToolContract,
  registerToolContractSource,
  resetFunctionRegistryContractSourceForTests,
  resolveVisibleContracts,
  toolContractToOpenAITool,
} from './toolContractRegistry';
import { clearFunctionCalls, registerFunctionCall } from './functionRegistry';

clearFunctionCalls();
resetFunctionRegistryContractSourceForTests();
clearToolContractSources();

registerToolContractSource({
  id: 'pack-a',
  list: () => [
    {
      name: 'alpha_list',
      description: 'A list',
      parameters: {
        type: 'object',
        properties: { q: { type: 'string' } },
        required: ['q'],
      },
      sourceId: 'pack-a',
    },
  ],
});

registerToolContractSource({
  id: 'pack-b',
  list: () => [
    {
      name: 'alpha_list',
      description: 'B overrides',
      parameters: {
        type: 'object',
        properties: { q: { type: 'string', minLength: 1 } },
        required: ['q'],
      },
      sourceId: 'pack-b',
    },
    {
      name: 'beta_get',
      description: 'B get',
      parameters: { type: 'object', properties: {} },
      sourceId: 'pack-b',
    },
  ],
});

{
  const visible = resolveVisibleContracts(['alpha_list', 'beta_get', 'ghost']);
  assert.equal(visible.length, 2);
  assert.equal(visible.find((c) => c.name === 'alpha_list')?.sourceId, 'pack-b');
  assert.equal(visible.find((c) => c.name === 'alpha_list')?.description, 'B overrides');
  assert.equal(getToolContract('ghost'), undefined);
}

{
  const openai = toolContractToOpenAITool(getToolContract('beta_get')!);
  assert.equal(openai.function.name, 'beta_get');
  assert.ok(openai.function.parameters);
}

clearToolContractSources();
clearFunctionCalls();
registerFunctionCall({
  name: 'echo_demo',
  description: 'echo',
  parameters: {
    type: 'object',
    properties: { n: { type: 'number' } },
    required: ['n'],
  },
  handler: async () => ({ ok: true }),
});
ensureFunctionRegistryContractSource();

{
  const visible = resolveVisibleContracts(['echo_demo', 'missing']);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].name, 'echo_demo');
  assert.deepEqual((visible[0].parameters.properties as { n: unknown }).n, { type: 'number' });
}

clearFunctionCalls();
resetFunctionRegistryContractSourceForTests();
clearToolContractSources();

console.log('toolContractRegistry.verify.ts: all assertions passed');
