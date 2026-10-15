import type { AIChatDisplayMode } from '../types';

export function getCurrentPathname(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname;
}

export function isHiddenPath(pathname: string, hiddenPaths: string[]): boolean {
  return hiddenPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function getDisplayModeForPath(pathname: string, hiddenPaths: string[]): AIChatDisplayMode {
  return isHiddenPath(pathname, hiddenPaths) ? 'hidden' : 'sidebar';
}

const pathnameListeners = new Set<() => void>();

/**
 * 宿主在 react-router 导航后显式通知（勿 monkey-patch history.pushState）。
 * 与 popstate 兜底一起驱动 displayMode / hiddenPaths 同步。
 */
export function notifyPathnameChange(): void {
  pathnameListeners.forEach((listener) => listener());
}

/**
 * 监听 SPA 路由变化。
 * - 优先：宿主调用 notifyPathnameChange()
 * - 兜底：window popstate（浏览器前进/后退）
 * 不再改写 history.pushState / replaceState，避免与 React Router 冲突导致卡死。
 */
export function subscribePathname(onChange: () => void): () => void {
  const handleChange = () => onChange();
  pathnameListeners.add(handleChange);
  window.addEventListener('popstate', handleChange);
  return () => {
    pathnameListeners.delete(handleChange);
    window.removeEventListener('popstate', handleChange);
  };
}
