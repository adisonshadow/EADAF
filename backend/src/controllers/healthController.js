const os = require('os');
const packageJson = require('../../package.json');
const sequelize = require('../config/database');
const logger = require('../utils/logger');
const {
  reportDependencyError,
  noteDependencyUp,
} = require('../utils/dependencyDiagnostics');

class HealthController {
  static async check(ctx) {
    try {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      
      // 检查数据库连接（健康检查会被轮询：依赖不可用只报一次，避免刷屏）
      let dbStatus = 'ok';
      try {
        await sequelize.authenticate();
        noteDependencyUp('postgres');
      } catch (dbError) {
        reportDependencyError('数据库连接检查失败', dbError, { fallbackKey: 'postgres' });
        dbStatus = 'error';
      }
      
      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          status: dbStatus === 'ok' ? 'ok' : 'warning',
          timestamp: new Date().toISOString(),
          version: packageJson.version,
          uptime: Math.floor(uptime),
          memory: {
            total: os.totalmem(),
            free: os.freemem(),
            used: memoryUsage.heapUsed
          },
          cpu: {
            cores: os.cpus().length,
            loadAvg: os.loadavg()
          },
          database: {
            status: dbStatus,
            message: dbStatus === 'ok' ? '数据库连接正常' : '数据库连接异常'
          }
        }
      };
    } catch (error) {
      logger.error('健康检查失败', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '健康检查失败',
        error: error.message
      };
    }
  }
}

module.exports = HealthController; 