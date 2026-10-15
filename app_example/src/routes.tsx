import { AIChatDisplay } from '@eadaf/ai-base';
import { Navigate, Route, Routes } from 'react-router-dom';
import AuthGate from '@/auth/AuthGate';
import AuthCallback from '@/auth/AuthCallback';
import LoginPage from '@/auth/LoginPage';
import AppShell from '@/layout/AppShell';
import DashboardPage from '@/pages/store/Dashboard';
import ProductsPage from '@/pages/store/Products';
import OrdersPage from '@/pages/store/Orders';
import MembersPage from '@/pages/store/Members';
import ComplaintsPage from '@/pages/store/Complaints';

/** 路由：登录/回调独立于外壳；业务页在 AppShell 内（均需 EADAF SSO 登录） */
export default function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/auth/login"
        element={
          <AIChatDisplay mode="hidden">
            <LoginPage />
          </AIChatDisplay>
        }
      />
      <Route
        path="/auth/callback"
        element={
          <AIChatDisplay mode="hidden">
            <AuthCallback />
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
