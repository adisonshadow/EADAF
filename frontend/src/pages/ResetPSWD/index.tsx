import React, { useState, useEffect } from 'react';
import { Alert, Form, Input, Button, Card, Space, Tabs } from 'antd';
import { message } from '@/utils/antdAppApis';
import { history } from '@/utils/navigation';
import { LeftOutlined } from '@ant-design/icons';
import {
  postUsersRequestPasswordReset,
  postUsersResetPasswordWithToken,
} from '@/services/EADAF/api/users';
import { getApplicationsSsoId } from '@/services/EADAF/api/applicationsSso';
import { useInitialState } from '@/providers/InitialStateProvider';
import {
  mergeAppBranding,
  resolveBrandingDisplay,
  type AppBranding,
} from '@/utils/appBranding';
import AuthPageFrame from '@/components/AuthPageFrame';
import type { SsoLoginPageStyle } from '@/utils/ssoLoginPage';
import '../Auth/index.scss';

interface ApplicationInfo extends AppBranding {
  sso_config?: {
    login_page?: SsoLoginPageStyle;
  };
}

const checkPasswordStrength = (password: string): number => {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;
  return strength;
};

const ResetPassword: React.FC = () => {
  const { initialState } = useInitialState();
  const [requestForm] = Form.useForm();
  const [resetForm] = Form.useForm();
  const [requestLoading, setRequestLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('1');
  const [applicationInfo, setApplicationInfo] = useState<ApplicationInfo | null>(null);
  const [loginPage, setLoginPage] = useState<SsoLoginPageStyle | null>(null);
  const appIdFromUrl = new URLSearchParams(window.location.search).get('app');
  const [ssoStyleLoaded, setSsoStyleLoaded] = useState(!appIdFromUrl);

  useEffect(() => {
    const fetchApplicationInfo = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const appId = urlParams.get('app');
      if (!appId) {
        setSsoStyleLoaded(true);
        return;
      }
      try {
        const response = await getApplicationsSsoId({ id: appId }, { skipErrorHandler: true });
        if (response.code === 200 && response.data) {
          setApplicationInfo(response.data);
          setLoginPage(response.data.sso_config?.login_page || null);
        }
      } catch {
        // 未启用 SSO 时沿用系统品牌
      } finally {
        setSsoStyleLoaded(true);
      }
    };

    fetchApplicationInfo();
  }, []);

  const branding = mergeAppBranding(applicationInfo, initialState?.appBranding);
  const { shortName: pageShortName } = resolveBrandingDisplay(branding);

  const handleRequestReset = async (values: { username: string; email: string }) => {
    try {
      setRequestLoading(true);
      const response = await postUsersRequestPasswordReset({
        username: values.username.trim(),
        email: values.email.trim(),
      });

      if (response.code === 200) {
        message.success('重置码已发送，请查收邮件');
        resetForm.setFieldsValue({ username: values.username.trim() });
        requestForm.resetFields();
        setActiveTab('2');
      } else {
        message.error(response.message || '获取重置码失败');
      }
    } catch (error: any) {
      message.error(error?.data?.message || error?.message || '获取重置码失败');
    } finally {
      setRequestLoading(false);
    }
  };

  const handleResetPassword = async (values: {
    username: string;
    token: string;
    new_password: string;
    confirm_password: string;
  }) => {
    try {
      setResetLoading(true);
      const response = await postUsersResetPasswordWithToken({
        username: values.username.trim(),
        token: values.token.trim(),
        new_password: values.new_password,
      });

      if (response.code === 200) {
        message.success('密码重置成功，请使用新密码登录');
        resetForm.resetFields();
        const urlParams = new URLSearchParams(window.location.search);
        const appId = urlParams.get('app');
        history.push(`/auth/login${appId ? `?app=${appId}` : ''}`);
      } else {
        message.error(response.message || '重置密码失败');
      }
    } catch (error: any) {
      message.error(error?.data?.message || error?.message || '重置密码失败');
    } finally {
      setResetLoading(false);
    }
  };

  const items = [
    {
      key: '1',
      label: '1. 获取重置码',
      children: (
        <Form form={requestForm} layout="vertical" onFinish={handleRequestReset} size="large">
          
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
              { max: 16, message: '用户名最多16个字符' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线' },
            ]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入注册邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              title="未设置邮箱的用户无法重置密码，请联系管理员手工修改。"
            />
            <Input placeholder="请输入与账户绑定的邮箱" />
          </Form.Item>
          
          <Form.Item className="mb-0">
            <Button type="primary" htmlType="submit" loading={requestLoading} block>
              发送重置码
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: '2',
      label: '2. 开始重置',
      children: (
        <Form form={resetForm} layout="vertical" onFinish={handleResetPassword} size="large">
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item
            name="token"
            label="重置码"
            rules={[{ required: true, message: '请输入系统通过邮件发送的重置码' }]}
          >
            <Input placeholder="请输入重置码" />
          </Form.Item>
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, message: '密码至少8个字符' },
              { max: 16, message: '密码最多16个字符' },
              {
                pattern: /^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+$/,
                message: '密码只能包含字母、数字和特殊字符',
              },
              {
                validator: (_, value) => {
                  if (!value || checkPasswordStrength(value) >= 4) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('密码强度不足，请包含大小写字母、数字和特殊字符'));
                },
              },
            ]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="确认新密码"
            dependencies={['new_password']}
            rules={[
              { required: true, message: '请输入确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请输入确认新密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={resetLoading} block>
              重置密码
            </Button>
          </Form.Item>
        </Form>
      ),
    },
  ];

  return (
    <AuthPageFrame
      shortName={pageShortName}
      loginPage={loginPage}
      asidePending={Boolean(appIdFromUrl) && !ssoStyleLoaded}
    >
      <Card className="auth-card" variant="borderless">
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <Tabs style={{ marginTop: '20px' }} tabPlacement="start" activeKey={activeTab} onChange={setActiveTab} items={items} tabBarExtraContent={
            <Button 
              type="link"
              icon={<LeftOutlined />}
              onClick={() => {
                const urlParams = new URLSearchParams(window.location.search);
                const appId = urlParams.get('app');
                history.push(`/auth/login${appId ? `?app=${appId}` : ''}`);
              }}>返回登录
            </Button>
          } />
        </Space>
      </Card>
    </AuthPageFrame>
  );
};

export default ResetPassword;
