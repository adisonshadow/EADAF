const logger = require('../utils/logger');
const { getSystemHealthReport } = require('../services/system/systemHealthService');

class SystemHealthController {
  static async get(ctx) {
    try {
      const bypassCache = String(ctx.query.refresh || '') === '1';
      const data = await getSystemHealthReport({ bypassCache });
      ctx.body = { code: 200, message: 'success', data };
    } catch (error) {
      logger.error('系统健康检查失败', { message: error.message, stack: error.stack });
      ctx.status = 500;
      ctx.body = { code: 500, message: '系统健康检查失败', error: error.message };
    }
  }
}

module.exports = SystemHealthController;
