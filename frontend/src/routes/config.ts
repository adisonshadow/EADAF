import type { MenuDataItem } from '@ant-design/pro-components';
import { matchPath } from 'react-router-dom';
import {
  EADAF_SEMANTIC_ROUTES,
  isSemanticRedirect,
  type AppSemanticEntry,
} from './semanticRegistry';
import {
  ROUTE_UI_BY_PATH,
  EXTRA_ROUTE_META,
  type AppRouteMeta,
} from './routeUi';
import { menuVisibleForThreeMember, SYSTEM_ADMIN_DATABASE_CONNECTION_PATH } from '@/utils/threeMember';

function pathSegmentCount(path: string) {
  return path.split('/').filter(Boolean).length;
}

/** 判断是否为某一级菜单下的可展示子项（支持 materialization/execute 等三级路径） */
function isMenuChildOf(rootPath: string, item: AppRouteMeta, allItems: AppRouteMeta[]) {
  if (!item.name || item.hideInMenu) return false;
  if (!item.path.startsWith(`${rootPath}/`)) return false;

  const rootDepth = pathSegmentCount(rootPath);
  const itemDepth = pathSegmentCount(item.path);
  const depthDiff = itemDepth - rootDepth;

  if (depthDiff === 1) return true;

  if (depthDiff === 2) {
    const parentPath = item.path.split('/').slice(0, -1).join('/');
    const parentIsMenu = allItems.some(
      (candidate) => candidate.path === parentPath && candidate.name && !candidate.hideInMenu,
    );
    return !parentIsMenu;
  }

  return false;
}

/**
 * 菜单元数据派生：语义清单 + UI 补充表（不再手写全表）。
 * - redirect 条目：默认不进菜单；仅当 UI 表给了 name（分组根）才进 appRouteMeta；
 * - 页面条目：name = ui.name ?? title，合并 ROUTE_UI_BY_PATH[path]；
 * - 末尾拼接手写补充（/account/center 等非目标路由）。
 */
export function buildAppRouteMeta(
  entries: AppSemanticEntry[] = EADAF_SEMANTIC_ROUTES,
  uiByPath: Record<string, Partial<AppRouteMeta>> = ROUTE_UI_BY_PATH,
): AppRouteMeta[] {
  const meta: AppRouteMeta[] = [];
  for (const entry of entries) {
    const ui = uiByPath[entry.path] ?? {};
    if (isSemanticRedirect(entry)) {
      // 分组根（如 /member_org、/permissions）：仅当 UI 表给了 name 才进菜单元数据
      if (ui.name) {
        meta.push({ path: entry.path, ...ui });
      }
      continue;
    }
    meta.push({
      path: entry.path,
      name: ui.name ?? entry.title,
      ...ui,
    });
  }
  return [...meta, ...EXTRA_ROUTE_META];
}

/** 应用菜单与路由元数据（由语义清单 + UI 补充表派生） */
export const appRouteMeta: AppRouteMeta[] = buildAppRouteMeta();

interface MenuAccessContext {
  /** 用户角色 id 列表 */
  roleIds?: string[];
  /** 用户角色 code 列表（含 SUPER_ADMIN 时拥有全部权限） */
  roleCodes?: string[];
  /** 用户所属组织 id */
  departmentId?: string | null;
  /** 是否超级管理员 */
  isSuperAdmin?: boolean;
  /** 三员开关。关闭时菜单判断与原来完全一致 */
  threeMemberEnabled?: boolean;
  threeMemberRole?: string | null;
}

interface MenuPermissionEntry {
  code: string;
  access_restriction?: { mode: 'none' | 'role' | 'department'; roleIds?: string[]; departmentIds?: string[] } | null;
  three_member_duty?: string | null;
}

/**
 * 按 access_restriction 判断当前用户是否可访问某菜单根（对应 MENU 权限 code）。
 * - 超级管理员：始终可见
 * - mode=none / 未配置：可见
 * - mode=role：用户角色命中允许角色
 * - mode=department：用户组织命中允许组织
 */
function restrictionAllows(
  permissionCode: string,
  menuPermissions: MenuPermissionEntry[] | undefined,
  ctx: MenuAccessContext | undefined,
): boolean {
  if (!menuPermissions || !menuPermissions.length) return true;
  const perm = menuPermissions.find((p) => p.code === permissionCode);
  if (!perm) return true;
  const r = perm.access_restriction;
  if (!r || r.mode === 'none') return true;
  if (r.mode === 'role') {
    const userRoleIds = ctx?.roleIds || [];
    return (r.roleIds || []).some((id) => userRoleIds.includes(id));
  }
  if (r.mode === 'department') {
    const deptId = ctx?.departmentId ? String(ctx.departmentId) : null;
    return Boolean(deptId) && (r.departmentIds || []).includes(deptId!);
  }
  return true;
}

function isMenuAllowed(
  permissionCode: string,
  menuPermissions: MenuPermissionEntry[] | undefined,
  ctx: MenuAccessContext | undefined,
): boolean {
  if (!ctx?.threeMemberEnabled) {
    if (ctx?.isSuperAdmin) return true;
    return restrictionAllows(permissionCode, menuPermissions, ctx);
  }
  if (!restrictionAllows(permissionCode, menuPermissions, ctx)) return false;
  const perm = menuPermissions?.find((item) => item.code === permissionCode);
  return menuVisibleForThreeMember(permissionCode, ctx.threeMemberRole, perm?.three_member_duty);
}

export function buildMenuData(
  features?: API.SystemFeatures,
  menuPermissions?: MenuPermissionEntry[],
  accessCtx?: MenuAccessContext,
): MenuDataItem[] {
  const visibleRoutes = appRouteMeta.filter((item) => {
    if (!item.requiresFeature) return true;
    if (item.requiresFeature === 'metadataEnabled') return Boolean(features?.metadataEnabled);
    if (item.requiresFeature === 'threeMemberEnabled') return Boolean(features?.threeMemberEnabled);
    return true;
  });

  // 菜单根 path（如 /member_org）→ MENU 权限 code（member_org:manage）
  const rootToPermissionCode = (rootPath: string) => {
    const seg = rootPath.replace(/^\//, '');
    return `${seg}:manage`;
  };

  const roots = visibleRoutes.filter(
    (item) =>
      item.path.split('/').filter(Boolean).length === 1 &&
      item.name &&
      !item.hideInMenu,
  );

  return roots
    .filter((root) => isMenuAllowed(rootToPermissionCode(root.path), menuPermissions, accessCtx))
    .map((root) => {
      const prefix = root.path;
      const systemAdminDatabaseOnly =
        Boolean(accessCtx?.threeMemberEnabled) &&
        accessCtx?.threeMemberRole === 'system_admin' &&
        prefix === '/business_data';
      const children = visibleRoutes
        .filter((item) => isMenuChildOf(prefix, item, visibleRoutes))
        .filter((child) => {
          if (!accessCtx?.threeMemberEnabled) return true;
          if (child.path === '/three_member/approvals') return accessCtx.threeMemberRole === 'security_admin';
          if (child.path === '/three_member/audit') return accessCtx.threeMemberRole === 'auditor';
          if (systemAdminDatabaseOnly) return child.path === SYSTEM_ADMIN_DATABASE_CONNECTION_PATH;
          return true;
        })
        .map((child) => ({
          path: child.path,
          name: child.name,
        }));

      return {
        path: systemAdminDatabaseOnly ? SYSTEM_ADMIN_DATABASE_CONNECTION_PATH : prefix,
        name: root.name,
        icon: root.icon,
        children: children.length ? children : undefined,
      };
    });
}

export function findRouteMeta(pathname: string): AppRouteMeta | undefined {
  const exact = appRouteMeta.find((item) => item.path === pathname);
  if (exact) return exact;

  const dynamicMatch = [...appRouteMeta]
    .filter((item) => item.path.includes(':'))
    .filter((item) => matchPath({ path: item.path, end: true }, pathname))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (dynamicMatch) return dynamicMatch;

  // 最长前缀匹配（静态路径嵌套路由元数据）
  return [...appRouteMeta]
    .filter((item) => !item.path.includes(':'))
    .filter((item) => pathname.startsWith(`${item.path}/`) || pathname === item.path)
    .sort((a, b) => b.path.length - a.path.length)[0];
}
