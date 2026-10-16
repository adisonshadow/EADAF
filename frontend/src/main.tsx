import { createRoot } from 'react-dom/client';
import { loadDeployConfig } from '@/config/deployConfig';
import './global.scss';

/**
 * 启动顺序很重要：
 *   1. 先加载「运行时可配」（静态注入的 runtime-config.js → 后端 /system/runtime-config → 兜底值）；
 *   2. **再**动态 import App。
 *
 * 这样 App 依赖链里的模块级常量（如 constants/storage.ts 的 SYSTEM_STORAGE_BUCKET_CODE）
 * 才是在配置就绪之后求值的；否则它们会把兜底值固化下来，运行时可配就白做了。
 */
async function bootstrap() {
  await loadDeployConfig();
  const { default: App } = await import('./App');
  createRoot(document.getElementById('root')!).render(<App />);
}

void bootstrap();
