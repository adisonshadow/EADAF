/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** EADAF 后端地址；开发环境默认 '/api'（vite proxy 到 29526） */
  readonly VITE_API_BASE: string;
  /** EADAF 里的 AI Scope（销售 Demo 的 Skill/Tool 归属），如 sales-demo */
  readonly VITE_DEMO_SCOPE_SLUG: string;
  /** EADAF 里注册的应用 ID（SSO 登录用） */
  readonly VITE_SSO_APPLICATION_ID: string;
  /** EADAF 管理端地址（SSO 登录跳转目标），默认 http://localhost:29527 */
  readonly VITE_SSO_EADAF_FRONTEND: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '@eadaf/ai-base/style.css';
