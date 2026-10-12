'use strict';

/**
 * backend/src/config/envFiles.js
 *
 * 决定后端按什么顺序加载 env 文件。
 *
 * 背景：backend/.env.development 现在入库（值与 docker-compose 默认值一致，开箱可用），
 * 因此**个人/真实配置必须有一个不进 git 的覆盖层**：
 *   .env                 （本地私有，已在 .gitignore）
 *   .env.{NODE_ENV}      （开发默认值，例如 .env.development）
 *   .env.{NODE_ENV}.local（个人覆盖，已在 .gitignore；最后加载、可覆盖上面两者）
 *
 * dotenv 不覆盖已存在的 process.env，所以“最后加载”即“优先级最高”。
 * 真实环境变量（CI / pm2 / docker -e）始终优先于这些文件。
 *
 * 只放纯路径逻辑，便于单测。
 */
const path = require('path');

function envFileCandidates({ backendRoot, nodeEnv }) {
  const env = String(nodeEnv || 'development').trim() || 'development';
  return [
    path.join(backendRoot, '.env'),
    path.join(backendRoot, `.env.${env}`),
    path.join(backendRoot, `.env.${env}.local`),
  ];
}

module.exports = { envFileCandidates };
