import { AuditOutlined, DesktopOutlined, LogoutOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { history } from '@/utils/navigation';
import { useInitialState } from '@/providers/InitialStateProvider';
import { Spin, Avatar } from 'antd';
import type { MenuInfo } from 'rc-menu/lib/interface';
import React, { useCallback } from 'react';
import { flushSync } from 'react-dom';
import HeaderDropdown from '../HeaderDropdown';
import { getImageUrlIfValid } from '@/utils/image';

export type GlobalHeaderRightProps = {
  menu?: boolean;
  children?: React.ReactNode;
};

export const AvatarName = () => {
  const { initialState } = useInitialState();
  const { currentUser } = initialState || {};
  return <span className="anticon">{currentUser?.username}</span>;
};

export const AvatarDropdown: React.FC<GlobalHeaderRightProps> = ({ menu, children }) => {
  /**
   * 退出登录。
   *
   * 统一走登出中转页 `/auth/logout`：由它撤销刷新令牌、清掉平台会话位**与所有应用的
   * `sso_token:<app_id>`**，再决定回管理台登录页还是回业务应用。
   * （原先直接在组件里 POST + 只清两个 key，会漏掉应用令牌，业务应用也收不到通知。）
   */
  const loginOut = () => {
    const appId = new URLSearchParams(window.location.search).get('app');
    history.push(appId ? `/auth/logout?app=${encodeURIComponent(appId)}` : '/auth/logout');
  };

  const { initialState, setInitialState } = useInitialState();

  const onMenuClick = useCallback(
    (event: MenuInfo) => {
      const { key } = event;
      if (key === 'logout') {
        flushSync(() => {
          setInitialState((s) => {
            if (!s) return s;
            return { ...s, currentUser: undefined };
          });
        });
        loginOut();
        return;
      }
      if (key === 'center') {
        history.push('/account/center');
        return;
      }
      if (key === 'settings') {
        history.push('/system/settings');
        return;
      }
      if (key === 'account-sessions') {
        history.push('/account/sessions');
        return;
      }
      if (key === 'operation-logs') {
        history.push('/system/operation-logs');
        return;
      }
    },
    [setInitialState],
  );

  const loading = (
    <span>
      <Spin
        size="small"
        style={{
          marginLeft: 8,
          marginRight: 8,
          display: 'flex',
          height: '48px',
          overflow: 'hidden',
          alignItems: 'center',
          padding: '0 8px',
          cursor: 'pointer',
        }}
      />
    </span>
  );

  if (!initialState) {
    return loading;
  }

  const { currentUser } = initialState;

  if (!currentUser || !currentUser.username) {
    return loading;
  }

  const menuItems = [
    ...(menu
      ? [
          {
            key: 'center',
            icon: <UserOutlined />,
            label: '个人中心',
          },
          {
            key: 'settings',
            icon: <SettingOutlined />,
            label: '系统设置',
          },
          {
            key: 'account-sessions',
            icon: <DesktopOutlined />,
            label: '我的登录信息',
          },
          {
            key: 'operation-logs',
            icon: <AuditOutlined />,
            label: '系统日志',
          },
          {
            type: 'divider' as const,
          },
        ]
      : []),
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
    },
  ];

  return (
    <HeaderDropdown
      menu={{
        selectedKeys: [],
        onClick: onMenuClick,
        items: menuItems,
      }}
    >
      <span className="anticon">
        {children || (
          <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Avatar
              src={getImageUrlIfValid(currentUser?.avatar)}
              icon={<UserOutlined />}
              style={{ marginRight: 8 }}
            />
            <span>{currentUser?.name || currentUser?.username}</span>
          </span>
        )}
      </span>
    </HeaderDropdown>
  );
};
