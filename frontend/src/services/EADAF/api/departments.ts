// @ts-ignore
/* eslint-disable */
import { request } from '@/utils/request';

/** 获取部门列表 [需要认证] 获取部门列表，支持分页和筛选。当 size 参数为 -1 时，返回所有记录不分页。 GET /api/v1/departments */
export async function getDepartments(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getDepartmentsParams,
  options?: { [key: string]: any },
) {
  return request<{
    code?: number;
    message?: string;
    data?: {
      total?: number;
      page?: number;
      size?: number;
      items?: API.Department[];
    };
  }>('/api/v1/departments', {
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

/** 创建部门 [需要认证] 创建新的部门 POST /api/v1/departments */
export async function postDepartments(
  body: {
    /** 部门名称 */
    name: string;
    /** 部门描述 */
    description?: string;
    /** 父部门ID */
    parent_id?: string;
    /** 部门状态 */
    status?: 'ACTIVE' | 'DISABLED';
  },
  options?: { [key: string]: any },
) {
  return request<{
    code?: number;
    message?: string;
    data?: {
      department_id?: string;
      name?: string;
      description?: string;
      parent_id?: string;
      status?: string;
      created_at?: string;
    };
  }>('/api/v1/departments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 获取部门详情 [需要认证] 获取指定部门的详细信息 GET /api/v1/departments/${param0} */
export async function getDepartmentsDepartmentId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getDepartmentsDepartmentIdParams,
  options?: { [key: string]: any },
) {
  const { department_id: param0, ...queryParams } = params;
  return request<{
    code?: number;
    message?: string;
    data?: {
      department_id?: string;
      name?: string;
      description?: string;
      parent_id?: string;
      status?: string;
      created_at?: string;
      updated_at?: string;
      parent?: { department_id?: string; name?: string };
    };
  }>(`/api/v1/departments/${param0}`, {
    method: 'GET',
    params: { ...queryParams },
    ...(options || {}),
  });
}

/** 更新部门 [需要认证] 更新指定部门的信息 PUT /api/v1/departments/${param0} */
export async function putDepartmentsDepartmentId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.putDepartmentsDepartmentIdParams,
  body: {
    /** 部门名称 */
    name?: string;
    /** 部门描述 */
    description?: string;
    /** 父部门ID */
    parent_id?: string;
    /** 部门状态 */
    status?: 'ACTIVE' | 'DISABLED';
  },
  options?: { [key: string]: any },
) {
  const { department_id: param0, ...queryParams } = params;
  return request<{
    code?: number;
    message?: string;
    data?: {
      department_id?: string;
      name?: string;
      description?: string;
      parent_id?: string;
      status?: string;
      updated_at?: string;
    };
  }>(`/api/v1/departments/${param0}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}

/** 删除部门 [需要认证] 删除指定部门 DELETE /api/v1/departments/${param0} */
export async function deleteDepartmentsDepartmentId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.deleteDepartmentsDepartmentIdParams,
  options?: { [key: string]: any },
) {
  const { department_id: param0, ...queryParams } = params;
  return request<{ code?: number; message?: string; data?: any }>(
    `/api/v1/departments/${param0}`,
    {
      method: 'DELETE',
      params: { ...queryParams },
      ...(options || {}),
    },
  );
}

/** 获取部门用户 [需要认证] 获取指定部门的所有用户 GET /api/v1/departments/${param0}/users */
export async function getDepartmentsDepartmentIdUsers(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getDepartmentsDepartmentIdUsersParams,
  options?: { [key: string]: any },
) {
  const { department_id: param0, ...queryParams } = params;
  return request<{
    code?: number;
    message?: string;
    data?: {
      user_id?: string;
      username?: string;
      name?: string;
      email?: string;
      phone?: string;
      status?: string;
    }[];
  }>(`/api/v1/departments/${param0}/users`, {
    method: 'GET',
    params: {
      ...queryParams,
    },
    ...(options || {}),
  });
}

/** 获取部门树 获取部门树形结构，返回所有未删除的部门，按层级组织 GET /api/v1/departments/tree */
export async function getDepartmentsTree(options?: { [key: string]: any }) {
  return request<{
    code?: number;
    message?: string;
    data?: { items?: API.DepartmentTreeItem[] };
  }>('/api/v1/departments/tree', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 更新部门角色 [需要认证] PUT /api/v1/departments/${param0}/roles */
export async function putDepartmentsDepartmentIdRoles(
  params: { department_id: string },
  body: { role_ids: string[] },
  options?: { [key: string]: any },
) {
  const { department_id: param0, ...queryParams } = params;
  return request<{
    code?: number;
    message?: string;
    data?: { department_id?: string; roles?: { role_id?: string; role_name?: string; code?: string }[] };
  }>(`/api/v1/departments/${param0}/roles`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}
