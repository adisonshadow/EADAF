import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installUnauthorizedInterceptor } from './auth/auth';
import './index.css';

// 业务请求拿到 401 说明 BFF 侧会话真的没了（刷新由 BFF 负责）→ 统一回登录页，
// 而不是把「无效的令牌 / 未授权」留在页面上
installUnauthorizedInterceptor();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
