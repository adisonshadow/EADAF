// 认证相关的常量配置

// 不需要 token 的 API 路径
export const NO_TOKEN_APIS = [
  '/auth/login',           // 登录
  '/auth/register',        // 注册
  '/auth/captcha',         // 验证码
  '/auth/health',          // 健康检查
  '/applications/public',  // 公开应用信息
  '/applications-public/',   // 应用公开 API 目录
  '/users/request-password-reset',  // 请求密码重置
] as const;

// 认证相关的页面路径
export const AUTH_PAGES = [
  '/auth/login',
  '/auth/logout',
  '/auth/reset-password',
  // 授权码中转页：页面自己负责"未登录先登录"与跳转，交给统一的 401 处置会丢掉原始 query
  '/oauth/authorize',
] as const;

// 登录页面路径
export const LOGIN_PATH = '/auth/login';

// 默认重定向路径
export const DEFAULT_REDIRECT = '/';

// Token 相关的 localStorage key
export const TOKEN_KEY = 'token';
export const REFRESH_TOKEN_KEY = 'refresh_token';

// Token 相关的请求头
export const AUTH_HEADER = 'Authorization';
export const AUTH_PREFIX = 'Bearer '; 