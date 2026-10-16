/**
 * 部署期「运行时可配」——让同一份前端产物能部署到不同环境，不必重新构建。
 *
 * 解析顺序（前者优先）：
 *   1. `window.__EADAF_DEPLOY__`：部署时覆盖 `public/runtime-config.js`（或另挂一个同名静态文件）注入；
 *   2. `GET /api/v1/system/runtime-config`：同源部署时由后端 env 下发（如 SYSTEM_STORAGE_BUCKET_CODE）；
 *   3. 构建期注入 / 代码默认值：最后兜底（跨域部署的 API 基址仍可用 vite define 的 APP_API_BASE_URL）。
 *
 * 约束：**不抛错**。拿不到配置时必须照常启动（用兜底值），否则一次网络抖动就能让管理台打不开。
 */

export interface DeployConfig {
  /** 跨域部署时的 API 基址（同源留空）；会覆盖构建期注入值 */
  apiBaseUrl?: string;
  /** 系统内置存储桶 code（对应后端 SYSTEM_STORAGE_BUCKET_CODE） */
  systemStorageBucketCode?: string;
}

declare global {
  interface Window {
    __EADAF_DEPLOY__?: DeployConfig;
  }
}

/** 与后端 config.storage.systemBucket.code 的默认值保持一致 */
const DEFAULT_SYSTEM_BUCKET = 'eadaf-system';
/** 同源部署时后端下发的运行时可配接口 */
const RUNTIME_CONFIG_PATH = '/api/v1/system/runtime-config';

let resolved: DeployConfig = {};
let loaded = false;

function readInjected(): DeployConfig {
  if (typeof window === 'undefined') return {};
  const injected = window.__EADAF_DEPLOY__;
  return injected && typeof injected === 'object' ? injected : {};
}

function normalize(raw: DeployConfig | null | undefined): DeployConfig {
  const out: DeployConfig = {};
  if (!raw) return out;
  if (typeof raw.apiBaseUrl === 'string' && raw.apiBaseUrl.trim()) {
    out.apiBaseUrl = raw.apiBaseUrl.trim().replace(/\/+$/, '');
  }
  if (typeof raw.systemStorageBucketCode === 'string' && raw.systemStorageBucketCode.trim()) {
    out.systemStorageBucketCode = raw.systemStorageBucketCode.trim();
  }
  return out;
}

/**
 * 应用启动时调用一次（见 main.tsx：加载完成后才 import App）。
 * 静态注入优先；缺失时再问后端；都拿不到就用兜底值。
 */
export async function loadDeployConfig(): Promise<DeployConfig> {
  const injected = normalize(readInjected());

  try {
    const base = injected.apiBaseUrl || '';
    const res = await fetch(`${base}${RUNTIME_CONFIG_PATH}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const json = await res.json();
      resolved = { ...normalize(json?.data), ...injected }; // 静态注入优先
    } else {
      resolved = injected;
    }
  } catch {
    resolved = injected; // 后端不可达也要能起界面，后续请求会各自报错
  }

  loaded = true;
  return resolved;
}

export function getDeployConfig(): DeployConfig {
  return resolved;
}

/** 是否已完成一次加载（供测试/调试查看） */
export function isDeployConfigLoaded(): boolean {
  return loaded;
}

/** API 基址：运行时可配优先，其次构建期注入 */
export function resolveApiBaseUrl(buildTimeFallback = ''): string {
  return resolved.apiBaseUrl || String(buildTimeFallback || '').replace(/\/+$/, '');
}

/** 系统存储桶 code：运行时可配优先，其次构建期注入，最后代码默认值 */
export function getSystemStorageBucketCode(buildTimeFallback?: string): string {
  return resolved.systemStorageBucketCode || buildTimeFallback || DEFAULT_SYSTEM_BUCKET;
}
