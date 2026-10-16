import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@eadaf/ai-base/style.css',
        replacement: path.resolve(__dirname, '../package/ai-base/src/ui/AIChatPanel.css'),
      },
      {
        find: '@eadaf/ai-base',
        replacement: path.resolve(__dirname, '../package/ai-base/src/index.ts'),
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, 'src'),
      },
    ],
  },
  // 不预构建 @eadaf/ai-base（直接读 src，改源码后 HMR）；
  // react-is 为 CJS，须单独预构建，否则 antd/rc 组件会报 ForwardRef 导出错误
  optimizeDeps: {
    exclude: ['@eadaf/ai-base'],
    include: ['react-is'],
  },
  server: {
    port: 29529,
    watch: {
      ignored: ['!**/package/ai-base/src/**'],
    },
    // 前端不再直连 EADAF：/api 与 /auth 都交给本仓库的 BFF（app_example/server/index.mjs）。
    // 这样浏览器只面对一个源（同源 httpOnly 会话 Cookie），令牌只存在于 BFF。
    // BFF 端口可用 BFF_PORT 覆盖；先启动：pnpm --filter ./app_example dev:bff
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.BFF_PORT || 29530}`,
        changeOrigin: true,
      },
      '/auth': {
        target: `http://localhost:${process.env.BFF_PORT || 29530}`,
        changeOrigin: true,
      },
    },
  },
});
