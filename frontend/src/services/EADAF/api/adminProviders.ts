// @ts-ignore
/* eslint-disable */
import { request } from '@/utils/request';

/** 获取服务商列表 [需要认证] GET /api/v1/admin/providers */
export async function getAdminProviders(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getAdminProvidersParams,
  options?: { [key: string]: any },
) {
  return request<any>('/api/v1/admin/providers', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  });
}

/** 创建服务商 [需要认证] POST /api/v1/admin/providers */
export async function postAdminProviders(
  body: {
    name: string;
    slug: string;
    baseUrl: string;
    apiKey?: string;
    adapterType?: string;
  },
  options?: { [key: string]: any },
) {
  return request<any>('/api/v1/admin/providers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 获取服务商详情 [需要认证] GET /api/v1/admin/providers/${param0} */
export async function getAdminProvidersId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getAdminProvidersIdParams,
  options?: { [key: string]: any },
) {
  const { id: param0, ...queryParams } = params;
  return request<any>(`/api/v1/admin/providers/${param0}`, {
    method: 'GET',
    params: { ...queryParams },
    ...(options || {}),
  });
}

/** 删除服务商（软删除） [需要认证] DELETE /api/v1/admin/providers/${param0} */
export async function deleteAdminProvidersId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.deleteAdminProvidersIdParams,
  options?: { [key: string]: any },
) {
  const { id: param0, ...queryParams } = params;
  return request<any>(`/api/v1/admin/providers/${param0}`, {
    method: 'DELETE',
    params: { ...queryParams },
    ...(options || {}),
  });
}

/** 更新服务商 [需要认证] PATCH /api/v1/admin/providers/${param0} */
export async function patchAdminProvidersId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.patchAdminProvidersIdParams,
  body: {
    name?: string;
    slug?: string;
    baseUrl?: string;
    apiKey?: string;
    adapterType?: string;
    isActive?: boolean;
  },
  options?: { [key: string]: any },
) {
  const { id: param0, ...queryParams } = params;
  return request<any>(`/api/v1/admin/providers/${param0}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}
