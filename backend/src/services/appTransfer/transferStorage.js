/**
 * 迁移包中的存储桶 / 对象文件收集与导入。
 */
const { Op } = require('sequelize');
const models = require('../../models');
const { buildObjectRelativePath } = require('../storage/storageService');
const objectStore = require('../storage/objectStore');
const { isSystemBucketCode, getSystemBucketConfig } = require('../storage/systemBucketService');
const {
  extractStorageObjectId,
  collectFileEntries,
  resolvePackageFile,
  assertSafeRelativePath,
} = require('./transferZip');

function pickModelFields(model, row) {
  const attrs = model.getAttributes();
  const out = {};
  for (const key of Object.keys(attrs)) {
    if (key === 'created_at' || key === 'updated_at' || key === 'deleted_at') continue;
    if (Object.prototype.hasOwnProperty.call(row, key)) out[key] = row[key];
  }
  return out;
}

/** Logo 与 SSO 登录页侧栏图/Lottie。这些文件常落在系统桶且 application_id 不是本应用。 */
function collectReferencedStorageIds(app) {
  const ids = new Set();
  const push = (ref) => {
    const id = extractStorageObjectId(ref);
    if (id) ids.add(id);
  };
  push(app && app.logo_url);
  const page = app && app.sso_config && app.sso_config.login_page;
  if (page && typeof page === 'object') {
    push(page.aside_image);
    push(page.aside_lottie);
  }
  return [...ids];
}

async function collectAppStorage(app, options, warnings) {
  const storageBuckets = (await models.StorageBucket.findAll({
    where: { application_id: app.application_id },
    raw: true,
  })).map((r) => pickModelFields(models.StorageBucket, r));

  if (!options.includeFiles) {
    return { storageBuckets, storageObjects: [], storageFileEntries: [] };
  }

  const referencedIds = collectReferencedStorageIds(app);
  const bucketIds = storageBuckets.map((b) => b.bucket_id);
  const or = [];
  if (bucketIds.length) or.push({ bucket_id: { [Op.in]: bucketIds } });
  or.push({ application_id: app.application_id });
  if (referencedIds.length) or.push({ object_id: { [Op.in]: referencedIds } });
  if (!or.length) {
    return { storageBuckets, storageObjects: [], storageFileEntries: [] };
  }

  const objectRows = await models.StorageObject.findAll({ where: { [Op.or]: or }, raw: true });
  return decorateObjects(objectRows, storageBuckets, warnings);
}

async function collectPlatformStorage(eadafApp, options, warnings) {
  if (!options.includeFiles) {
    return { storageBuckets: [], storageObjects: [], storageFileEntries: [] };
  }
  const storageBuckets = (await models.StorageBucket.findAll({
    where: {
      [Op.or]: [
        { application_id: eadafApp.application_id },
        { application_id: null },
        { code: getSystemBucketConfig().code },
      ],
    },
    raw: true,
  })).map((r) => pickModelFields(models.StorageBucket, r));

  const bucketIds = storageBuckets.map((b) => b.bucket_id);
  const objectRows = bucketIds.length
    ? await models.StorageObject.findAll({ where: { bucket_id: { [Op.in]: bucketIds } }, raw: true })
    : [];
  return decorateObjects(objectRows, storageBuckets, warnings);
}

async function decorateObjects(objectRows, storageBuckets, warnings) {
  const neededBucketIds = [...new Set(objectRows.map((o) => o.bucket_id).filter(Boolean))];
  const known = new Map(storageBuckets.map((b) => [b.bucket_id, b]));
  const missingIds = neededBucketIds.filter((id) => !known.has(id));
  const extraRows = missingIds.length
    ? await models.StorageBucket.findAll({
      where: { bucket_id: { [Op.in]: missingIds } },
      raw: true,
    })
    : [];
  extraRows.forEach((b) => known.set(b.bucket_id, b));

  // 对象可能落在 application_id 为空的共享桶(如 fpcu);不导出桶则导入端找不到桶,图片全 404
  const seen = new Set(storageBuckets.map((b) => b.bucket_id));
  const mergedBuckets = [...storageBuckets];
  for (const row of extraRows) {
    const packed = pickModelFields(models.StorageBucket, row);
    if (!seen.has(packed.bucket_id)) {
      seen.add(packed.bucket_id);
      mergedBuckets.push(packed);
    }
  }

  const storageObjects = objectRows.map((r) => ({
    ...pickModelFields(models.StorageObject, r),
    bucket_code: known.get(r.bucket_id)?.code || null,
  }));
  const { entries, missing } = await collectFileEntries(storageObjects);
  if (missing.length) {
    const preview = missing.slice(0, 8).join(', ');
    warnings.push(
      `${missing.length} 个对象在对象存储中缺失,已跳过二进制: ${preview}${missing.length > 8 ? '…' : ''}`,
    );
  }
  return { storageBuckets: mergedBuckets, storageObjects, storageFileEntries: entries };
}

async function resolveCreatedBy(userId) {
  if (!userId) return null;
  const row = await models.User.findByPk(userId, { attributes: ['user_id'] });
  return row ? userId : null;
}

async function resolveApplicationId(ctx, sourceAppId) {
  if (!sourceAppId) return ctx.defaultStorageApplicationId || ctx.targetAppId || null;
  if (ctx.idMap.applications.has(sourceAppId)) {
    return ctx.idMap.applications.get(sourceAppId);
  }
  if (ctx.sourceAppId && sourceAppId === ctx.sourceAppId && ctx.targetAppId) {
    return ctx.targetAppId;
  }
  const exists = await models.Application.findByPk(sourceAppId, { attributes: ['application_id'] });
  if (exists) return sourceAppId;
  return ctx.defaultStorageApplicationId || ctx.targetAppId || null;
}

async function ensureImportedBucket(ctx, obj, section, transaction) {
  const code = String(obj.bucket_code || '').trim();
  if (!code || isSystemBucketCode(code)) return null;
  const applicationId = await resolveApplicationId(ctx, obj.application_id)
    || ctx.defaultStorageApplicationId
    || ctx.targetAppId
    || null;
  const created = await models.StorageBucket.create({
    code,
    name: code,
    application_id: applicationId,
    status: 'ACTIVE',
    // 设备型号图走匿名 crop;源端 fpcu 等共享桶即 public
    access_mode: 'public',
    access_restrictions: {},
  }, transaction ? { transaction } : undefined);
  if (obj.bucket_id) ctx.idMap.buckets.set(obj.bucket_id, created.bucket_id);
  if (section) {
    section.notes.push(`目标无存储桶「${code}」,已自动创建(access_mode=public)`);
  }
  return created;
}

async function resolveTargetBucket(ctx, obj, { transaction, section } = {}) {
  if (obj.bucket_id && ctx.idMap.buckets.has(obj.bucket_id)) {
    const mapped = ctx.idMap.buckets.get(obj.bucket_id);
    const row = await models.StorageBucket.findByPk(mapped, { transaction });
    if (row) return row;
  }
  if (obj.bucket_code) {
    const byCode = await models.StorageBucket.findOne({
      where: { code: obj.bucket_code },
      transaction,
    });
    if (byCode) {
      if (obj.bucket_id) ctx.idMap.buckets.set(obj.bucket_id, byCode.bucket_id);
      return byCode;
    }
  }
  return ensureImportedBucket(ctx, obj, section, transaction);
}

async function copyObjectFile(srcAbs, destRelative) {
  const safe = assertSafeRelativePath(destRelative);
  await objectStore.putFile(safe, srcAbs);
  return safe;
}

/**
 * @param {object} ctx ImportContext (beginSection/skipSection/itemFailed/idMap/strategy/file)
 * @param {{ defaultApplicationId?: string }} opts
 */
async function importStorageBucketsSection(ctx, opts = {}) {
  const section = ctx.beginSection('storageBuckets');
  const buckets = Array.isArray(ctx.file.storageBuckets) ? ctx.file.storageBuckets : [];
  if (!buckets.length) {
    return ctx.skipSection(section, '文件无存储桶');
  }
  const defaultApplicationId = opts.defaultApplicationId
    || ctx.defaultStorageApplicationId
    || ctx.targetAppId
    || null;
  try {
    for (const bucket of buckets) {
      if (!bucket.code) {
        ctx.itemFailed(section, '(无 code)', new Error('存储桶缺少 code'));
        continue;
      }
      if (isSystemBucketCode(bucket.code)) {
        const existing = await models.StorageBucket.findOne({ where: { code: bucket.code } });
        if (!existing) {
          ctx.itemFailed(section, bucket.code, new Error('目标缺少系统桶,请先执行 init-db'));
          continue;
        }
        if (bucket.bucket_id) ctx.idMap.buckets.set(bucket.bucket_id, existing.bucket_id);
        section.counts.skipped += 1;
        section.notes.push(`系统桶「${bucket.code}」按 code 匹配,未重建`);
        continue;
      }
      const overrides = { application_id: defaultApplicationId };
      const restrictions = bucket.access_restrictions && typeof bucket.access_restrictions === 'object'
        ? { ...bucket.access_restrictions }
        : null;
      if (restrictions && Array.isArray(restrictions.role_ids) && restrictions.role_ids.length) {
        const roleMap = ctx.idMap.roles;
        if (roleMap && roleMap.size) {
          const remapped = [];
          const missing = [];
          for (const id of restrictions.role_ids) {
            const sourceId = String(id);
            const mapped = roleMap.get(sourceId);
            if (mapped) remapped.push(mapped);
            else missing.push(sourceId);
          }
          if (remapped.length) {
            restrictions.role_ids = remapped;
            overrides.access_restrictions = restrictions;
            if (missing.length) {
              section.notes.push(
                `存储桶「${bucket.code}」access_restrictions.role_ids 未映射: ${missing.join(', ')}`,
              );
            }
          } else {
            // 全部未映射时不写空数组(空 role_ids 表示不启用角色策略,会放宽访问)
            section.notes.push(
              `存储桶「${bucket.code}」access_restrictions.role_ids 全部未映射: ${missing.join(', ')},已保留源角色 ID,请导入后人工核对`,
            );
          }
        } else {
          section.notes.push(
            `存储桶「${bucket.code}」的 access_restrictions.role_ids 指向源角色 ID,本次未导入角色映射,请导入后人工核对`,
          );
        }
      }
      await ctx.upsertMeta(
        models.StorageBucket,
        bucket,
        'code',
        ctx.idMap.buckets,
        overrides,
        section,
        {},
      );
    }
  } catch (e) {
    ctx.markFailed(section, e.message);
  }
  return section;
}

/**
 * 保留原 object_id,把 zip files/ 拷到 STORAGE_ROOT。
 */
async function importStorageObjectsSection(ctx, opts = {}) {
  const section = ctx.beginSection('storageObjects');
  section.counts.copied = 0;
  const objects = Array.isArray(ctx.file.storageObjects) ? ctx.file.storageObjects : [];
  const includeFiles = ctx.file.options?.includeFiles === true;
  if (!includeFiles && !objects.length) {
    return ctx.skipSection(section, '未勾选 includeFiles,跳过对象文件');
  }
  if (!objects.length) {
    return ctx.skipSection(section, '文件无存储对象');
  }
  const filesDir = opts.filesDir || (ctx.file.__package && ctx.file.__package.filesDir) || null;
  const defaultApplicationId = opts.defaultApplicationId
    || ctx.defaultStorageApplicationId
    || ctx.targetAppId
    || null;
  // 记录已写入但对象存储里没有文件的对象（写库成功、文件拿不到 → 读图 404）
  const missingBinaries = [];

  try {
    for (const obj of objects) {
      const label = obj.name || obj.object_id || '(对象)';
      try {
        if (!obj.object_id) {
          ctx.itemFailed(section, label, new Error('缺少 object_id'));
          continue;
        }
        const bucketRow = await resolveTargetBucket(ctx, obj, { section });
        if (!bucketRow) {
          ctx.itemFailed(section, label, new Error(`找不到目标桶 ${obj.bucket_code || obj.bucket_id || ''}`));
          continue;
        }
        const destRelative = obj.relative_path
          ? assertSafeRelativePath(String(obj.relative_path).replace(/\\/g, '/'))
          : buildObjectRelativePath(bucketRow.code, obj.object_id, obj.name);
        const applicationId = await resolveApplicationId(ctx, obj.application_id) || defaultApplicationId;
        const createdBy = await resolveCreatedBy(obj.created_by);
        let contentMd5 = obj.content_md5 || null;
        if (contentMd5) {
          const dup = await models.StorageObject.findOne({
            where: { bucket_id: bucketRow.bucket_id, content_md5: contentMd5 },
          });
          if (dup && dup.object_id !== obj.object_id) {
            contentMd5 = null;
            section.notes.push(`对象「${label}」与已有文件 MD5 相同,已去掉 content_md5 以避免冲突`);
          }
        }

        const payload = {
          object_id: obj.object_id,
          bucket_id: bucketRow.bucket_id,
          name: obj.name || 'file',
          mime_type: obj.mime_type || null,
          size: obj.size == null ? 0 : Number(obj.size),
          relative_path: destRelative,
          content_md5: contentMd5,
          application_id: applicationId,
          created_by: createdBy,
        };

        const existing = await models.StorageObject.findByPk(obj.object_id);
        const existingRelative = existing && existing.relative_path
          ? assertSafeRelativePath(String(existing.relative_path).replace(/\\/g, '/'))
          : null;
        // skip 策略下已存在的对象以目标现有路径为准
        const servedRelative = (existing && ctx.strategy !== 'overwrite' && existingRelative)
          ? existingRelative
          : destRelative;

        // 先确认文件能不能拿到，再决定要不要写记录。
        // 以前是先写记录、后判文件，于是「未携带文件」的包会在目标库留下
        // 指向不存在对象的行 → 图片/附件接口 404，且导入报告看不出异常（见 #20）。
        const srcAbs = resolvePackageFile(filesDir, obj.relative_path || destRelative);
        const stored = await objectStore.stat(assertSafeRelativePath(servedRelative));
        const objectMissing = !stored;
        const willCopy = objectStore.shouldCopyStoredObject({
          existing: Boolean(existing),
          strategy: ctx.strategy,
          objectMissing,
          hasPackageFile: Boolean(srcAbs),
        });

        if (objectMissing && !willCopy) {
          // 对象存储里没有文件，包内也没有可写的二进制：
          //   - 新建记录：直接跳过，绝不制造悬空记录
          //   - 已存在记录：保留目标现有记录与文件，不改动
          const reason = srcAbs ? '包内有对应文件但拷贝失败' : '包内无对应二进制';
          missingBinaries.push({
            objectId: obj.object_id,
            label: obj.name || '',
            path: servedRelative,
            reason,
            existing: Boolean(existing),
          });
          section.counts.skipped += 1;
          ctx.itemFailed(section, `${label}(${reason})`, new Error('对象文件不可访问，未写入该记录'));
          continue;
        }

        if (existing) {
          if (ctx.strategy === 'overwrite') {
            await existing.update({
              bucket_id: payload.bucket_id,
              name: payload.name,
              mime_type: payload.mime_type,
              size: payload.size,
              relative_path: payload.relative_path,
              content_md5: payload.content_md5,
              application_id: payload.application_id,
              created_by: payload.created_by,
            });
            section.counts.updated += 1;
          } else {
            section.counts.skipped += 1;
          }
        } else {
          await models.StorageObject.create(payload);
          section.counts.created += 1;
        }

        if (willCopy) {
          await copyObjectFile(srcAbs, servedRelative);
          section.counts.copied += 1;
        }
      } catch (e) {
        ctx.itemFailed(section, label, e);
      }
    }

    // 缺失二进制必须显式报告，不能只靠 includeFiles 分支（见 #20）
    if (missingBinaries.length) {
      const skippedNew = missingBinaries.filter((m) => !m.existing).length;
      const keptExisting = missingBinaries.length - skippedNew;
      const preview = missingBinaries
        .slice(0, 8)
        .map((m) => `${m.objectId}(${m.path})`)
        .join(', ');
      section.notes.push(
        `${missingBinaries.length} 个对象的文件不在包内、也不在对象存储里: `
        + `未写入的新记录 ${skippedNew} 个`
        + `${keptExisting ? `;目标已有记录保留(未改动) ${keptExisting} 个` : ''}。`
        + `明细: ${preview}${missingBinaries.length > 8 ? '…' : ''}`,
      );
      section.notes.push(
        '这些文件的下载/预览/裁剪在目标实例不可用。导出时请勾选「携带存储文件」;'
        + '只带元数据的包不会迁移原始文件。',
      );
      section.status = 'failed';
    }

    if (section.counts.failed > 0 && section.counts.created === 0 && section.counts.updated === 0 && section.counts.copied === 0) {
      section.status = 'failed';
    }
  } catch (e) {
    ctx.markFailed(section, e.message);
  }
  return section;
}

module.exports = {
  collectAppStorage,
  collectPlatformStorage,
  importStorageBucketsSection,
  importStorageObjectsSection,
};
