import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { APP_ENV } from './config/env';

const DEV_LOG_PATH = '/__dev/ai-tool-log';

/** pnpm 隔离下 frontend 解析不到 lodash-es，从仓库 .pnpm store 取已安装副本 */
function resolveLodashEs(): string {
  const hoisted = path.resolve(__dirname, 'node_modules/lodash-es');
  if (fs.existsSync(hoisted)) return hoisted;
  const pnpmRoot = path.resolve(__dirname, '../node_modules/.pnpm');
  if (fs.existsSync(pnpmRoot)) {
    const dirs = fs.readdirSync(pnpmRoot).filter((name) => name.startsWith('lodash-es@'));
    dirs.sort();
    const latest = dirs.at(-1);
    if (latest) {
      const candidate = path.join(pnpmRoot, latest, 'node_modules/lodash-es');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return 'lodash-es';
}

const lodashEsDir = resolveLodashEs();

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'ai-tool-dev-log',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0];
          if (url !== DEV_LOG_PATH || req.method !== 'POST') {
            next();
            return;
          }
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const text = payload.text || payload.message || JSON.stringify(payload);
              console.log(`\n${text}\n`);
            } catch (error) {
              console.error('🤖❌ [client] ai-tool-log parse failed', error);
            }
            res.statusCode = 204;
            res.end();
          });
        });
      },
    },
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-is'],
    alias: [
      {
        find: 'react',
        replacement: path.resolve(__dirname, 'node_modules/react'),
      },
      {
        find: 'react-dom',
        replacement: path.resolve(__dirname, 'node_modules/react-dom'),
      },
      {
        find: 'react/jsx-runtime',
        replacement: path.resolve(__dirname, 'node_modules/react/jsx-runtime'),
      },
      {
        find: 'react/jsx-dev-runtime',
        replacement: path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime'),
      },
      {
        find: '@eadaf/ai-base/style.css',
        replacement: path.resolve(__dirname, '../package/ai-base/src/ui/AIChatPanel.css'),
      },
      {
        find: '@eadaf/ai-base',
        replacement: path.resolve(__dirname, '../package/ai-base/src/index.ts'),
      },
      // 该包 ESM 导出在 Vite optimizeDeps 下偶发写不出 .vite/deps 文件（浏览器 504），直链 dist
      {
        find: 'constrained-editor-plugin',
        replacement: path.resolve(
          __dirname,
          'node_modules/constrained-editor-plugin/dist/esm/constrainedEditor.js',
        ),
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, 'src'),
      },
      // lodash UMD 无静态 named export；Vite 8 会编成 (0, import_lodash.memoize) 并在 plots 运行时炸掉
      { find: /^lodash$/, replacement: lodashEsDir },
      { find: /^lodash\/(.*)$/, replacement: `${lodashEsDir}/$1` },
    ],
  },
  optimizeDeps: {
    exclude: ['@eadaf/ai-base', 'constrained-editor-plugin'],
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-is',
    ],
  },
  server: {
    // true：监听 0.0.0.0，并在启动日志里打印真实局域网 IP（勿写死 '0.0.0.0'，否则 Network 只会显示 0.0.0.0）
    host: true,
    port: APP_ENV.port,
    allowedHosts: true,
    cors: true,
    watch: {
      usePolling: false,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/.cursor/**', // 排除Cursor AI缓存目录！非常关键
        '**/*.log'
      ]
    },
    proxy: {
      '/api/v1': {
        target: APP_ENV.devApiBaseUrl,
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
  preview: {
    host: true,
    port: APP_ENV.port,
    allowedHosts: true,
    cors: true,
    proxy: {
      '/api/v1': {
        target: APP_ENV.devApiBaseUrl,
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  define: {
    'process.env.APP_API_BASE_URL': JSON.stringify(APP_ENV.prodApiBaseUrl),
    'process.env.APP_SYSTEM_STORAGE_BUCKET_CODE': JSON.stringify(APP_ENV.systemStorageBucketCode),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
});
