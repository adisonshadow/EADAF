// @ts-ignore
/* eslint-disable */
import { request } from '@/utils/request';

/** 获取SSO应用信息 获取指定应用的SSO配置信息，用于SSO登录流程 GET /api/v1/applications-sso/${param0} */
export async function getApplicationsSsoId(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getApplicationsSsoIdParams,
  options?: { [key: string]: any },
) {
  const { id: param0, ...queryParams } = params;
  return request<{
    code?: number;
    message?: string;
    data?: {
      application_id?: string;
      name?: string;
      code?: string;
      logo_url?: string | null;
      description?: string | null;
      status?: 'ACTIVE' | 'DISABLED';
      sso_enabled?: boolean;
      sso_config?: {
        currentTimestamp?: string;
        secret?: string;
        protocol?: 'OIDC';
        redirect_uri?: string;
        /** 是否跟随本系统访问域名/IP（登录响应中 redirect_uri 已解析为完整 URL） */
        redirect_uri_use_system_host?: boolean;
        redirect_mode?: 'POST_REDIRECT' | 'HEADER_REDIRECT';
        base_url?: string;
        client_id?: string;
        client_secret?: string;
        issuer?: string;
        frontend_url?: string;
        login_page?: API.SsoLoginPageStyle;
        /** 该应用登录页是否要求人类验证（滑块）；未配置时跟随平台全局开关 */
        login_verify_enabled?: boolean;
      };
      created_at?: string;
      updated_at?: string;
    };
  }>(`/api/v1/applications-sso/${param0}`, {
    method: 'GET',
    params: { ...queryParams },
    ...(options || {}),
  });
}
