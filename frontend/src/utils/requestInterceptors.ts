import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import { message } from '@/utils/antdAppApis';

import { handleUnauthorized, consumeEmbedAuthFromUrl } from './auth';
import { getApiErrorMessage, enrichAxiosError } from './apiResponse';
import { ssoTokenKey } from './ssoTokenStore';
import { NO_TOKEN_APIS, AUTH_HEADER, AUTH_PREFIX, AUTH_PAGES } from '@/constants/auth';

// 错误类型枚举
export enum ErrorShowType {
  SILENT = 0,
  WARN_MESSAGE = 1,
  ERROR_MESSAGE = 2,
  NOTIFICATION = 3,
  REDIRECT = 9,
}

// 响应数据结构
export interface ResponseStructure {
  success: boolean;
  data: any;
  code?: number;
  message?: string;
  showType?: ErrorShowType;
}

// 请求拦截器
export const requestInterceptors = [
  (url: string, options: AxiosRequestConfig) => {
    consumeEmbedAuthFromUrl();
    const { headers = {} } = options;

    // console.log('请求拦截器 - 开始处理请求:', {
    //   url,
    //   method: options.method || 'GET',
    //   isNoTokenApi: noTokenApis.some(api => url.includes(api)),
    //   currentHeaders: headers,
    // });

    // 检查是否是无需 token 的 API
    const isNoTokenApi = NO_TOKEN_APIS.some(api => url.includes(api));
    if (isNoTokenApi) {
    //   console.log('请求拦截器 - 无需 token 的 API，直接放行:', url);
      return { url, options };
    }

    // 解析应用（SSO）上下文：
    // 1) 调用方显式传 params.app（如 Auth 页 getAuthCheck({ app })）；
    // 2) 或非认证页 URL 自带 ?app=（第三方嵌入）。
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const onAuthPage = (AUTH_PAGES as readonly string[]).includes(pathname);
    const pageApp =
      !onAuthPage && typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('app')
        : null;
    const existingParams =
      options.params && typeof options.params === 'object' && !Array.isArray(options.params)
        ? (options.params as Record<string, unknown>)
        : {};
    const appId = (existingParams.app as string | undefined) || pageApp || null;

    // 应用 token 与平台会话隔离：带 app 的请求优先用 sso_token:<app>；
    // 找不到应用 token 时退回平台 token（兼容把 token 写在平台会话位的旧嵌入场景）。
    const token = appId
      ? localStorage.getItem(ssoTokenKey(appId)) || localStorage.getItem('token')
      : localStorage.getItem('token');

    if (!token) {
      console.log('请求拦截器 - 未找到 token，直接放行:', url);
      return { url, options };
    }

    // 确保 headers 是一个新对象
    const newHeaders = {
      ...headers,
      [AUTH_HEADER]: `${AUTH_PREFIX}${token}`,
    };

    // SSO 应用 JWT 必须带 app；但认证页上的 ?app= 只表示「正在给该应用做 SSO」，
    // 不能自动注入到所有请求，否则会把平台 JWT 拿去验应用密钥并误清登录态。
    // 需要带 app 的调用方（如 Auth 页 getAuthCheck）应显式传 params.app。
    const nextParams = appId
      ? { ...existingParams, app: existingParams.app ?? appId }
      : existingParams;

    return {
      url,
      options: {
        ...options,
        headers: newHeaders,
        params: nextParams,
      },
    };
  },
];

// 响应拦截器
export const responseInterceptors = [
  async (response: AxiosResponse) => {
    const { status, data, config } = response;
    const requestUrl = config?.url || '';
    const isAuthCheckRequest = requestUrl.includes('/auth/check');
    
    // 处理 401 未授权的情况
    if (status === 401) {
      const currentPath = window.location.pathname;
      const isAuthPage = AUTH_PAGES.includes(currentPath as any);
      
      // auth/check 的 401 表示 token 无效，由调用方自行处理，避免重复登出
      if (!isAuthPage && !isAuthCheckRequest) {
        handleUnauthorized();
      }
      return response;
    }

    // 处理业务错误
    // 注意：这里我们只处理明确标记为失败的情况
    // 如果后端返回 code 200 且没有 success 字段，我们也认为是成功的
    if (data && data.success === false) {
      const error: any = new Error(data.message || '请求失败');
      error.name = 'BizError';
      error.info = {
        code: data.code,
        message: data.message,
        showType: data.showType || ErrorShowType.ERROR_MESSAGE,
        data: data.data,
      };
      throw error;
    }

    // 对于其他情况，包括：
    // 1. data.success === true
    // 2. data 中没有 success 字段，但有 code === 200
    // 3. 其他正常响应
    // 都直接返回响应
    return response;
  },
];

// 错误处理配置
export const errorConfig = {
  errorThrower: (res: ResponseStructure) => {
    const { success, data, code, message, showType } = res;
    if (!success) {
      const error: any = new Error(message);
      error.name = 'BizError';
      error.info = { code, message, showType, data };
      throw error;
    }
  },
  errorHandler: (error: any, opts: any) => {
    if (opts?.skipErrorHandler) throw error;

    // 处理业务错误
    if (error.name === 'BizError') {
      const errorInfo: ResponseStructure | undefined = error.info;
      if (errorInfo) {
        const { message: errorMessage, code } = errorInfo;
        switch (errorInfo.showType) {
          case ErrorShowType.SILENT:
            // 静默处理
            break;
          case ErrorShowType.WARN_MESSAGE:
            message.warning(errorMessage || '操作警告');
            break;
          case ErrorShowType.ERROR_MESSAGE:
            message.error(errorMessage || '操作失败');
            break;
          case ErrorShowType.NOTIFICATION:
            message.error(errorMessage || '操作失败');
            if (code) {
              message.info(`错误码：${code}`);
            }
            break;
          case ErrorShowType.REDIRECT:
            // 重定向到错误页面
            window.location.href = '/exception/error';
            break;
          default:
            message.error(errorMessage || '操作失败');
        }
      }
    } else if (error.response) {
      // Axios 的错误
      enrichAxiosError(error);
      const { status } = error.response;
      const requestUrl = error.config?.url || '';
      const isAuthCheckRequest = requestUrl.includes('/auth/check');
      const currentPath = window.location.pathname;
      const isAuthPage = AUTH_PAGES.includes(currentPath as any);
      
      // 登录态检查或认证页面的 401 属于预期行为，不弹全局错误
      if ((isAuthPage && status === 401) || (opts?.skipErrorHandler && status === 401) || isAuthCheckRequest) {
        throw error;
      }
      
      message.error(getApiErrorMessage(error, `请求错误 ${status}: ${error.response.statusText}`));
    } else if (error.request) {
      // 请求已发出但没有收到响应
      message.error('服务器无响应，请稍后重试');
    } else {
      // 请求配置出错
      message.error('请求配置错误，请检查');
    }
  },
};