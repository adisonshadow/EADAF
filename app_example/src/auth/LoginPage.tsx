import { Alert, Badge, Button, Card, Typography } from 'antd';
import { buildSsoLoginUrl } from './auth';

/** 登录页：跳 EADAF 管理端做 SSO（示例应用不自己管账号密码） */
export default function LoginPage() {
  // 从 EADAF 登出中转回来：明确告知"已退出"，且必须用户主动点击才发起登录。
  // 这里刻意不做"自动跳 SSO" —— IdP 会话若还在，自动跳会让人以为没退出成功。
  const loggedOut = new URLSearchParams(window.location.search).get('logged_out') === '1';

  const handleLogin = () => {
    window.location.href = buildSsoLoginUrl();
  };

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
        <Card style={{ width: 420 }}>
          <Typography.Title level={4} style={{ marginBottom: 0 }}>
            雨伞品牌 · 电商独立站
          </Typography.Title>
          <Typography.Text style={{ fontSize: 26, fontWeight: 600 }}>
            销售管理系统
          </Typography.Text>

          <Typography.Paragraph type="secondary" style={{ marginTop: 26 }}>
            账号与权限由 EADAF 统一管理，请先通过单点登录进入（应用：
            {import.meta.env.VITE_SSO_APPLICATION_ID || '未配置'}）。
          </Typography.Paragraph>

          {loggedOut ? (
            <Alert
              type="success"
              showIcon
              message="已退出登录"
              description="EADAF 会话已一并退出。如需继续使用，请重新登录。"
              style={{ marginBottom: 16 }}
            />
          ) : null}

          <Button type="primary" block size="large" onClick={handleLogin}>
            前往登录
          </Button>
        </Card>
      </Badge.Ribbon>
    </div>
  );
}
