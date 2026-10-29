const test = require('node:test');
const assert = require('node:assert/strict');

const { matchesDuty, menuVisible, normalizeRole, effectiveDuty } = require('./threeMemberRules');

test('业务权限只给普通用户，三员权限只给对应身份', () => {
  assert.equal(matchesDuty({ userRole: null, duty: 'business' }), true);
  assert.equal(matchesDuty({ userRole: 'system_admin', duty: 'business' }), false);
  assert.equal(matchesDuty({ userRole: 'auditor', duty: 'auditor' }), true);
  assert.equal(matchesDuty({ userRole: 'auditor', duty: 'system_admin' }), false);
  assert.equal(matchesDuty({ userRole: null, duty: 'auditor' }), false);
});

test('成员与组织菜单同时对系统管理员和安全保密管理员可见', () => {
  assert.equal(menuVisible({ userRole: 'system_admin', code: 'member_org:manage', storedDuty: 'business' }), true);
  assert.equal(menuVisible({ userRole: 'security_admin', code: 'member_org:manage', storedDuty: 'business' }), true);
  assert.equal(menuVisible({ userRole: 'auditor', code: 'member_org:manage', storedDuty: 'business' }), false);
  assert.equal(menuVisible({ userRole: 'auditor', code: 'three_member:manage', storedDuty: 'business' }), true);
  assert.equal(menuVisible({ userRole: 'system_admin', code: 'three_member:manage', storedDuty: 'business' }), false);
  assert.equal(menuVisible({ userRole: null, code: 'business_data:manage', storedDuty: 'business' }), true);
  assert.equal(effectiveDuty('permissions:manage', 'business'), 'security_admin');
});

test('系统管理员可以操作权限管理、应用列表，以及业务数据菜单入口', () => {
  assert.equal(menuVisible({ userRole: 'system_admin', code: 'permissions:manage', storedDuty: 'security_admin' }), true);
  assert.equal(menuVisible({ userRole: 'security_admin', code: 'permissions:manage', storedDuty: 'security_admin' }), true);
  assert.equal(menuVisible({ userRole: null, code: 'permissions:manage', storedDuty: 'business' }), false);
  assert.equal(menuVisible({ userRole: 'system_admin', code: 'permission:create', storedDuty: 'security_admin' }), true);
  assert.equal(menuVisible({ userRole: 'system_admin', code: 'service_provider:manage', storedDuty: 'business' }), true);
  assert.equal(menuVisible({ userRole: null, code: 'service_provider:manage', storedDuty: 'business' }), true);
  assert.equal(menuVisible({ userRole: 'auditor', code: 'service_provider:manage', storedDuty: 'business' }), false);
  assert.equal(menuVisible({ userRole: 'system_admin', code: 'business_data:manage', storedDuty: 'business' }), true);
  assert.equal(menuVisible({ userRole: 'security_admin', code: 'business_data:manage', storedDuty: 'business' }), false);
});

test('空三员属性合法，非法值拒绝', () => {
  assert.equal(normalizeRole(''), null);
  assert.equal(normalizeRole('auditor'), 'auditor');
  assert.throws(() => normalizeRole('boss'), /三员属性/);
});
