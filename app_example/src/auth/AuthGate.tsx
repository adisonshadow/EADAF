import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { checkAuth } from './auth';

/** 定时复检登录态的间隔：令牌中途过期时，即使页面没有发起请求也能被发现 */
const RECHECK_INTERVAL_MS = 60_000;

/**
 * 登录态闸门：未登录（或令牌已失效）时自动跳 `/auth/login`。
 *
 * 三条检查路径，覆盖「进页面时没登录」和「用着用着令牌过期」两种情况：
 *   1. 首次挂载：确认登录态，未登录直接跳登录页；
 *   2. 每次路由切换：复检（不闪 loading，查完再决定）；
 *   3. 每 60s 定时复检：闲置页面上令牌过期也能及时跳转。
 *
 * 另外，API 层拿到 401 时会调 `handleUnauthorized()` 直接跳转（见 storeApi.ts），
 * 所以真正「用着用着失效」的瞬间就会被送回登录页，不必等这里的下一次复检。
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  // 挂载 + 每次路由切换复检
  useEffect(() => {
    let alive = true;
    checkAuth().then((ok) => {
      if (!alive) return;
      setAuthed(ok);
      setChecking(false);
    });
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  // 定时复检
  useEffect(() => {
    const timer = window.setInterval(() => {
      checkAuth().then((ok) => {
        if (!ok) setAuthed(false);
      });
    }, RECHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  if (checking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin description="验证登录状态..." />
      </div>
    );
  }

  if (!authed) {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
