const path = require('path');
const storageService = require('../services/storage/storageService');
const objectStore = require('../services/storage/objectStore');
const imgCropService = require('../services/storage/imgCropService');
const { assertObjectAccess } = require('../services/storage/storageAccessService');
const { getSession, isOwner } = require('../services/storage/tusProgressStore');
const StorageBucket = require('../models/storage_bucket');
const StorageObject = require('../models/storage_object');
const logger = require('../utils/logger');

class StorageController {
  static async listBuckets(ctx) {
    try {
      const data = await storageService.listBuckets({
        page: parseInt(ctx.query.page, 10) || 1,
        size: parseInt(ctx.query.size, 10) || 20,
        keyword: ctx.query.keyword,
      });
      ctx.body = { code: 200, message: '获取 Bucket 列表成功', data };
    } catch (error) {
      StorageController.sendError(ctx, error);
    }
  }

  static async getBucket(ctx) {
    try {
      const data = await storageService.getBucketById(ctx.params.id);
      if (!data) {
        ctx.status = 404;
        ctx.body = { code: 404, message: 'Bucket 不存在', data: null };
        return;
      }
      ctx.body = { code: 200, message: '获取 Bucket 成功', data };
    } catch (error) {
      StorageController.sendError(ctx, error);
    }
  }

  static async createBucket(ctx) {
    try {
      const data = await storageService.createBucket(ctx.request.body);
      ctx.status = 201;
      ctx.body = { code: 201, message: '创建 Bucket 成功', data };
    } catch (error) {
      StorageController.sendError(ctx, error, 400);
    }
  }

  static async updateBucket(ctx) {
    try {
      const data = await storageService.updateBucket(ctx.params.id, ctx.request.body);
      if (!data) {
        ctx.status = 404;
        ctx.body = { code: 404, message: 'Bucket 不存在', data: null };
        return;
      }
      ctx.body = { code: 200, message: '更新 Bucket 成功', data };
    } catch (error) {
      StorageController.sendError(ctx, error, 400);
    }
  }

  static async deleteBucket(ctx) {
    try {
      const ok = await storageService.deleteBucket(ctx.params.id);
      if (!ok) {
        ctx.status = 404;
        ctx.body = { code: 404, message: 'Bucket 不存在', data: null };
        return;
      }
      ctx.body = { code: 200, message: '删除 Bucket 成功', data: null };
    } catch (error) {
      StorageController.sendError(ctx, error);
    }
  }

  static async listObjects(ctx) {
    try {
      const data = await storageService.listObjects({
        page: parseInt(ctx.query.page, 10) || 1,
        size: parseInt(ctx.query.size, 10) || 20,
        keyword: ctx.query.keyword,
        bucketId: ctx.query.bucketId,
        applicationId: ctx.query.applicationId,
        mimeType: ctx.query.mimeType,
      });
      ctx.body = { code: 200, message: '获取文件列表成功', data };
    } catch (error) {
      StorageController.sendError(ctx, error);
    }
  }

  static async deleteObject(ctx) {
    try {
      const ok = await storageService.deleteObject(ctx.params.id);
      if (!ok) {
        ctx.status = 404;
        ctx.body = { code: 404, message: '文件不存在', data: null };
        return;
      }
      ctx.body = { code: 200, message: '删除文件成功', data: null };
    } catch (error) {
      StorageController.sendError(ctx, error);
    }
  }

  static async uploadObject(ctx) {
    try {
      const file = ctx.request.files?.file;
      const bucketCode = ctx.request.body?.bucketCode || ctx.query.bucketCode;
      if (!file) {
        ctx.status = 400;
        ctx.body = { code: 400, message: '没有上传文件', data: null };
        return;
      }
      if (!bucketCode) {
        ctx.status = 400;
        ctx.body = { code: 400, message: 'bucketCode 为必填项', data: null };
        return;
      }
      const data = await storageService.uploadObject({
        bucketCode,
        file,
        authContext: ctx.state.authContext,
        applicationId: ctx.request.body?.applicationId,
      });
      ctx.status = 201;
      ctx.body = { code: 201, message: '上传成功', data };
    } catch (error) {
      StorageController.sendError(ctx, error, 400);
    }
  }

  static async getTusResult(ctx) {
    try {
      const uploadId = ctx.params.id;
      const session = await getSession(uploadId);
      if (!session) {
        ctx.status = 404;
        ctx.body = { code: 404, message: '上传会话不存在', data: null };
        return;
      }
      if (!isOwner(session, ctx.state.authContext)) {
        ctx.status = 403;
        ctx.body = { code: 403, message: '无权访问该上传会话', data: null };
        return;
      }

      if (session.status === 'completed' || session.status === 'duplicate') {
        const object = session.objectId ? await storageService.getObjectById(session.objectId) : null;
        ctx.body = {
          code: 200,
          message: session.status === 'duplicate' ? '文件已存在，已去重' : '上传完成',
          data: {
            status: session.status,
            uploadId: session.uploadId,
            offset: session.offset,
            uploadLength: session.uploadLength,
            object,
          },
        };
        return;
      }

      if (session.status === 'failed' || session.status === 'expired') {
        ctx.body = {
          code: 200,
          message: session.errorMessage || '上传失败',
          data: {
            status: session.status,
            uploadId: session.uploadId,
            offset: session.offset,
            uploadLength: session.uploadLength,
          },
        };
        return;
      }

      ctx.body = {
        code: 202,
        message: '上传处理中',
        data: {
          status: session.status,
          uploadId: session.uploadId,
          offset: session.offset,
          uploadLength: session.uploadLength,
        },
      };
    } catch (error) {
      StorageController.sendError(ctx, error);
    }
  }

  static async dedupCheck(ctx) {
    try {
      const bucketCode = ctx.request.body?.bucketCode;
      const md5 = String(ctx.request.body?.md5 || '').trim().toLowerCase();
      if (!bucketCode) {
        ctx.status = 400;
        ctx.body = { code: 400, message: 'bucketCode 为必填项', data: null };
        return;
      }
      if (!/^[a-f0-9]{32}$/.test(md5)) {
        ctx.status = 400;
        ctx.body = { code: 400, message: 'md5 须为 32 位 hex', data: null };
        return;
      }
      const bucket = await StorageBucket.findOne({ where: { code: bucketCode, status: 'ACTIVE' } });
      if (!bucket) {
        ctx.status = 400;
        ctx.body = { code: 400, message: 'Bucket 不存在或已停用', data: null };
        return;
      }
      const object = await storageService.findObjectByBucketAndMd5(bucket.bucket_id, md5);
      ctx.body = {
        code: 200,
        message: object ? '命中重复文件' : '未命中',
        data: { duplicate: Boolean(object), object },
      };
    } catch (error) {
      StorageController.sendError(ctx, error, 400);
    }
  }

  static async downloadObject(ctx) {
    await StorageController.streamObject(ctx, 'attachment');
  }

  static async previewObject(ctx) {
    await StorageController.streamObject(ctx, 'inline');
  }

  static async cropObject(ctx) {
    try {
      const objectRow = await StorageObject.findByPk(ctx.params.id, {
        include: [{ model: StorageBucket, as: 'StorageBucket', required: true }],
      });
      if (!objectRow) {
        ctx.status = 404;
        ctx.body = { code: 404, message: '文件不存在', data: null };
        return;
      }

      const mime = objectRow.mime_type || '';
      if (!mime.startsWith('image/')) {
        ctx.status = 400;
        ctx.body = { code: 400, message: '仅支持图片类型', data: null };
        return;
      }

      const bucket = objectRow.StorageBucket;
      await assertObjectAccess({
        bucket,
        object: objectRow,
        authContext: ctx.state.authContext,
      });

      const cropped = await imgCropService.cropImage({
        objectId: objectRow.object_id,
        sourceKey: objectRow.relative_path,
        query: ctx.query,
        mimeType: mime,
      });

      const baseName = path.basename(objectRow.name || 'image', path.extname(objectRow.name || ''));
      const outType = cropped.contentType || 'image/webp';
      const outExt = outType === 'image/png' ? 'png'
        : outType === 'image/jpeg' ? 'jpg'
          : outType === 'image/svg+xml' ? 'svg'
            : 'webp';
      ctx.set('Content-Type', outType);
      ctx.set('Content-Disposition', `inline; filename="${encodeURIComponent(baseName)}.${outExt}"`);
      if (cropped.fallback) {
        // 源文件/裁剪不可用时的兜底：短缓存，等对象补齐后能自动恢复真实图片
        ctx.set('Cache-Control', 'public, max-age=60');
        ctx.set('X-Crop-Fallback', cropped.fallback);
      } else {
        ctx.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
      ctx.body = cropped.stream;
    } catch (error) {
      StorageController.sendError(ctx, error, error.status || 500);
    }
  }

  static async streamObject(ctx, disposition) {
    try {
      const objectRow = await StorageObject.findByPk(ctx.params.id, {
        include: [{ model: StorageBucket, as: 'StorageBucket', required: true }],
      });
      if (!objectRow) {
        ctx.status = 404;
        ctx.body = { code: 404, message: '文件不存在', data: null };
        return;
      }

      const bucket = objectRow.StorageBucket;
      await assertObjectAccess({
        bucket,
        object: objectRow,
        authContext: ctx.state.authContext,
      });

      const stored = await objectStore.stat(objectRow.relative_path);
      if (!stored) {
        ctx.status = 404;
        ctx.body = { code: 404, message: '物理文件不存在', data: null };
        return;
      }

      ctx.set('Content-Type', objectRow.mime_type || 'application/octet-stream');
      ctx.set('Content-Disposition', `${disposition}; filename="${encodeURIComponent(objectRow.name)}"`);
      ctx.body = await objectStore.getStream(objectRow.relative_path);
    } catch (error) {
      StorageController.sendError(ctx, error, error.status || 403);
    }
  }

  static sendError(ctx, error, fallbackStatus = 500) {
    logger.error('Storage API error', { message: error.message, stack: error.stack });
    ctx.status = error.status || fallbackStatus;
    ctx.body = {
      code: ctx.status,
      message: error.message || '服务器错误',
      data: null,
    };
  }
}

module.exports = StorageController;
