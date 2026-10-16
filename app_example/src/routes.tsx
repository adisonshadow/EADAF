import { AIChatDisplay } from '@eadaf/ai-base';
import { Navigate, Route, Routes } from 'react-router-dom';
import AuthGate from '@/auth/AuthGate';
import LoginPage from '@/auth/LoginPage';
import AppShell from '@/layout/AppShell';
import DashboardPage from '@/pages/store/Dashboard';
import ProductsPage from '@/pages/store/Products';
import OrdersPage from '@/pages/store/Orders';
import MembersPage from '@/pages/store/Members';
import ComplaintsPage from '@/pages/store/Complaints';

/** 路由：登录页独立于外壳；业务页在 AppShell 内（均需登录，由 BFF 会话判定） */
export default function AppRoutes() {
  return (
    <Routes>
      {/* 站内登录页：/auth/* 由 BFF 占用（授权/会话/登出），所以用 /login */}
      <Route
        path="/login"
        element={
          <AIChatDisplay mode="hidden">
            <LoginPage />
          </AIChatDisplay>
        }
      />
      <Route
        path="/"
        element={
          <AuthGate>
            <AppShell />
          </AuthGate>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="complaints" element={<ComplaintsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
