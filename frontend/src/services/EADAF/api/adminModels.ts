// @ts-ignore
/* eslint-disable */
import { request } from '@/utils/request';

/** 获取 AI 模型列表 [需要认证] GET /api/v1/admin/models */
export async function getAdminModels(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getAdminModelsParams,
  options?: { [key: string]: any },
) {
  return request<any>('/api/v1/admin/models', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  });
}

/** 创建 AI 模型 [需要认证] POST /api/v1/admin/models */
export async function postAdminModels(
  body: {
    providerId: string;
    slug: string;
    modelId: string;
    displayName: string;
    defaultParams?: Record<string, any>;
    rateLimit?: API.ModelRateLimit;
    capabilities: string[];
    inputTags?: string[];
    outputTags?: string[];
  },
  options?: { [key: string]: any },
) {
  return request<any>('/api/v1/admin/models', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 获取 AI 模型详情 [需要认证] GET /api/v1/admin/models/${param0} */
export async function getAdminModelsId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getAdminModelsIdParams,
  options?: { [key: string]: any },
) {
  const { id: param0, ...queryParams } = params;
  return request<any>(`/api/v1/admin/models/${param0}`, {
    method: 'GET',
    params: { ...queryParams },
    ...(options || {}),
  });
}

/** 删除 AI 模型（软删除） [需要认证] DELETE /api/v1/admin/models/${param0} */
export async function deleteAdminModelsId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.deleteAdminModelsIdParams,
  options?: { [key: string]: any },
) {
  const { id: param0, ...queryParams } = params;
  return request<any>(`/api/v1/admin/models/${param0}`, {
    method: 'DELETE',
    params: { ...queryParams },
    ...(options || {}),
  });
}

/** 更新 AI 模型 [需要认证] PATCH /api/v1/admin/models/${param0} */
export async function patchAdminModelsId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.patchAdminModelsIdParams,
  body: {
    providerId?: string;
    slug?: string;
    modelId?: string;
    displayName?: string;
    defaultParams?: Record<string, any>;
    rateLimit?: API.ModelRateLimit;
    capabilities?: string[];
    inputTags?: string[];
    outputTags?: string[];
    isActive?: boolean;
  },
  options?: { [key: string]: any },
) {
  const { id: param0, ...queryParams } = params;
  return request<any>(`/api/v1/admin/models/${param0}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}
