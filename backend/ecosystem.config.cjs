/**
 * pm2 配置：pnpm pm2dev / pnpm pm2prod（--only 选择对应进程）
 * - eadaf-api-dev：开发模式，pm2 watch 文件变更自动重启
 * - eadaf-api   ：生产模式，dotenv 自动加载 .env.production
 */
const common = {
  cwd: __dirname,
  script: 'src/app.js',
  instances: 1,
  autorestart: true,
  max_memory_restart: '600M',
  time: true,
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'eadaf-api-dev',
      watch: true,
      ignore_watch: [
        'node_modules',
        'logs',
        'upload_test',
        'upload',
        '**/*.log',
        'swagger.json',
      ],
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      ...common,
      name: 'eadaf-api',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
