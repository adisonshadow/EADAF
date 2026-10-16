import { request } from '@/utils/request';

export interface AppBranding {
  application_id?: string;
  name?: string;
  code?: string;
  logo_url?: string | null;
  description?: string | null;
  sso_enabled?: boolean;
}

/** 获取 EADAF 系统应用公开品牌信息（无需登录） GET /api/v1/applications-sso/system-branding */
export async function getSystemBranding(options?: { skipErrorHandler?: boolean }) {
  return request<{
    code?: number;
    message?: string;
    data?: AppBranding;
  }>('/api/v1/applications-sso/system-branding', {
    method: 'GET',
    ...(options || {}),
  });
}
