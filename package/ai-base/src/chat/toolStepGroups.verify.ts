import assert from 'node:assert/strict';
import type { ChatToolStep } from './chatToolSteps';
import { resolveToolStepGroup, splitToolStepsIntoGroups } from './toolStepGroups';

function step(id: string, functionName: string): ChatToolStep {
  return {
    id,
    functionName,
    displayName: functionName,
    status: 'success',
    durationMs: 50,
  };
}

assert.equal(resolveToolStepGroup('bizdata_get_materialization_status'), 'materialization');
assert.equal(resolveToolStepGroup('bizdata_execute_materialization'), 'materialization');
assert.equal(resolveToolStepGroup('bizdata_insert_mock_data'), 'mock_data');
assert.equal(resolveToolStepGroup('apiservice_create_services_batch'), 'api_service');
assert.equal(resolveToolStepGroup('bizdata_validate_model'), 'modeling');

const grouped = splitToolStepsIntoGroups([
  step('1', 'bizdata_get_materialization_status'),
  step('2', 'bizdata_execute_materialization'),
  step('3', 'bizdata_insert_mock_data'),
  step('4', 'bizdata_insert_mock_data'),
  step('5', 'apiservice_create_services_batch'),
]);

assert.equal(grouped.length, 3, '物化 / MOCK / API 应拆成 3 条 ThoughtChain');
assert.deepEqual(
  grouped.map((group) => group.key),
  ['materialization', 'mock_data', 'api_service'],
);
assert.equal(grouped[0]?.steps.length, 2);
assert.equal(grouped[1]?.steps.length, 2);
assert.equal(grouped[2]?.steps.length, 1);

console.log('toolStepGroups.verify.ts: ok');
