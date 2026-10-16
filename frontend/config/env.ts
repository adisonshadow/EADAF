/**
 * 前端**开发期**配置（vite.config.ts 读取）。
 *
 * 这里只放"构建/开发服务器"自己的东西：dev 端口、dev proxy 目标。
 * 跨环境会变的值请走**运行时可配**（`public/runtime-config.js` 或后端
 * `/api/v1/system/runtime-config`，见 `src/config/deployConfig.ts`），
 * 这样同一份 `dist` 能直接部署到不同环境。
 */
export const APP_ENV = {
  /** 前端开发服务器端口 */
  port: 29527,

  /** 开发环境：后端 API 地址（devServer proxy 转发目标） */
  devApiBaseUrl: 'http://localhost:29526',

  /**
   * 生产环境 API 地址——**仅跨域部署的 bootstrap 兜底**（会被构建进产物）。
   * 同源部署（Nginx 反代 /api，或后端直接托管 dist）留空；
   * 需要跨域时优先在部署时写 `runtime-config.js`，这样不必重新构建。
   */
  prodApiBaseUrl: '',
} as const;

/** 当前构建/运行模式下的 API 基础地址（仅构建期用途） */
export const resolveAppApiBaseUrl = () =>
  process.env.NODE_ENV === 'development'
    ? APP_ENV.devApiBaseUrl
    : APP_ENV.prodApiBaseUrl;
