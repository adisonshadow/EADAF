// @ts-ignore
/* eslint-disable */
import { request } from '@/utils/request';

/** 获取验证码 获取登录验证码图片 GET /api/v1/auth/captcha */
export async function getAuthCaptcha(options?: { [key: string]: any }) {
  return request<{
    code?: number;
    message?: string;
    data?: { captcha_id?: string; bg_url?: string; puzzle_url?: string };
  }>('/api/v1/auth/captcha', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 检查用户登录状态 [需要认证] 检查当前用户的登录状态，支持两种使用方式：

1. **标准模式**：不传任何参数，使用默认JWT密钥验证token
2. **SSO模式**：通过query参数app传递应用ID，使用应用统一密钥（client_secret / app_secret，兼容旧 salt）验证token

**使用场景**：
- 前端应用验证用户登录状态
- 第三方系统验证SSO token有效性
- 获取当前登录用户的详细信息

**认证方式**：Bearer Token

**响应说明**：
- 200: 用户已登录，返回用户信息
- 400: 无效的应用ID或SSO配置（仅SSO模式）
- 401: 未登录或token无效
- 500: 服务器内部错误
 GET /api/v1/auth/check */
export async function getAuthCheck(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getAuthCheckParams,
  options?: { [key: string]: any },
) {
  return request<{
    code?: number;
    message?: string;
    data?: {
      user_id?: string;
      username?: string;
      name?: string;
      avatar?: string;
      gender?: string;
      email?: string;
      phone?: string;
      status?: string;
      department_id?: string;
    };
  }>('/api/v1/auth/check', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  });
}

/** 用户登录 用户登录接口，支持多种登录模式：

1. **开发者登录模式**：在开发环境下设置 dev=true 可跳过验证码和登录限制检查
2. **普通登录模式**：
   - 2.1 首次登录：输入 username、password，返回需要验证码
   - 2.2 验证码验证：输入 username、password、captcha_data 完成登录
3. **SSO登录模式**：如果包含 application_id 则进入 SSO 模式，返回包含 SSO 信息
 POST /api/v1/auth/login */
export async function postAuthLogin(
  body: {
    /** 用户名 */
    username: string;
    /** 密码 */
    password: string;
    /** 开发者登录模式标志
- 仅在开发环境（NODE_ENV=development）下生效
- 设置为 true 时跳过验证码验证和登录限制检查
- 适用于开发测试场景
 */
    dev?: boolean;
    /** 应用ID，用于SSO登录模式
- 如果提供且应用启用了SSO，将返回该应用的SSO配置信息
- 系统将使用应用统一密钥（client_secret / app_secret，兼容旧 salt）作为JWT签名密钥
 */
    application_id?: string;
    /** 登录页所属应用ID（仅用于判定「人类验证」，不影响令牌签发）
- 授权码流程（/oauth/authorize）的登录页没有 application_id（那会用应用密钥签发令牌），
  但仍应遵循该应用在 sso_config.login_verify_enabled 上的设置
 */
    login_app_id?: string;
    /** 验证码数据，用于普通登录模式的验证码验证步骤
- 在首次登录返回需要验证码后，需要提供此参数完成验证
 */
    captcha_data?: { captcha_id?: string };
  },
  options?: { [key: string]: any },
) {
  return request<{
    code?: number;
    message?: string;
    data?: {
      token?: string;
      refresh_token?: string;
      expires_in?: string;
      user_id?: string;
      sso?: {
        application_id?: string;
        application_name?: string;
        application_code?: string;
        sso_config?: {
          salt?: string;
          redirect_uri?: string;
          redirect_mode?: 'POST_REDIRECT' | 'HEADER_REDIRECT';
          /** 本次登录是否要求人类验证（滑块）；由服务端按应用配置解析 */
          login_verify_enabled?: boolean;
        };
      };
    };
  }>('/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 用户登出 [需要认证] 用户登出接口，使当前访问令牌失效 POST /api/v1/auth/logout */
export async function postAuthLogout(
  body: {
    /** 刷新令牌 */
    refresh_token?: string;
    /** 会话 ID：撤销它 = 该设备上所有应用一起退出（前端 localStorage 的 eadaf_sid） */
    sid?: string;
    /** 为 true 时同时撤销该用户的全部会话（退出所有设备） */
    all?: boolean;
  },
  options?: { [key: string]: any },
) {
  return request<{ code?: number; message?: string; data?: any }>(
    '/api/v1/auth/logout',
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

/** 刷新访问令牌 [需要认证] 使用刷新令牌获取新的访问令牌，支持第三方系统通过app参数刷新token POST /api/v1/auth/refresh */
export async function postAuthRefresh(
  body: {
    /** 刷新令牌 */
    refresh_token: string;
    /** 应用ID，用于第三方系统刷新token（可选） */
    app?: string;
  },
  options?: { [key: string]: any },
) {
  return request<{
    code?: number;
    message?: string;
    data?: { token?: string; refresh_token?: string; expires_in?: string };
  }>('/api/v1/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 当前用户的活跃会话（登录设备）[需要认证] GET /api/v1/auth/sessions */
export async function getAuthSessions(options?: { [key: string]: any }) {
  return request<{
    code?: number;
    message?: string;
    data?: {
      /** false = 会话存储（Redis）不可用，此时 items 必为空 */
      store_available?: boolean;
      items?: Array<{
        sid?: string;
        application_id?: string | null;
        platform?: boolean;
        ip?: string | null;
        user_agent?: string | null;
        created_at?: string | null;
        last_seen_at?: string | null;
        current?: boolean;
      }>;
    };
  }>('/api/v1/auth/sessions', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 撤销指定会话 [需要认证] DELETE /api/v1/auth/sessions/{sid} */
export async function deleteAuthSessionsId(
  params: { sid: string },
  options?: { [key: string]: any },
) {
  const { sid } = params;
  return request<{ code?: number; message?: string; data?: unknown }>(
    `/api/v1/auth/sessions/${sid}`,
    {
      method: 'DELETE',
      ...(options || {}),
    },
  );
}

/** 退出所有设备（撤销全部会话）[需要认证] DELETE /api/v1/auth/sessions */
export async function deleteAuthSessions(options?: { [key: string]: any }) {
  return request<{ code?: number; message?: string; data?: { revoked_sessions?: number } }>(
    '/api/v1/auth/sessions',
    {
      method: 'DELETE',
      ...(options || {}),
    },
  );
}
