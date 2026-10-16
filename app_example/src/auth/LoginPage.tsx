import { Alert, Badge, Button, Card, Typography } from 'antd';
import { startLogin } from './auth';

/**
 * 登录页（BFF 形态）。
 *
 * 这里**不做任何自动跳转**：只有用户点「前往登录」才去 BFF 的 `/auth/login`
 * （BFF 生成 PKCE → 跳 EADAF 授权页 → 回调 → 建服务端会话）。
 * IdP 会话还在时自动跳会让人以为"没退出成功"，所以退出后停在登录页、等用户主动点。
 */
export default function LoginPage() {
  const params = new URLSearchParams(window.location.search);
  const loggedOut = params.get('logged_out') === '1';
  const expired = params.get('expired') === '1';
  const authError = params.get('auth_error');

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
      }}
    >
      <Badge.Ribbon text="EADAF 业务应用示例">
        <Card style={{ width: 440 }}>
          <Typography.Title level={4} style={{ marginBottom: 0 }}>
            雨伞品牌 · 独立电商站点
          </Typography.Title>
          <Typography.Text style={{ fontSize: 26, fontWeight: 600 }}>
            销售管理系统
          </Typography.Text>

          <Typography.Paragraph type="secondary" style={{ marginTop: 26 }}>
            账号与权限由 EADAF 统一管理。登录由本应用的 BFF 完成（授权码 + PKCE），
            浏览器只保存 BFF 的 httpOnly 会话 Cookie，不接触任何令牌。
          </Typography.Paragraph>

          {loggedOut ? (
            <Alert
              type="success"
              showIcon
              message="已退出登录"
              description="EADAF 会话已一并退出，该设备上的其它应用也会退出。"
              style={{ marginBottom: 16 }}
            />
          ) : null}

          {expired ? (
            <Alert
              type="warning"
              showIcon
              message="会话已失效"
              description="请重新登录后继续。"
              style={{ marginBottom: 16 }}
            />
          ) : null}

          {authError ? (
            <Alert
              type="error"
              showIcon
              message="登录未完成"
              description={
                authError === 'state'
                  ? '回调校验失败（state 不匹配），请重新发起登录。'
                  : '授权码换票失败，请重新发起登录；若反复失败请联系管理员。'
              }
              style={{ marginBottom: 16 }}
            />
          ) : null}

          <Button type="primary" block size="large" onClick={() => startLogin()}>
            前往登录
          </Button>
        </Card>
      </Badge.Ribbon>
    </div>
  );
}
