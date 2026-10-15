/**
 * JSON.stringify(undefined) 为 undefined，Surface 不得对 text.length 崩溃
 * node --import tsx src/ui/payloadToPreviewText.verify.ts
 */
import assert from 'node:assert/strict';
import { payloadToPreviewText } from './payloadToPreviewText';
import { inferToolDisplay } from '../utils/inferToolDisplay';

assert.equal(payloadToPreviewText(undefined), 'undefined');
assert.equal(payloadToPreviewText(null), 'null');
assert.ok(payloadToPreviewText({ a: 1 }).includes('"a": 1'));
assert.equal(payloadToPreviewText({ a: 1, b: 2 }, 1).split('\n')[0], '{');

{
  const display = inferToolDisplay({
    ok: true,
    kind: 'success',
    data: {
      connectionId: 'c1',
      connectionName: 'pg',
      targetSchema: undefined,
      reason: 'single_available_connection',
    },
    meta: { tool: 'apiservice_resolve_connection' },
  });
  assert.equal(display?.kind, 'entity');
  const payload = display?.payload as Record<string, unknown>;
  assert.equal('targetSchema' in payload, false);
  assert.equal(payload.connectionId, 'c1');
}

console.log('payloadToPreviewText.verify.ts ok');
