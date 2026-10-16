/**
 * EADAF 平台导入预览:解析文件、冲突清单,不写数据。
 */
const { Op } = require('sequelize');
const models = require('../../models');
const { FORMAT, FORMAT_VERSION } = require('./platformExportService');
const { openTransferPackage, cleanupUpload } = require('../appTransfer/transferZip');
const { isSystemBucketCode } = require('../storage/systemBucketService');
const transferCompat = require('../appTransfer/transferCompat');

async function parsePlatformExportFile(filePath) {
  const payload = await openTransferPackage(filePath);
  if (payload?.format === 'eadaf-app-export') {
    throw Object.assign(
      new Error('这是业务应用导出文件,请到「应用数据导出/导入」页导入'),
      { status: 400 },
    );
  }
  if (!payload || payload.format !== FORMAT) {
    throw Object.assign(new Error(`文件格式不正确,缺少 format: "${FORMAT}" 标识`), { status: 400 });
  }
  if (Number(payload.formatVersion) !== FORMAT_VERSION) {
    throw Object.assign(new Error(`不支持的文件版本: ${payload.formatVersion}`), { status: 400 });
  }
  return payload;
}

function sectionCount(...arrs) {
  return arrs.reduce((sum, a) => sum + (Array.isArray(a) ? a.length : 0), 0);
}

async function previewImportFile(filePath) {
  const file = await parsePlatformExportFile(filePath);
  const options = file.options && typeof file.options === 'object' ? file.options : {};
  const warnings = [];
  if (options.secretsInPlaintext !== true) {
    warnings.push('文件头未声明 secretsInPlaintext,Provider API Key 可能无法在目标实例解密');
  }

  const skills = file.skills || {};
  const skillItems = Array.isArray(skills.items) ? skills.items : [];
  const toolItems = Array.isArray(skills.tools) ? skills.tools : [];
  const ai = file.ai || {};
  const providerItems = Array.isArray(ai.providers) ? ai.providers : [];
  const aiModelItems = Array.isArray(ai.models) ? ai.models : [];
  const dataStandards = Array.isArray(file.dataStandards) ? file.dataStandards : [];
  const eadafPermissions = Array.isArray(transferCompat.readSection(file, 'eadafPermissions')) ? transferCompat.readSection(file, 'eadafPermissions') : [];
  const buckets = Array.isArray(file.storageBuckets) ? file.storageBuckets : [];
  const storageObjects = Array.isArray(file.storageObjects) ? file.storageObjects : [];
  const systemFeatures = file.systemFeatures && typeof file.systemFeatures === 'object'
    ? file.systemFeatures
    : {};

  const conflicts = [];
  const pushConflict = (section, code, key, value, existingCode, type) => {
    conflicts.push({ section, code, key, value, existingCode: existingCode || null, type });
  };

  const checkUnique = async (section, rows, keyField, model, whereKey) => {
    const values = [...new Set(rows.map((r) => r[keyField]).filter(Boolean))];
    if (!values.length) return;
    const existing = await model.findAll({
      where: { [whereKey]: { [Op.in]: values } },
      raw: true,
    });
    const byValue = new Map();
    for (const row of existing) {
      const v = row[whereKey];
      if (!byValue.has(v)) byValue.set(v, row);
    }
    for (const row of rows) {
      const v = row[keyField];
      if (v && byValue.has(v)) {
        const hit = byValue.get(v);
        pushConflict(
          section,
          row.code || row.slug || v,
          keyField,
          v,
          hit.code || hit.slug || v,
          'business_key',
        );
      }
    }
  };

  await checkUnique('skills', skillItems, 'slug', models.Skill, 'slug');
  await checkUnique('skills.tools', toolItems, 'slug', models.Tool, 'slug');
  {
    const fnNames = [...new Set(toolItems.map((t) => t.function_name).filter(Boolean))];
    if (fnNames.length) {
      const exist = await models.Tool.findAll({
        where: { function_name: { [Op.in]: fnNames } },
        attributes: ['slug', 'function_name'],
        raw: true,
      });
      const byFn = new Map(exist.map((r) => [r.function_name, r]));
      for (const t of toolItems) {
        const hit = t.function_name && byFn.get(t.function_name);
        if (hit && hit.slug !== t.slug) {
          pushConflict('skills.tools', t.slug, 'function_name', t.function_name, hit.slug, 'second_key');
        }
      }
    }
  }
  if (Array.isArray(skills.scopes)) {
    await checkUnique('skills.scopes', skills.scopes, 'slug', models.Scope, 'slug');
  }
  await checkUnique('ai.providers', providerItems, 'slug', models.Provider, 'slug');
  await checkUnique('ai.models', aiModelItems, 'slug', models.AiModel, 'slug');
  await checkUnique('eadafPermissions', eadafPermissions, 'code', models.Permission, 'code');
  await checkUnique('storageBuckets', buckets.filter((b) => !isSystemBucketCode(b.code)), 'code', models.StorageBucket, 'code');

  if (dataStandards.length) {
    const exist = await models.BizdataDataStandard.findAll({
      attributes: ['code', 'version'],
      raw: true,
    });
    const existSet = new Set(exist.map((r) => `${r.code}::${r.version}`));
    for (const row of dataStandards) {
      const key = `${row.code}::${row.version}`;
      if (row.code && row.version && existSet.has(key)) {
        pushConflict('dataStandards', row.code, 'code+version', `${row.code} v${row.version}`, row.code, 'business_key');
      }
    }
  }

  const featuresRow = await models.BizdataSetting.findOne({
    where: { key: 'system_features' },
    raw: true,
  });
  if (featuresRow) {
    pushConflict('systemFeatures', 'system_features', 'key', 'system_features', 'system_features', 'business_key');
  }

  return {
    format: file.format,
    formatVersion: file.formatVersion,
    options,
    platform: file.platform || { applicationCode: 'EADAF' },
    sections: {
      skills: {
        items: skillItems.length,
        tools: toolItems.length,
        scopes: sectionCount(skills.scopes),
        skillTools: sectionCount(skills.skillTools),
        applications: sectionCount(skills.applications),
      },
      ai: {
        providers: providerItems.length,
        models: aiModelItems.length,
        capabilities: sectionCount(ai.capabilities),
        ioTags: sectionCount(ai.ioTags),
      },
      dataStandards: dataStandards.length,
      systemFeatures: Object.keys(systemFeatures).length,
      eadafPermissions: eadafPermissions.length,
      storageBuckets: buckets.length,
      storageObjects: storageObjects.length,
    },
    conflicts,
    warnings,
  };
}

function cleanupFile(filePath) {
  return cleanupUpload(filePath);
}

module.exports = {
  parsePlatformExportFile,
  previewImportFile,
  cleanupFile,
};
