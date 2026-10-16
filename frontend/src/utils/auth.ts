import { history } from '@/utils/navigation';
import { message } from '@/utils/antdAppApis';
import { getAuthCheck } from '@/services/EADAF/api/auth';
import { saveSsoAuth } from './ssoTokenStore';

import { getApiData } from './apiResponse';
import { normalizeUploadFileId } from './image';

export interface CurrentUser {
  user_id: string;
  username: string;
  name: string;
  avatar: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  email: string;
  phone: string | null;
  status: 'ACTIVE' | 'DISABLED' | 'LOCKED' | 'ARCHIVED';
  department_id: string | null;
  must_change_password?: boolean;
  /** 用户角色 id 列表（用于按 access_restriction 过滤菜单/按钮可见性） */
  role_ids?: string[];
  /** 用户角色 code 列表（含 SUPER_ADMIN 时拥有全部权限） */
  role_codes?: string[];
}

/** 解析 auth/check 响应（兼容 request.dataField 解包前后） */
export function parseAuthUser(response: unknown): CurrentUser | undefined {
  const user = getApiData<Record<string, unknown>>(response);
  if (!user || typeof user !== 'object') {
    return undefined;
  }
  if (!user.user_id && !user.username) {
    return undefined;
  }

  const username = String(user.username || '');
  const roleIds = Array.isArray(user.role_ids)
    ? user.role_ids.map((r) => String(r))
    : [];
  const roleCodes = Array.isArray(user.role_codes)
    ? user.role_codes.map((r) => String(r)).filter(Boolean)
    : [];
  return {
    user_id: String(user.user_id || ''),
    username,
    name: String(user.name || username),
    avatar: normalizeUploadFileId(user.avatar as string | null | undefined),
    gender: (user.gender as CurrentUser['gender']) || null,
    email: String(user.email || ''),
    phone: (user.phone as string | null) ?? null,
    status: (user.status as CurrentUser['status']) || 'DISABLED',
    department_id: (user.department_id as string | null) ?? null,
    must_change_password: Boolean(user.must_change_password),
    role_ids: roleIds,
    role_codes: roleCodes,
  };
}

/** 是否为超级管理员（默认拥有全部权限，不受 access_restriction 限制） */
export function isSuperAdmin(user?: CurrentUser | null): boolean {
  return Boolean(user?.role_codes?.includes('SUPER_ADMIN'));
}

export function isAuthCheckSuccess(response: unknown): boolean {
  return !!parseAuthUser(response);
}

// 登录页面路径
export const loginPath = '/auth/login';

// 认证相关页面
export const authPages = ['/auth/login', '/auth/logout', '/auth/reset-password', '/oauth/authorize'];

// 检查是否是认证页面
export const isAuthPage = (pathname: string) => authPages.includes(pathname);

// 获取当前页面是否需要 app 参数
export const hasAppParam = () => new URLSearchParams(window.location.search).has('app');

// 获取重定向 URL
export const getRedirectUrl = (currentPath: string) => {
  const appParam = hasAppParam() ? `?app=${new URLSearchParams(window.location.search).get('app')}` : '';
  return loginPath + (currentPath !== '/' ? `?redirect=${encodeURIComponent(currentPath)}` : '') + appParam;
};

// 检查 token 是否有效
// SSO：JWT 按应用密钥签发时需传 app，否则会按平台密钥验签导致误判无效
export const checkTokenValid = async (appId?: string | null) => {
  console.log('开始检查 token 有效性...', { appId: appId || null });
  try {
    const response = await getAuthCheck(
      appId ? { app: appId } : {},
      { skipErrorHandler: true },
    );
    const isValid = isAuthCheckSuccess(response);
    console.log('Token 有效性检查结果:', { isValid });
    return isValid;
  } catch (error: any) {
    const status = error?.response?.status;
    if (status !== 401) {
      console.error('Token 有效性检查失败:', error);
    }
    return false;
  }
};

// 清除认证信息
export const clearAuth = () => {
  console.log('清除认证信息...');
  const oldToken = localStorage.getItem('token');
  const oldRefreshToken = localStorage.getItem('refresh_token');
  console.log('清除前的认证信息:', {
    hasToken: !!oldToken,
    tokenLength: oldToken?.length,
    hasRefreshToken: !!oldRefreshToken,
    refreshTokenLength: oldRefreshToken?.length,
  });
  
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  
  console.log('认证信息已清除');
};

/**
 * 只读 JWT 负载里的 application_id（**不验签**，仅用于选存储位/选验签密钥）。
 * 平台会话 token 不带这个声明；应用密钥签发的用户 JWT 带（新版后端签发时写入）。
 */
function readTokenApplicationId(token: string): string {
  try {
    const segment = token.split('.')[1];
    if (!segment) return '';
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { application_id?: unknown };
    return typeof payload?.application_id === 'string' ? payload.application_id : '';
  } catch {
    return '';
  }
}

/** SSO 会话 ID（sid）。一个浏览器一个 sid：管理台与各业务应用都用它，
 *  这样在管理台登出 = 撤销该会话 = 该设备上所有应用一起失效（见 SSO 方案计划 Phase 1）。 */
export const SSO_SID_KEY = 'eadaf_sid';

export function getSsoSid(): string | null {
  try {
    return localStorage.getItem(SSO_SID_KEY);
  } catch {
    return null;
  }
}

export function saveSsoSid(sid?: string | null): void {
  if (!sid) return;
  try {
    localStorage.setItem(SSO_SID_KEY, sid);
  } catch {
    /* 隐私模式等场景忽略 */
  }
}

export function clearSsoSid(): void {
  try {
    localStorage.removeItem(SSO_SID_KEY);
  } catch {
    /* ignore */
  }
}

/** iframe / 第三方嵌入：从 URL 写入本域 token，并去掉敏感 query，保留 embed、app、theme */
export function consumeEmbedAuthFromUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const token = url.searchParams.get('access_token') || url.searchParams.get('token');
  const refreshToken = url.searchParams.get('refresh_token') || undefined;
  if (!token) return;

  // 应用密钥签发的 token（SSO 登录得到的用户 JWT）必须存进 sso_token:<app_id>，
  // 绝不能占平台会话位：管理台拿平台密钥验签必然 401 → 清会话 → 回登录页。
  const appId = url.searchParams.get('app') || readTokenApplicationId(token);
  if (appId) {
    saveSsoAuth(appId, token, refreshToken);
  } else {
    saveAuth(token, refreshToken);
  }

  url.searchParams.delete('access_token');
  url.searchParams.delete('token');
  url.searchParams.delete('refresh_token');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(null, '', next);
}

// 保存认证信息
export const saveAuth = (token: string, refreshToken?: string) => {
  console.log('保存认证信息...', {
    tokenLength: token?.length,
    hasRefreshToken: !!refreshToken,
    refreshTokenLength: refreshToken?.length,
  });
  
  localStorage.setItem('token', token);
  if (refreshToken) {
    localStorage.setItem('refresh_token', refreshToken);
  }
  
  console.log('认证信息保存完成');
};

/**
 * SSO 应用 token 的独立存储。
 *
 * 应用 JWT 由后端用【应用密钥】签发，只对带 `app=<id>` 的请求有效；而 EADAF
 * 管理台的全局会话校验不带 app（用平台密钥验签）。两者若共用 localStorage.token，
 * 应用登录就会把管理台会话覆盖成无效 token —— 现象就是「SSO 登录后 EADAF 掉登录」。
 * 所以应用 token 按应用分别存放，绝不写进平台会话位（实现见 ssoTokenStore）。
 */
export {
  saveSsoAuth,
  getSsoAuth,
  clearSsoAuth,
  clearAllSsoAuth,
  ssoTokenKey,
} from './ssoTokenStore';

// 获取认证信息（高频路径：勿打日志；调试设 localStorage DEBUG_AUTH=1）
export const getAuth = () => {
  const token = localStorage.getItem('token');
  const refreshToken = localStorage.getItem('refresh_token');

  if (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_AUTH') === '1') {
    console.log('获取认证信息:', {
      hasToken: !!token,
      tokenLength: token?.length,
      hasRefreshToken: !!refreshToken,
      refreshTokenLength: refreshToken?.length,
    });
  }

  return { token, refreshToken };
};

// 路由守卫
export const checkAuth = async (setInitialState?: (callback: (state: any) => any) => void) => {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_AUTH') === '1') {
    console.log('开始路由守卫检查...');
  }
  consumeEmbedAuthFromUrl();
  const { token } = getAuth();
  const currentPath = location.pathname + location.search;
  const isCurrentAuthPage = isAuthPage(location.pathname);
  const hasCurrentAppParam = hasAppParam();
  const appId = new URLSearchParams(location.search).get('app');

  if (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_AUTH') === '1') {
    console.log('当前页面状态:', {
      path: currentPath,
      isAuthPage: isCurrentAuthPage,
      hasAppParam: hasCurrentAppParam,
      hasToken: !!token,
      tokenLength: token?.length,
    });
  }

  // 如果是认证页面且有 app 参数，允许访问
  if (isCurrentAuthPage && hasCurrentAppParam) {
    return true;
  }

  // 如果没有 token 且不是认证页面，跳转到登录页
  if (!token && !isCurrentAuthPage) {
    const redirectUrl = getRedirectUrl(currentPath);
    history.push(redirectUrl);
    return false;
  }

  // 如果有 token，验证其有效性
  if (token && !isCurrentAuthPage) {
    try {
      const response = await getAuthCheck(
        appId ? { app: appId } : {},
        { skipErrorHandler: true },
      );
      const currentUser = parseAuthUser(response);

      if (currentUser) {
        if (setInitialState) {
          setInitialState((s) => ({
            ...s,
            currentUser,
          }));
        }
        return true;
      }
      throw new Error('Token 无效');
    } catch (error) {
      console.error('Token 验证失败:', error);
      // token 无效，清除并跳转
      clearAuth();
      if (setInitialState) {
        setInitialState((s) => ({
          ...s,
          currentUser: undefined,
        }));
      }
      const redirectUrl = getRedirectUrl(currentPath);
      history.push(redirectUrl);
      return false;
    }
  }

  // 如果已登录且在认证页面，跳转到首页
  if (token && isCurrentAuthPage) {
    history.push('/');
    return false;
  }

  return true;
};

// 处理 401 未授权
export const handleUnauthorized = (setInitialState?: (callback: (state: any) => any) => void) => {
  console.log('处理 401 未授权...');
  clearAuth();
  if (setInitialState) {
    console.log('清除用户状态');
    setInitialState((s) => ({
      ...s,
      currentUser: undefined,
    }));
  }

  const isCurrentAuthPage = isAuthPage(location.pathname);
  const hasCurrentAppParam = hasAppParam();

  console.log('401 处理状态:', {
    isAuthPage: isCurrentAuthPage,
    hasAppParam: hasCurrentAppParam,
    currentPath: location.pathname + location.search,
  });

  if (!isCurrentAuthPage || (isCurrentAuthPage && !hasCurrentAppParam)) {
    const redirectUrl = getRedirectUrl(location.pathname + location.search);
    console.log('准备重定向到:', redirectUrl);
    history.push(redirectUrl);
  } else {
    console.log('当前在认证页面且有 app 参数，不进行重定向');
  }
}; 