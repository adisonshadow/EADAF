const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeDuration,
  readStoredDuration,
  applyAuthTokenSettings,
  resolveLoginAccessExpiresIn,
  resolveRefreshExpiresIn,
  resolveJwtExpiresIn,
  durationToSeconds,
  publicSettings,
} = require('./authTokenSettings');

test('合法的有效期会归一化，空值表示用环境变量', () => {
  assert.equal(normalizeDuration('24H', '访问令牌'), '24h');
  assert.equal(normalizeDuration(' 7d ', '刷新令牌'), '7d');
  assert.equal(normalizeDuration('', '访问令牌'), null);
  assert.equal(normalizeDuration(null, '访问令牌'), null);
});

test('格式不对或超出范围会拒绝', () => {
  assert.throws(() => normalizeDuration('20mb', '访问令牌'), /数字加单位/);
  assert.throws(() => normalizeDuration('30s', '访问令牌'), /1 分钟/);
  assert.throws(() => normalizeDuration('4000d', '刷新令牌'), /3650 天/);
});

test('坏的存档读出来当没配', () => {
  assert.equal(readStoredDuration('nope'), null);
  assert.equal(readStoredDuration(12), null);
});

test('设置页的值高于环境变量，清空后回到环境变量', () => {
  applyAuthTokenSettings({ jwtExpiresIn: '2h', jwtRefreshExpiresIn: '14d' });
  assert.equal(resolveLoginAccessExpiresIn(), '2h');
  assert.equal(resolveJwtExpiresIn(), '2h');
  assert.equal(resolveRefreshExpiresIn(), '14d');
  assert.equal(publicSettings().jwtExpiresInIsCustom, true);
  assert.equal(durationToSeconds(resolveRefreshExpiresIn(), 0), 14 * 86400);

  applyAuthTokenSettings({});
  assert.equal(publicSettings().jwtExpiresInIsCustom, false);
  assert.equal(publicSettings().jwtRefreshExpiresInIsCustom, false);
  assert.notEqual(resolveLoginAccessExpiresIn(), '2h');
  assert.notEqual(resolveRefreshExpiresIn(), '14d');
});
