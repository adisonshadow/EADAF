import type { ReactNode } from 'react';
import {
  ApiOutlined,
  AuditOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  FolderOutlined,
  HeartOutlined,
  PartitionOutlined,
  RobotOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { MenuDataItem } from '@ant-design/pro-components';
import { ProLayout } from '@ant-design/pro-components';
import { Suspense, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AnimatedOutlet from '@/components/AnimatedOutlet';
import { AvatarDropdown, Footer } from '@/components';
import defaultSettings from '../../config/defaultSettings';
import { buildMenuData, findRouteMeta } from '@/routes/config';
import { useInitialState } from '@/providers/InitialStateProvider';
import { useUiTheme } from '@/theme/uiTheme';

const iconMap: Record<string, ReactNode> = {
  TeamOutlined: <TeamOutlined />,
  AuditOutlined: <AuditOutlined />,
  PartitionOutlined: <PartitionOutlined />,
  FolderOutlined: <FolderOutlined />,
  HeartOutlined: <HeartOutlined />,
  DatabaseOutlined: <DatabaseOutlined />,
  ApiOutlined: <ApiOutlined />,
  DeploymentUnitOutlined: <DeploymentUnitOutlined />,
  RobotOutlined: <RobotOutlined />,
  SettingOutlined: <SettingOutlined />,
  UserOutlined: <UserOutlined />,
};

function decorateMenuIcons(items: MenuDataItem[]): MenuDataItem[] {
  return items.map((item) => ({
    ...item,
    icon: typeof item.icon === 'string' ? iconMap[item.icon] : item.icon,
    children: item.children ? decorateMenuIcons(item.children) : undefined,
  }));
}

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { initialState } = useInitialState();
  const { resolved: uiTheme } = useUiTheme();
  const routeMeta = findRouteMeta(location.pathname);
  // 嵌入业务应用时个人中心不套平台顶栏（?embed=1 / ?hideHeader=1）
  const embedAccountCenter = (() => {
    if (location.pathname !== '/account/center') return false;
    const params = new URLSearchParams(location.search);
    const embed = params.get('embed');
    const hideHeader = params.get('hideHeader');
    return embed === '1' || embed === 'true' || hideHeader === '1' || hideHeader === 'true';
  })();
  const currentUser = initialState?.currentUser;
  const metadataEnabled = Boolean(initialState?.systemFeatures?.metadataEnabled);

  const menuData = useMemo(
    () =>
      decorateMenuIcons(
        buildMenuData(
          initialState?.systemFeatures,
          initialState?.menuPermissions as Parameters<typeof buildMenuData>[1],
          {
            roleIds: currentUser?.role_ids,
            roleCodes: currentUser?.role_codes,
            departmentId: currentUser?.department_id,
            isSuperAdmin: currentUser?.role_codes?.includes('SUPER_ADMIN'),
          },
        ),
      ),
    [
      initialState?.systemFeatures,
      initialState?.menuPermissions,
      currentUser?.role_ids,
      currentUser?.role_codes,
      currentUser?.department_id,
    ],
  );

  const menuDataRender = useCallback(() => menuData, [menuData]);

  const menuItemRender = useCallback(
    (item: MenuDataItem, dom: ReactNode) =>
      item.path ? <Link to={item.path}>{dom}</Link> : dom,
    [],
  );

  const actionsRender = useCallback(
    () => (
      <div style={{ marginRight: 16, display: 'flex', alignItems: 'center' }}>
        <AvatarDropdown menu />
      </div>
    ),
    [],
  );

  const footerRender = useCallback(() => <Footer />, []);

  return (
    <ProLayout
      {...defaultSettings}
      {...initialState?.settings}
      navTheme={uiTheme === 'dark' ? 'realDark' : 'light'}
      location={location}
      route={{ routes: menuData }}
      menu={{
        ...defaultSettings.menu,
        ...initialState?.settings?.menu,
        params: { metadataEnabled },
      }}
      menuDataRender={menuDataRender}
      menuItemRender={menuItemRender}
      actionsRender={actionsRender}
      footerRender={footerRender}
      menuRender={routeMeta?.hideMenu ? false : undefined}
      pure={routeMeta?.layout === false || embedAccountCenter}
      contentStyle={
        routeMeta?.hideMenu || routeMeta?.noContentPadding
          ? {
              ...(routeMeta?.hideMenu ? { margin: 0 } : {}),
              ...(routeMeta?.noContentPadding ? { padding: 0 } : {}),
            }
          : undefined
      }
      onMenuHeaderClick={() => navigate('/')}
    >
      <Suspense fallback={null}>
        <AnimatedOutlet />
      </Suspense>
    </ProLayout>
  );
}
