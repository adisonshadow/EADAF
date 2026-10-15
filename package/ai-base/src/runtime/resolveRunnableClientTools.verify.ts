/**
 * resolveRunnableClientToolNames / assertRunnableClientTool 回归
 * node --import tsx src/runtime/resolveRunnableClientTools.verify.ts
 */
import assert from 'node:assert/strict';
import {
  registerFunctionCall,
  unregisterFunctionCall,
  clearFunctionCalls,
} from '../registry/functionRegistry';
import {
  ensureFunctionRegistryContractSource,
  resetFunctionRegistryContractSourceForTests,
} from '../registry/toolContractRegistry';
import {
  resolveRunnableClientToolNames,
  assertRunnableClientTool,
  RUN_CODE_NEVER_ORCHESTRATE,
} from './resolveRunnableClientTools';
import { beginTurn } from '../registry/agentPlanState';

resetFunctionRegistryContractSourceForTests();
clearFunctionCalls();
ensureFunctionRegistryContractSource();

registerFunctionCall({
  name: 'bizdata_list_entity_summaries',
  description: 'list',
  parameters: { type: 'object', properties: { codePrefix: { type: 'string' } } },
  handler: async () => ({ items: [] }),
});

// 无 dispatcher：授权含 http_request（无 client handler）+ 业务 Tool → 名单不含 http_request
{
  const { toolNames } = resolveRunnableClientToolNames(
    new Set(['http_request', 'bizdata_list_entity_summaries']),
    { includeAuthorizedServerTools: false },
  );
  assert.deepEqual(toolNames, ['bizdata_list_entity_summaries']);
  assert.equal(toolNames.includes('http_request'), false);
}

// 有 dispatcher：授权含 server_builtin 名 → 进 list；http_request / harness 仍排除
{
  const end = beginTurn({
    conversationKey: 'verify-resolve-runnable-dispatcher',
    plan: [],
    toolOutcomes: [],
    invokedToolNames: new Set(),
    availableToolNames: new Set([
      'bizdata_list_entity_summaries',
      'bizdata_get_materialization_status',
      'http_request',
      'run_code',
      'skill',
    ]),
    invokeAuthorizedTool: async (name) => ({ invoked: name }),
    resolveToolBrief: (name) =>
      name === 'bizdata_get_materialization_status'
        ? {
            description: '物化状态',
            parameters: { type: 'object', properties: {} },
          }
        : undefined,
  });
  const { toolNames, contracts } = resolveRunnableClientToolNames(
    getCurrentAuth(),
    { includeAuthorizedServerTools: true },
  );
  assert.ok(toolNames.includes('bizdata_list_entity_summaries'));
  assert.ok(toolNames.includes('bizdata_get_materialization_status'));
  assert.equal(toolNames.includes('http_request'), false);
  assert.equal(toolNames.includes('run_code'), false);
  assert.equal(toolNames.includes('skill'), false);
  const statusContract = contracts.find((c) => c.name === 'bizdata_get_materialization_status');
  assert.ok(statusContract);
  assert.equal(statusContract!.description, '物化状态');
  assert.ok(RUN_CODE_NEVER_ORCHESTRATE.has('http_request'));
  end();
}

function getCurrentAuth(): Set<string> {
  return new Set([
    'bizdata_list_entity_summaries',
    'bizdata_get_materialization_status',
    'http_request',
    'run_code',
    'skill',
  ]);
}

// 空授权 → 回退全部已注册 client
{
  const { toolNames } = resolveRunnableClientToolNames(new Set());
  assert.ok(toolNames.includes('bizdata_list_entity_summaries'));
  assert.equal(toolNames.includes('http_request'), false);
}

// subagent 越权拦截（仍 client-only）
{
  const end = beginTurn({
    conversationKey: 'verify-resolve-runnable',
    plan: [],
    toolOutcomes: [],
    invokedToolNames: new Set(),
    availableToolNames: new Set(['bizdata_list_entity_summaries']),
  });
  assert.doesNotThrow(() =>
    assertRunnableClientTool('bizdata_list_entity_summaries', new Set(['bizdata_list_entity_summaries'])),
  );
  assert.throws(
    () => assertRunnableClientTool('apiservice_list_services', new Set(['bizdata_list_entity_summaries'])),
    /未授权/,
  );
  // server_builtin 无 client handler → subagent 仍拒绝
  assert.throws(
    () =>
      assertRunnableClientTool(
        'bizdata_get_materialization_status',
        new Set(['bizdata_get_materialization_status']),
      ),
    /未授权|未注册/,
  );
  end();
}

unregisterFunctionCall('bizdata_list_entity_summaries');
resetFunctionRegistryContractSourceForTests();
clearFunctionCalls();

console.log('resolveRunnableClientTools.verify.ts: all assertions passed');
