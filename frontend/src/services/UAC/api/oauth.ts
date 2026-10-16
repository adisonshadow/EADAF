// @ts-ignore
/* eslint-disable */
import { request } from '@/utils/request';

/**
 * 登记授权码（OAuth 2.1 授权码 + PKCE 的第一步）[需要认证]
 *
 * 由管理台前端在用户已登录后调用：本平台没有 IdP Cookie（会话在 sid 里），
 * 浏览器直接 GET 后端授权端点时无法证明「当前是谁」，所以授权入口放在管理台页面。
 * POST /api/v1/oauth/authorize
 */
export async function postOauthAuthorize(
  body: {
    /** 应用 ID（= OAuth client_id） */
    client_id: string;
    /** 必须在应用里登记过（完全匹配） */
    redirect_uri: string;
    response_type?: string;
    state?: string;
    scope?: string;
    nonce?: string;
    code_challenge?: string;
    code_challenge_method?: 'S256' | 'plain';
  },
  options?: { [key: string]: any },
) {
  return request<{
    code?: number;
    message?: string;
    data?: { code?: string; redirect_uri?: string; state?: string; expires_in?: number };
  }>('/api/v1/oauth/authorize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}
