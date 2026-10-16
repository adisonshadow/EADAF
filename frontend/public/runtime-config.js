/**
 * 部署期「运行时可配」注入点（被 index.html 以普通 script 加载，先于应用代码执行）。
 *
 * 部署时**直接覆盖本文件**（或另挂一个同名静态文件），即可让同一份 `dist` 适配不同环境，
 * 无需重新构建。应用侧解析顺序见 `src/config/deployConfig.ts`：
 *   本文件注入 → 后端 GET /api/v1/system/runtime-config → 构建期注入/代码默认值。
 *
 * 支持字段：
 *   apiBaseUrl              跨域部署时的 API 基址（同源留空）
 *   systemStorageBucketCode 系统内置存储桶 code（需与后端 SYSTEM_STORAGE_BUCKET_CODE 一致）
 *
 * 例：
 *   window.__EADAF_DEPLOY__ = {
 *     apiBaseUrl: 'https://api.example.com',
 *     systemStorageBucketCode: 'eadaf-system',
 *   };
 *
 * 注意：本文件里**不要放密钥**——它是公开静态资源。
 */
window.__EADAF_DEPLOY__ = window.__EADAF_DEPLOY__ || {};
