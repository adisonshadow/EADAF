import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installUnauthorizedInterceptor } from './auth/auth';
import './index.css';

// 任何请求返回 401（令牌失效/过期）都统一跳登录页，而不是把「无效的令牌」留在页面上
installUnauthorizedInterceptor();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
