/** 与 backend/src/services/system/threeMemberRules.js 的内置职责表保持一致。 */

export type ThreeMemberRole = 'system_admin' | 'security_admin' | 'auditor';
export type ThreeMemberDuty = 'business' | ThreeMemberRole;

export const THREE_MEMBER_ROLE_OPTIONS: { label: string; value: ThreeMemberRole }[] = [
  { label: '系统管理员', value: 'system_admin' },
  { label: '安全保密管理员', value: 'security_admin' },
  { label: '安全审计员', value: 'auditor' },
];

export const THREE_MEMBER_DUTY_OPTIONS: { label: string; value: ThreeMemberDuty }[] = [
  { label: '业务', value: 'business' },
  ...THREE_MEMBER_ROLE_OPTIONS,
];

const BUILTIN_DUTY: Record<string, ThreeMemberDuty> = {
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

/** 与 backend threeMemberRules.js 的 SYSTEM_ADMIN_ALSO 保持一致。 */
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

/** 系统管理员在「业务数据」下唯一可进的页面。 */
export const SYSTEM_ADMIN_DATABASE_CONNECTION_PATH = '/business_data/database-connections';

export function effectiveThreeMemberDuty(code: string, stored?: string | null): ThreeMemberDuty {
  if (stored && stored !== 'business' && THREE_MEMBER_DUTY_OPTIONS.some((item) => item.value === stored)) {
    return stored as ThreeMemberDuty;
  }
  return BUILTIN_DUTY[code] || 'business';
}

export function matchesThreeMemberDuty(
  userRole: string | null | undefined,
  duty: string | null | undefined,
): boolean {
  const normalized = duty && duty !== 'business' ? duty : 'business';
  const role = userRole || null;
  if (normalized === 'business') return !role;
  return normalized === role;
}

export function menuVisibleForThreeMember(
  code: string,
  userRole: string | null | undefined,
  storedDuty?: string | null,
): boolean {
  if (code === 'member_org:manage') {
    return userRole === 'system_admin' || userRole === 'security_admin';
  }
  if (code === 'three_member:manage') {
    return userRole === 'security_admin' || userRole === 'auditor';
  }
  if (code === 'business_data:manage' && userRole === 'system_admin') return true;
  if (SYSTEM_ADMIN_ALSO.has(code) && userRole === 'system_admin') return true;
  return matchesThreeMemberDuty(userRole, effectiveThreeMemberDuty(code, storedDuty));
}

/** 头像菜单和直接输入地址时用。开关关闭时一律放行。 */
export function pathAllowedWhenThreeMember(
  pathname: string,
  enabled: boolean,
  userRole: string | null | undefined,
): boolean {
  if (!enabled) return true;
  if (pathname.startsWith('/account/') || pathname === '/' || pathname === '/welcome') return true;
  if (pathname.startsWith('/system/operation-logs') || pathname.startsWith('/system/health')) {
    return userRole === 'auditor';
  }
  if (pathname.startsWith('/system/settings')) {
    return userRole === 'system_admin' || userRole === 'security_admin';
  }
  if (pathname.startsWith('/three_member/approvals')) return userRole === 'security_admin';
  if (pathname.startsWith('/three_member/audit')) return userRole === 'auditor';
  if (pathname === '/three_member') {
    return userRole === 'security_admin' || userRole === 'auditor';
  }
  if (pathname === '/business_data' || pathname.startsWith('/business_data/')) {
    if (userRole === 'system_admin') {
      return pathname === SYSTEM_ADMIN_DATABASE_CONNECTION_PATH
        || pathname.startsWith(`${SYSTEM_ADMIN_DATABASE_CONNECTION_PATH}/`);
    }
  }
  const root = pathname.split('/').filter(Boolean)[0];
  if (!root || root === 'auth') return true;
  return menuVisibleForThreeMember(`${root}:manage`, userRole, null);
}
