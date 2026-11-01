const AppTransferExportService = require('../services/appTransfer/appExportService');
const AppTransferPreviewService = require('../services/appTransfer/appPreviewService');
const AppTransferImportService = require('../services/appTransfer/appImportService');
const { assertForceTargetSchema } = require('../services/appTransfer/schemaRelocation');
const { cleanupUpload } = require('../services/appTransfer/transferZip');
const logger = require('../utils/logger');
const { formatApiError } = require('../utils/formatApiError');

function sendError(ctx, error, fallbackStatus = 500) {
  const formatted = formatApiError(error, { fallbackStatus });
  logger.error(formatted.message, { stack: error?.stack });
  ctx.status = formatted.status;
  ctx.body = { code: formatted.code, message: formatted.message, data: formatted.data };
}

function getRequestFile(ctx) {
  const files = ctx.request.files || {};
  const raw = files.file;
  return Array.isArray(raw) ? raw[0] : raw;
}

class AppTransferController {
  /**
   * 导出:zip 附件流式下载(manifest.json + payload.json + 可选 files/),不包业务信封。
   * Content-Type 用 octet-stream,以便前端用 application/json 识别错误信封。
   */
  static async exportApp(ctx) {
    let streamStarted = false;
    try {
      const body = ctx.request.body || {};
      const { app, options, archive, fileName } = await AppTransferExportService.buildAppExportArchive(
        body.applicationId,
        body,
      );
      streamStarted = true;
      ctx.status = 200;
      ctx.set('Content-Type', 'application/octet-stream');
      ctx.set('Content-Disposition', `attachment; filename="${fileName}"`);
      archive.on('error', (err) => {
        logger.error(`[appTransfer] zip 导出失败: ${err.message}`, { stack: err.stack });
        ctx.res.destroy();
      });
      ctx.body = archive;
      logger.info(`[appTransfer] 应用「${app.code}」导出开始`, { fileName, options });
    } catch (error) {
      if (streamStarted) {
        ctx.res.destroy();
        return;
      }
      sendError(ctx, error, 400);
    }
  }

  static async previewImport(ctx) {
    const file = getRequestFile(ctx);
    if (!file || !file.filepath) {
      ctx.status = 400;
      ctx.body = { code: 400, message: '请上传应用导出的 .zip 或旧版 .json 文件', data: null };
      return;
    }
    try {
      const data = await AppTransferPreviewService.previewImportFile(file.filepath);
      ctx.body = { code: 200, message: '预览解析完成', data };
    } catch (error) {
      sendError(ctx, error, 400);
    } finally {
      await cleanupUpload(file.filepath);
    }
  }

  static async importApp(ctx) {
    const file = getRequestFile(ctx);
    if (!file || !file.filepath) {
      ctx.status = 400;
      ctx.body = { code: 400, message: '请上传应用导出的 .zip 或旧版 .json 文件', data: null };
      return;
    }
    const strategy = String(ctx.request.body?.strategy || 'overwrite');
    if (!AppTransferImportService.STRATEGIES.includes(strategy)) {
      ctx.status = 400;
      ctx.body = { code: 400, message: `strategy 仅支持: ${AppTransferImportService.STRATEGIES.join(' / ')}`, data: null };
      await cleanupUpload(file.filepath);
      return;
    }
    const body = ctx.request.body || {};
    const importOptions = { createdBy: ctx.state.user?.user_id };
    // multipart 字段多为字符串;显式传入时覆盖包内安全模式,未传则由导入服务沿用包内值
    if (Object.prototype.hasOwnProperty.call(body, 'safeMode')) {
      const raw = body.safeMode;
      importOptions.safeMode = raw === true || raw === 'true' || raw === '1';
    }
    if (body.forceTargetSchema != null && String(body.forceTargetSchema).trim() !== '') {
      try {
        importOptions.forceTargetSchema = assertForceTargetSchema(body.forceTargetSchema);
      } catch (error) {
        sendError(ctx, error, 400);
        await cleanupUpload(file.filepath);
        return;
      }
    }
    try {
      const data = await AppTransferImportService.importAppFile(file.filepath, strategy, importOptions);
      ctx.body = {
        code: 200,
        message: data.chainStoppedAt
          ? `导入在「${data.chainStoppedAt}」节失败,后续节已终止`
          : '导入执行完成',
        data,
      };
    } catch (error) {
      sendError(ctx, error, 400);
    } finally {
      await cleanupUpload(file.filepath);
    }
  }
}

module.exports = AppTransferController;
