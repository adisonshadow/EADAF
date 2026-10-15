/**
 * Tool 展示名注入回归
 * node --import tsx src/utils/toolDisplayNameFallbacks.verify.ts
 */
import assert from 'node:assert/strict';
import {
  clearHostToolDisplayNames,
  CORE_TOOL_DISPLAY_NAMES,
  lookupToolDisplayName,
  registerToolDisplayNames,
} from './toolDisplayNameFallbacks';

clearHostToolDisplayNames();

assert.equal(lookupToolDisplayName('skill'), '加载 Skill');
assert.equal(lookupToolDisplayName('bizdata_get_scope_description'), undefined);
assert.ok(!('bizdata_list_entity_summaries' in CORE_TOOL_DISPLAY_NAMES));

const dispose = registerToolDisplayNames({
  bizdata_get_scope_description: '读取 Scope 业务说明',
  bizdata_list_entity_summaries: '列出实体摘要',
});
assert.equal(lookupToolDisplayName('bizdata_get_scope_description'), '读取 Scope 业务说明');
assert.equal(lookupToolDisplayName('bizdata_list_entity_summaries'), '列出实体摘要');
// 宿主覆盖不抹掉内核
assert.equal(lookupToolDisplayName('skill'), '加载 Skill');

dispose();
assert.equal(lookupToolDisplayName('bizdata_get_scope_description'), undefined);

clearHostToolDisplayNames();
console.log('toolDisplayNameFallbacks.verify.ts: all assertions passed');
