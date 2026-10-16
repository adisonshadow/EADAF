import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig, type Method } from 'axios';
import { API_BASE_URL } from '@/constants/env';
import { enrichAxiosError } from '@/utils/apiResponse';
import {
  errorConfig,
  requestInterceptors,
  responseInterceptors,
} from '@/utils/requestInterceptors';
import { refreshSessionOnce, shouldTryRefresh } from '@/utils/sessionClient';

export interface RequestOptions extends Omit<AxiosRequestConfig, 'url' | 'method'> {
  method?: Method | string;
  data?: unknown;
  params?: Record<string, unknown>;
  skipErrorHandler?: boolean;
  /** 内部标记：本请求已经因 401 重放过一次，避免无限刷新 */
  __authRetried?: boolean;
  /** 调用方声明：本请求不希望触发静默刷新（如登出、刷新自身） */
  skipAuthRetry?: boolean;
  [key: string]: unknown;
}

/** 这些接口自身的 401 不该触发静默刷新（会互相递归/掩盖真实结果） */
const NO_AUTH_RETRY_URLS = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/end-session'];

const axiosInstance = axios.create({
  timeout: 10000,
  ...(process.env.NODE_ENV !== 'development' && API_BASE_URL ? { baseURL: API_BASE_URL } : {}),
});

axiosInstance.interceptors.request.use((config) => {
  const url = config.url || '';
  let nextUrl = url;
  let nextConfig: AxiosRequestConfig = { ...config };

  for (const interceptor of requestInterceptors) {
    const result = interceptor(nextUrl, nextConfig);
    nextUrl = result.url;
    nextConfig = { ...nextConfig, ...result.options };
  }

  return { ...nextConfig, url: nextUrl } as InternalAxiosRequestConfig;
});

/**
 * 401「令牌过期」→ 静默刷新 → 原样重放一次。
 *
 * 放在 errorHandler **之前**：否则每次静默刷新都会先弹一个"请求错误 401"，
 * 刷新成功后用户仍会看到一闪而过的错误提示。
 * 重放会再走一遍请求拦截器，因此自动带上新令牌。
 */
function shouldRetryAfterRefresh(error: any): boolean {
  const config = error?.config || {};
  if (config.__authRetried || config.skipAuthRetry) return false;
  const url = String(config.url || '');
  if (NO_AUTH_RETRY_URLS.some((path) => url.includes(path))) return false;
  return shouldTryRefresh(error?.response?.status, error?.response?.data?.error_code);
}

axiosInstance.interceptors.response.use(
  async (response) => {
    let next = response;
    for (const interceptor of responseInterceptors) {
      next = await interceptor(next);
    }
    return next;
  },
  async (error) => {
    enrichAxiosError(error);

    if (shouldRetryAfterRefresh(error)) {
      const refreshed = await refreshSessionOnce();
      if (refreshed) {
        return axiosInstance.request({ ...error.config, __authRetried: true });
      }
    }

    const opts = error.config?.skipErrorHandler ? { skipErrorHandler: true } : {};
    errorConfig.errorHandler(error, opts);
    return Promise.reject(error);
  },
);

export async function request<T = unknown>(url: string, options: RequestOptions = {}): Promise<T> {
  const { skipErrorHandler, method = 'GET', data, params, headers, ...rest } = options;

  try {
    const response = await axiosInstance.request<T>({
      url,
      method: method as Method,
      data,
      params,
      headers,
      skipErrorHandler,
      ...rest,
    } as AxiosRequestConfig & { skipErrorHandler?: boolean });

    return response.data as T;
  } catch (error) {
    if (skipErrorHandler) {
      throw error;
    }
    throw error;
  }
}

export default request;
