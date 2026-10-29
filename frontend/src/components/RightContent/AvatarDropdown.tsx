import {
  AuditOutlined,
  CloseCircleFilled,
  DesktopOutlined,
  ExclamationCircleFilled,
  HeartOutlined,
  LogoutOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { history } from '@/utils/navigation';
import { useInitialState } from '@/providers/InitialStateProvider';
import { useSystemHealth } from '@/hooks/useSystemHealth';
import { Badge, Spin, Avatar, theme } from 'antd';
import type { MenuInfo } from 'rc-menu/lib/interface';
import React, { useCallback } from 'react';
import { flushSync } from 'react-dom';
import HeaderDropdown from '../HeaderDropdown';
import { getImageUrlIfValid } from '@/utils/image';
import type { ThreeMemberRole } from '@/utils/threeMember';

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

  const { token } = theme.useToken();
  const { initialState, setInitialState } = useInitialState();
  const currentUser = initialState?.currentUser;
  const { report } = useSystemHealth(Boolean(menu && currentUser?.username));
  const unhealthyCount = (report?.errorCount || 0) + (report?.warningCount || 0);
  const severity = report?.status === 'error' || report?.status === 'warning' ? report.status : null;
  const severityColor = severity === 'error' ? token.colorError : token.colorWarning;
  const SeverityIcon = severity === 'error' ? CloseCircleFilled : ExclamationCircleFilled;

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
      if (key === 'system-health') {
        history.push('/system/health');
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

  if (!currentUser || !currentUser.username) {
    return loading;
  }

  const threeOn = Boolean(initialState?.systemFeatures?.threeMemberEnabled);
  const memberRole = (currentUser?.three_member_role || null) as ThreeMemberRole | null;
  const showSettings = !threeOn || memberRole === 'system_admin' || memberRole === 'security_admin';
  const showAudit = !threeOn || memberRole === 'auditor';

  const menuItems = [
    ...(menu
      ? [
          {
            key: 'center',
            icon: <UserOutlined />,
            label: '个人中心',
          },
          ...(showSettings
            ? [{
                key: 'settings',
                icon: <SettingOutlined />,
                label: '系统设置',
              }]
            : []),
          {
            key: 'account-sessions',
            icon: <DesktopOutlined />,
            label: '我的登录信息',
          },
          ...(showAudit
            ? [{
                key: 'operation-logs',
                icon: <AuditOutlined />,
                label: '系统日志',
              }]
            : []),
          ...(showAudit
            ? [{
                key: 'system-health',
                icon: severity ? (
                  <SeverityIcon style={{ color: severityColor }} />
                ) : (
                  <HeartOutlined />
                ),
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: token.marginXS }}>
                    系统健康
                    {severity && unhealthyCount > 0 ? (
                      <Badge count={unhealthyCount} color={severityColor} />
                    ) : null}
                  </span>
                ),
              }]
            : []),
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
            {severity ? (
              <SeverityIcon
                aria-label={
                  severity === 'error'
                    ? `系统健康：${report?.errorCount || 0} 个错误`
                    : `系统健康：${report?.warningCount || 0} 个警告`
                }
                style={{ color: severityColor, fontSize: token.fontSizeLG, marginRight: token.marginXS }}
              />
            ) : null}
            <Avatar
              src={getImageUrlIfValid(currentUser?.avatar)}
              icon={<UserOutlined />}
              style={{ marginRight: token.marginXS }}
            />
            <span>{currentUser?.name || currentUser?.username}</span>
          </span>
        )}
      </span>
    </HeaderDropdown>
  );
};
