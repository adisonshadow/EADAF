// @ts-ignore
import { request } from '@/utils/request';

/** 内置 API 访问限制 */
export interface BuiltinApiAccessRestriction {
  mode: 'role' | 'department';
  roleIds?: string[];
  departmentIds?: string[];
}

/** 内置 API 清单项（合并限制配置后） */
export interface BuiltinApiItem {
  code: string;
  domain: string;
  label: string;
  routePath: string;
  httpMethods: string[];
  actions: string[];
  description: string;
  accessRestriction: BuiltinApiAccessRestriction | null;
  configured: boolean;
}

/** 内置 API 树节点 */
export interface BuiltinApiTreeNode {
  code: string;
  label: string;
  key: string;
  isLeaf: boolean;
  fullCode?: string;
  children?: BuiltinApiTreeNode[];
}

/** 获取内置 API 清单（含限制配置与树） GET /api/v1/admin/builtin-apis */
export async function getBuiltinApis(options?: { [key: string]: any }) {
  return request<{
    code: number;
    message: string;
    data: {
      items: BuiltinApiItem[];
      tree: BuiltinApiTreeNode[];
    };
  }>('/api/v1/admin/builtin-apis', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 配置内置 API 访问限制 PUT /api/v1/admin/builtin-apis/:code/access-restriction */
export async function putBuiltinApiAccessRestriction(
  code: string,
  accessRestriction: BuiltinApiAccessRestriction,
  options?: { [key: string]: any },
) {
  return request<{
    code: number;
    message: string;
    data: { code: string; accessRestriction: BuiltinApiAccessRestriction };
  }>(`/api/v1/admin/builtin-apis/${encodeURIComponent(code)}/access-restriction`, {
    method: 'PUT',
    data: { accessRestriction },
    ...(options || {}),
  });
}

/** 清除内置 API 访问限制 DELETE /api/v1/admin/builtin-apis/:code/access-restriction */
export async function deleteBuiltinApiAccessRestriction(
  code: string,
  options?: { [key: string]: any },
) {
  return request<{
    code: number;
    message: string;
    data: null;
  }>(`/api/v1/admin/builtin-apis/${encodeURIComponent(code)}/access-restriction`, {
    method: 'DELETE',
    ...(options || {}),
  });
}

/** 批量配置域下内置 API 访问限制 PUT /api/v1/admin/builtin-apis/batch/access-restriction */
export async function putBuiltinApiBatchAccessRestriction(
  domainPrefix: string,
  accessRestriction: BuiltinApiAccessRestriction,
  options?: { [key: string]: any },
) {
  return request<{
    code: number;
    message: string;
    data: { domainPrefix: string; appliedCount: number; accessRestriction: BuiltinApiAccessRestriction };
  }>('/api/v1/admin/builtin-apis/batch/access-restriction', {
    method: 'PUT',
    data: { domainPrefix, accessRestriction },
    ...(options || {}),
  });
}
