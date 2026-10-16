/**
 * 删除应用时的业务数据级联：按与应用导出相同的 scope 前缀规则匹配
 * 实体 / API / 管道 / 指标 / Webhook / Hook 等，可选再删物理物化表。
 */
const { Op } = require('sequelize');
const models = require('../models');
const config = require('../../config');
const {
  prefixHit,
  parseApiDataScope,
  matchApiServiceByScope,
  matchWebhookByScope,
  isWebhookScopeEmpty,
  buildScopeAncestorCodes,
  hookEventFilterHits,
} = require('./appTransfer/scopePrefix');
const { executeEntityDeletion } = require('./businessData/entityDeletionService');
const logger = require('../utils/logger');

/**
 * @param {object} app Application instance or plain
 * @returns {{
 *   entityScopeCodes: string[],
 *   entities: object[],
 *   apiServices: object[],
 *   pipelines: object[],
 *   webhooks: object[],
 *   metrics: object[],
 *   hooks: object[],
 *   enums: object[],
 *   scopeDocs: object[],
 *   materializationCount: number,
 *   skillLinkCount: number,
 *   pipelineAppLinkCount: number,
 * }}
 */
async function collectCascadeTargets(app) {
  const scopeCodes = Array.isArray(app.bizdata_scope_codes) ? app.bizdata_scope_codes : [];
  const apiDataScope = parseApiDataScope(app.api_data_scope);
  const trimmedBizScopes = scopeCodes.map((s) => String(s || '').trim()).filter(Boolean);
  const trimmedDomainCodes = (apiDataScope.domainCodes || []).map((s) => String(s || '').trim()).filter(Boolean);
  const entityScopeCodes = trimmedBizScopes.length
    ? [...new Set(trimmedBizScopes)]
    : [...new Set(trimmedDomainCodes)];
  const webhookScope = app.outbound_webhook_scope && typeof app.outbound_webhook_scope === 'object'
    ? app.outbound_webhook_scope
    : {};

  const allEntities = await models.BizdataEntity.findAll({ raw: true });
  const entities = allEntities.filter((e) => prefixHit(e.code, entityScopeCodes));
  const entityIds = entities.map((e) => e.id);
  const entityCodeSet = new Set(entities.map((e) => e.code));

  const allApiServices = await models.BizdataApiService.findAll({ raw: true });
  const apiServices = allApiServices.filter((s) =>
    matchApiServiceByScope(s.code, apiDataScope, scopeCodes),
  );
  const apiServiceCodeSet = new Set(apiServices.map((s) => s.code));

  const allPipelines = await models.BizdataCollectionPipeline.findAll({
    where: { status: { [Op.ne]: 'deleted' } },
    raw: true,
  });
  const pipelines = allPipelines.filter((p) => prefixHit(p.code, entityScopeCodes));

  const allWebhooks = await models.OutboundWebhook.findAll({
    where: { status: { [Op.ne]: 'deleted' } },
    raw: true,
  });
  let webhooks;
  if (isWebhookScopeEmpty(webhookScope)) {
    webhooks = allWebhooks.filter(
      (w) => w.trigger_api_service_code && apiServiceCodeSet.has(w.trigger_api_service_code),
    );
  } else {
    webhooks = allWebhooks.filter((w) => matchWebhookByScope(w.code, webhookScope));
  }

  const allMetrics = await models.BizdataMetric.findAll({ raw: true });
  const metrics = allMetrics.filter((m) => prefixHit(m.code, entityScopeCodes));

  const exportedCodes = new Set([...entityCodeSet, ...apiServiceCodeSet]);
  const allHooks = await models.AutomationHook.findAll({
    where: { status: { [Op.ne]: 'deleted' } },
    raw: true,
  });
  const hooks = allHooks.filter((h) => hookEventFilterHits(h.event_filter, exportedCodes));

  const allEnums = await models.BizdataEnum.findAll({ raw: true });
  const enums = entityScopeCodes.length
    ? allEnums.filter((en) => prefixHit(en.code, entityScopeCodes))
    : [];

  const ancestorCodes = new Set();
  for (const code of entityCodeSet) {
    for (const a of buildScopeAncestorCodes(code)) ancestorCodes.add(a);
  }
  for (const s of entityScopeCodes) ancestorCodes.add(s);
  const scopeDocs = ancestorCodes.size
    ? await models.BizdataScopeDoc.findAll({
      where: { code: { [Op.in]: [...ancestorCodes] } },
      raw: true,
    })
    : [];

  const materializationCount = entityIds.length
    ? await models.BizdataMaterializationEntity.count({
      where: { entity_id: { [Op.in]: entityIds } },
    })
    : 0;

  const appId = app.application_id || app.id;
  const skillLinkCount = appId
    ? await models.SkillApplication.count({ where: { application_id: appId } })
    : 0;
  const dedicated = await collectExclusiveDedicatedSkills(appId);
  const pipelineAppLinkCount = appId
    ? await models.BizdataCollectionPipelineApplication.count({
      where: { application_id: appId },
    })
    : 0;

  return {
    entityScopeCodes,
    entities,
    apiServices,
    pipelines,
    webhooks,
    metrics,
    hooks,
    enums,
    scopeDocs,
    materializationCount,
    skillLinkCount,
    pipelineAppLinkCount,
    dedicatedSkills: dedicated.skills,
    exclusiveTools: dedicated.tools,
  };
}

/**
 * 预览计数（供删除确认页）
 * @param {object} app
 */
async function previewCascade(app) {
  const t = await collectCascadeTargets(app);
  const lockedEntities = t.entities.filter((e) => e.is_locked);
  return {
    entityScopeCodes: t.entityScopeCodes,
    counts: {
      entities: t.entities.length,
      lockedEntities: lockedEntities.length,
      apiServices: t.apiServices.length,
      pipelines: t.pipelines.length,
      webhooks: t.webhooks.length,
      metrics: t.metrics.length,
      hooks: t.hooks.length,
      enums: t.enums.length,
      scopeDocs: t.scopeDocs.length,
      materializations: t.materializationCount,
      skillLinks: t.skillLinkCount,
      dedicatedSkills: t.dedicatedSkills.length,
      exclusiveTools: t.exclusiveTools.length,
      pipelineAppLinks: t.pipelineAppLinkCount,
    },
    samples: {
      entities: t.entities.slice(0, 8).map((e) => ({ code: e.code, label: e.label, is_locked: e.is_locked })),
      apiServices: t.apiServices.slice(0, 8).map((s) => ({ code: s.code, name: s.name })),
    },
  };
}

async function softDeleteByIds(Model, ids, extra = {}) {
  if (!ids.length) return 0;
  const [n] = await Model.update(
    { status: 'deleted', ...extra },
    { where: { id: { [Op.in]: ids } } },
  );
  return n;
}

async function hardDeleteApiServices(services) {
  let deleted = 0;
  for (const s of services) {
    const id = s.id;
    // eslint-disable-next-line no-await-in-loop
    await models.BizdataApiServiceOperation.destroy({ where: { api_service_id: id } });
    // eslint-disable-next-line no-await-in-loop
    await models.BizdataApiServicePermission.destroy({ where: { api_service_id: id } });
    // eslint-disable-next-line no-await-in-loop
    await models.BizdataApiService.destroy({ where: { id } });
    deleted += 1;
  }
  return deleted;
}

/**
 * 执行业务数据级联删除
 * @param {object} app
 * @param {{ dropPhysicalTables?: boolean }} options
 */
async function executeCascade(app, options = {}) {
  const dropPhysicalTables = Boolean(options.dropPhysicalTables);
  const t = await collectCascadeTargets(app);
  const summary = {
    deletedEntities: 0,
    deletedApiServices: 0,
    deletedPipelines: 0,
    deletedWebhooks: 0,
    deletedMetrics: 0,
    deletedHooks: 0,
    deletedEnums: 0,
    deletedScopeDocs: 0,
    deletedSkillLinks: 0,
    deletedSkills: 0,
    deletedTools: 0,
    deletedPipelineAppLinks: 0,
    unlockedEntities: 0,
    physicalTableDrops: [],
    entityDeletion: null,
  };

  const appId = app.application_id || app.id;

  // 1) 实体域：复用实体删除（含关联 API/管道/指标强关联 + 可选物理表）
  const entityIds = t.entities.map((e) => e.id);
  if (entityIds.length) {
    const lockedIds = t.entities.filter((e) => e.is_locked).map((e) => e.id);
    if (lockedIds.length) {
      await models.BizdataEntity.update(
        { is_locked: false },
        { where: { id: { [Op.in]: lockedIds } } },
      );
      summary.unlockedEntities = lockedIds.length;
    }
    try {
      const entityResult = await executeEntityDeletion({
        deleteEntityIds: entityIds,
        dropPhysicalTables,
      });
      summary.entityDeletion = entityResult?.summary || null;
      summary.deletedEntities = entityResult?.summary?.deletedEntities || entityIds.length;
      summary.deletedApiServices += entityResult?.summary?.deletedApiServices || 0;
      summary.deletedPipelines += entityResult?.summary?.deletedCollectionPipelines || 0;
      summary.deletedMetrics += entityResult?.summary?.deletedMetrics || 0;
      summary.physicalTableDrops = entityResult?.summary?.physicalTableDrops || [];
    } catch (err) {
      logger.error('应用级联删除实体失败', { error: err.message, entityIds });
      throw err;
    }
  }

  // 2) 仍存活的 scope 命中 API（无 entity_id 或未随实体删掉）
  const remainingApiIds = new Set(
    (await models.BizdataApiService.findAll({
      where: { id: { [Op.in]: t.apiServices.map((s) => s.id) } },
      attributes: ['id'],
      raw: true,
    })).map((r) => r.id),
  );
  const leftoverApis = t.apiServices.filter((s) => remainingApiIds.has(s.id));
  if (leftoverApis.length) {
    summary.deletedApiServices += await hardDeleteApiServices(leftoverApis);
  }

  // 3) 仍存活的管道 → 软删
  const remainingPipelineIds = (
    await models.BizdataCollectionPipeline.findAll({
      where: {
        id: { [Op.in]: t.pipelines.map((p) => p.id) },
        status: { [Op.ne]: 'deleted' },
      },
      attributes: ['id'],
      raw: true,
    })
  ).map((r) => r.id);
  if (remainingPipelineIds.length) {
    await models.BizdataCollectionPipeline.update(
      { entity_id: null, entity_code: null, status: 'deleted' },
      { where: { id: { [Op.in]: remainingPipelineIds } } },
    );
    summary.deletedPipelines += remainingPipelineIds.length;
  }

  // 4) 指标（按 code 前缀，实体删除未覆盖的弱关联）
  const remainingMetricIds = (
    await models.BizdataMetric.findAll({
      where: { id: { [Op.in]: t.metrics.map((m) => m.id) } },
      attributes: ['id'],
      raw: true,
    })
  ).map((r) => r.id);
  if (remainingMetricIds.length) {
    await models.BizdataMetricCard.destroy({
      where: { metric_id: { [Op.in]: remainingMetricIds } },
    });
    await models.BizdataMetric.destroy({
      where: { id: { [Op.in]: remainingMetricIds } },
    });
    summary.deletedMetrics += remainingMetricIds.length;
  }

  // 5) Webhooks / Hooks 软删
  summary.deletedWebhooks = await softDeleteByIds(
    models.OutboundWebhook,
    t.webhooks.map((w) => w.id),
  );
  summary.deletedHooks = await softDeleteByIds(
    models.AutomationHook,
    t.hooks.map((h) => h.id),
  );

  // 6) 枚举 / Scope 文档
  if (t.enums.length) {
    summary.deletedEnums = await models.BizdataEnum.destroy({
      where: { id: { [Op.in]: t.enums.map((e) => e.id) } },
    });
  }
  if (t.scopeDocs.length) {
    // scope_docs 主键是 code，没有 id 列
    const codes = t.scopeDocs.map((d) => d.code).filter(Boolean);
    summary.deletedScopeDocs = codes.length
      ? await models.BizdataScopeDoc.destroy({
        where: { code: { [Op.in]: codes } },
      })
      : 0;
  }

  // 7) 仅绑定本应用的专用 Skill，以及只被这些 Skill 使用的 Tool。
  // 全局 Skill、以及仍被其他 Skill 使用的 Tool（如 http-request）只解除绑定，不删本体。
  if (t.exclusiveTools.length) {
    summary.deletedTools = await models.Tool.destroy({
      where: { id: { [Op.in]: t.exclusiveTools.map((tool) => tool.id) } },
    });
  }
  if (t.dedicatedSkills.length) {
    summary.deletedSkills = await models.Skill.destroy({
      where: { id: { [Op.in]: t.dedicatedSkills.map((skill) => skill.id) } },
    });
  }
  if (appId) {
    summary.deletedSkillLinks = await models.SkillApplication.destroy({
      where: { application_id: appId },
    });
    summary.deletedPipelineAppLinks = await models.BizdataCollectionPipelineApplication.destroy({
      where: { application_id: appId },
    });
  }

  return summary;
}

/**
 * 找出「只挂在该应用上」的专用 Skill，以及只被这些 Skill 引用的 Tool。
 * 仍被其他应用绑定的专用 Skill、仍被其他 Skill 使用的 Tool 不在删除范围内。
 */
async function collectExclusiveDedicatedSkills(appId) {
  const empty = { skills: [], tools: [] };
  if (!appId) return empty;
  const links = await models.SkillApplication.findAll({
    where: { application_id: appId },
    attributes: ['skill_id'],
    raw: true,
  });
  const linkedIds = [...new Set(links.map((link) => link.skill_id))];
  if (!linkedIds.length) return empty;
  const skills = await models.Skill.findAll({
    where: { id: { [Op.in]: linkedIds }, is_dedicated: true },
    attributes: ['id', 'slug', 'name'],
    raw: true,
  });
  if (!skills.length) return empty;
  const skillIds = skills.map((skill) => skill.id);
  const otherLinks = await models.SkillApplication.findAll({
    where: {
      skill_id: { [Op.in]: skillIds },
      application_id: { [Op.ne]: appId },
    },
    attributes: ['skill_id'],
    raw: true,
  });
  const sharedSkillIds = new Set(otherLinks.map((link) => link.skill_id));
  const exclusiveSkills = skills.filter((skill) => !sharedSkillIds.has(skill.id));
  const exclusiveSkillIds = exclusiveSkills.map((skill) => skill.id);
  if (!exclusiveSkillIds.length) return empty;
  const skillTools = await models.SkillTool.findAll({
    where: { skill_id: { [Op.in]: exclusiveSkillIds } },
    attributes: ['tool_id'],
    raw: true,
  });
  const toolIds = [...new Set(skillTools.map((row) => row.tool_id))];
  if (!toolIds.length) return { skills: exclusiveSkills, tools: [] };
  const otherUses = await models.SkillTool.findAll({
    where: {
      tool_id: { [Op.in]: toolIds },
      skill_id: { [Op.notIn]: exclusiveSkillIds },
    },
    attributes: ['tool_id'],
    raw: true,
  });
  const sharedToolIds = new Set(otherUses.map((row) => row.tool_id));
  const exclusiveToolIds = toolIds.filter((id) => !sharedToolIds.has(id));
  const tools = exclusiveToolIds.length
    ? await models.Tool.findAll({
      where: { id: { [Op.in]: exclusiveToolIds } },
      attributes: ['id', 'slug', 'name'],
      raw: true,
    })
    : [];
  return { skills: exclusiveSkills, tools };
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quotePgIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * 物理删除应用前，把仍指向它的可空外键置空。
 * 系统 Bucket 里的文件不会随应用删除，但 application_id 必须先摘掉，否则外键拒绝删除。
 * @returns {Promise<number>} 改写的行数
 */
async function releaseApplicationReferences(applicationId) {
  if (!applicationId) return 0;
  const [rows] = await models.sequelize.query(`
    SELECT
      n.nspname AS table_schema,
      c.relname AS table_name,
      a.attname AS column_name,
      a.attnotnull AS is_required
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = con.conkey[1] AND a.attnum > 0
    JOIN pg_class pc ON pc.oid = con.confrelid
    JOIN pg_namespace pn ON pn.oid = pc.relnamespace
    WHERE con.contype = 'f'
      AND pn.nspname = :schema
      AND pc.relname = 'applications'
      AND array_length(con.conkey, 1) = 1
  `, { replacements: { schema: config.postgresql.schema } });
  let count = 0;
  for (const fk of rows) {
    if (!IDENT_RE.test(fk.table_schema) || !IDENT_RE.test(fk.table_name) || !IDENT_RE.test(fk.column_name)) {
      continue;
    }
    if (fk.is_required) {
      throw new Error(
        `无法删除应用:${fk.table_schema}.${fk.table_name}.${fk.column_name} 外键非空`,
      );
    }
    const [, meta] = await models.sequelize.query(
      `UPDATE ${quotePgIdentifier(fk.table_schema)}.${quotePgIdentifier(fk.table_name)}
       SET ${quotePgIdentifier(fk.column_name)} = NULL
       WHERE ${quotePgIdentifier(fk.column_name)} = :applicationId`,
      { replacements: { applicationId } },
    );
    count += Number(meta?.rowCount || 0);
  }
  return count;
}

module.exports = {
  collectCascadeTargets,
  previewCascade,
  executeCascade,
  releaseApplicationReferences,
};
