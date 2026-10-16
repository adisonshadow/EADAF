import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Spin, Typography } from 'antd';
import { history } from '@/utils/navigation';
import { getAuth } from '@/utils/auth';
import { getApiErrorMessage } from '@/utils/apiResponse';
import { postOauthAuthorize } from '@/services/EADAF/api/oauth';
import AuthPageFrame from '@/components/AuthPageFrame';

/**
 * 授权码中转页（`/oauth/authorize`）—— OAuth 2.1 授权端点的"前端半边"。
 *
 * 为什么由前端发起：本平台没有 IdP Cookie（会话在 localStorage 的 sid 里），
 * 浏览器直接 GET 后端授权端点无法证明"当前是谁"；管理台已登录，能带上令牌。
 *
 * 流程：
 *   1. 未登录 → 跳 `/auth/login?redirect=<本页完整 URL>`，登录后自动回到这里；
 *   2. 已登录 → `POST /api/v1/oauth/authorize` 校验客户端/回调地址/PKCE 并登记一次性授权码；
 *   3. 302 到 BFF 的 `redirect_uri?code=...&state=...`。**令牌不进浏览器地址栏**，
 *      浏览器只拿到一次性 code，由 BFF 用 `code_verifier` + `client_secret` 去 `/oauth/token` 换。
 *
 * 接入方拼接的入口地址形如：
 *   {eadaf_frontend}/oauth/authorize?client_id=<application_id>&redirect_uri=<BFF回调>
 *     &response_type=code&scope=openid%20profile&state=<opaque>
 *     &code_challenge=<S256>&code_challenge_method=S256&nonce=<opaque>
 */
export default function OAuthAuthorize() {
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return; // StrictMode 下只跑一次（授权码一次性，重复登记会浪费一个码）
    startedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('client_id');
    const redirectUri = params.get('redirect_uri');
    const returnTo = `${window.location.pathname}${window.location.search}`;

    if (!clientId || !redirectUri) {
      setError('缺少 client_id 或 redirect_uri：请从业务应用发起单点登录。');
      return;
    }

    const goLogin = () => {
      history.replace(`/auth/login?redirect=${encodeURIComponent(returnTo)}`);
    };

    if (!getAuth().token) {
      goLogin();
      return;
    }

    const run = async () => {
      try {
        const res = await postOauthAuthorize(
          {
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: params.get('response_type') || 'code',
            state: params.get('state') || undefined,
            scope: params.get('scope') || undefined,
            nonce: params.get('nonce') || undefined,
            code_challenge: params.get('code_challenge') || undefined,
            code_challenge_method:
              (params.get('code_challenge_method') as 'S256' | 'plain' | null) || undefined,
          },
          { skipErrorHandler: true },
        );

        const data = res?.data;
        if (!data?.code || !data?.redirect_uri) {
          setError(res?.message || '授权失败：未拿到授权码');
          return;
        }

        const target = new URL(data.redirect_uri);
        target.searchParams.set('code', data.code);
        if (data.state) target.searchParams.set('state', data.state);
        window.location.replace(target.toString());
      } catch (err: any) {
        // 未登录/会话失效：回登录页，登录后再回来
        if (err?.response?.status === 401) {
          goLogin();
          return;
        }
        setError(getApiErrorMessage(err, '授权失败，请稍后重试'));
      }
    };

    void run();
  }, []);

  return (
    <AuthPageFrame shortName="EADAF" helmetTitle="授权 - EADAF">
      <Card className="auth-card" variant="borderless">
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          {error ? (
            <>
              <Alert type="error" showIcon message="无法完成授权" description={error} />
              <Button
                type="primary"
                style={{ marginTop: 20 }}
                onClick={() => history.replace('/auth/login?logged_out=1')}
              >
                去登录页
              </Button>
            </>
          ) : (
            <>
              <Spin />
              <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
                正在前往业务应用…
              </Typography.Paragraph>
            </>
          )}
        </div>
      </Card>
    </AuthPageFrame>
  );
}
