import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { fetchSession } from './auth';

/** 定时复检登录态的间隔：会话被撤销/过期时，闲置页面也能及时回到登录页 */
const RECHECK_INTERVAL_MS = 60_000;

/**
 * 登录态闸门（BFF 形态）：未登录时跳站内 `/login`。
 *
 * 三条检查路径，覆盖「进页面时没登录」和「用着用着会话没了」两种情况：
 *   1. 首次挂载：问 BFF `/auth/me`，未登录直接跳登录页；
 *   2. 每次路由切换：复检（不闪 loading，查完再决定）；
 *   3. 每 60s 定时复检：闲置页面也能发现会话失效。
 *
 * 网络抖动返回 `unknown`：**不动登录态**，等下一次检查（避免"网络一抖就掉登录"）。
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  // 挂载 + 每次路由切换复检
  useEffect(() => {
    let alive = true;
    fetchSession().then(({ status }) => {
      if (!alive) return;
      if (status === 'unauthenticated') setAuthed(false);
      else if (status === 'authenticated') setAuthed(true);
      setChecking(false);
    });
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  // 定时复检
  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchSession().then(({ status }) => {
        if (status === 'unauthenticated') setAuthed(false);
        else if (status === 'authenticated') setAuthed(true);
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
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
