import { useEffect, useRef, useState } from 'react';
import { Spin, Typography } from 'antd';
import { history } from '@/utils/navigation';
import { clearAllSsoAuth, clearAuth, getAuth } from '@/utils/auth';
import { postAuthLogout } from '@/services/UAC/api/auth';

/**
 * 登出中转页（`/auth/logout`）—— 单点登出的浏览器侧入口。
 *
 * 为什么需要它：Phase 0 的刷新令牌还在浏览器 localStorage 里，服务端拿不到，
 * 所以"撤销 + 清本地"必须由浏览器页面完成；校验回跳地址并 302 则交给后端
 * `/api/v1/auth/end-session`（白名单校验，防开放重定向）。
 *
 * 流程：
 *   1. 用本地 refresh_token 调 `POST /auth/logout`（尽力而为，失败不阻塞登出）；
 *   2. 清掉平台会话位（token / refresh_token）**和全部应用令牌**（sso_token:<app_id>）；
 *   3. 带 `app` + `post_logout_redirect_uri` 时跳后端 end-session 回业务应用；
 *      否则回管理台登录页并带 `logged_out=1`（登录页据此显示"已退出"且不自动 SSO）。
 *
 * 业务应用侧跳这里即可：
 *   {eadaf_frontend}/auth/logout?app=<application_id>&post_logout_redirect_uri=<应用登录页>&state=<opaque>
 */
export default function Logout() {
  const [message, setMessage] = useState('正在退出登录…');
  const startedRef = useRef(false);

  useEffect(() => {
    // StrictMode 下 effect 会跑两次：第二次不能再清一遍/再跳一次
    if (startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const appId = params.get('app');
      const postLogoutRedirect = params.get('post_logout_redirect_uri');
      const state = params.get('state');

      const { refreshToken } = getAuth();
      if (refreshToken) {
        try {
          await postAuthLogout({ refresh_token: refreshToken }, { skipErrorHandler: true });
        } catch (error) {
          // 撤销失败不影响本地登出：本地清干净 + 令牌自然过期
          console.warn('登出时撤销刷新令牌失败（已忽略）:', error);
        }
      }

      // 平台会话位 + 所有应用的 SSO 令牌一起清：管理台一次登出不该留下任何登录态
      clearAuth();
      clearAllSsoAuth();

      if (appId && postLogoutRedirect) {
        setMessage('正在返回应用…');
        const qs = new URLSearchParams({
          app: appId,
          post_logout_redirect_uri: postLogoutRedirect,
        });
        if (state) qs.set('state', state);
        window.location.replace(`/api/v1/auth/end-session?${qs.toString()}`);
        return;
      }

      history.replace('/auth/login?logged_out=1');
    };

    void run();
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Spin />
      <Typography.Text type="secondary">{message}</Typography.Text>
    </div>
  );
}
