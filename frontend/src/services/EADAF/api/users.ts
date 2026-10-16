// @ts-ignore
/* eslint-disable */
import { request } from '@/utils/request';

/** 获取用户列表 [需要认证] 获取用户列表，支持分页和多种筛选条件 GET /api/v1/users */
export async function getUsers(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getUsersParams,
  options?: { [key: string]: any },
) {
  return request<{
    code?: number;
    message?: string;
    data?: { total?: number; page?: number; size?: number; items?: API.User[] };
  }>('/api/v1/users', {
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

/** 创建用户 [需要认证] 创建新用户 POST /api/v1/users */
export async function postUsers(
  body: {
    /** 用户ID（可选；不传时系统自动生成） */
    user_id?: string;
    /** 用户名 */
    username: string;
    /** 密码 */
    password: string;
    /** 姓名 */
    name: string;
    /** 邮箱 */
    email?: string;
    /** 电话 */
    phone?: string;
    /** 性别 */
    gender?: 'MALE' | 'FEMALE' | 'OTHER';
    /** 头像URL */
    avatar?: string;
    /** 部门ID */
    department_id?: string;
    /** 角色ID列表 */
    role_ids?: string[];
  },
  options?: { [key: string]: any },
) {
  return request<{ code?: number; message?: string; data?: API.User }>(
    '/api/v1/users',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: body,
      ...(options || {}),
    },
  );
}

/** 获取用户详情 [需要认证] 获取指定用户的详细信息 GET /api/v1/users/${param0} */
export async function getUsersUserId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getUsersUserIdParams,
  options?: { [key: string]: any },
) {
  const { user_id: param0, ...queryParams } = params;
  return request<{ code?: number; message?: string; data?: API.User }>(
    `/api/v1/users/${param0}`,
    {
      method: 'GET',
      params: { ...queryParams },
      ...(options || {}),
    },
  );
}

/** 更新用户信息 [需要认证] 更新指定用户的信息 PUT /api/v1/users/${param0} */
export async function putUsersUserId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.putUsersUserIdParams,
  body: {
    /** 姓名 */
    name?: string;
    /** 邮箱 */
    email?: string;
    /** 电话 */
    phone?: string;
    /** 性别 */
    gender?: 'MALE' | 'FEMALE' | 'OTHER';
    /** 头像URL */
    avatar?: string;
    /** 部门ID */
    department_id?: string;
    /** 用户状态 */
    status?: 'ACTIVE' | 'DISABLED' | 'ARCHIVED';
  },
  options?: { [key: string]: any },
) {
  const { user_id: param0, ...queryParams } = params;
  return request<{ code?: number; message?: string; data?: API.User }>(
    `/api/v1/users/${param0}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      params: { ...queryParams },
      data: body,
      ...(options || {}),
    },
  );
}

/** 删除用户 [需要认证] 删除指定用户 DELETE /api/v1/users/${param0} */
export async function deleteUsersUserId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.deleteUsersUserIdParams,
  options?: { [key: string]: any },
) {
  const { user_id: param0, ...queryParams } = params;
  return request<{ code?: number; message?: string; data?: any }>(
    `/api/v1/users/${param0}`,
    {
      method: 'DELETE',
      params: { ...queryParams },
      ...(options || {}),
    },
  );
}

/** 上传用户头像 [需要认证] 上传并更新用户头像 POST /api/v1/users/${param0}/avatar */
export async function postUsersUserIdAvatar(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.postUsersUserIdAvatarParams,
  body: {},
  avatar?: File,
  options?: { [key: string]: any },
) {
  const { user_id: param0, ...queryParams } = params;
  const formData = new FormData();

  if (avatar) {
    formData.append('avatar', avatar);
  }

  Object.keys(body).forEach((ele) => {
    const item = (body as any)[ele];

    if (item !== undefined && item !== null) {
      if (typeof item === 'object' && !(item instanceof File)) {
        if (item instanceof Array) {
          item.forEach((f) => formData.append(ele, f || ''));
        } else {
          formData.append(ele, JSON.stringify(item));
        }
      } else {
        formData.append(ele, item);
      }
    }
  });

  return request<any>(`/api/v1/users/${param0}/avatar`, {
    method: 'POST',
    params: { ...queryParams },
    data: formData,
    requestType: 'form',
    ...(options || {}),
  });
}

/** 修改密码 [需要认证] 用户通过旧密码修改为新密码 POST /api/v1/users/${param0}/change-password */
export async function postUsersUserIdChangePassword(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.postUsersUserIdChangePasswordParams,
  body: {
    /** 旧密码 */
    old_password: string;
    /** 新密码 */
    new_password: string;
  },
  options?: { [key: string]: any },
) {
  const { user_id: param0, ...queryParams } = params;
  return request<{ code?: number; message?: string; data?: any }>(
    `/api/v1/users/${param0}/change-password`,
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

/** 恢复已删除用户 [需要认证] 恢复被软删除的用户 POST /api/v1/users/${param0}/restore */
export async function postUsersUserIdRestore(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.postUsersUserIdRestoreParams,
  options?: { [key: string]: any },
) {
  const { user_id: param0, ...queryParams } = params;
  return request<any>(`/api/v1/users/${param0}/restore`, {
    method: 'POST',
    params: { ...queryParams },
    ...(options || {}),
  });
}

/** 更新用户角色 [需要认证] 更新指定用户的角色 PUT /api/v1/users/${param0}/roles */
export async function putUsersUserIdRoles(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.putUsersUserIdRolesParams,
  body: {
    /** 角色ID列表 */
    role_ids: string[];
  },
  options?: { [key: string]: any },
) {
  const { user_id: param0, ...queryParams } = params;
  return request<{
    code?: number;
    message?: string;
    data?: { user_id?: string; roles?: { role_id?: string; name?: string }[] };
  }>(`/api/v1/users/${param0}/roles`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}

/** 更新用户状态 [需要认证] 更新指定用户的状态 PUT /api/v1/users/${param0}/status */
export async function putUsersUserIdStatus(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.putUsersUserIdStatusParams,
  body: {
    /** 用户状态 */
    status: 'ACTIVE' | 'DISABLED' | 'ARCHIVED';
  },
  options?: { [key: string]: any },
) {
  const { user_id: param0, ...queryParams } = params;
  return request<any>(`/api/v1/users/${param0}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}

/** 请求重置密码 通过用户名和邮箱请求重置密码，系统会发送重置令牌到邮箱 POST /api/v1/users/request-password-reset */
export async function postUsersRequestPasswordReset(
  body: {
    /** 用户名 */
    username: string;
    /** 邮箱 */
    email: string;
  },
  options?: { [key: string]: any },
) {
  return request<{ code?: number; message?: string; data?: any }>(
    '/api/v1/users/request-password-reset',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: body,
      ...(options || {}),
    },
  );
}

/** 重置密码 [需要认证] 重置用户密码 POST /api/v1/users/reset-password */
export async function postUsersResetPassword(
  body: {
    /** 用户名 */
    username: string;
    /** 邮箱 */
    email: string;
  },
  options?: { [key: string]: any },
) {
  return request<any>('/api/v1/users/reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 使用令牌重置密码 使用重置令牌重置密码 POST /api/v1/users/reset-password-with-token */
export async function postUsersResetPasswordWithToken(
  body: {
    /** 用户名 */
    username: string;
    /** 重置令牌（8位） */
    token: string;
    /** 新密码 */
    new_password: string;
  },
  options?: { [key: string]: any },
) {
  return request<{ code?: number; message?: string; data?: any }>(
    '/api/v1/users/reset-password-with-token',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: body,
      ...(options || {}),
    },
  );
}
