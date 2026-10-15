/**
 * node --import tsx src/utils/validateToolArgs.verify.ts
 */
import assert from 'node:assert/strict';
import { clearValidateToolArgsCache, formatAjvErrors, validateToolArgs } from './validateToolArgs';
import { inferToolDisplay } from './inferToolDisplay';
import { normalizeToolResult } from './normalizeToolResult';
import { buildInvalidArgsEnvelope } from '../types/toolResponse';

clearValidateToolArgsCache();

const schema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    action: { type: 'string', enum: ['list', 'get'] },
  },
  required: ['id'],
};

assert.equal(validateToolArgs({ id: 'a' }, schema).valid, true);
const missing = validateToolArgs({}, schema);
assert.equal(missing.valid, false);
assert.match(String(missing.message), /id/i);

const blankId = validateToolArgs({ id: '   ' }, schema);
assert.equal(blankId.valid, false);
assert.match(String(blankId.message), /不能为空/);

const badEnum = validateToolArgs({ id: 'a', action: 'nope' }, schema);
assert.equal(badEnum.valid, false);
assert.ok(badEnum.errors && badEnum.errors.length > 0);
assert.ok(formatAjvErrors(badEnum.errors!).length > 0);

assert.equal(validateToolArgs({ anything: true }, {}).valid, true);
assert.equal(validateToolArgs({ anything: true }, { type: 'object' }).valid, true);

const envelope = buildInvalidArgsEnvelope('demo_tool', '参数校验失败: id required');
assert.equal(envelope.error?.category, 'invalid_args');
assert.equal(envelope.error?.retryable, true);
assert.equal(envelope.display?.kind, 'error');

const listOk = normalizeToolResult({
  tool: 'uac_list_users',
  rawResult: { items: [{ username: 'admin' }, { username: 'test' }] },
});
assert.equal(listOk.kind, 'success');
assert.equal(listOk.display?.kind, 'table');

const emptyOk = normalizeToolResult({
  tool: 'uac_list_users',
  rawResult: { items: [] },
});
assert.equal(emptyOk.display?.kind, 'empty');

const entityOk = normalizeToolResult({
  tool: 'bizdata_get_entity',
  rawResult: { id: 'e1', code: 'fmms:Order' },
});
assert.equal(entityOk.display?.kind, 'entity');

const inferred = inferToolDisplay({
  ok: true,
  kind: 'success',
  data: [{ a: 1 }],
  meta: { tool: 'x' },
});
assert.equal(inferred?.kind, 'table');

console.log('validateToolArgs.verify.ts: all assertions passed');
