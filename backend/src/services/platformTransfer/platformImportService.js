/**
 * EADAF 平台导入:按节 upsert,节失败互不硬终止。
 */
const { Op } = require('sequelize');
const models = require('../../models');
const { encryptApiKey } = require('../../utils/encryption');
const logger = require('../../utils/logger');
const { pickModelFields } = require('../appTransfer/appExportService');
const { parsePlatformExportFile } = require('./platformPreviewService');
const { resolveEadafApplication } = require('./platformExportService');
const {
  importStorageBucketsSection,
  importStorageObjectsSection,
} = require('../appTransfer/transferStorage');

const STRATEGIES = ['overwrite', 'skip', 'abort'];

class ImportContext {
  constructor(file, strategy) {
    this.file = file;
    this.strategy = strategy;
    this.currentSection = null;
    this.idMap = {
      skills: new Map(),
      tools: new Map(),
      scopes: new Map(),
      providers: new Map(),
      aiModels: new Map(),
      permissions: new Map(),
      standards: new Map(),
      buckets: new Map(),
      applications: new Map(),
    };
    this.targetAppId = null;
    this.defaultStorageApplicationId = null;
    this.sourceAppId = null;
  }

  beginSection(name) {
    this.currentSection = name;
    const section = {
      status: 'ok',
      counts: { created: 0, updated: 0, skipped: 0, failed: 0 },
      errors: [],
      notes: [],
    };
    this.result.sections[name] = section;
    return section;
  }

  skipSection(section, message) {
    section.status = 'skipped';
    section.notes.push(message);
    return section;
  }

  markFailed(section, message) {
    section.status = 'failed';
    section.errors.push(message);
    logger.warn(`[platformTransfer] 导入节「${this.currentSection}」失败: ${message}`);
  }

  itemFailed(section, label, error) {
    section.counts.failed += 1;
    const message = `${label}: ${error instanceof Error ? error.message : String(error)}`;
    section.errors.push(message);
    return message;
  }

  async upsertMeta(model, sourceRow, uniqueKey, map, overrides, section, opts = {}) {
    const { transaction, secondKey = null, label = sourceRow[uniqueKey] } = opts;
    const payload = { ...pickModelFields(model, sourceRow), ...(overrides || {}) };
    const pk = model.primaryKeyAttribute;
    delete payload[pk];

    const existing = await model.findOne({
      where: { [uniqueKey]: sourceRow[uniqueKey] },
      transaction,
      paranoid: false,
    });
    if (existing) {
      if (existing.deleted_at) {
        this.itemFailed(section, `${label}`, new Error('目标存在同键软删记录,请先恢复或物理删除后再导入'));
        return null;
      }
      if (this.strategy === 'overwrite') {
        if (secondKey && sourceRow[secondKey.field]) {
          const conflict = await secondKey.model.findOne({
            where: {
              [secondKey.field]: sourceRow[secondKey.field],
              [uniqueKey]: { [Op.ne]: sourceRow[uniqueKey] },
            },
            transaction,
          });
          if (conflict) {
            this.itemFailed(section, `${label}`, new Error(`第二唯一键 ${secondKey.field}「${sourceRow[secondKey.field]}」已被 ${conflict[uniqueKey]} 占用`));
            return null;
          }
        }
        await existing.update(payload, { transaction });
        section.counts.updated += 1;
      } else {
        section.counts.skipped += 1;
      }
      map.set(sourceRow[pk], existing.get(pk));
      return { row: existing, created: false };
    }

    if (secondKey && sourceRow[secondKey.field]) {
      const conflict = await secondKey.model.findOne({
        where: { [secondKey.field]: sourceRow[secondKey.field] },
        transaction,
      });
      if (conflict) {
        this.itemFailed(section, `${label}`, new Error(`第二唯一键 ${secondKey.field}「${sourceRow[secondKey.field]}」已被 ${conflict[uniqueKey]} 占用`));
        return null;
      }
    }
    const created = await model.create(payload, { transaction });
    section.counts.created += 1;
    map.set(sourceRow[pk], created.get(pk));
    return { row: created, created: true };
  }

  async upsertMetaRaw(model, sourceRow, uniqueKey, map, payload, section, opts = {}) {
    const { transaction } = opts;
    const pk = model.primaryKeyAttribute;
    const cleanPayload = { ...payload };
    delete cleanPayload[pk];
    const existing = await model.findOne({
      where: { [uniqueKey]: sourceRow[uniqueKey] },
      transaction,
      paranoid: false,
    });
    if (existing) {
      if (existing.deleted_at) {
        this.itemFailed(section, String(sourceRow[uniqueKey]), new Error('目标存在同键软删记录'));
        return null;
      }
      if (this.strategy === 'overwrite') {
        await existing.update(cleanPayload, { transaction });
        section.counts.updated += 1;
      } else {
        section.counts.skipped += 1;
      }
      map.set(sourceRow[pk], existing.get(pk));
      return { row: existing, created: false };
    }
    const created = await model.create(cleanPayload, { transaction });
    section.counts.created += 1;
    map.set(sourceRow[pk], created.get(pk));
    return { row: created, created: true };
  }

  async upsertJoin(model, whereClause, payload, section, { transaction } = {}) {
    const existing = await model.findOne({ where: whereClause, transaction });
    const extraPayload = { ...payload };
    for (const key of Object.keys(whereClause)) delete extraPayload[key];
    if (existing) {
      if (this.strategy === 'overwrite' && Object.keys(extraPayload).length) {
        await existing.update(extraPayload, { transaction });
        section.counts.updated += 1;
      } else {
        section.counts.skipped += 1;
      }
      return existing;
    }
    const created = await model.create({ ...whereClause, ...extraPayload }, { transaction });
    section.counts.created += 1;
    return created;
  }

  async withSectionTransaction(fn) {
    const transaction = await models.sequelize.transaction();
    try {
      const out = await fn(transaction);
      await transaction.commit();
      return out;
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  }

  async importSkills() {
    const section = this.beginSection('skills');
    const skills = this.file.skills || {};
    const scopes = Array.isArray(skills.scopes) ? skills.scopes : [];
    const tools = Array.isArray(skills.tools) ? skills.tools : [];
    const items = Array.isArray(skills.items) ? skills.items : [];
    const skillTools = Array.isArray(skills.skillTools) ? skills.skillTools : [];
    const appLinks = Array.isArray(skills.applications) ? skills.applications : [];
    try {
      const eadafApp = await resolveEadafApplication();
      await this.withSectionTransaction(async (transaction) => {
        for (const scope of scopes) {
          await this.upsertMeta(models.Scope, scope, 'slug', this.idMap.scopes, {}, section, { transaction });
        }
        for (const tool of tools) {
          const overrides = {
            scope_id: tool.scope_id ? (this.idMap.scopes.get(tool.scope_id) || null) : null,
          };
          await this.upsertMeta(models.Tool, tool, 'slug', this.idMap.tools, overrides, section, {
            transaction,
            secondKey: { field: 'function_name', model: models.Tool },
          });
        }
        for (const skill of items) {
          const overrides = {
            scope_id: skill.scope_id ? (this.idMap.scopes.get(skill.scope_id) || null) : null,
          };
          await this.upsertMeta(models.Skill, skill, 'slug', this.idMap.skills, overrides, section, { transaction });
        }
        for (const st of skillTools) {
          const skillId = this.idMap.skills.get(st.skill_id);
          const toolId = this.idMap.tools.get(st.tool_id);
          if (!skillId || !toolId) {
            section.counts.skipped += 1;
            continue;
          }
          await this.upsertJoin(models.SkillTool, { skill_id: skillId, tool_id: toolId }, {
            sort_order: st.sort_order ?? 0,
          }, section, { transaction });
        }
        for (const link of appLinks) {
          const skillId = this.idMap.skills.get(link.skill_id);
          if (!skillId) {
            section.counts.skipped += 1;
            continue;
          }
          const existing = await models.SkillApplication.findOne({
            where: { skill_id: skillId, application_id: eadafApp.application_id },
            transaction,
          });
          if (!existing) {
            await models.SkillApplication.create({
              skill_id: skillId,
              application_id: eadafApp.application_id,
            }, { transaction });
            section.counts.created += 1;
          } else {
            section.counts.skipped += 1;
          }
        }
      });
    } catch (e) {
      this.markFailed(section, e.message);
    }
    return section;
  }

  async importAi() {
    const section = this.beginSection('ai');
    const ai = this.file.ai || {};
    const providers = Array.isArray(ai.providers) ? ai.providers : [];
    const aiModels = Array.isArray(ai.models) ? ai.models : [];
    const capabilities = Array.isArray(ai.capabilities) ? ai.capabilities : [];
    const ioTags = Array.isArray(ai.ioTags) ? ai.ioTags : [];
    if (!providers.length && !aiModels.length) {
      return this.skipSection(section, '文件无 AI 目录');
    }
    try {
      await this.withSectionTransaction(async (transaction) => {
        for (const provider of providers) {
          const payload = pickModelFields(models.Provider, provider);
          delete payload.id;
          delete payload.api_key_encrypted;
          payload.api_key_encrypted = provider.api_key ? encryptApiKey(provider.api_key) : null;
          delete payload.api_key;
          await this.upsertMetaRaw(models.Provider, provider, 'slug', this.idMap.providers, payload, section, { transaction });
        }
        for (const model of aiModels) {
          const providerId = this.idMap.providers.get(model.provider_id);
          if (!providerId) {
            section.counts.skipped += 1;
            continue;
          }
          const payload = pickModelFields(models.AiModel, model);
          delete payload.id;
          payload.provider_id = providerId;
          const combo = await models.AiModel.findOne({
            where: { provider_id: providerId, model_id: model.model_id },
            transaction,
          });
          if (combo && combo.slug !== model.slug) {
            this.itemFailed(section, `模型「${model.slug}」`, new Error(`(provider, model_id) 组合已被 ${combo.slug} 占用`));
            continue;
          }
          await this.upsertMetaRaw(models.AiModel, model, 'slug', this.idMap.aiModels, payload, section, { transaction });
        }
        for (const cap of capabilities) {
          const modelId = this.idMap.aiModels.get(cap.model_id);
          if (!modelId) {
            section.counts.skipped += 1;
            continue;
          }
          const existing = await models.ModelCapability.findOne({
            where: { model_id: modelId, capability: cap.capability },
            transaction,
          });
          if (!existing) {
            await models.ModelCapability.create({
              model_id: modelId,
              capability: cap.capability,
            }, { transaction });
            section.counts.created += 1;
          } else {
            section.counts.skipped += 1;
          }
        }
        for (const tag of ioTags) {
          const modelId = this.idMap.aiModels.get(tag.model_id);
          if (!modelId) {
            section.counts.skipped += 1;
            continue;
          }
          const existing = await models.ModelIoTag.findOne({
            where: { model_id: modelId, direction: tag.direction, modality: tag.modality },
            transaction,
          });
          if (!existing) {
            await models.ModelIoTag.create({
              model_id: modelId,
              direction: tag.direction,
              modality: tag.modality,
            }, { transaction });
            section.counts.created += 1;
          } else {
            section.counts.skipped += 1;
          }
        }
      });
    } catch (e) {
      this.markFailed(section, e.message);
    }
    return section;
  }

  async importDataStandards() {
    const section = this.beginSection('dataStandards');
    const items = Array.isArray(this.file.dataStandards) ? this.file.dataStandards : [];
    if (!items.length) {
      return this.skipSection(section, '文件无数据标准');
    }
    try {
      await this.withSectionTransaction(async (transaction) => {
        for (const row of items) {
          const payload = pickModelFields(models.BizdataDataStandard, row);
          delete payload.id;
          const existing = await models.BizdataDataStandard.findOne({
            where: { code: row.code, version: row.version },
            transaction,
          });
          if (existing) {
            if (this.strategy === 'overwrite') {
              await existing.update(payload, { transaction });
              section.counts.updated += 1;
            } else {
              section.counts.skipped += 1;
            }
            this.idMap.standards.set(row.id, existing.id);
          } else {
            const created = await models.BizdataDataStandard.create(payload, { transaction });
            section.counts.created += 1;
            this.idMap.standards.set(row.id, created.id);
          }
        }
      });
    } catch (e) {
      this.markFailed(section, e.message);
    }
    return section;
  }

  async importSystemFeatures() {
    const section = this.beginSection('systemFeatures');
    const value = this.file.systemFeatures && typeof this.file.systemFeatures === 'object'
      ? this.file.systemFeatures
      : null;
    if (!value || !Object.keys(value).length) {
      return this.skipSection(section, '文件无系统功能开关');
    }
    try {
      await this.withSectionTransaction(async (transaction) => {
        const existing = await models.BizdataSetting.findOne({
          where: { key: 'system_features' },
          transaction,
        });
        if (existing) {
          if (this.strategy === 'overwrite') {
            const current = existing.value && typeof existing.value === 'object' ? existing.value : {};
            await existing.update({ value: { ...current, ...value } }, { transaction });
            section.counts.updated += 1;
          } else {
            section.counts.skipped += 1;
          }
        } else {
          await models.BizdataSetting.create({ key: 'system_features', value }, { transaction });
          section.counts.created += 1;
        }
      });
    } catch (e) {
      this.markFailed(section, e.message);
    }
    return section;
  }

  async importEadafPermissions() {
    const section = this.beginSection('uacPermissions');
    const items = Array.isArray(this.file.uacPermissions) ? this.file.uacPermissions : [];
    if (!items.length) {
      return this.skipSection(section, '文件无 EADAF 权限目录');
    }
    try {
      await this.withSectionTransaction(async (transaction) => {
        for (const perm of items) {
          await this.upsertMeta(models.Permission, perm, 'code', this.idMap.permissions, {}, section, { transaction });
        }
      });
    } catch (e) {
      this.markFailed(section, e.message);
    }
    return section;
  }

  async importStorageBuckets() {
    return importStorageBucketsSection(this, {
      defaultApplicationId: this.defaultStorageApplicationId,
    });
  }

  async importStorageObjects() {
    return importStorageObjectsSection(this, {
      defaultApplicationId: this.defaultStorageApplicationId,
    });
  }
}

async function importPlatformFile(filePath, strategy = 'overwrite') {
  const effectiveStrategy = STRATEGIES.includes(strategy) ? strategy : 'overwrite';
  const file = await parsePlatformExportFile(filePath);
  const ctx = new ImportContext(file, effectiveStrategy);
  const result = { strategy: effectiveStrategy, sections: {}, warnings: [], durationMs: 0 };
  ctx.result = result;
  const eadafApp = await resolveEadafApplication();
  ctx.targetAppId = eadafApp.application_id;
  ctx.defaultStorageApplicationId = eadafApp.application_id;
  ctx.idMap.applications.set(eadafApp.application_id, eadafApp.application_id);
  const startedAt = Date.now();

  if (effectiveStrategy === 'abort') {
    const { previewImportFile } = require('./platformPreviewService');
    const preview = await previewImportFile(filePath);
    if (preview.conflicts.length) {
      result.aborted = true;
      result.sections = {
        aborted: {
          status: 'skipped',
          counts: {},
          errors: ['abort 策略:存在冲突,未写入任何数据'],
          notes: [],
        },
      };
      result.conflicts = preview.conflicts;
      result.durationMs = Date.now() - startedAt;
      return result;
    }
  }

  const steps = [
    ['skills', () => ctx.importSkills()],
    ['ai', () => ctx.importAi()],
    ['dataStandards', () => ctx.importDataStandards()],
    ['systemFeatures', () => ctx.importSystemFeatures()],
    ['uacPermissions', () => ctx.importEadafPermissions()],
    ['storageBuckets', () => ctx.importStorageBuckets()],
    ['storageObjects', () => ctx.importStorageObjects()],
  ];

  for (const [, step] of steps) {
    await step();
  }

  const failedSections = Object.entries(result.sections)
    .filter(([, s]) => s.status === 'failed')
    .map(([name]) => name);
  if (failedSections.length) {
    result.warnings.push(`以下节存在失败条目,请查看各节 errors: ${failedSections.join(', ')}`);
  }
  result.durationMs = Date.now() - startedAt;
  return result;
}

module.exports = {
  importPlatformFile,
  STRATEGIES,
};
