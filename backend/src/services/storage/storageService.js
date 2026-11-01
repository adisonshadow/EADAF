const os = require('os');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const config = require('../../config');
const StorageBucket = require('../../models/storage_bucket');
const StorageObject = require('../../models/storage_object');
const Application = require('../../models/application');
const User = require('../../models/user');
const { normalizeRestrictions } = require('./storageAccessService');
const { isSystemBucket, isSystemBucketCode } = require('./systemBucketService');
const imgCropService = require('./imgCropService');
const { resolveStorageRoot } = require('./storageRoot');
const objectStore = require('./objectStore');
const fileStorageSettings = require('./fileStorageSettings');
const logger = require('../../utils/logger');

function getStorageRoot() {
  return resolveStorageRoot(config.storage.root, process.cwd());
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getTusDir() {
  const dir = path.join(os.tmpdir(), config.storage.tus.dirName || 'eadaf-tus');
  ensureDir(dir);
  return dir;
}

function sanitizeStorageFilename(name) {
  return String(name || 'file').replace(/[^\w.\-()\u4e00-\u9fff]/g, '_').slice(0, 255) || 'file';
}

function buildObjectRelativePath(bucketCode, objectId, filename) {
  const ext = path.extname(filename || '') || '';
  return path.join(bucketCode, `${objectId}${ext}`).split(path.sep).join('/');
}

function formatBucket(row) {
  const json = row.toJSON ? row.toJSON() : row;
  return {
    bucketId: json.bucket_id,
    code: json.code,
    name: json.name,
    description: json.description,
    applicationId: json.application_id,
    status: json.status,
    accessMode: json.access_mode,
    accessRestrictions: normalizeRestrictions(json.access_restrictions),
    isSystem: isSystemBucketCode(json.code),
    createdAt: json.created_at,
    updatedAt: json.updated_at,
    application: json.Application
      ? { applicationId: json.Application.application_id, name: json.Application.name, code: json.Application.code }
      : undefined,
  };
}

function formatObject(row) {
  const json = row.toJSON ? row.toJSON() : row;
  return {
    objectId: json.object_id,
    bucketId: json.bucket_id,
    name: json.name,
    mimeType: json.mime_type,
    size: Number(json.size || 0),
    relativePath: json.relative_path,
    contentMd5: json.content_md5 || null,
    applicationId: json.application_id,
    createdBy: json.created_by,
    createdAt: json.created_at,
    updatedAt: json.updated_at,
    bucket: json.StorageBucket
      ? { bucketId: json.StorageBucket.bucket_id, code: json.StorageBucket.code, name: json.StorageBucket.name }
      : undefined,
    application: json.Application
      ? { applicationId: json.Application.application_id, name: json.Application.name, code: json.Application.code }
      : undefined,
    creator: json.creator
      ? { userId: json.creator.user_id, username: json.creator.username, name: json.creator.name }
      : undefined,
  };
}

function validateAccessRestrictions(accessMode, restrictions = {}) {
  return normalizeRestrictions(restrictions);
}

async function listBuckets({ page = 1, size = 20, keyword } = {}) {
  const where = {};
  if (keyword) {
    where[Op.or] = [
      { code: { [Op.iLike]: `%${keyword}%` } },
      { name: { [Op.iLike]: `%${keyword}%` } },
    ];
  }
  const limit = Math.min(Math.max(size, 1), 200);
  const { count, rows } = await StorageBucket.findAndCountAll({
    where,
    include: [{ model: Application, as: 'Application', attributes: ['application_id', 'name', 'code'], required: false }],
    limit,
    offset: (page - 1) * limit,
    order: [['created_at', 'DESC']],
  });
  return { total: count, items: rows.map(formatBucket), page, size: limit };
}

async function getBucketById(id) {
  const row = await StorageBucket.findByPk(id, {
    include: [{ model: Application, as: 'Application', attributes: ['application_id', 'name', 'code'], required: false }],
  });
  return row ? formatBucket(row) : null;
}

async function getBucketByCode(code) {
  const row = await StorageBucket.findOne({
    where: { code },
    include: [{ model: Application, as: 'Application', attributes: ['application_id', 'name', 'code'], required: false }],
  });
  return row ? formatBucket(row) : null;
}

async function createBucket(payload) {
  const {
    code,
    name,
    description,
    applicationId,
    status = 'ACTIVE',
    accessMode = 'authenticated',
    accessRestrictions = {},
  } = payload;
  if (!code || !name) throw new Error('code 和 name 为必填项');
  if (isSystemBucketCode(code.trim())) {
    const err = new Error('不能使用系统保留的 Bucket 编码');
    err.status = 400;
    throw err;
  }
  const normalized = validateAccessRestrictions(accessMode, accessRestrictions);
  const row = await StorageBucket.create({
    code: code.trim(),
    name: name.trim(),
    description: description || null,
    application_id: applicationId || null,
    status,
    access_mode: accessMode,
    access_restrictions: normalized,
  });
  return getBucketById(row.bucket_id);
}

async function updateBucket(id, payload) {
  const row = await StorageBucket.findByPk(id);
  if (!row) return null;
  if (isSystemBucket(row)) {
    const err = new Error('系统内置 Bucket 不可编辑');
    err.status = 403;
    throw err;
  }
  const accessMode = payload.accessMode ?? row.access_mode;
  const restrictions = payload.accessRestrictions !== undefined
    ? validateAccessRestrictions(accessMode, payload.accessRestrictions)
    : row.access_restrictions;
  await row.update({
    code: payload.code !== undefined ? payload.code.trim() : row.code,
    name: payload.name !== undefined ? payload.name.trim() : row.name,
    description: payload.description !== undefined ? payload.description : row.description,
    application_id: payload.applicationId !== undefined ? payload.applicationId : row.application_id,
    status: payload.status !== undefined ? payload.status : row.status,
    access_mode: accessMode,
    access_restrictions: restrictions,
  });
  return getBucketById(id);
}

async function deleteBucket(id) {
  const row = await StorageBucket.findByPk(id);
  if (!row) return false;
  if (isSystemBucket(row)) {
    const err = new Error('系统内置 Bucket 不可删除');
    err.status = 403;
    throw err;
  }
  await row.destroy();
  return true;
}

/** 列出归属某应用的 Bucket（含对象数量），供删除应用页预览 */
async function listBucketsByApplicationId(applicationId) {
  if (!applicationId) return [];
  const rows = await StorageBucket.findAll({
    where: { application_id: applicationId },
    include: [{ model: Application, as: 'Application', attributes: ['application_id', 'name', 'code'], required: false }],
    order: [['created_at', 'DESC']],
  });
  const items = [];
  for (const row of rows) {
    const objectCount = await StorageObject.count({ where: { bucket_id: row.bucket_id } });
    items.push({
      ...formatBucket(row),
      objectCount,
      isSystem: isSystemBucket(row),
    });
  }
  return items;
}

/**
 * 删除应用归属的 Bucket 及其下全部对象与物理文件（跳过系统 Bucket）。
 * @returns {{ bucketsDeleted: number, objectsDeleted: number, skippedSystem: number }}
 */
async function deleteBucketsForApplication(applicationId) {
  const result = { bucketsDeleted: 0, objectsDeleted: 0, skippedSystem: 0 };
  if (!applicationId) return result;
  const buckets = await StorageBucket.findAll({ where: { application_id: applicationId } });
  for (const bucket of buckets) {
    if (isSystemBucket(bucket)) {
      result.skippedSystem += 1;
      continue;
    }
    const objects = await StorageObject.findAll({
      where: { bucket_id: bucket.bucket_id },
      attributes: ['object_id'],
    });
    for (const obj of objects) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await deleteObject(obj.object_id);
      if (ok) result.objectsDeleted += 1;
    }
    await bucket.destroy();
    result.bucketsDeleted += 1;
  }
  return result;
}

async function listObjects({
  page = 1,
  size = 20,
  keyword,
  bucketId,
  applicationId,
  mimeType,
} = {}) {
  const where = {};
  if (keyword) where.name = { [Op.iLike]: `%${keyword}%` };
  if (bucketId) where.bucket_id = bucketId;
  if (applicationId) where.application_id = applicationId;
  if (mimeType) where.mime_type = { [Op.iLike]: `%${mimeType}%` };

  const limit = Math.min(Math.max(size, 1), 200);
  const { count, rows } = await StorageObject.findAndCountAll({
    where,
    include: [
      { model: StorageBucket, as: 'StorageBucket', attributes: ['bucket_id', 'code', 'name'], required: false },
      { model: Application, as: 'Application', attributes: ['application_id', 'name', 'code'], required: false },
      { model: User, as: 'creator', attributes: ['user_id', 'username', 'name'], required: false },
    ],
    limit,
    offset: (page - 1) * limit,
    order: [['created_at', 'DESC']],
  });
  return { total: count, items: rows.map(formatObject), page, size: limit };
}

async function getObjectById(id) {
  const row = await StorageObject.findByPk(id, {
    include: [
      { model: StorageBucket, as: 'StorageBucket', required: true },
      { model: Application, as: 'Application', attributes: ['application_id', 'name', 'code'], required: false },
      { model: User, as: 'creator', attributes: ['user_id', 'username', 'name'], required: false },
    ],
  });
  return row ? formatObject(row) : null;
}

function resolveSafeStoragePath(relativePath) {
  if (!relativePath) {
    const err = new Error('文件路径为空');
    err.status = 400;
    throw err;
  }
  const root = path.resolve(getStorageRoot());
  const abs = path.resolve(root, relativePath);
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    const err = new Error('非法文件路径');
    err.status = 400;
    throw err;
  }
  return abs;
}

async function getObjectFilePath(objectRow) {
  const relative = objectRow.relative_path || objectRow.relativePath;
  return resolveSafeStoragePath(relative);
}

async function deleteObject(id) {
  const row = await StorageObject.findByPk(id);
  if (!row) return false;

  const relativePath = row.relative_path;
  const others = relativePath
    ? await StorageObject.count({
      where: { relative_path: relativePath, object_id: { [Op.ne]: id } },
    })
    : 0;

  await row.destroy();

  if (relativePath && others === 0) {
    try {
      await objectStore.remove(relativePath);
    } catch (error) {
      logger.warn('删除存储对象失败', { objectId: id, relativePath, message: error.message });
    }
  }

  try {
    await imgCropService.purgeCropCache(id);
  } catch (error) {
    logger.warn('清理裁剪缓存失败', { objectId: id, message: error.message });
  }

  return true;
}

async function uploadObject({ bucketCode, file, authContext, applicationId }) {
  const bucketRow = await StorageBucket.findOne({ where: { code: bucketCode, status: 'ACTIVE' } });
  if (!bucketRow) throw new Error('Bucket 不存在或已停用');

  const { resolveUploadApplicationId, resolveUploadUserId } = require('./storageAccessService');
  const resolvedAppId = resolveUploadApplicationId(authContext, applicationId);
  const createdBy = resolveUploadUserId(authContext);

  // 写入 MinIO 之前按当前文件存储设置校验类别/大小/图片格式，
  // 并按需把 JPEG/PNG 转成 WebP；不合格的文件不会进对象存储。
  let prepared;
  try {
    prepared = await fileStorageSettings.buildStoredUpload({
      filePath: file.filepath,
      size: file.size,
      mimeType: file.mimetype,
      filename: file.originalFilename,
    });
  } catch (error) {
    // 校验失败也要清掉 formidable 的临时文件，避免被拒的上传占满磁盘
    try {
      if (file.filepath && fs.existsSync(file.filepath)) fs.unlinkSync(file.filepath);
    } catch { /* ignore temp cleanup */ }
    throw error;
  }

  const objectId = uuidv4();
  const safeName = sanitizeStorageFilename(prepared.filename || 'file');
  const relativePath = buildObjectRelativePath(bucketRow.code, objectId, safeName);

  let stored;
  try {
    stored = await objectStore.putFile(relativePath, prepared.path, {
      'Content-Type': prepared.mimeType || 'application/octet-stream',
    });
  } finally {
    const tempPaths = new Set([file.filepath, ...(prepared.tempPaths || [])].filter(Boolean));
    for (const tempPath of tempPaths) {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch { /* ignore temp cleanup */ }
      }
    }
  }

  const row = await StorageObject.create({
    object_id: objectId,
    bucket_id: bucketRow.bucket_id,
    name: safeName,
    mime_type: prepared.mimeType || 'application/octet-stream',
    size: prepared.size || file.size || stored.size,
    relative_path: relativePath,
    application_id: resolvedAppId,
    created_by: createdBy,
  });

  return getObjectById(row.object_id);
}

async function findObjectByBucketAndMd5(bucketId, contentMd5) {
  if (!bucketId || !contentMd5) return null;
  const row = await StorageObject.findOne({
    where: { bucket_id: bucketId, content_md5: contentMd5 },
    include: [
      { model: StorageBucket, as: 'StorageBucket', required: false },
      { model: Application, as: 'Application', attributes: ['application_id', 'name', 'code'], required: false },
      { model: User, as: 'creator', attributes: ['user_id', 'username', 'name'], required: false },
    ],
  });
  return row ? formatObject(row) : null;
}

module.exports = {
  getStorageRoot,
  getTusDir,
  sanitizeStorageFilename,
  buildObjectRelativePath,
  listBuckets,
  getBucketById,
  getBucketByCode,
  createBucket,
  updateBucket,
  deleteBucket,
  listBucketsByApplicationId,
  deleteBucketsForApplication,
  listObjects,
  getObjectById,
  getObjectFilePath,
  deleteObject,
  uploadObject,
  formatBucket,
  formatObject,
  findObjectByBucketAndMd5,
};
