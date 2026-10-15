import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spin, message } from 'antd';
import { saveAuth } from './auth';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    const token = searchParams.get('token')
      || searchParams.get('access_token')
      || searchParams.get('accessToken');
    const refreshToken = searchParams.get('refresh_token') || undefined;
    if (token) {
      saveAuth(token, refreshToken);
      messageApi.success('登录成功');
      navigate('/', { replace: true });
      return;
    }
    messageApi.error('SSO 回调缺少 token');
    navigate('/auth/login', { replace: true });
  }, [messageApi, navigate, searchParams]);

  return (
    <>
      {contextHolder}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin description="正在完成 SSO 登录..." />
      </div>
    </>
  );
}
