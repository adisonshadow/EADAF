/**
 * 写成功后 navigate hint 回归验证
 * node --import tsx src/navigation/writeNavigateHint.verify.ts
 */
import assert from 'node:assert/strict';
import {
  isWriteLikeToolName,
  needsPostWriteNavigation,
  withWriteNavigateHint,
  WRITE_SUCCESS_NAVIGATE_HINT,
} from './writeNavigateHint';
import type { ToolResponse } from '../types/toolResponse';

assert.equal(isWriteLikeToolName('bizdata_create_entity'), true);
assert.equal(isWriteLikeToolName('apiservice_create_service'), true);
assert.equal(isWriteLikeToolName('apiservice_create_services_batch'), true);
assert.equal(isWriteLikeToolName('uac_update_user'), true);
assert.equal(isWriteLikeToolName('outbound_webhook_upsert'), true);
assert.equal(isWriteLikeToolName('bizdata_execute_materialization'), true);
assert.equal(isWriteLikeToolName('bizdata_list_entity_summaries'), false);
assert.equal(isWriteLikeToolName('uac_list_users'), false);
assert.equal(isWriteLikeToolName('apiservice_navigate'), false);
assert.equal(isWriteLikeToolName('navigate_to_page'), false);
assert.equal(isWriteLikeToolName('task_complete'), false);

const writeOk: ToolResponse = {
  ok: true,
  verified: true,
  kind: 'success',
  meta: { tool: 'bizdata_create_entity' },
  data: { id: 'e-1' },
};
const apiOk: ToolResponse = {
  ok: true,
  verified: true,
  kind: 'success',
  meta: { tool: 'apiservice_create_service' },
  data: { id: 's-1' },
};
const navOk: ToolResponse = {
  ok: true,
  verified: true,
  kind: 'success',
  meta: { tool: 'navigate_to_page' },
  data: { navigated: true, path: '/api_services/s-1/edit' },
};
const listOk: ToolResponse = {
  ok: true,
  kind: 'success',
  meta: { tool: 'bizdata_list_entity_summaries' },
};

assert.equal(needsPostWriteNavigation([]), false);
assert.equal(needsPostWriteNavigation([listOk]), false);
assert.equal(needsPostWriteNavigation([writeOk]), true, '实体创建成功后应提示跳转');
assert.equal(
  needsPostWriteNavigation([writeOk, apiOk]),
  true,
  '实体→API 连续创建且从未跳转 → 应提示',
);
assert.equal(needsPostWriteNavigation([writeOk, navOk]), false, '写后已跳则不再提示');
assert.equal(
  needsPostWriteNavigation([writeOk, navOk, apiOk]),
  true,
  'API 创建在上次跳转之后 → 应再提示一次',
);

const hinted = withWriteNavigateHint(writeOk, true);
assert.notEqual(hinted, writeOk);
assert.equal(hinted.agentHint, WRITE_SUCCESS_NAVIGATE_HINT);
assert.equal(writeOk.agentHint, undefined, '原信封不可变');
assert.equal(withWriteNavigateHint(writeOk, false), writeOk);
assert.equal(withWriteNavigateHint(listOk, true), listOk);

console.log('writeNavigateHint 回归验证全部通过');
