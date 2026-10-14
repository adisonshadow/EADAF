const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveLoginVerifyEnabled, parseTriState } = require('./ssoLoginVerify');
// 引入本模块会连带加载 sequelize；纯函数测试用不到连接，跑完关掉，避免进程挂住 30 秒
const { sequelize } = require('../models');

test.after(async () => {
  await sequelize.close().catch(() => {});
});

test('三态解析：布尔与字符串/数字写法都认', () => {
  for (const v of [true, 'true', 1, '1']) assert.equal(parseTriState(v), true, String(v));
  for (const v of [false, 'false', 0, '0']) assert.equal(parseTriState(v), false, String(v));
  for (const v of [undefined, null, '', 'yes', {}]) assert.equal(parseTriState(v), null, String(v));
});

test('应用未配置时跟随平台全局开关', () => {
  assert.equal(resolveLoginVerifyEnabled({ appFlag: undefined, globalFlag: true }), true);
  assert.equal(resolveLoginVerifyEnabled({ appFlag: undefined, globalFlag: false }), false);
  assert.equal(resolveLoginVerifyEnabled({}), true, '缺省应保守地要求验证');
  assert.equal(resolveLoginVerifyEnabled({ globalFlag: undefined }), true);
});

test('应用可关掉人类验证（内部应用场景）', () => {
  assert.equal(resolveLoginVerifyEnabled({ appFlag: false, globalFlag: true }), false);
  assert.equal(resolveLoginVerifyEnabled({ appFlag: 'false', globalFlag: true }), false);
});

test('应用可显式要求验证，即使平台全局关掉', () => {
  assert.equal(resolveLoginVerifyEnabled({ appFlag: true, globalFlag: false }), true);
});

test('只认明确取值，垃圾值回落到全局开关', () => {
  assert.equal(resolveLoginVerifyEnabled({ appFlag: 'maybe', globalFlag: true }), true);
  assert.equal(resolveLoginVerifyEnabled({ appFlag: 'maybe', globalFlag: false }), false);
});
