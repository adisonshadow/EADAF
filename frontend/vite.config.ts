import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { APP_ENV } from './config/env';

const DEV_LOG_PATH = '/__dev/ai-tool-log';

/**
 * Windows 上「原子写盘」有个绕不开的窗口：写盘方先把内容写进
 * `.<文件名>.<pid>.<随机>.tmpdir/<文件名>.tmp`，再原子替换目标文件、删掉暂存目录。
 * 这段窗口里 fs.watch 会抛 EBUSY（资源被占用），chokidar 把它 emit 成 error 事件——
 * 而 Vite 没给 watcher 挂 error 监听，EventEmitter 就直接抛未捕获异常，
 * 整个 dev server 进程退出（pnpm recursive run 随之失败，后端也被 dev-core 一起收掉）。
 *
 * 走「临时文件 + 替换」的写盘都会触发（编辑器保存、代码生成器、AI 改代码），
 * 所以这里兜底：同类错误只记一条告警，绝不退出；后续事件仍由 chokidar 正常处理。
 */
function watchErrorGuard(): Plugin {
  return {
    name: 'watch-error-guard',
    configureServer(server) {
      const seen = new Map<string, number>();
      server.watcher.on('error', (error: Error) => {
        const err = error as NodeJS.ErrnoException;
        const code = err.code || 'UNKNOWN';
        const count = (seen.get(code) || 0) + 1;
        seen.set(code, count);
        if (count > 1) return; // 同类只提示一次，避免刷屏
        server.config.logger.warn(
          `[watch] 已忽略一次 fs.watch ${code}（${err.path || '路径未知'}）：` +
            '原子写盘的瞬时锁冲突，不影响 HMR；后续同类错误只计数。',
        );
      });
    },
  };
}

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

/** pnpm 隔离下 frontend 解析不到 ai-base 源码里的运行时依赖（@cordisjs/core / ajv / @antv/gpt-vis），
 * 与 resolveLodashEs 同理：从仓库 .pnpm store 取已安装副本，返回真实目录供 Vite 解析。 */
function resolvePnpmDep(pkgName: string): string {
  const hoisted = path.resolve(__dirname, 'node_modules', pkgName);
  if (fs.existsSync(hoisted)) return hoisted;
  const pnpmRoot = path.resolve(__dirname, '../node_modules/.pnpm');
  if (fs.existsSync(pnpmRoot)) {
    // .pnpm 目录名把 scope 的 / 换成 +（@cordisjs/core → @cordisjs+core@x.y.z）
    const prefix = pkgName.replace('/', '+');
    const dirs = fs.readdirSync(pnpmRoot).filter((name) => name.startsWith(`${prefix}@`));
    dirs.sort();
    const latest = dirs.at(-1);
    if (latest) {
      const candidate = path.join(pnpmRoot, latest, 'node_modules', pkgName);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return pkgName;
}

const cordisCoreDir = resolvePnpmDep('@cordisjs/core');
const ajvDir = resolvePnpmDep('ajv');
const gptVisDir = resolvePnpmDep('@antv/gpt-vis');

export default defineConfig({
  plugins: [
    react(),
    watchErrorGuard(),
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
      // ai-base 源码直接引用其运行时依赖；pnpm 隔离下 frontend 的 node_modules 没有这些包，直链 .pnpm store
      { find: '@cordisjs/core', replacement: cordisCoreDir },
      { find: 'ajv', replacement: ajvDir },
      { find: '@antv/gpt-vis', replacement: gptVisDir },
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
        '**/*.log',
        // 原子写盘在源码目录里造出的暂存目录/文件：没有监听价值，而且是 Windows 上
        // fs.watch EBUSY 崩溃的主要来源（见 watchErrorGuard）。chokidar 的 ignored
        // 支持 anymatch 语义，所以这里用正则匹配整条绝对路径。
        /\.tmpdir([\\/]|$)/,
        /\.tmp$/,
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
    // 跨域部署的 bootstrap 兜底；同源部署留空。系统存储桶 code 等改为运行时可配
    // （public/runtime-config.js 或后端 /api/v1/system/runtime-config，见 src/config/deployConfig.ts）
    'process.env.APP_API_BASE_URL': JSON.stringify(APP_ENV.prodApiBaseUrl),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
});
