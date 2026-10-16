/**
 * 应用导出服务(review 方案 §4/§5.2)。
 *
 * - 按应用配置的 scope 前缀筛选各节数据(禁止冒号首段膨胀,见 scopePrefix.js);
 *   实体/管道/指标优先 bizdata_scope_codes,为空时回退 api_data_scope.domainCodes;
 * - 行数据仅支持 postgresql/mysql,复用物化记录定位连接,保留行原主键;
 * - 响应以异步 generator 逐节产出 JSON chunk,由控制器 Readable.from 流式下载;
 * - 密文字段(encryptApiKey 加密,绑定实例 ENCRYPTION_KEY)导出时解密为明文段,
 *   导入端用目标实例密钥重新加密;app_secret/client_secret 库内即明文,原样往返;
 * - 导出 databaseConnections 元数据(含 host/port/databaseName/username 供预览),
 *   **不导出** password_enc;导入端优先匹配,失败则用目标同类型连接凭证创建本地连接。
 * - physicalTables 为 entityData 的库表摘要,便于预览一眼看到物化表清单。
 */
const { Op } = require('sequelize');
const { Client: PgClient } = require('pg');
const mysql = require('mysql2/promise');

const models = require('../../models');
const { decryptApiKey } = require('../../utils/encryption');
const logger = require('../../utils/logger');
const connectionRunner = require('../businessData/materialization/connectionRunner');
const { buildRuntimeConfig } = require('../businessData/databaseConnectionService');
const {
  prefixHit,
  parseApiDataScope,
  matchApiServiceByScope,
  matchWebhookByScope,
  isWebhookScopeEmpty,
  buildScopeAncestorCodes,
  hookEventFilterHits,
} = require('./scopePrefix');
const { collectAppStorage } = require('./transferStorage');
const { buildManifest, createTransferZipArchive } = require('./transferZip');
const { Readable } = require('stream');

const SYSTEM_APPLICATION_CODE = 'EADAF';
const LARGE_ROW_THRESHOLD = 100000;
const ROW_PAGE_SIZE = 500;

function assertExportableApplication(applicationId) {
  if (!applicationId) {
    throw Object.assign(new Error('缺少 applicationId 参数'), { status: 400 });
  }
  return models.Application.findByPk(applicationId).then((app) => {
    if (!app) {
      throw Object.assign(new Error('应用不存在'), { status: 404 });
    }
    if (app.code === SYSTEM_APPLICATION_CODE) {
      throw Object.assign(new Error('内置系统应用 EADAF 不允许导出'), { status: 400 });
    }
    return app;
  });
}

/** 按模型属性白名单挑字段(剥掉时间戳,由目标端自行生成) */
function pickModelFields(model, row) {
  const attrs = model.getAttributes();
  const out = {};
  for (const key of Object.keys(attrs)) {
    if (key === 'created_at' || key === 'updated_at' || key === 'deleted_at') continue;
    if (Object.prototype.hasOwnProperty.call(row, key)) out[key] = row[key];
  }
  return out;
}

function normalizeOptions(raw = {}) {
  const dataMode = raw.dataMode === 'data_only' ? 'data_only' : 'structure_and_data';
  return {
    dataMode,
    includeUac: raw.includeUac === true,
    includeFiles: raw.includeFiles === true,
    // 默认关闭:导入保持源发布状态。开启后覆盖导入才把已发布 API/管道/Webhook 退回未发布
    safeMode: raw.safeMode === true,
  };
}

function buildFileOptions(options, sourceApplicationId) {
  return {
    dataMode: options.dataMode,
    includeUac: options.includeUac,
    includeFiles: options.includeFiles,
    safeMode: options.safeMode === true,
    secretsInPlaintext: true,
    exportedAt: new Date().toISOString(),
    sourceApplicationId,
  };
}

async function decorateWithStandardRef(rows, model) {
  const ids = [...new Set(rows.map((r) => r.standard_id).filter(Boolean))];
  const standards = ids.length
    ? await models.BizdataDataStandard.findAll({ where: { id: { [Op.in]: ids } }, raw: true })
    : [];
  const byId = new Map(standards.map((s) => [s.id, s]));
  return rows.map((r) => {
    const out = pickModelFields(model, r);
    const std = r.standard_id ? byId.get(r.standard_id) : null;
    out.standard_code = std ? std.code : null;
    out.standard_version = std ? std.version : null;
    return out;
  });
}

/** 仅导出本次应用包内 entity/metric/enum 绑定的逻辑元数据,不含数据标准目录 */
async function collectBoundMetadata({ entityIds, metricIds, enumIds }) {
  const or = [];
  if (entityIds.length) or.push({ target_type: 'entity', target_id: { [Op.in]: entityIds } });
  if (metricIds.length) or.push({ target_type: 'metric', target_id: { [Op.in]: metricIds } });
  if (enumIds.length) or.push({ target_type: 'enum', target_id: { [Op.in]: enumIds } });
  if (!or.length) return { tables: [], fields: [] };
  const tables = await models.BizdataMetadataTable.findAll({ where: { [Op.or]: or }, raw: true });
  const tableIds = tables.map((t) => t.id);
  const fields = tableIds.length
    ? await models.BizdataMetadataField.findAll({
      where: { metadata_table_id: { [Op.in]: tableIds } },
      raw: true,
    })
    : [];
  return {
    tables: await decorateWithStandardRef(tables, models.BizdataMetadataTable),
    fields: await decorateWithStandardRef(fields, models.BizdataMetadataField),
  };
}

/** hooks 的 action_config.auth.secretEnc → 明文 secret 段 */
function exportHookSecret(hookRow) {
  const out = pickModelFields(models.AutomationHook, hookRow);
  const cfg = out.action_config;
  if (
    out.action_type === 'http_request' &&
    cfg && typeof cfg === 'object' && cfg.auth && typeof cfg.auth === 'object' &&
    cfg.auth.secretEnc
  ) {
    const nextAuth = { ...cfg.auth };
    delete nextAuth.secretEnc;
    try {
      nextAuth.secret = decryptApiKey(cfg.auth.secretEnc);
    } catch (e) {
      logger.warn(`导出钩子「${hookRow.name}」鉴权密钥解密失败,已置空: ${e.message}`);
      nextAuth.secret = null;
    }
    out.action_config = { ...cfg, auth: nextAuth };
  }
  return out;
}

/** webhook 的 auth_secret_enc → 明文 auth_secret 段 */
function exportWebhookSecret(webhookRow) {
  const out = pickModelFields(models.OutboundWebhook, webhookRow);
  delete out.auth_secret_enc;
  if (webhookRow.auth_secret_enc) {
    try {
      out.auth_secret = decryptApiKey(webhookRow.auth_secret_enc);
    } catch (e) {
      logger.warn(`导出 Webhook「${webhookRow.code}」鉴权密钥解密失败,已置空: ${e.message}`);
      out.auth_secret = null;
    }
  } else {
    out.auth_secret = null;
  }
  return out;
}

async function getLatestMaterializationMap(entityIds) {
  if (!entityIds.length) return new Map();
  const rows = await models.BizdataMaterializationEntity.findAll({
    where: { entity_id: { [Op.in]: entityIds } },
    include: [{
      model: models.BizdataMaterializationRun,
      as: 'run',
      required: true,
      where: { status: 'success' },
      include: [{ model: models.BizdataDatabaseConnection, as: 'connection' }],
    }],
    order: [[{ model: models.BizdataMaterializationRun, as: 'run' }, 'created_at', 'DESC']],
  });
  const map = new Map();
  for (const row of rows) {
    const plain = row.toJSON();
    if (!map.has(plain.entity_id)) {
      map.set(plain.entity_id, {
        connection: plain.run?.connection || null,
        connectionId: plain.run?.connection_id || null,
        targetSchema: plain.run?.target_schema || null,
        entityVersion: plain.entity_version,
      });
    }
  }
  return map;
}

function quotePgIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function quoteMysqlIdentifier(name) {
  return `\`${String(name).replace(/`/g, '``')}\``;
}

/** 读取物化物理表的列清单(information_schema),required 标记 NOT NULL 且无默认值的列 */
async function readTableColumns(runtime, schemaName, tableName) {
  if (runtime.dbType === 'postgresql') {
    return connectionRunner.withPgClient(runtime, async (client) => {
      const res = await client.query(
        `SELECT column_name, data_type, is_nullable, column_default, is_identity
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
        [schemaName, tableName],
      );
      return res.rows.map((r) => ({
        name: r.column_name,
        dataType: r.data_type,
        required: r.is_nullable === 'NO' && !r.column_default && r.is_identity !== 'YES',
      }));
    });
  }
  if (runtime.dbType === 'mysql') {
    return connectionRunner.withMysqlClient(runtime, async (conn) => {
      const [rows] = await conn.query(
        `SELECT COLUMN_NAME AS columnName, DATA_TYPE AS dataType, IS_NULLABLE AS isNullable,
                COLUMN_DEFAULT AS columnDefault, EXTRA AS extra
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ? ORDER BY ORDINAL_POSITION`,
        [runtime.databaseName, tableName],
      );
      return rows.map((r) => {
        const name = r.columnName || r.COLUMN_NAME;
        const isNullable = r.isNullable ?? r.IS_NULLABLE;
        const columnDefault = r.columnDefault ?? r.COLUMN_DEFAULT;
        const extra = String(r.extra ?? r.EXTRA ?? '');
        return {
          name,
          dataType: r.dataType || r.DATA_TYPE,
          required: isNullable === 'NO' && (columnDefault === null || columnDefault === undefined) && !extra.includes('auto_increment'),
        };
      });
    });
  }
  throw new Error(`不支持的行数据库类型: ${runtime.dbType}`);
}

async function countTableRows(runtime, schemaName, tableName) {
  if (runtime.dbType === 'postgresql') {
    return connectionRunner.withPgClient(runtime, async (client) => {
      const res = await client.query(
        `SELECT COUNT(*)::int AS count FROM ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)}`,
      );
      return Number(res.rows[0]?.count || 0);
    });
  }
  if (runtime.dbType === 'mysql') {
    return connectionRunner.withMysqlClient(runtime, async (conn) => {
      const [rows] = await conn.query(
        `SELECT COUNT(*) AS count FROM ${quoteMysqlIdentifier(schemaName || runtime.databaseName)}.${quoteMysqlIdentifier(tableName)}`,
      );
      return Number(rows[0]?.count || 0);
    });
  }
  return 0;
}

/** 单连接逐页读行,保留原主键;由调用方负责关闭连接 */
async function* iterateTableRows(runtime, schemaName, tableName, orderColumn, pageSize = ROW_PAGE_SIZE) {
  if (runtime.dbType === 'postgresql') {
    const client = new PgClient({
      host: runtime.host,
      port: runtime.port,
      user: runtime.username,
      password: runtime.password,
      database: runtime.databaseName,
    });
    await client.connect();
    try {
      let offset = 0;
      for (;;) {
        const res = await client.query(
          `SELECT * FROM ${quotePgIdentifier(schemaName)}.${quotePgIdentifier(tableName)}
           ORDER BY ${quotePgIdentifier(orderColumn)} LIMIT ${pageSize} OFFSET ${offset}`,
        );
        for (const row of res.rows) yield row;
        if (res.rows.length < pageSize) break;
        offset += pageSize;
      }
    } finally {
      await client.end().catch(() => {});
    }
    return;
  }
  if (runtime.dbType === 'mysql') {
    const conn = await mysql.createConnection({
      host: runtime.host,
      port: runtime.port || 3306,
      user: runtime.username,
      password: runtime.password || undefined,
      database: runtime.databaseName,
      multipleStatements: false,
    });
    try {
      let offset = 0;
      for (;;) {
        const [rows] = await conn.query(
          `SELECT * FROM ${quoteMysqlIdentifier(schemaName || runtime.databaseName)}.${quoteMysqlIdentifier(tableName)}
           ORDER BY ${quoteMysqlIdentifier(orderColumn)} LIMIT ? OFFSET ?`,
          [pageSize, offset],
        );
        for (const row of rows) yield row;
        if (rows.length < pageSize) break;
        offset += pageSize;
      }
    } finally {
      await conn.end().catch(() => {});
    }
    return;
  }
  throw new Error(`不支持的行数据库类型: ${runtime.dbType}`);
}

/**
 * 组装导出上下文(除行数据外的全部元数据节,内存占用可控)。
 * @returns {{
 *   application: object, entitiesSection: object, apiServicesSection: object,
 *   collectionPipelinesSection: object, outboundWebhooks: object[], metricsSection: object,
 *   hooks: object[], hooksExcluded: object[], skillsSection: object,
 *   metadataSection: object, uacSection: object, storageBuckets: object[], storageObjects: object[],
 *   storageFileEntries: object[], entityDataItems: object[],
 *   sourceApplicationId: string, warnings: string[],
 * }}
 */
async function buildExportContext(app, options) {
  const warnings = [];
  const scopeCodes = Array.isArray(app.bizdata_scope_codes) ? app.bizdata_scope_codes : [];
  const apiDataScope = parseApiDataScope(app.api_data_scope);
  // 实体/管道/指标:优先 bizdata_scope_codes;为空时才回退到 api_data_scope.domainCodes
  const trimmedBizScopes = scopeCodes.map((s) => String(s || '').trim()).filter(Boolean);
  const trimmedDomainCodes = (apiDataScope.domainCodes || []).map((s) => String(s || '').trim()).filter(Boolean);
  const entityScopeCodes = trimmedBizScopes.length
    ? [...new Set(trimmedBizScopes)]
    : [...new Set(trimmedDomainCodes)];
  const webhookScope = app.outbound_webhook_scope && typeof app.outbound_webhook_scope === 'object'
    ? app.outbound_webhook_scope : {};

  // ---- 实体域 ----
  const allEntities = await models.BizdataEntity.findAll({ raw: true });
  const entities = allEntities.filter((e) => prefixHit(e.code, entityScopeCodes));
  const entityIds = entities.map((e) => e.id);
  const entityCodeSet = new Set(entities.map((e) => e.code));
  if (!entityScopeCodes.length) {
    warnings.push('应用未配置 bizdata_scope_codes,且 api_data_scope.domainCodes 为空,未导出任何实体');
  } else if (!entities.length) {
    const scopeLabel = trimmedBizScopes.length ? 'bizdata_scope_codes' : 'api_data_scope.domainCodes';
    warnings.push(`按 ${scopeLabel} [${entityScopeCodes.join(', ')}] 未命中任何实体`);
  }

  const fields = entityIds.length
    ? await models.BizdataEntityField.findAll({
      where: { entity_id: { [Op.in]: entityIds } },
      order: [['entity_id', 'ASC'], ['sort_order', 'ASC']],
      raw: true,
    })
    : [];

  const fieldsText = JSON.stringify(fields);
  const allEnums = await models.BizdataEnum.findAll({ raw: true });
  const enums = allEnums.filter(
    (en) => prefixHit(en.code, entityScopeCodes) || fieldsText.includes(en.code),
  );

  const relations = entityIds.length
    ? await models.BizdataRelation.findAll({
      where: { from_entity_id: { [Op.in]: entityIds }, to_entity_id: { [Op.in]: entityIds } },
      raw: true,
    })
    : [];

  const ancestorCodes = new Set();
  for (const code of entityCodeSet) {
    for (const a of buildScopeAncestorCodes(code)) ancestorCodes.add(a);
  }
  const scopeDocs = ancestorCodes.size
    ? await models.BizdataScopeDoc.findAll({ where: { code: { [Op.in]: [...ancestorCodes] } }, raw: true })
    : [];

  // ---- API 服务域 ----
  const allApiServices = await models.BizdataApiService.findAll({ raw: true });
  const apiServices = allApiServices.filter(
    (s) => matchApiServiceByScope(s.code, apiDataScope, scopeCodes),
  );
  const apiServiceIds = apiServices.map((s) => s.id);
  const apiServiceCodeSet = new Set(apiServices.map((s) => s.code));
  const apiServiceOperations = apiServiceIds.length
    ? await models.BizdataApiServiceOperation.findAll({
      where: { api_service_id: { [Op.in]: apiServiceIds } },
      order: [['api_service_id', 'ASC'], ['sort_order', 'ASC']],
      raw: true,
    })
    : [];
  const apiServicePermissions = apiServiceIds.length
    ? await models.BizdataApiServicePermission.findAll({
      where: { api_service_id: { [Op.in]: apiServiceIds } },
      raw: true,
    })
    : [];

  // ---- 采集管道 ----
  const allPipelines = await models.BizdataCollectionPipeline.findAll({ raw: true });
  const pipelines = allPipelines.filter((p) => prefixHit(p.code, entityScopeCodes));
  const pipelineIds = pipelines.map((p) => p.id);
  const pipelineApplications = pipelineIds.length
    ? await models.BizdataCollectionPipelineApplication.findAll({
      where: { pipeline_id: { [Op.in]: pipelineIds }, application_id: app.application_id },
      raw: true,
    })
    : [];

  // ---- Outbound Webhooks ----
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
  webhooks = webhooks.map(exportWebhookSecret);

  // ---- 指标 ----
  const allMetrics = await models.BizdataMetric.findAll({ raw: true });
  const metrics = allMetrics.filter((m) => prefixHit(m.code, entityScopeCodes));
  const metricIdSet = new Set(metrics.map((m) => m.id));
  const allMetricCards = await models.BizdataMetricCard.findAll({ raw: true });
  const metricCards = allMetricCards.filter(
    (c) => metricIdSet.has(c.metric_id) && prefixHit(c.domain_code, entityScopeCodes),
  );

  // ---- 钩子 ----
  const exportedCodes = new Set([...entityCodeSet, ...apiServiceCodeSet]);
  const allHooks = await models.AutomationHook.findAll({
    where: { status: { [Op.ne]: 'deleted' } },
    raw: true,
  });
  const hooks = [];
  const hooksExcluded = [];
  for (const h of allHooks) {
    if (hookEventFilterHits(h.event_filter, exportedCodes)) {
      hooks.push(exportHookSecret(h));
    } else {
      hooksExcluded.push({
        name: h.name,
        eventType: h.event_type,
        reason: 'event_filter 未命中本次导出的实体/API code(含 filter 为空),未纳入导出',
      });
    }
  }

  // ---- Skills(仅该应用专用,不含全局/EADAF 平台 Skill) ----
  const appLinks = await models.SkillApplication.findAll({
    where: { application_id: app.application_id },
    raw: true,
  });
  const dedicatedSkillIds = [...new Set(appLinks.map((l) => l.skill_id))];
  const skills = dedicatedSkillIds.length
    ? await models.Skill.findAll({
      where: { id: { [Op.in]: dedicatedSkillIds }, is_dedicated: true },
      raw: true,
    })
    : [];
  const skillIds = skills.map((s) => s.id);
  const skillIdSet = new Set(skillIds);
  const dedicatedLinks = appLinks.filter((l) => skillIdSet.has(l.skill_id));
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

  // ---- 实体绑定的逻辑元数据(数据标准目录走平台包,此处只带 code+version 供重映射) ----
  let metadataSection = { tables: [], fields: [] };
  try {
    metadataSection = await collectBoundMetadata({
      entityIds,
      metricIds: metrics.map((m) => m.id),
      enumIds: enums.map((en) => en.id),
    });
  } catch (e) {
    warnings.push(`逻辑元数据节导出失败(已跳过): ${e.message}`);
  }

  // ---- 存储(须早于EADAF引用角色,以便把桶 access_restrictions.role_ids 算进被引用角色) ----
  const {
    storageBuckets,
    storageObjects,
    storageFileEntries,
  } = await collectAppStorage(app, options, warnings);

  if (!options.includeFiles && storageObjects.length) {
    warnings.push(
      `未勾选「携带存储文件」,已跳过 ${storageObjects.length} 个存储对象(桶元数据照常导出)。`
      + '目标实例不会有这些对象记录,相关图片/附件不会被引用;需要文件请在导出时勾选。',
    );
  }

  // ---- EADAF(不勾选仅导出被引用 roles/permissions) ----
  const bucketRoleIds = [];
  for (const bucket of storageBuckets) {
    const restrictions = bucket.access_restrictions;
    if (restrictions && Array.isArray(restrictions.role_ids)) {
      for (const id of restrictions.role_ids) {
        if (id) bucketRoleIds.push(id);
      }
    }
  }
  const referencedRoleIds = [
    ...new Set([
      ...apiServicePermissions.filter((p) => p.grant_type === 'role').map((p) => p.grant_id),
      ...bucketRoleIds,
    ]),
  ];
  const referencedRoleRows = referencedRoleIds.length
    ? await models.Role.findAll({ where: { role_id: { [Op.in]: referencedRoleIds } }, raw: true })
    : [];
  const referencedRolePermissionRows = referencedRoleIds.length
    ? await models.RolePermission.findAll({ where: { role_id: { [Op.in]: referencedRoleIds } }, raw: true })
    : [];
  const referencedPermissionIds = [
    ...new Set(referencedRolePermissionRows.map((rp) => rp.permission_id)),
  ];
  const referencedPermissionRows = referencedPermissionIds.length
    ? await models.Permission.findAll({ where: { permission_id: { [Op.in]: referencedPermissionIds } }, raw: true })
    : [];

  const uacSection = {
    roles: referencedRoleRows.map((r) => pickModelFields(models.Role, r)),
    permissions: referencedPermissionRows.map((r) => pickModelFields(models.Permission, r)),
    rolePermissions: referencedRolePermissionRows.map((r) => pickModelFields(models.RolePermission, r)),
    users: [],
    departments: [],
    userRoles: [],
    dataPermissionRules: [],
  };
  if (options.includeUac) {
    const [users, departments, userRoles, allRoles, allPermissions, allRolePermissions, rules] =
      await Promise.all([
        models.User.findAll({ raw: true }),
        models.Department.findAll({ raw: true }),
        models.UserRole.findAll({ raw: true }),
        models.Role.findAll({ raw: true }),
        models.Permission.findAll({ raw: true }),
        models.RolePermission.findAll({ raw: true }),
        models.DataPermissionRule.findAll({ raw: true }),
      ]);
    uacSection.users = users.map((r) => pickModelFields(models.User, r));
    uacSection.departments = departments.map((r) => pickModelFields(models.Department, r));
    uacSection.userRoles = userRoles.map((r) => pickModelFields(models.UserRole, r));
    uacSection.roles = allRoles.map((r) => pickModelFields(models.Role, r));
    uacSection.permissions = allPermissions.map((r) => pickModelFields(models.Permission, r));
    uacSection.rolePermissions = allRolePermissions.map((r) => pickModelFields(models.RolePermission, r));
    uacSection.dataPermissionRules = rules.map((r) => pickModelFields(models.DataPermissionRule, r));
  }

  // ---- 行数据桩(实体 → 最新成功物化记录 → 连接) ----
  const matMap = await getLatestMaterializationMap(entityIds);
  const connectionIdSet = new Set();
  apiServices.forEach((s) => { if (s.connection_id) connectionIdSet.add(s.connection_id); });
  pipelines.forEach((p) => { if (p.connection_id) connectionIdSet.add(p.connection_id); });
  metrics.forEach((m) => { if (m.connection_id) connectionIdSet.add(m.connection_id); });

  const entityDataItems = [];
  const erEntities = entities.filter((e) => e.entity_kind === 'er_table');
  for (const entity of erEntities) {
    const mat = matMap.get(entity.id);
    if (!mat || !mat.connection) {
      entityDataItems.push({
        entityCode: entity.code,
        entityVersion: entity.version,
        rowsOmitted: true,
        omitReason: '未找到成功的物化记录,无可导出行数据',
      });
      continue;
    }
    const conn = mat.connection;
    connectionIdSet.add(conn.id);
    // 与物化共用同一 runtime 组装:默认 PostgreSQL 连接未保存密码时回落平台库口令。
    // 此前这里只认 password_enc,连接没密码就静默跳过所有实体的物理表结构与行数据,
    // 导出的包会变成「结构齐、表结构和行数据全空」。
    const runtime = buildRuntimeConfig(conn);
    runtime.targetSchema = mat.targetSchema || runtime.targetSchema;
    const item = {
      entityCode: entity.code,
      entityVersion: entity.version,
      connectionSourceId: conn.id,
      tableName: entity.table_name,
      targetSchema: runtime.targetSchema,
      dbType: runtime.dbType,
    };
    if (runtime.dbType !== 'postgresql' && runtime.dbType !== 'mysql') {
      item.rowsOmitted = true;
      item.omitReason = `行数据暂仅支持 postgresql/mysql,源连接为 ${runtime.dbType},已跳过`;
      entityDataItems.push(item);
      continue;
    }
    try {
      item.columns = await readTableColumns(runtime, runtime.targetSchema, entity.table_name);
      item.rowCount = await countTableRows(runtime, runtime.targetSchema, entity.table_name);
    } catch (e) {
      logger.warn(`导出实体「${entity.code}」读取物理表结构失败: ${e.message}`);
      item.rowsOmitted = true;
      const credentialHint = runtime.password
        ? ''
        : `;数据库连接「${conn.name || conn.id}」未保存密码,请到「数据库连接」页补填后重新导出`;
      item.omitReason = `读取物理表结构失败: ${e.message}${credentialHint}`;
      entityDataItems.push(item);
      continue;
    }
    item.rows = []; // 占位,流式阶段填充
    entityDataItems.push({
      ...item,
      _runtime: runtime,
      _orderColumn: (item.columns || []).some((c) => c.name === 'id') ? 'id' : (item.columns[0]?.name || 'id'),
    });
  }

  const connRows = connectionIdSet.size
    ? await models.BizdataDatabaseConnection.findAll({ where: { id: { [Op.in]: [...connectionIdSet] } }, raw: true })
    : [];
  // 完整连接元数据(无密码);connectionsHint 保留同结构兼容旧导入
  const databaseConnections = connRows.map((c) => ({
    sourceId: c.id,
    name: c.name,
    dbType: c.db_type,
    targetSchema: c.target_schema,
    isDefault: Boolean(c.is_default),
    host: c.host || null,
    port: c.port == null ? null : Number(c.port),
    databaseName: c.database_name || null,
    username: c.username || null,
  }));
  const connectionsHint = databaseConnections.map((c) => ({
    sourceId: c.sourceId,
    name: c.name,
    dbType: c.dbType,
    targetSchema: c.targetSchema,
    isDefault: c.isDefault,
  }));
  const physicalTables = entityDataItems.map((item) => {
    const row = {
      entityCode: item.entityCode,
      tableName: item.tableName || null,
      targetSchema: item.targetSchema || null,
      dbType: item.dbType || null,
      columnCount: Array.isArray(item.columns) ? item.columns.length : 0,
      rowCount: item.rowCount == null ? null : Number(item.rowCount),
    };
    if (item.rowsOmitted) {
      row.rowsOmitted = true;
      row.omitReason = item.omitReason || null;
    }
    return row;
  });

  return {
    application: pickModelFields(models.Application, app.toJSON()),
    entitiesSection: {
      items: entities.map((r) => pickModelFields(models.BizdataEntity, r)),
      fields: fields.map((r) => pickModelFields(models.BizdataEntityField, r)),
      enums: enums.map((r) => pickModelFields(models.BizdataEnum, r)),
      relations: relations.map((r) => pickModelFields(models.BizdataRelation, r)),
      scopeDocs: scopeDocs.map((r) => pickModelFields(models.BizdataScopeDoc, r)),
      databaseConnections,
      connectionsHint,
      physicalTables,
    },
    apiServicesSection: {
      items: apiServices.map((r) => pickModelFields(models.BizdataApiService, r)),
      operations: apiServiceOperations.map((r) => pickModelFields(models.BizdataApiServiceOperation, r)),
      permissions: apiServicePermissions.map((r) => pickModelFields(models.BizdataApiServicePermission, r)),
    },
    collectionPipelinesSection: {
      items: pipelines.map((r) => pickModelFields(models.BizdataCollectionPipeline, r)),
      applications: pipelineApplications.map((r) => pickModelFields(models.BizdataCollectionPipelineApplication, r)),
    },
    outboundWebhooks: webhooks,
    metricsSection: {
      items: metrics.map((r) => pickModelFields(models.BizdataMetric, r)),
      cards: metricCards.map((r) => pickModelFields(models.BizdataMetricCard, r)),
    },
    hooks,
    hooksExcluded,
    skillsSection: {
      items: skills.map((r) => pickModelFields(models.Skill, r)),
      tools: tools.map((r) => pickModelFields(models.Tool, r)),
      scopes: aiScopes.map((r) => pickModelFields(models.Scope, r)),
      skillTools: skillToolRows.map((r) => pickModelFields(models.SkillTool, r)),
      applications: dedicatedLinks.map((r) => pickModelFields(models.SkillApplication, r)),
    },
    metadataSection,
    uacSection,
    storageBuckets,
    // 未携带文件时不导出对象记录：记录一旦落到目标库就会指向不存在的对象，
    // 图片/附件接口随即 404，而导入报告看不出任何异常（见 #20）。
    storageObjects: options.includeFiles ? storageObjects : [],
    storageFileEntries,
    entityDataItems,
    sourceApplicationId: app.application_id,
    warnings,
  };
}

function buildExportSummary(ctx, options) {
  const count = (arr) => (Array.isArray(arr) ? arr.length : 0);
  const largeEntities = ctx.entityDataItems
    .filter((item) => Number(item.rowCount) > LARGE_ROW_THRESHOLD)
    .map((item) => ({ entityCode: item.entityCode, rowCount: item.rowCount }));
  const totalRows = ctx.entityDataItems.reduce((sum, item) => sum + (Number(item.rowCount) || 0), 0);
  const summary = {
    applicationCode: ctx.application.code,
    dataMode: options.dataMode,
    includeUac: options.includeUac,
    includeFiles: options.includeFiles,
    safeMode: options.safeMode === true,
    counts: {
      entities: count(ctx.entitiesSection.items),
      entityFields: count(ctx.entitiesSection.fields),
      enums: count(ctx.entitiesSection.enums),
      relations: count(ctx.entitiesSection.relations),
      scopeDocs: count(ctx.entitiesSection.scopeDocs),
      databaseConnections: count(ctx.entitiesSection.databaseConnections),
      physicalTables: count(ctx.entitiesSection.physicalTables),
      apiServices: count(ctx.apiServicesSection.items),
      apiServiceOperations: count(ctx.apiServicesSection.operations),
      apiServicePermissions: count(ctx.apiServicesSection.permissions),
      collectionPipelines: count(ctx.collectionPipelinesSection.items),
      outboundWebhooks: count(ctx.outboundWebhooks),
      metrics: count(ctx.metricsSection.items),
      metricCards: count(ctx.metricsSection.cards),
      hooks: count(ctx.hooks),
      skills: count(ctx.skillsSection.items),
      tools: count(ctx.skillsSection.tools),
      aiScopes: count(ctx.skillsSection.scopes),
      metadataTables: count(ctx.metadataSection?.tables),
      metadataFields: count(ctx.metadataSection?.fields),
      storageBuckets: count(ctx.storageBuckets),
      storageObjects: count(ctx.storageObjects),
      uacUsers: count(ctx.uacSection.users),
      uacDepartments: count(ctx.uacSection.departments),
      uacRoles: count(ctx.uacSection.roles),
      uacPermissions: count(ctx.uacSection.permissions),
      entityDataEntities: ctx.entityDataItems.length,
      entityDataRows: totalRows,
    },
    entityDataSkipped: ctx.entityDataItems
      .filter((item) => item.rowsOmitted)
      .map((item) => ({ entityCode: item.entityCode, reason: item.omitReason })),
    hooksExcluded: ctx.hooksExcluded,
    largeEntities,
    secretsInPlaintext: true,
    warnings: ctx.warnings,
  };
  if (largeEntities.length) {
    summary.warnings.push(`以下实体行数超过 ${LARGE_ROW_THRESHOLD},导出/导入耗时可能较长: ${largeEntities.map((e) => e.entityCode).join(', ')}`);
  }
  // 行数据被跳过的实体必须显式告警:导入端只会拿到结构,目标表/数据为空,
  // 以前只写进 entityDataSkipped,前端不显眼,导致「导出成功但目标没数据」。
  const rowsSkipped = ctx.entityDataItems.filter((item) => item.rowsOmitted);
  if (rowsSkipped.length) {
    summary.warnings.push(
      `有 ${rowsSkipped.length} 个实体的行数据未导出(详见 entityDataSkipped):`
      + `导入后这些实体在目标端只有结构、没有数据。${rowsSkipped[0].omitReason || ''}`,
    );
  }
  return summary;
}

/** 大字符串切块,避免单个巨型 Buffer */
function* chunkString(text, size = 1024 * 1024) {
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(i, i + size);
  }
}

/**
 * 导出流:逐节产出合法 JSON 文本。
 * 元数据节一次性 stringify(体量小),行数据按页流式输出。
 */
async function* exportAppPayloadStream(ctx, options, summary) {
  const fileOptions = buildFileOptions(options, ctx.sourceApplicationId);

  const headJson = JSON.stringify({
    format: 'eadaf-app-export',
    formatVersion: 1,
    options: fileOptions,
    application: ctx.application,
    entities: ctx.entitiesSection,
    apiServices: ctx.apiServicesSection,
    collectionPipelines: ctx.collectionPipelinesSection,
    outboundWebhooks: ctx.outboundWebhooks,
    metrics: ctx.metricsSection,
    hooks: ctx.hooks,
    skills: ctx.skillsSection,
    metadata: ctx.metadataSection,
  });
  yield* chunkString(headJson.slice(0, -1));
  yield ',"uac":';
  yield* chunkString(JSON.stringify(ctx.uacSection));
  yield ',"storageBuckets":';
  yield* chunkString(JSON.stringify(ctx.storageBuckets));
  yield ',"storageObjects":';
  yield* chunkString(JSON.stringify(ctx.storageObjects || []));
  yield ',"entityData":[';

  let first = true;
  for (const item of ctx.entityDataItems) {
    const prefix = first ? '' : ',';
    first = false;
    const meta = {
      entityCode: item.entityCode,
      entityVersion: item.entityVersion,
    };
    if (item.connectionSourceId) meta.connectionSourceId = item.connectionSourceId;
    if (item.tableName) meta.tableName = item.tableName;
    if (item.targetSchema) meta.targetSchema = item.targetSchema;
    if (item.dbType) meta.dbType = item.dbType;
    if (item.rowsOmitted) {
      meta.rowsOmitted = true;
      meta.omitReason = item.omitReason;
      yield prefix + JSON.stringify(meta);
      continue;
    }
    meta.columns = item.columns;
    meta.rowCount = item.rowCount;
    yield `${prefix}${JSON.stringify(meta).slice(0, -1)},"rows":[`;
    let firstRow = true;
     
    for await (const row of iterateTableRows(item._runtime, item.targetSchema, item.tableName, item._orderColumn)) {
      yield `${firstRow ? '' : ','}${JSON.stringify(row)}`;
      firstRow = false;
    }
    yield ']}';
  }
  yield '],"exportSummary":';
  yield* chunkString(JSON.stringify(summary));
  yield '}';
}

async function prepareAppExport(applicationId, rawOptions = {}) {
  const app = await assertExportableApplication(applicationId);
  const options = normalizeOptions(rawOptions);
  const ctx = await buildExportContext(app, options);
  const summary = buildExportSummary(ctx, options);
  return { app, options, ctx, summary };
}

async function* exportAppStream(applicationId, rawOptions = {}) {
  const { ctx, options, summary } = await prepareAppExport(applicationId, rawOptions);
  yield* exportAppPayloadStream(ctx, options, summary);
}

function buildAppExportArchive(applicationId, rawOptions = {}) {
  return prepareAppExport(applicationId, rawOptions).then(async ({ app, options, ctx, summary }) => {
    const fileOptions = buildFileOptions(options, ctx.sourceApplicationId);
    const archive = await createTransferZipArchive({
      manifest: buildManifest({
        format: 'eadaf-app-export',
        options: fileOptions,
        summary,
        includeFiles: options.includeFiles,
      }),
      payloadStream: Readable.from(exportAppPayloadStream(ctx, options, summary)),
      fileEntries: options.includeFiles ? (ctx.storageFileEntries || []) : [],
    });
    return { app, options, archive, fileName: buildExportFileName(app.code) };
  });
}

/** 构造下载文件名:eadaf-app-export-{appCode}-{yyyyMMddHHmmss}.zip */
function buildExportFileName(appCode, date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `eadaf-app-export-${appCode}-${ts}.zip`;
}

module.exports = {
  assertExportableApplication,
  buildExportFileName,
  exportAppStream,
  buildAppExportArchive,
  prepareAppExport,
  normalizeOptions,
  buildFileOptions,
  pickModelFields,
  readTableColumns,
};
