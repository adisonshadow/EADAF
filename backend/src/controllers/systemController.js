const systemService = require('../services/system/systemService');
const config = require('../config');
const logger = require('../utils/logger');
const { formatApiError } = require('../utils/formatApiError');
const fs = require('fs/promises');

function sendError(ctx, error, fallbackStatus = 500) {
  const formatted = formatApiError(error, { fallbackStatus });
  logger.error(formatted.message, { stack: error?.stack });
  ctx.status = formatted.status;
  ctx.body = { code: formatted.code, message: formatted.message, data: formatted.data };
}

class SystemController {
  /**
   * 运行时可配（**公开**，供前端启动时读取；只放非敏感值）。
   *
   * 目的：同一份前端产物可部署到不同环境，不必因为"系统存储桶 code 不同"而重新构建。
   * 前端解析顺序：window.__EADAF_DEPLOY__（部署时覆盖 public/runtime-config.js）> 本接口 > 代码默认值。
   */
  static async getRuntimeConfig(ctx) {
    try {
      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          systemStorageBucketCode: config.storage.systemBucket.code,
        },
      };
    } catch (error) {
      sendError(ctx, error);
    }
  }

  static async getFeatures(ctx) {
    try {
      const data = await systemService.getSystemFeatures();
      ctx.body = { code: 200, message: '获取系统功能开关成功', data };
    } catch (error) {
      sendError(ctx, error);
    }
  }

  static async updateFeatures(ctx) {
    try {
      const data = await systemService.updateSystemFeatures(ctx.request.body || {});
      ctx.body = { code: 200, message: '更新系统功能开关成功', data };
    } catch (error) {
      sendError(ctx, error, 400);
    }
  }

  static async listBackups(ctx) {
    try {
      const data = await systemService.listBackups();
      ctx.body = { code: 200, message: '获取备份列表成功', data };
    } catch (error) {
      sendError(ctx, error);
    }
  }

  static async runBackup(ctx) {
    try {
      const data = await systemService.runBackup();
      ctx.body = { code: 200, message: '备份任务已执行', data };
    } catch (error) {
      sendError(ctx, error, 500);
    }
  }

  static async restoreBackup(ctx) {
    const files = ctx.request.files || {};
    const raw = files.file;
    const file = Array.isArray(raw) ? raw[0] : raw;

    if (!file || !file.filepath) {
      ctx.status = 400;
      ctx.body = { code: 400, message: '请上传 .dump 备份文件', data: null };
      return;
    }

    try {
      const data = await systemService.restoreBackup(file.filepath);
      ctx.body = { code: 200, message: '数据恢复完成', data };
    } catch (error) {
      sendError(ctx, error, 500);
    } finally {
      // 无论成败都清理上传的临时文件
      try {
        await fs.unlink(file.filepath);
      } catch (cleanupError) {
        logger.warn('恢复备份临时文件清理失败', {
          filepath: file.filepath,
          message: cleanupError.message,
        });
      }
    }
  }
}

module.exports = SystemController;
