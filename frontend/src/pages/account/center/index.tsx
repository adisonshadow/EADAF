import React, { useEffect, useState } from 'react';
import { Tabs, ConfigProvider, theme } from 'antd';
import { PageContainer } from '@ant-design/pro-components';
import { useSearchParams } from 'react-router-dom';
import Lottie from 'react-lottie-player';
import ProfileForm from './components/ProfileForm';
import PasswordForm from './components/PasswordForm';
import FirstLoginSetupModal from './components/FirstLoginSetupModal';
import styles from './index.module.scss';
import { useInitialState } from '@/providers/InitialStateProvider';
import goodJobLottie from '@/assets/lotties/good-job.json';

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
  const embed = isEmbedMode(searchParams);
  const pageTheme = resolveAccountTheme(searchParams);

  // 平台内跟随主布局主题；只有嵌入业务应用时才按 ?theme= 单独包一层
  if (!embed) {
    return <AccountCenterPage pageTheme={pageTheme} embed={false} />;
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: pageTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
        },
      }}
    >
      <AccountCenterPage pageTheme={pageTheme} embed />
    </ConfigProvider>
  );
};

const AccountCenterPage: React.FC<{ pageTheme: 'light' | 'dark'; embed: boolean }> = ({
  pageTheme,
  embed,
}) => {
  const { token } = theme.useToken();
  const { initialState, refresh } = useInitialState();
  const canvas = pageTheme === 'dark' ? token.colorBgLayout : token.colorBgContainer;

  useEffect(() => {
    if (!embed) return undefined;
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
  }, [canvas, embed, pageTheme]);
  const [activeTab, setActiveTab] = useState('profile');
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSuccess = () => {
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      refresh();
    }, 2000);
  };

  if (!initialState?.currentUser) {
    return null;
  }

  const mustChangePassword = !!initialState.currentUser.must_change_password;

  const tabs = (
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
  );

  const success = showSuccess ? (
    <div className={styles['account-center-success-animation']}>
      <Lottie
        animationData={goodJobLottie}
        loop={false}
        play
        style={{ width: 200, height: 200 }}
      />
    </div>
  ) : null;

  // 平台内走主布局顶栏，与系统设置同一套 header；嵌入业务应用时仍是独立页
  if (!embed) {
    return (
      <PageContainer title={<></>}>
        <FirstLoginSetupModal open={mustChangePassword} />
        <div className={styles['account-center-container']}>{tabs}</div>
        {success}
      </PageContainer>
    );
  }

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
        {tabs}
        {success}
      </div>
    </div>
  );
};

export default AccountCenter; 