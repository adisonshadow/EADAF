import { postAuthRefresh } from '@/services/UAC/api/auth';
import { getAuth, saveAuth, saveSsoSid } from './auth';

/**
 * 管理台的会话客户端：访问令牌静默刷新。
 *
 * 为什么需要：Phase 1 起访问令牌会收紧到 15 分钟（`SSO_ACCESS_TOKEN_TTL`），
 * 没有静默刷新就会每 15 分钟把人踢回登录页。
 *
 * 约定：
 * - **单飞**：并发请求同时 401 只触发一次刷新（Promise 复用）；
 * - 只对"令牌过期"这类可恢复的 401 刷新；`SESSION_REVOKED` / `TOKEN_INVALID`
 *   表示会话真的没了，刷新也救不回来，交给调用方清会话回登录页；
 * - 刷新失败不抛错，只返回 false（由上层决定后续处置）。
 *
 * 刷新令牌是**不透明随机串**（`rt_…`），这里只回传、不解码。
 */

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const { refreshToken } = getAuth();
  if (!refreshToken) return false;

  try {
    const res = await postAuthRefresh(
      { refresh_token: refreshToken },
      { skipErrorHandler: true },
    );
    const data = (res as { data?: { token?: string; refresh_token?: string; sid?: string } } | undefined)?.data;
    if (!data?.token) return false;

    saveAuth(data.token, data.refresh_token || refreshToken);
    if (data.sid) saveSsoSid(data.sid);
    return true;
  } catch (error) {
    console.warn('静默刷新访问令牌失败:', error);
    return false;
  }
}

/** 单飞刷新：并发的 401 共用同一次刷新请求 */
export function refreshSessionOnce(): Promise<boolean> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/**
 * 这个 401 值不值得先刷新一次？
 * - 必须是 401；
 * - 带 `error_code` 时只认 `TOKEN_EXPIRED`；
 * - 老后端不带 `error_code`：试一次（刷新失败无副作用）。
 */
export function shouldTryRefresh(status?: number, errorCode?: string): boolean {
  if (status !== 401) return false;
  if (!errorCode) return true;
  return errorCode === 'TOKEN_EXPIRED';
}
