// @ts-ignore
/* eslint-disable */
import { request } from '@/utils/request';

/** 获取权限列表 [需要认证] 获取权限列表，支持分页和筛选。当 size 参数为 -1 时，返回所有记录不分页。 GET /api/v1/permissions */
export async function getPermissions(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getPermissionsParams,
  options?: { [key: string]: any },
) {
  return request<{
    code?: number;
    message?: string;
    data?: {
      total?: number;
      page?: number;
      size?: number;
      items?: API.Permission[];
    };
  }>('/api/v1/permissions', {
    method: 'GET',
    params: {
      // page has a default value: 1
      page: '1',
      // size has a default value: 10
      size: '10',

      ...params,
    },
    ...(options || {}),
  });
}

/** 创建权限 [需要认证] 创建新的权限 POST /api/v1/permissions */
export async function postPermissions(
  body: {
    /** 权限编码 */
    code: string;
    /** 权限描述 */
    description?: string;
    /** 资源类型 */
    resource_type: 'MENU' | 'BUTTON' | 'API';
    /** 操作类型列表 */
    actions: ('create' | 'read' | 'update' | 'delete')[];
  },
  options?: { [key: string]: any },
) {
  return request<{
    code?: number;
    message?: string;
    data?: {
      permission_id?: string;
      code?: string;
      description?: string;
      resource_type?: string;
      actions?: string[];
      created_at?: string;
    };
  }>('/api/v1/permissions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 获取权限详情 [需要认证] 获取指定权限的详细信息 GET /api/v1/permissions/${param0} */
export async function getPermissionsPermissionId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getPermissionsPermissionIdParams,
  options?: { [key: string]: any },
) {
  const { permission_id: param0, ...queryParams } = params;
  return request<{
    code?: number;
    message?: string;
    data?: {
      permission_id?: string;
      code?: string;
      description?: string;
      resource_type?: string;
      actions?: string[];
      created_at?: string;
      updated_at?: string;
    };
  }>(`/api/v1/permissions/${param0}`, {
    method: 'GET',
    params: { ...queryParams },
    ...(options || {}),
  });
}

/** 更新权限 [需要认证] 更新指定权限的信息 PUT /api/v1/permissions/${param0} */
export async function putPermissionsPermissionId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.putPermissionsPermissionIdParams,
  body: {
    /** 权限描述 */
    description?: string;
    /** 资源类型 */
    resource_type?: 'MENU' | 'BUTTON' | 'API';
    /** 操作类型列表 */
    actions?: ('create' | 'read' | 'update' | 'delete')[];
    /** 访问限制（菜单/按钮运行时可见性） */
    access_restriction?: { mode: 'none' | 'role' | 'department'; roleIds?: string[]; departmentIds?: string[] };
  },
  options?: { [key: string]: any },
) {
  const { permission_id: param0, ...queryParams } = params;
  return request<{
    code?: number;
    message?: string;
    data?: {
      permission_id?: string;
      code?: string;
      description?: string;
      resource_type?: string;
      actions?: string[];
      access_restriction?: { mode: string; roleIds?: string[]; departmentIds?: string[] } | null;
      created_at?: string;
    };
  }>(`/api/v1/permissions/${param0}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}

/** 删除权限 [需要认证] 删除指定权限 DELETE /api/v1/permissions/${param0} */
export async function deletePermissionsPermissionId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.deletePermissionsPermissionIdParams,
  options?: { [key: string]: any },
) {
  const { permission_id: param0, ...queryParams } = params;
  return request<{ code?: number; message?: string }>(
    `/api/v1/permissions/${param0}`,
    {
      method: 'DELETE',
      params: { ...queryParams },
      ...(options || {}),
    },
  );
}

/** 分配角色权限 [需要认证] 为指定角色分配权限 POST /api/v1/permissions/${param0}/roles */
export async function postPermissionsPermissionIdRoles(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.postPermissionsPermissionIdRolesParams,
  body: {
    /** 角色ID列表 */
    role_ids: string[];
  },
  options?: { [key: string]: any },
) {
  const { permission_id: param0, ...queryParams } = params;
  return request<{ code?: number; message?: string }>(
    `/api/v1/permissions/${param0}/roles`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      params: { ...queryParams },
      data: body,
      ...(options || {}),
    },
  );
}

/** 检查权限 [需要认证] 检查用户是否拥有指定资源类型的多个操作权限 GET /api/v1/permissions/check */
export async function getPermissionsCheck(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getPermissionsCheckParams,
  options?: { [key: string]: any },
) {
  return request<{
    code?: number;
    message?: string;
    data?: {
      has_permission?: boolean;
      permissions?: {
        permission_id?: string;
        name?: string;
        code?: string;
        actions?: string[];
      }[];
    };
  }>('/api/v1/permissions/check', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  });
}

/** 获取数据权限规则列表 [需要认证] 获取所有数据权限规则 GET /api/v1/permissions/rules */
export async function getPermissionsRules(options?: { [key: string]: any }) {
  return request<{
    code?: number;
    message?: string;
    data?: {
      items?: {
        rule_id?: string;
        role_id?: string;
        resource_type?: string;
        conditions?: Record<string, any>;
        status?: string;
      }[];
      total?: number;
    };
  }>('/api/v1/permissions/rules', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 创建数据权限规则 [需要认证] 创建新的数据权限规则 POST /api/v1/permissions/rules */
export async function postPermissionsRules(
  body: {
    /** 角色ID */
    role_id: string;
    /** 资源类型 */
    resource_type: string;
    /** 权限条件 */
    conditions: Record<string, any>;
  },
  options?: { [key: string]: any },
) {
  return request<{
    code?: number;
    message?: string;
    data?: {
      rule_id?: string;
      role_id?: string;
      resource_type?: string;
      conditions?: Record<string, any>;
      status?: string;
    };
  }>('/api/v1/permissions/rules', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 获取用户权限 [需要认证] 获取指定用户的所有权限 GET /api/v1/permissions/users/${param0} */
export async function getPermissionsUsersUserId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getPermissionsUsersUserIdParams,
  options?: { [key: string]: any },
) {
  const { user_id: param0, ...queryParams } = params;
  return request<{
    code?: number;
    message?: string;
    data?: {
      permission_id?: string;
      permission_name?: string;
      code?: string;
      description?: string;
    }[];
  }>(`/api/v1/permissions/users/${param0}`, {
    method: 'GET',
    params: { ...queryParams },
    ...(options || {}),
  });
}
