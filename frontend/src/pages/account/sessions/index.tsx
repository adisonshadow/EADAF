import { PageContainer } from '@ant-design/pro-components';
import React from 'react';
import LoginDevices from '../center/components/LoginDevices';

/** 我的账户登录信息：当前账号的登录设备（SSO 会话） */
const AccountSessionsPage: React.FC = () => {
  return (
    <PageContainer title={<></>}>
      <LoginDevices />
    </PageContainer>
  );
};

export default AccountSessionsPage;
