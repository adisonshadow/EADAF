import { createMutatingHandler } from '@/ai/toolMutation';
import { getBusinessDataScopes } from '@/services/EADAF/api/businessData';
import { getDepartmentsTree } from '@/services/EADAF/api/departments';
import {
  getPermissions,
  getPermissionsRules,
  postPermissions,
  postPermissionsRules,
  putPermissionsPermissionId,
} from '@/services/EADAF/api/permissions';
import {
  deleteRolesRoleId,
  getRoles,
  getRolesRoleId,
  postRoles,
  postRolesRoleIdPermissions,
  putRolesRoleId,
} from '@/services/EADAF/api/roles';
import {
  deleteUsersUserId,
  getUsers,
  getUsersUserId,
  postUsers,
  putUsersUserId,
  putUsersUserIdRoles,
} from '@/services/EADAF/api/users';
import { getApiData, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { registerFunctionCall, unregisterFunctionCall } from '@eadaf/ai-base';

const EADAF_DOMAIN = 'uac';

/** /api/v1/users 不支持 size=-1；无效/负数按「大页」处理，上限 500 */
function normalizeUserPageSize(size: unknown, fallback = 500): number {
  const n = typeof size === 'number' ? size : Number(size);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), 500);
}

const TOOL_NAMES = [
  'uac_list_users',
  'uac_filter_users',
  'uac_get_user',
  'uac_create_user',
  'uac_update_user',
  'uac_delete_user',
  'uac_assign_user_roles',
  'uac_list_roles',
  'uac_get_role',
  'uac_create_role',
  'uac_update_role',
  'uac_delete_role',
  'uac_set_role_permissions',
  'uac_list_permissions',
  'uac_create_permission',
  'uac_update_permission',
  'uac_list_departments_tree',
  'uac_list_bizdata_scopes',
  'uac_create_data_rule',
  'uac_list_data_rules',
] as const;

function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function generatePassword(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function registerEadafTools() {
  registerFunctionCall({
    name: 'uac_list_users',
    description:
      '分页列出用户。禁止传 size=-1（用户接口不支持，会 500）；拉较多数据用 page=1&size=500，或改用 uac_filter_users',
    parameters: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: '页码，从 1 起' },
        size: {
          type: 'integer',
          description: '每页条数，1–500；禁止 -1',
          minimum: 1,
          maximum: 500,
        },
        username: { type: 'string' },
        name: { type: 'string' },
        status: { type: 'string' },
      },
    },
    handler: async (args) => {
      const res = await getUsers({
        page: (args.page as number) || 1,
        // 模型常误传 size=-1（角色列表习惯）；-1 在 JS 中为真值，不能用 || 兜底
        size: normalizeUserPageSize(args.size, 500),
        username: args.username as string,
        name: args.name as string,
        status: args.status as API.getUsersParams['status'],
      });
      return parseApiListResponse(res).items;
    },
  });

  registerFunctionCall({
    name: 'uac_filter_users',
    description:
      '按过滤项检索用户（用户名/姓名/邮箱/电话/状态/部门/用户ID），内部固定 page=1&size=500；勿传 size=-1',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        status: { type: 'string', enum: ['ACTIVE', 'DISABLED', 'ARCHIVED'] },
        departmentId: { type: 'string', description: '部门ID' },
        userId: { type: 'string', description: '用户ID精确匹配' },
      },
    },
    handler: async (args) => {
      const res = await getUsers({
        page: 1,
        size: 500,
        username: args.username as string,
        name: args.name as string,
        email: args.email as string,
        phone: args.phone as string,
        status: args.status as API.getUsersParams['status'],
        department_id: args.departmentId as string,
        user_id: args.userId as string,
      });
      const { items, total } = parseApiListResponse(res);
      return { items, total };
    },
  });

  registerFunctionCall({
    name: 'uac_get_user',
    description: '获取用户详情',
    parameters: {
      type: 'object',
      properties: { userId: { type: 'string' } },
      required: ['userId'],
    },
    handler: async (args) => getApiData(await getUsersUserId({ user_id: String(args.userId) })),
  });

  registerFunctionCall({
    name: 'uac_create_user',
    description: '创建用户',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        gender: { type: 'string' },
        departmentId: { type: 'string' },
        roleIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['username', 'name', 'departmentId'],
    },
    handler: createMutatingHandler({
      domain: EADAF_DOMAIN,
      type: 'user.created',
      scope: 'member_org.member',
      buildResourceId: (_args, data) => (data as { user_id?: string })?.user_id,
      handler: async (args) => {
        const password = (args.password as string) || generatePassword();
        const res = await postUsers({
          username: String(args.username),
          password,
          name: String(args.name),
          email: args.email as string,
          phone: args.phone as string,
          gender: args.gender as 'MALE' | 'FEMALE' | 'OTHER',
          department_id: String(args.departmentId),
          role_ids: args.roleIds as string[],
        });
        const data = getApiData(res);
        if (!data) throw new Error('创建用户失败');
        return { ...data, generated_password: args.password ? undefined : password };
      },
    }),
  });

  registerFunctionCall({
    name: 'uac_update_user',
    description: '更新用户信息',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        gender: { type: 'string' },
        departmentId: { type: 'string' },
        status: { type: 'string' },
      },
      required: ['userId'],
    },
    handler: createMutatingHandler({
      domain: EADAF_DOMAIN,
      type: 'user.updated',
      scope: 'member_org.member',
      buildResourceId: (args) => String(args.userId),
      handler: async (args) => {
        const res = await putUsersUserId(
          { user_id: String(args.userId) },
          pickDefined({
            name: args.name as string,
            email: args.email as string,
            phone: args.phone as string,
            gender: args.gender as 'MALE' | 'FEMALE' | 'OTHER',
            department_id: args.departmentId as string,
            status: args.status as 'ACTIVE' | 'DISABLED' | 'ARCHIVED',
          }),
        );
        const data = getApiData(res);
        if (!data) throw new Error('更新用户失败');
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'uac_delete_user',
    description: '删除用户',
    parameters: {
      type: 'object',
      properties: { userId: { type: 'string' } },
      required: ['userId'],
    },
    handler: createMutatingHandler({
      domain: EADAF_DOMAIN,
      type: 'user.deleted',
      scope: 'member_org.member',
      buildResourceId: (args) => String(args.userId),
      handler: async (args) => {
        await deleteUsersUserId({ user_id: String(args.userId) });
        return { user_id: String(args.userId), deleted: true };
      },
    }),
  });

  registerFunctionCall({
    name: 'uac_assign_user_roles',
    description: '全量分配用户角色',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        roleIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['userId', 'roleIds'],
    },
    handler: createMutatingHandler({
      domain: EADAF_DOMAIN,
      type: 'user.roles_updated',
      scope: 'member_org.member',
      buildResourceId: (args) => String(args.userId),
      handler: async (args) => {
        const res = await putUsersUserIdRoles(
          { user_id: String(args.userId) },
          { role_ids: args.roleIds as string[] },
        );
        return getApiData(res) ?? { user_id: String(args.userId), role_ids: args.roleIds };
      },
    }),
  });

  registerFunctionCall({
    name: 'uac_list_roles',
    description: '列出角色',
    parameters: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        size: { type: 'integer' },
        status: { type: 'string' },
      },
    },
    handler: async (args) => {
      const res = await getRoles({
        page: (args.page as number) || 1,
        size: args.size !== undefined ? (args.size as number) : -1,
        status: args.status as API.getRolesParams['status'],
      });
      return parseApiListResponse(res).items;
    },
  });

  registerFunctionCall({
    name: 'uac_get_role',
    description: '获取角色详情',
    parameters: {
      type: 'object',
      properties: { roleId: { type: 'string' } },
      required: ['roleId'],
    },
    handler: async (args) => getApiData(await getRolesRoleId({ role_id: String(args.roleId) })),
  });

  registerFunctionCall({
    name: 'uac_create_role',
    description: '创建角色',
    parameters: {
      type: 'object',
      properties: {
        roleName: { type: 'string' },
        code: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
      },
      required: ['roleName', 'code'],
    },
    handler: createMutatingHandler({
      domain: EADAF_DOMAIN,
      type: 'role.created',
      scope: 'member_org.role',
      buildResourceId: (_args, data) => (data as { role_id?: string })?.role_id,
      handler: async (args) => {
        const res = await postRoles({
          role_name: String(args.roleName),
          code: String(args.code),
          description: args.description as string,
          status: (args.status as 'ACTIVE' | 'ARCHIVED') || 'ACTIVE',
        });
        const data = getApiData(res);
        if (!data) throw new Error('创建角色失败');
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'uac_update_role',
    description: '更新角色',
    parameters: {
      type: 'object',
      properties: {
        roleId: { type: 'string' },
        roleName: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['roleId'],
    },
    handler: createMutatingHandler({
      domain: EADAF_DOMAIN,
      type: 'role.updated',
      scope: 'member_org.role',
      buildResourceId: (args) => String(args.roleId),
      handler: async (args) => {
        const res = await putRolesRoleId(
          { role_id: String(args.roleId) },
          pickDefined({
            role_name: args.roleName as string,
            description: args.description as string,
          }),
        );
        const data = getApiData(res);
        if (!data) throw new Error('更新角色失败');
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'uac_delete_role',
    description: '删除角色',
    parameters: {
      type: 'object',
      properties: { roleId: { type: 'string' } },
      required: ['roleId'],
    },
    handler: createMutatingHandler({
      domain: EADAF_DOMAIN,
      type: 'role.deleted',
      scope: 'member_org.role',
      buildResourceId: (args) => String(args.roleId),
      handler: async (args) => {
        await deleteRolesRoleId({ role_id: String(args.roleId) });
        return { role_id: String(args.roleId), deleted: true };
      },
    }),
  });

  registerFunctionCall({
    name: 'uac_set_role_permissions',
    description: '全量设置角色权限',
    parameters: {
      type: 'object',
      properties: {
        roleId: { type: 'string' },
        permissionIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['roleId', 'permissionIds'],
    },
    handler: createMutatingHandler({
      domain: EADAF_DOMAIN,
      type: 'role.permissions_updated',
      scope: 'member_org.role',
      buildResourceId: (args) => String(args.roleId),
      handler: async (args) => {
        await postRolesRoleIdPermissions(
          { role_id: String(args.roleId) },
          { permission_ids: args.permissionIds as string[] },
        );
        return {
          role_id: String(args.roleId),
          permission_ids: args.permissionIds,
        };
      },
    }),
  });

  registerFunctionCall({
    name: 'uac_list_permissions',
    description: '列出权限',
    parameters: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        size: { type: 'integer' },
        resourceType: { type: 'string' },
        code: { type: 'string' },
      },
    },
    handler: async (args) => {
      const res = await getPermissions({
        page: (args.page as number) || 1,
        size: args.size !== undefined ? (args.size as number) : -1,
        type: args.resourceType as API.getPermissionsParams['type'],
        code: args.code as string,
      });
      return parseApiListResponse(res).items;
    },
  });

  registerFunctionCall({
    name: 'uac_create_permission',
    description: '创建权限',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        description: { type: 'string' },
        resourceType: { type: 'string' },
        actions: { type: 'array', items: { type: 'string' } },
      },
      required: ['code', 'resourceType', 'actions'],
    },
    handler: createMutatingHandler({
      domain: EADAF_DOMAIN,
      type: 'permission.created',
      scope: 'permissions',
      buildResourceId: (_args, data) => (data as { permission_id?: string })?.permission_id,
      handler: async (args) => {
        const res = await postPermissions({
          code: String(args.code),
          description: args.description as string,
          resource_type: args.resourceType as 'MENU' | 'BUTTON' | 'API',
          actions: args.actions as ('create' | 'read' | 'update' | 'delete')[],
        });
        const data = getApiData(res);
        if (!data) throw new Error('创建权限失败');
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'uac_update_permission',
    description: '更新权限',
    parameters: {
      type: 'object',
      properties: {
        permissionId: { type: 'string' },
        description: { type: 'string' },
        actions: { type: 'array', items: { type: 'string' } },
        status: { type: 'string' },
      },
      required: ['permissionId'],
    },
    handler: createMutatingHandler({
      domain: EADAF_DOMAIN,
      type: 'permission.updated',
      scope: 'permissions',
      buildResourceId: (args) => String(args.permissionId),
      handler: async (args) => {
        const res = await putPermissionsPermissionId(
          { permission_id: String(args.permissionId) },
          pickDefined({
            description: args.description as string,
            actions: args.actions as ('create' | 'read' | 'update' | 'delete')[],
            status: args.status as 'ACTIVE' | 'DISABLED' | 'ARCHIVED',
          }),
        );
        const data = getApiData(res);
        if (!data) throw new Error('更新权限失败');
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'uac_list_departments_tree',
    description: '获取部门树',
    parameters: { type: 'object', properties: {} },
    handler: async () => getApiData(await getDepartmentsTree()),
  });

  registerFunctionCall({
    name: 'uac_list_bizdata_scopes',
    description: '列出 bizdata 业务域 Scope 树',
    parameters: { type: 'object', properties: {} },
    handler: async () => getApiData(await getBusinessDataScopes()),
  });

  registerFunctionCall({
    name: 'uac_create_data_rule',
    description: '创建数据权限规则',
    parameters: {
      type: 'object',
      properties: {
        roleId: { type: 'string' },
        resourceType: { type: 'string' },
        conditions: { type: 'object' },
      },
      required: ['roleId', 'resourceType', 'conditions'],
    },
    handler: createMutatingHandler({
      domain: EADAF_DOMAIN,
      type: 'data_rule.created',
      scope: 'member_org.role',
      buildResourceId: (_args, data) => (data as { rule_id?: string })?.rule_id,
      handler: async (args) => {
        const res = await postPermissionsRules({
          role_id: String(args.roleId),
          resource_type: String(args.resourceType),
          conditions: args.conditions as Record<string, unknown>,
        });
        const data = getApiData(res);
        if (!data) throw new Error('创建数据权限规则失败');
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'uac_list_data_rules',
    description: '列出数据权限规则',
    parameters: {
      type: 'object',
      properties: {
        roleId: { type: 'string' },
        resourceType: { type: 'string' },
      },
    },
    handler: async (args) => {
      const res = await getPermissionsRules({
        params: pickDefined({
          role_id: args.roleId as string,
          resource_type: args.resourceType as string,
        }),
      });
      if (!isApiSuccess(res)) {
        throw new Error(res.message || '获取数据权限规则失败');
      }
      const data = getApiData(res);
      if (Array.isArray(data)) return data;
      const items = (data as { items?: unknown[] })?.items;
      return Array.isArray(items) ? items : [];
    },
  });
}

export function unregisterEadafTools() {
  for (const name of TOOL_NAMES) {
    unregisterFunctionCall(name);
  }
}
