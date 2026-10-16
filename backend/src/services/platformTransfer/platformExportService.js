/**
 * EADAF 平台导出:Skill/Tool、AI 目录、数据标准、系统开关、EADAF 权限目录。
 * 不含业务实体 / API / 行数据 / 用户。
 */
const { Op } = require('sequelize');
const models = require('../../models');
const { decryptApiKey } = require('../../utils/encryption');
const logger = require('../../utils/logger');
const { pickModelFields } = require('../appTransfer/appExportService');
const { collectPlatformStorage } = require('../appTransfer/transferStorage');
const { buildManifest, createTransferZipArchive } = require('../appTransfer/transferZip');
const { Readable } = require('stream');

const SYSTEM_APPLICATION_CODE = 'EADAF';
const FORMAT = 'eadaf-platform-export';
const FORMAT_VERSION = 1;

function exportProviderSecret(providerRow) {
  const out = pickModelFields(models.Provider, providerRow);
  delete out.api_key_encrypted;
  if (providerRow.api_key_encrypted) {
    try {
      out.api_key = decryptApiKey(providerRow.api_key_encrypted);
    } catch (e) {
      logger.warn(`导出 Provider「${providerRow.slug}」API Key 解密失败,已置空: ${e.message}`);
      out.api_key = null;
    }
  } else {
    out.api_key = null;
  }
  return out;
}

function* chunkString(text, size = 1024 * 1024) {
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(i, i + size);
  }
}

async function resolveEadafApplication() {
  const app = await models.Application.findOne({
    where: { code: SYSTEM_APPLICATION_CODE },
    raw: true,
  });
  if (!app) {
    throw Object.assign(new Error('目标实例缺少内置应用 EADAF,请先执行 init-db'), { status: 500 });
  }
  return app;
}

function normalizeOptions(raw = {}) {
  return {
    includeFiles: raw.includeFiles === true,
  };
}

async function buildPlatformExport(rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const eadafApp = await resolveEadafApplication();

  const globalSkills = await models.Skill.findAll({ where: { is_global: true }, raw: true });
  const appLinks = await models.SkillApplication.findAll({
    where: { application_id: eadafApp.application_id },
    raw: true,
  });
  const dedicatedIds = [...new Set(appLinks.map((l) => l.skill_id))];
  const dedicatedSkills = dedicatedIds.length
    ? await models.Skill.findAll({
      where: { id: { [Op.in]: dedicatedIds }, is_dedicated: true },
      raw: true,
    })
    : [];
  const skillById = new Map();
  for (const skill of [...globalSkills, ...dedicatedSkills]) skillById.set(skill.id, skill);
  const skills = [...skillById.values()];
  const skillIds = skills.map((s) => s.id);
  const dedicatedIdSet = new Set(dedicatedSkills.map((s) => s.id));
  const eadafLinks = appLinks.filter((l) => dedicatedIdSet.has(l.skill_id));

  const skillToolRows = skillIds.length
    ? await models.SkillTool.findAll({ where: { skill_id: { [Op.in]: skillIds } }, raw: true })
    : [];
  const toolIds = [...new Set(skillToolRows.map((st) => st.tool_id))];
  const tools = toolIds.length
    ? await models.Tool.findAll({ where: { id: { [Op.in]: toolIds } }, raw: true })
    : [];
  const aiScopeIds = [
    ...new Set([
      ...skills.map((s) => s.scope_id),
      ...tools.map((t) => t.scope_id),
    ].filter(Boolean)),
  ];
  const aiScopes = aiScopeIds.length
    ? await models.Scope.findAll({ where: { id: { [Op.in]: aiScopeIds } }, raw: true })
    : [];

  const providers = (await models.Provider.findAll({ raw: true })).map(exportProviderSecret);
  const providerIds = providers.map((p) => p.id);
  const aiModels = providerIds.length
    ? await models.AiModel.findAll({ where: { provider_id: { [Op.in]: providerIds } }, raw: true })
    : [];
  const modelIds = aiModels.map((m) => m.id);
  const capabilities = modelIds.length
    ? await models.ModelCapability.findAll({ where: { model_id: { [Op.in]: modelIds } }, raw: true })
    : [];
  const ioTags = modelIds.length
    ? await models.ModelIoTag.findAll({ where: { model_id: { [Op.in]: modelIds } }, raw: true })
    : [];

  const dataStandards = (await models.BizdataDataStandard.findAll({ raw: true }))
    .map((r) => pickModelFields(models.BizdataDataStandard, r));

  const featuresRow = await models.BizdataSetting.findOne({
    where: { key: 'system_features' },
    raw: true,
  });
  const systemFeatures = featuresRow && featuresRow.value && typeof featuresRow.value === 'object'
    ? featuresRow.value
    : {};

  const uacPermissions = (await models.Permission.findAll({ raw: true }))
    .map((r) => pickModelFields(models.Permission, r));

  const skillsSection = {
    items: skills.map((r) => pickModelFields(models.Skill, r)),
    tools: tools.map((r) => pickModelFields(models.Tool, r)),
    scopes: aiScopes.map((r) => pickModelFields(models.Scope, r)),
    skillTools: skillToolRows.map((r) => pickModelFields(models.SkillTool, r)),
    applications: eadafLinks.map((r) => pickModelFields(models.SkillApplication, r)),
  };
  const aiSection = {
    providers,
    models: aiModels.map((r) => pickModelFields(models.AiModel, r)),
    capabilities: capabilities.map((r) => pickModelFields(models.ModelCapability, r)),
    ioTags: ioTags.map((r) => pickModelFields(models.ModelIoTag, r)),
  };

  const warnings = [];
  const {
    storageBuckets,
    storageObjects,
    storageFileEntries,
  } = await collectPlatformStorage(eadafApp, options, warnings);

  if (!options.includeFiles && storageObjects.length) {
    warnings.push(
      `未勾选「携带存储文件」,已跳过 ${storageObjects.length} 个存储对象(桶元数据照常导出)。`
      + '目标实例不会有这些对象记录,相关图片/附件不会被引用;需要文件请在导出时勾选。',
    );
  }

  const exportSummary = {
    platformCode: SYSTEM_APPLICATION_CODE,
    includeFiles: options.includeFiles,
    counts: {
      skills: skillsSection.items.length,
      tools: skillsSection.tools.length,
      aiScopes: skillsSection.scopes.length,
      skillApplications: skillsSection.applications.length,
      providers: aiSection.providers.length,
      aiModels: aiSection.models.length,
      capabilities: aiSection.capabilities.length,
      ioTags: aiSection.ioTags.length,
      dataStandards: dataStandards.length,
      uacPermissions: uacPermissions.length,
      storageBuckets: storageBuckets.length,
      // 与 payload 保持一致:未携带文件时导出 0 个对象记录
      storageObjects: options.includeFiles ? storageObjects.length : 0,
    },
    secretsInPlaintext: true,
    warnings,
  };

  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    options: {
      includeFiles: options.includeFiles,
      secretsInPlaintext: true,
      exportedAt: new Date().toISOString(),
    },
    platform: {
      applicationCode: SYSTEM_APPLICATION_CODE,
      name: eadafApp.name,
    },
    skills: skillsSection,
    ai: aiSection,
    dataStandards,
    systemFeatures,
    uacPermissions,
    storageBuckets,
    // 同 app 导出:未携带文件时不导出会悬空的对象记录(见 #20)
    storageObjects: options.includeFiles ? storageObjects : [],
    exportSummary,
    _storageFileEntries: storageFileEntries,
  };
}

async function* exportPlatformStream(rawOptions = {}) {
  const payload = await buildPlatformExport(rawOptions);
  const { _storageFileEntries, ...publicPayload } = payload;
  yield* chunkString(JSON.stringify(publicPayload));
}

async function buildPlatformExportArchive(rawOptions = {}) {
  const payload = await buildPlatformExport(rawOptions);
  const { _storageFileEntries, ...publicPayload } = payload;
  const includeFiles = publicPayload.options.includeFiles === true;
  const archive = await createTransferZipArchive({
    manifest: buildManifest({
      format: FORMAT,
      options: publicPayload.options,
      summary: publicPayload.exportSummary,
      includeFiles,
    }),
    payloadStream: Readable.from(chunkString(JSON.stringify(publicPayload))),
    fileEntries: includeFiles ? (_storageFileEntries || []) : [],
  });
  return { archive, fileName: buildExportFileName(), options: publicPayload.options };
}

function buildExportFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `eadaf-platform-export-${ts}.zip`;
}

module.exports = {
  FORMAT,
  FORMAT_VERSION,
  SYSTEM_APPLICATION_CODE,
  buildPlatformExport,
  exportPlatformStream,
  buildPlatformExportArchive,
  buildExportFileName,
  resolveEadafApplication,
  normalizeOptions,
};
