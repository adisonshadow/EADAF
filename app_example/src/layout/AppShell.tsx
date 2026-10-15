import {
  AppstoreOutlined,
  DashboardOutlined,
  LogoutOutlined,
  ShoppingOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Button, Layout, Menu, Space, Typography } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearAuth } from '@/auth/auth';
import './AppShell.css';

const { Header, Content } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '经营概览' },
  { key: '/products', icon: <AppstoreOutlined />, label: '伞品管理' },
  { key: '/orders', icon: <ShoppingOutlined />, label: '独立站订单' },
  { key: '/members', icon: <TeamOutlined />, label: '会员' },
  { key: '/complaints', icon: <ToolOutlined />, label: '售后工单' },
];

/**
 * 示例应用外壳：顶部标题 + 左侧菜单 + 内容区。
 * 有意保持极简（只用 antd Layout/Menu）；示例的重点是「复用 EADAF 后端」。
 */
export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout className="app-example-shell">
      <Header
        className="app-example-shell-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#001529',
        }}
      >
        <Space size={12}>
          <Typography.Text style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>
            雨伞品牌 · 独立站销售管理
          </Typography.Text>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
            EADAF 业务应用示例（app_example）
          </Typography.Text>
        </Space>
        <Button
          type="text"
          icon={<LogoutOutlined />}
          style={{ color: '#fff' }}
          onClick={() => {
            clearAuth();
            navigate('/auth/login');
          }}
        >
          退出
        </Button>
      </Header>
      <Layout className="app-example-shell-body">
        <Layout.Sider width={200} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
          />
        </Layout.Sider>
        <Content style={{ padding: 24, overflow: 'auto', minWidth: 0 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
