const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeLogRotation,
  readStoredLogRotation,
  resolveLogRotation,
  toWinstonRotation,
} = require('./logRotationSettings');

test('合法的大小和天数会归一化', () => {
  const settings = normalizeLogRotation({
    maxSize: '20M',
    retentionDays: 7,
    errorRetentionDays: 30,
    zippedArchive: false,
  });
  assert.deepEqual(settings, {
    maxSize: '20m',
    retentionDays: 7,
    errorRetentionDays: 30,
    zippedArchive: false,
  });
  assert.equal(toWinstonRotation(settings).maxFiles, '7d');
  assert.equal(toWinstonRotation(settings).errorMaxFiles, '30d');
});

test('大小格式不对或天数超出范围会拒绝', () => {
  assert.throws(() => normalizeLogRotation({ maxSize: '20mb' }), /m 或 g/);
  assert.throws(() => normalizeLogRotation({ retentionDays: 0 }), /运行日志保留天数/);
  assert.throws(() => normalizeLogRotation({ errorRetentionDays: 4000 }), /错误日志保留天数/);
});

test('没改过设置时用默认值，坏的存档读出来当没配', () => {
  const defaults = resolveLogRotation(null);
  assert.match(defaults.maxSize, /^\d+(\.\d+)?[mg]$/);
  assert.equal(readStoredLogRotation({ maxSize: 'nope' }), null);
  assert.equal(readStoredLogRotation(null), null);
});
