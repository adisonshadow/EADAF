// @ts-ignore
/* eslint-disable */
import { request } from '@/utils/request';

/** 获取应用列表 [需要认证] 获取应用列表，支持分页和筛选。当 size 参数为 -1 时，返回所有记录不分页。 GET /api/v1/applications */
export async function getApplications(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getApplicationsParams,
  options?: { [key: string]: any },
) {
  return request<{
    code?: number;
    message?: string;
    data?: {
      total?: number;
      page?: number;
      size?: number;
      items?: API.Application[];
    };
  }>('/api/v1/applications', {
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

/** 创建应用 [需要认证] 创建一个新的应用 POST /api/v1/applications */
export async function postApplications(
  body: {
    /** 应用ID（可选；不传时系统自动生成） */
    application_id?: string;
    /** 应用名称 */
    name: string;
    /** 应用编码 */
    code: string;
    /** 应用 Logo（存储预览路径或 objectId） */
    logo_url?: string | null;
    /** 应用状态 */
    status?: 'ACTIVE' | 'DISABLED';
    /** 是否启用SSO */
    sso_enabled?: boolean;
    sso_config?: API.SSOConfig;
    /** 是否启用API服务 */
    api_enabled?: boolean;
    api_connect_config?: API.APIConnectConfig;
    api_data_scope?: API.APIDataScope;
    /** 应用描述 */
    description?: string;
  },
  options?: { [key: string]: any },
) {
  return request<{ code?: number; message?: string; data?: API.Application }>(
    '/api/v1/applications',
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

/** 获取应用详情 [需要认证] 根据ID获取应用详情 GET /api/v1/applications/${param0} */
export async function getApplicationsId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getApplicationsIdParams,
  options?: { [key: string]: any },
) {
  const { id: param0, ...queryParams } = params;
  return request<{ code?: number; message?: string; data?: API.Application }>(
    `/api/v1/applications/${param0}`,
    {
      method: 'GET',
      params: { ...queryParams },
      ...(options || {}),
    },
  );
}

/** 更新应用 [需要认证] 更新应用信息 PUT /api/v1/applications/${param0} */
export async function putApplicationsId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.putApplicationsIdParams,
  body: {
    /** 应用名称 */
    name?: string;
    /** 应用编码 */
    code?: string;
    /** 应用 Logo（存储预览路径或 objectId） */
    logo_url?: string | null;
    /** 应用状态 */
    status?: 'ACTIVE' | 'DISABLED';
    /** 是否启用SSO */
    sso_enabled?: boolean;
    sso_config?: API.SSOConfig;
    /** 是否启用API服务 */
    api_enabled?: boolean;
    api_connect_config?: API.APIConnectConfig;
    api_data_scope?: API.APIDataScope;
    builtin_api_scope?: API.BuiltinApiScope;
    outbound_webhook_scope?: API.OutboundWebhookScope;
    bizdata_scope_codes?: string[];
    /** 应用描述 */
    description?: string;
  },
  options?: { [key: string]: any },
) {
  const { id: param0, ...queryParams } = params;
  return request<{ code?: number; message?: string; data?: API.Application }>(
    `/api/v1/applications/${param0}`,
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

/** 删除应用 [需要认证] 删除指定应用 DELETE /api/v1/applications/${param0} */
export async function deleteApplicationsId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.deleteApplicationsIdParams,
  body?: {
    deleteBizdata?: boolean;
    dropPhysicalTables?: boolean;
    deleteBuckets?: boolean;
  },
  options?: { [key: string]: any },
) {
  const { id: param0, ...queryParams } = params;
  return request<{
    code?: number;
    message?: string;
    data?: {
      cascade?: Record<string, any> | null;
      deletedBuckets?: number;
      deletedObjects?: number;
      skippedSystemBuckets?: number;
    } | null;
  }>(`/api/v1/applications/${param0}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    params: { ...queryParams },
    data: body || {},
    ...(options || {}),
  });
}

/** 应用删除预览：应用信息 + 归属 Bucket 清单 GET /api/v1/applications/${id}/delete-preview */
export async function getApplicationsIdDeletePreview(params: { id: string }, options?: { [key: string]: any }) {
  const { id: param0, ...queryParams } = params;
  return request<{
    code?: number;
    message?: string;
    data?: API.ApplicationDeletePreview;
  }>(`/api/v1/applications/${param0}/delete-preview`, {
    method: 'GET',
    params: { ...queryParams },
    ...(options || {}),
  });
}

/** 生成应用密钥 [需要认证] 根据应用ID和salt生成app_secret，并保存到应用的api_connect_config中 POST /api/v1/applications/${param0}/generate-secret */
export async function postApplicationsIdGenerateSecret(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.postApplicationsIdGenerateSecretParams,
  body?: {
    /** 签名盐值（旧版兼容，新版可不传） */
    salt?: string;
  },
  options?: { [key: string]: any },
) {
  const { id: param0, ...queryParams } = params;
  return request<{
    code?: number;
    message?: string;
    data?: { app_secret?: string };
  }>(`/api/v1/applications/${param0}/generate-secret`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}

/** 获取应用Token [需要认证] 根据应用ID和app_secret获取JWT Token，用于应用API认证 POST /api/v1/applications/token */
export async function getApplicationsIdTopLevelSkill(
  params: { id: string },
  options?: { [key: string]: any },
) {
  const { id: param0, ...queryParams } = params;
  return request<{
    code?: number;
    message?: string;
    data?: {
      applicationId?: string;
      applicationName?: string;
      contentMarkdown?: string;
      updatedAt?: string;
    };
  }>(`/api/v1/applications/${param0}/top-level-skill`, {
    method: 'GET',
    params: { ...queryParams },
    ...(options || {}),
  });
}

/** 更新应用顶层 Skill [需要认证] PUT /api/v1/applications/${param0}/top-level-skill */
export async function putApplicationsIdTopLevelSkill(
  params: { id: string },
  body: { contentMarkdown?: string },
  options?: { [key: string]: any },
) {
  const { id: param0, ...queryParams } = params;
  return request<{
    code?: number;
    message?: string;
    data?: {
      applicationId?: string;
      applicationName?: string;
      contentMarkdown?: string;
      updatedAt?: string;
    };
  }>(`/api/v1/applications/${param0}/top-level-skill`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}

/** 获取应用Token [需要认证] 根据应用ID和app_secret获取JWT Token，用于应用API认证 POST /api/v1/applications/token */
export async function postApplicationsToken(
  body: {
    /** 应用ID */
    application_id: string;
    /** 应用密钥 */
    app_secret: string;
  },
  options?: { [key: string]: any },
) {
  return request<{
    code?: number;
    message?: string;
    data?: { token?: string };
  }>('/api/v1/applications/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}
