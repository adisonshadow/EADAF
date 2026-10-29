const { Op } = require('sequelize');
const { User, Permission, BizdataSetting } = require('../../models');
const {
  ROLES,
  ROLE_LABEL,
  DEFAULT_DUTY_BY_CODE,
} = require('./threeMemberRules');

const FEATURES_KEY = 'system_features';

async function isThreeMemberEnabled() {
  const setting = await BizdataSetting.findOne({ where: { key: FEATURES_KEY } });
  return Boolean(setting?.value?.threeMemberEnabled);
}

async function assertThreeMembersPresent() {
  const rows = await User.findAll({
    where: {
      status: 'ACTIVE',
      three_member_role: { [Op.in]: ROLES },
    },
    attributes: ['three_member_role'],
  });
  const present = new Set(rows.map((row) => row.three_member_role));
  const missing = ROLES.filter((role) => !present.has(role));
  if (missing.length) {
    throw Object.assign(
      new Error(`开启三员前，需要各指定一名在职用户：${missing.map((role) => ROLE_LABEL[role]).join('、')}`),
      { status: 400 },
    );
  }
}

/** 开启时一次性指定三类人。三人必须不同且在职。 */
async function assignThreeMembers(assignments) {
  if (!assignments || typeof assignments !== 'object') {
    throw Object.assign(new Error('请为三类三员各指定一名用户'), { status: 400 });
  }
  const ids = ROLES.map((role) => String(assignments[role] || '').trim());
  if (ids.some((id) => !id)) {
    throw Object.assign(new Error('请为三类三员各指定一名用户'), { status: 400 });
  }
  if (new Set(ids).size !== 3) {
    throw Object.assign(new Error('三类三员必须是三个不同的用户'), { status: 400 });
  }
  const users = await User.findAll({
    where: { user_id: { [Op.in]: ids }, status: 'ACTIVE' },
    attributes: ['user_id'],
  });
  if (users.length !== 3) {
    throw Object.assign(new Error('指定的用户不存在或未启用'), { status: 400 });
  }
  for (let index = 0; index < ROLES.length; index += 1) {
    await User.update(
      { three_member_role: ROLES[index] },
      { where: { user_id: ids[index] } },
    );
  }
}

async function applyDefaultDuties() {
  const entries = Object.entries(DEFAULT_DUTY_BY_CODE);
  for (const [code, duty] of entries) {
    await Permission.update(
      { three_member_duty: duty },
      { where: { code, resource_type: { [Op.in]: ['MENU', 'BUTTON'] } } },
    );
  }
}

/** 开关打开时，要求当前用户是指定三员；关闭时不检查。 */
async function assertCallerRole(userId, expectedRole) {
  if (!(await isThreeMemberEnabled())) return null;
  const actor = await User.findByPk(userId, { attributes: ['three_member_role'] });
  const role = actor?.three_member_role || null;
  if (role !== expectedRole) {
    throw Object.assign(
      new Error(`启用三员后，只有${ROLE_LABEL[expectedRole]}可以执行此操作`),
      { status: 403 },
    );
  }
  return role;
}

module.exports = {
  isThreeMemberEnabled,
  assertThreeMembersPresent,
  assignThreeMembers,
  applyDefaultDuties,
  assertCallerRole,
};
