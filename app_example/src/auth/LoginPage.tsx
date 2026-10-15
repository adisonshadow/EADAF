import { Badge, Button, Card, Typography } from 'antd';
import { buildSsoLoginUrl } from './auth';

/** 登录页：跳 EADAF 管理端做 SSO（示例应用不自己管账号密码） */
export default function LoginPage() {
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

          <Button type="primary" block size="large" onClick={handleLogin}>
            前往登录
          </Button>
        </Card>
      </Badge.Ribbon>
    </div>
  );
}
