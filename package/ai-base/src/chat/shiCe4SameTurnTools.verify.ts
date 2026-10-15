/**
 * 同回合 Tool 池扩展 / expandAvailableTools 回归
 * node --import tsx src/chat/shiCe4SameTurnTools.verify.ts
 */
import assert from 'node:assert/strict';
import {
  beginTurn,
  expandAvailableTools,
  getCurrent,
} from '../registry/agentPlanState';
import {
  mergeSkillToolsIntoPool,
  rebuildSessionOpenAITools,
} from '../registry/toolManifest';
import type { AIBaseTool } from '../types';
import { SKILL_OPENAI_TOOL, RUN_CODE_OPENAI_TOOL } from '../registry/builtinTools';

const base: AIBaseTool[] = [
  {
    id: '1',
    name: '列出实体',
    slug: 'bizdata-list',
    functionName: 'bizdata_list_entity_summaries',
    executionType: 'client',
    description: 'list',
  },
];

const incoming: AIBaseTool[] = [
  {
    id: '2',
    name: '列出 API',
    slug: 'api-list',
    functionName: 'apiservice_list_services',
    executionType: 'client',
    description: 'apis',
  },
  // first-wins：同名不覆盖
  {
    id: '3',
    name: '列出实体2',
    slug: 'bizdata-list-2',
    functionName: 'bizdata_list_entity_summaries',
    executionType: 'client',
  },
];

{
  const merged = mergeSkillToolsIntoPool(base, incoming);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].functionName, 'bizdata_list_entity_summaries');
  assert.equal(merged[0].id, '1');
  assert.equal(merged[1].functionName, 'apiservice_list_services');
}

{
  const available = new Set(['bizdata_list_entity_summaries']);
  const end = beginTurn({
    conversationKey: 'verify-same-turn-tools',
    plan: [],
    toolOutcomes: [],
    invokedToolNames: new Set(),
    availableToolNames: available,
  });
  expandAvailableTools(['apiservice_list_services', '']);
  assert.ok(getCurrent()?.availableToolNames?.has('apiservice_list_services'));
  assert.ok(available.has('apiservice_list_services'));
  end();
}

{
  const openai = rebuildSessionOpenAITools({
    skillTools: mergeSkillToolsIntoPool(base, incoming),
    harnessTools: [],
    alwaysHarness: [SKILL_OPENAI_TOOL, RUN_CODE_OPENAI_TOOL] as never[],
    navTools: [],
    localTools: [],
  });
  const names = openai.map((t) => t.function.name);
  assert.ok(names.includes('bizdata_list_entity_summaries'));
  assert.ok(names.includes('apiservice_list_services'));
  assert.ok(names.includes('skill'));
  assert.ok(names.includes('run_code'));
}

console.log('shiCe4SameTurnTools.verify.ts: all assertions passed');
