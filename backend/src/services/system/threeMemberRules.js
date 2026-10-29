/**
 * 三员职责判定（纯函数）。
 * 开关关闭时 matchesDuty / menuVisible 恒为 true，调用方仍应在关闭时走原逻辑。
 */

const ROLES = ['system_admin', 'security_admin', 'auditor'];

const ROLE_LABEL = {
  system_admin: '系统管理员',
  security_admin: '安全保密管理员',
  auditor: '安全审计员',
};

const DUTIES = ['business', ...ROLES];

/** 内置菜单/按钮编码 → 职责。未列出的保持业务。 */
const DEFAULT_DUTY_BY_CODE = {
  'member_org:manage': 'system_admin',
  'user:manage': 'system_admin',
  'department:manage': 'system_admin',
  'member:create': 'system_admin',
  'member:edit': 'system_admin',
  'member:delete': 'system_admin',
  'permissions:manage': 'security_admin',
  'role:manage': 'security_admin',
  'permission:manage': 'security_admin',
  'member:assign_role': 'security_admin',
  'permission:create': 'security_admin',
  'permission:edit': 'security_admin',
  'permission:delete': 'security_admin',
  'log:manage': 'auditor',
  'system:settings:manage': 'system_admin',
};

/**
 * 这些编码的默认职责不变，但系统管理员也能看、也能做。
 * 权限管理仍归安全保密管理员；应用列表仍归普通用户。
 */
const SYSTEM_ADMIN_ALSO = new Set([
  'permissions:manage',
  'permission:manage',
  'permission:create',
  'permission:edit',
  'permission:delete',
  'service_provider:manage',
  'application:manage',
  'application:create',
  'application:edit',
]);

function bad(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function normalizeRole(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!ROLES.includes(text)) {
    throw bad('三员属性只能是系统管理员、安全保密管理员或安全审计员');
  }
  return text;
}

function normalizeDuty(value) {
  if (value == null || value === '') return 'business';
  const text = String(value).trim();
  if (!DUTIES.includes(text)) throw bad('三员性质无效');
  return text;
}

function effectiveDuty(code, stored) {
  const duty = stored && DUTIES.includes(stored) ? stored : 'business';
  if (duty !== 'business') return duty;
  return DEFAULT_DUTY_BY_CODE[code] || 'business';
}

/** 权限职责是否允许该用户。userRole 为空表示普通用户。 */
function matchesDuty({ userRole, duty }) {
  const normalized = duty && DUTIES.includes(duty) ? duty : 'business';
  const role = userRole || null;
  if (normalized === 'business') return !role;
  return normalized === role;
}

/**
 * 菜单是否可见。成员与组织同时给系统管理员（维护账号）和安全保密管理员（指定三员身份）。
 */
function menuVisible({ userRole, code, storedDuty }) {
  if (code === 'member_org:manage') {
    return userRole === 'system_admin' || userRole === 'security_admin';
  }
  if (code === 'three_member:manage') {
    return userRole === 'security_admin' || userRole === 'auditor';
  }
  // 业务数据整组仍是业务职责；系统管理员只为了进入「数据库连接」，具体页面由前端再收窄。
  if (code === 'business_data:manage' && userRole === 'system_admin') return true;
  if (SYSTEM_ADMIN_ALSO.has(code) && userRole === 'system_admin') return true;
  return matchesDuty({ userRole, duty: effectiveDuty(code, storedDuty) });
}

module.exports = {
  ROLES,
  ROLE_LABEL,
  DUTIES,
  DEFAULT_DUTY_BY_CODE,
  SYSTEM_ADMIN_ALSO,
  normalizeRole,
  normalizeDuty,
  effectiveDuty,
  matchesDuty,
  menuVisible,
};
