import { resolveApiBaseUrl } from '@/config/deployConfig';

/**
 * API 基址的**构建期兜底值**（vite define 注入 process.env.APP_API_BASE_URL）。
 *
 * 仅用于跨域部署的 bootstrap：同源部署留空即可（走相对路径）。
 * 运行时可配优先——部署时覆盖 `public/runtime-config.js` 或由后端
 * `/api/v1/system/runtime-config` 下发，见 `@/config/deployConfig`。
 */
export const API_BASE_URL = process.env.APP_API_BASE_URL || '';

/** 开发环境走 devServer proxy；生产环境按「运行时可配 > 构建期注入」拼绝对地址 */
export const resolveApiUrl = (path: string) => {
  if (process.env.NODE_ENV === 'development') {
    return path;
  }
  const base = resolveApiBaseUrl(API_BASE_URL);
  return base ? `${base.replace(/\/$/, '')}${path}` : path;
};

/** 流式 SSE 接口：与常规 API 同路径，开发环境走 devServer proxy */
export const resolveStreamApiUrl = (path: string) => resolveApiUrl(path);
