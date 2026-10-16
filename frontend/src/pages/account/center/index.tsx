import React, { useEffect, useState } from 'react';
import { Tabs, Button, ConfigProvider, theme } from 'antd';
import { useSearchParams } from 'react-router-dom';
import Lottie from 'react-lottie-player';
import ProfileForm from './components/ProfileForm';
import PasswordForm from './components/PasswordForm';
import FirstLoginSetupModal from './components/FirstLoginSetupModal';
import styles from './index.module.scss';
import { LeftOutlined, LogoutOutlined } from '@ant-design/icons';
import { history } from '@/utils/navigation';
import { useInitialState } from '@/providers/InitialStateProvider';
import goodJobLottie from '@/assets/lotties/good-job.json';
import defaultSettings from '../../../../config/defaultSettings';

function isEmbedMode(params: URLSearchParams) {
  const embed = params.get('embed');
  const hideHeader = params.get('hideHeader');
  return embed === '1' || embed === 'true' || hideHeader === '1' || hideHeader === 'true';
}

/** 嵌入方通过 ?theme=dark 切换深色；缺省及其余取值均为 light */
export function resolveAccountTheme(params: URLSearchParams): 'light' | 'dark' {
  return params.get('theme')?.trim().toLowerCase() === 'dark' ? 'dark' : 'light';
}

const AccountCenter: React.FC = () => {
  const [searchParams] = useSearchParams();
  const pageTheme = resolveAccountTheme(searchParams);

  return (
    <ConfigProvider
      theme={{
        algorithm: pageTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
        },
      }}
    >
      <AccountCenterPage pageTheme={pageTheme} />
    </ConfigProvider>
  );
};

const AccountCenterPage: React.FC<{ pageTheme: 'light' | 'dark' }> = ({ pageTheme }) => {
  const { token } = theme.useToken();
  const { initialState, refresh } = useInitialState();
  const [searchParams] = useSearchParams();
  const embed = isEmbedMode(searchParams);
  const canvas = pageTheme === 'dark' ? token.colorBgLayout : token.colorBgContainer;

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlBg: html.style.backgroundColor,
      bodyBg: body.style.backgroundColor,
      scheme: html.style.colorScheme,
    };
    html.style.backgroundColor = canvas;
    body.style.backgroundColor = canvas;
    html.style.colorScheme = pageTheme;
    return () => {
      html.style.backgroundColor = prev.htmlBg;
      body.style.backgroundColor = prev.bodyBg;
      html.style.colorScheme = prev.scheme;
    };
  }, [canvas, pageTheme]);
  const [activeTab, setActiveTab] = useState('profile');
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSuccess = () => {
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      refresh();
    }, 2000);
  };

  /**
   * 退出登录：统一走 `/auth/logout` 中转页（撤 refresh + 清平台会话位与所有应用令牌，
   * 带 `?app=` 时登出后回该应用）。
   */
  const loginOut = () => {
    const app_id = new URL(window.location.href).searchParams.get('app');
    history.push(app_id ? `/auth/logout?app=${encodeURIComponent(app_id)}` : '/auth/logout');
  };

  if (!initialState?.currentUser) {
    return null;
  }

  const mustChangePassword = !!initialState.currentUser.must_change_password;
  const brandingLogo = initialState.settings?.logo || defaultSettings.logo;
  const brandingName = initialState.settings?.title || defaultSettings.title;

  return (
    <div
      className={styles['account-center-page']}
      data-theme={pageTheme}
      style={{
        background: canvas,
        color: token.colorText,
        ['--account-label-color' as string]: token.colorText,
        ['--account-extra-color' as string]: token.colorTextSecondary,
        ['--account-overlay-bg' as string]:
          pageTheme === 'dark' ? token.colorBgElevated : 'rgba(255, 255, 255, 0.9)',
      }}
    >
      <div className={styles['account-center-container']}>
        <FirstLoginSetupModal open={mustChangePassword} />
        {!embed && (
          <div className='d-flex justify-content-between align-items-center'>
            <Button type='link' onClick={() => {
              history.back();
            }}>
              <LeftOutlined /> 返回
            </Button>

            <img
              src={brandingLogo}
              alt={typeof brandingName === 'string' ? brandingName : undefined}
              className={styles['account-center-logo']}
            />

            <Button type='link' onClick={() => {
              loginOut();
            }}>
              <LogoutOutlined /> 退出
            </Button>
          </div>
        )}
        <div className={embed ? undefined : 'mt-4'}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            centered
            items={[
              {
                key: 'profile',
                label: '修改资料',
                children: <ProfileForm onSuccess={handleSuccess} />,
              },
              {
                key: 'password',
                label: '修改密码',
                children: <PasswordForm onSuccess={handleSuccess} />,
              },
            ]}
          />
        </div>
        {showSuccess && (
          <div className={styles['account-center-success-animation']}>
            <Lottie
              animationData={goodJobLottie}
              loop={false}
              play
              style={{ width: 200, height: 200 }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountCenter; 