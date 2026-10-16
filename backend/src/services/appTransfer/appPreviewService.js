/**
 * 应用导入预览服务(review 方案 §5「预览 P1 必做」)。
 *
 * 解析上传的导出文件(不写任何数据),对目标实例做:
 * - 节条数统计;业务键 + 第二唯一键冲突清单(api_services/collection_pipelines 的 route_path、tools 的 function_name);
 * - 连接匹配结果(databaseConnections/connectionsHint → 目标 database_connections;
 *   未匹配且目标有同类型凭证模板时标记 willCreate,导入时用目标凭证创建本地连接);
 * - 行数据可写性(pg/mysql 之外、未物化、连接不匹配且无法创建的实体);
 * - 缺失引用(关系端点、实体/指标引用、Webhook 绑定的 API 等);
 * - EADAF 拒绝、超 10 万行警告。
 */
const { Op } = require('sequelize');
const models = require('../../models');
const { prefixHit } = require('./scopePrefix');
const { openTransferPackage, cleanupUpload } = require('./transferZip');

const SUPPORTED_ROW_DB = ['postgresql', 'mysql'];

async function parseExportFile(filePath) {
  const payload = await openTransferPackage(filePath);
  if (payload?.format === 'eadaf-platform-export') {
    throw Object.assign(
      new Error('这是 EADAF 平台导出文件,请到「EADAF数据导出/导入」页导入'),
      { status: 400 },
    );
  }
  if (!payload || payload.format !== 'eadaf-app-export') {
    throw Object.assign(new Error('文件格式不正确,缺少 format: "eadaf-app-export" 标识'), { status: 400 });
  }
  if (Number(payload.formatVersion) !== 1) {
    throw Object.assign(new Error(`不支持的文件版本: ${payload.formatVersion}`), { status: 400 });
  }
  return payload;
}

function sectionCount(...arrs) {
  return arrs.reduce((sum, a) => sum + (Array.isArray(a) ? a.length : 0), 0);
}

function safeFileScopeCodes(file) {
  const codes = file?.application?.bizdata_scope_codes;
  return Array.isArray(codes) ? codes : [];
}

/**
 * 连接匹配(优先匹配;未命中时导入端可按目标凭证创建):
 * 1) is_default 且 db_type 相同;2) (db_type, target_schema) 相同;3) name 相同(低置信,仅提示)。
 */
function matchTargetConnection(hint, targetConnections) {
  const dbType = hint.dbType || null;
  const targetSchema = hint.targetSchema || null;
  let tier1 = targetConnections.find((c) => c.is_default && c.db_type === dbType);
  if (tier1) return { connection: tier1, confidence: 'default' };
  const tier2 = targetConnections.find((c) => c.db_type === dbType && c.target_schema === targetSchema);
  if (tier2) return { connection: tier2, confidence: 'schema' };
  const tier3 = targetConnections.find((c) => c.name === hint.name);
  if (tier3) return { connection: tier3, confidence: 'name' };
  return { connection: null, confidence: 'none' };
}

/** 目标是否存在可作凭证模板的同 db_type 连接(创建本地连接用,绝不使用源 host/密码) */
function findCredentialTemplate(hint, targetConnections) {
  const dbType = hint.dbType || null;
  if (!dbType) return null;
  return (
    targetConnections.find((c) => c.is_default && c.db_type === dbType)
    || targetConnections.find((c) => c.db_type === dbType)
    || null
  );
}

/**
 * 从导出文件读取连接提示:优先 databaseConnections,回退 connectionsHint(旧包)。
 * @returns {object[]}
 */
function getFileConnectionHints(file) {
  const entities = file?.entities || {};
  if (Array.isArray(entities.databaseConnections) && entities.databaseConnections.length) {
    return entities.databaseConnections;
  }
  if (Array.isArray(entities.connectionsHint)) {
    return entities.connectionsHint;
  }
  return [];
}

/**
 * 生成导入预览摘要(不写库)。
 * @param {string} filePath 上传的临时文件路径
 */
async function previewImportFile(filePath) {
  const file = await parseExportFile(filePath);
  const appCode = file?.application?.code;
  if (appCode === 'EADAF') {
    throw Object.assign(new Error('内置系统应用 EADAF 不允许导入'), { status: 400 });
  }
  if (!appCode) {
    throw Object.assign(new Error('文件缺少 application.code'), { status: 400 });
  }

  const options = file.options && typeof file.options === 'object' ? file.options : {};
  const warnings = [];
  if (options.secretsInPlaintext !== true) {
    warnings.push('文件头未声明 secretsInPlaintext,密文字段可能无法在目标实例解密(跨实例 ENCRYPTION_KEY 不同)');
  }
  if (file.application?.logo_url && file.options?.includeFiles !== true) {
    warnings.push('应用 Logo / 头像等对象存储文件未随包迁移(未勾选携带存储文件),导入后链接可能失效');
  }

  const entities = file.entities || {};
  const entityItems = Array.isArray(entities.items) ? entities.items : [];
  const entityCodeSet = new Set(entityItems.map((e) => e.code));
  const apiServices = file.apiServices || {};
  const apiItems = Array.isArray(apiServices.items) ? apiServices.items : [];
  const apiCodeSet = new Set(apiItems.map((s) => s.code));
  const pipelines = file.collectionPipelines || {};
  const pipelineItems = Array.isArray(pipelines.items) ? pipelines.items : [];
  const webhooks = Array.isArray(file.outboundWebhooks) ? file.outboundWebhooks : [];
  const metrics = file.metrics || {};
  const metricItems = Array.isArray(metrics.items) ? metrics.items : [];
  const metricCards = Array.isArray(metrics.cards) ? metrics.cards : [];
  const hooks = Array.isArray(file.hooks) ? file.hooks : [];
  const skills = file.skills || {};
  const skillItems = Array.isArray(skills.items) ? skills.items : [];
  const toolItems = Array.isArray(skills.tools) ? skills.tools : [];
  const ai = file.ai || {};
  const providerItems = Array.isArray(ai.providers) ? ai.providers : [];
  const aiModelItems = Array.isArray(ai.models) ? ai.models : [];
  const uac = file.uac || {};
  const buckets = Array.isArray(file.storageBuckets) ? file.storageBuckets : [];
  const storageObjects = Array.isArray(file.storageObjects) ? file.storageObjects : [];
  const entityData = Array.isArray(file.entityData) ? file.entityData : [];
  const metadata = file.metadata || {};
  const metadataTables = Array.isArray(metadata.tables) ? metadata.tables : [];
  const metadataFields = Array.isArray(metadata.fields) ? metadata.fields : [];

  if (options.includeAi || (ai.providers && ai.providers.length)) {
    warnings.push('文件含实例级 AI 目录或 includeAi,应用导入已不再处理该节,请到「EADAF数据导出/导入」页迁移平台能力');
  }

  const hints = getFileConnectionHints(file);
  const physicalTables = Array.isArray(entities.physicalTables)
    ? entities.physicalTables
    : (Array.isArray(entityData)
      ? entityData.map((item) => ({
        entityCode: item.entityCode,
        tableName: item.tableName || null,
        targetSchema: item.targetSchema || null,
        dbType: item.dbType || null,
        columnCount: Array.isArray(item.columns) ? item.columns.length : 0,
        rowCount: item.rowCount == null ? null : Number(item.rowCount),
        ...(item.rowsOmitted ? { rowsOmitted: true, omitReason: item.omitReason || null } : {}),
      }))
      : []);
  const [targetConnections, targetApp] = await Promise.all([
    models.BizdataDatabaseConnection.findAll({ raw: true }),
    models.Application.findOne({ where: { code: appCode }, raw: true }),
  ]);

  // ---- 冲突检测 ----
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
          row.code || row.slug || row.username || v,
          keyField,
          v,
          hit.code || hit.slug || hit.username || v,
          'business_key',
        );
      }
    }
  };

  // application 本体
  if (targetApp) {
    pushConflict('application', appCode, 'code', appCode, targetApp.code, 'business_key');
  }

  await checkUnique('entities', entityItems, 'code', models.BizdataEntity, 'code');
  await checkUnique('entities.enums', entities.enums || [], 'code', models.BizdataEnum, 'code');
  await checkUnique('entities.scopeDocs', entities.scopeDocs || [], 'code', models.BizdataScopeDoc, 'code');

  // api_services:code + route_path 第二唯一键
  await checkUnique('apiServices', apiItems, 'code', models.BizdataApiService, 'code');
  {
    const routePaths = [...new Set(apiItems.map((s) => s.route_path).filter(Boolean))];
    if (routePaths.length) {
      const exist = await models.BizdataApiService.findAll({
        where: { route_path: { [Op.in]: routePaths } },
        attributes: ['code', 'route_path'],
        raw: true,
      });
      const byPath = new Map(exist.map((r) => [r.route_path, r]));
      for (const s of apiItems) {
        const hit = s.route_path && byPath.get(s.route_path);
        if (hit && hit.code !== s.code) {
          pushConflict('apiServices', s.code, 'route_path', s.route_path, hit.code, 'second_key');
        }
      }
    }
  }

  // collection_pipelines:code + route_path
  await checkUnique('collectionPipelines', pipelineItems, 'code', models.BizdataCollectionPipeline, 'code');
  {
    const routePaths = [...new Set(pipelineItems.map((s) => s.route_path).filter(Boolean))];
    if (routePaths.length) {
      const exist = await models.BizdataCollectionPipeline.findAll({
        where: { route_path: { [Op.in]: routePaths } },
        attributes: ['code', 'route_path'],
        raw: true,
      });
      const byPath = new Map(exist.map((r) => [r.route_path, r]));
      for (const p of pipelineItems) {
        const hit = p.route_path && byPath.get(p.route_path);
        if (hit && hit.code !== p.code) {
          pushConflict('collectionPipelines', p.code, 'route_path', p.route_path, hit.code, 'second_key');
        }
      }
    }
  }

  await checkUnique('outboundWebhooks', webhooks, 'code', models.OutboundWebhook, 'code');
  await checkUnique('metrics', metricItems, 'code', models.BizdataMetric, 'code');
  await checkUnique('metrics.cards', metricCards, 'code', models.BizdataMetricCard, 'code');
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
  if (Array.isArray(ai.scopes)) {
    await checkUnique('skills.scopes', ai.scopes, 'slug', models.Scope, 'slug');
  }
  await checkUnique('storageBuckets', buckets, 'code', models.StorageBucket, 'code');
  await checkUnique('eadaf.roles', eadaf.roles || [], 'code', models.Role, 'code');
  await checkUnique('eadaf.permissions', eadaf.permissions || [], 'code', models.Permission, 'code');
  await checkUnique('eadaf.users', eadaf.users || [], 'username', models.User, 'username');

  // hooks:按 (name, event_type) 查重复,多条命中需人工改名
  const hookMultiMatch = [];
  if (hooks.length) {
    const names = [...new Set(hooks.map((h) => h.name).filter(Boolean))];
    const existHooks = names.length
      ? await models.AutomationHook.findAll({ where: { name: { [Op.in]: names } }, attributes: ['name', 'event_type'], raw: true })
      : [];
    for (const h of hooks) {
      const matched = existHooks.filter((e) => e.name === h.name && e.event_type === h.event_type);
      if (matched.length > 1) {
        hookMultiMatch.push({ name: h.name, eventType: h.event_type, matched: matched.length });
      }
    }
  }

  // ---- 连接匹配(未命中且有目标凭证模板 → willCreate) ----
  const connectionMatches = hints.map((hint) => {
    const { connection, confidence } = matchTargetConnection(hint, targetConnections);
    const template = connection ? null : findCredentialTemplate(hint, targetConnections);
    const willCreate = !connection && Boolean(template);
    return {
      sourceId: hint.sourceId,
      name: hint.name,
      dbType: hint.dbType,
      targetSchema: hint.targetSchema,
      isDefault: Boolean(hint.isDefault),
      host: hint.host || null,
      port: hint.port == null ? null : Number(hint.port),
      databaseName: hint.databaseName || null,
      username: hint.username || null,
      matched: Boolean(connection),
      willCreate,
      confidence: connection ? confidence : (willCreate ? 'will_create' : 'none'),
      targetId: connection ? connection.id : null,
      targetName: connection ? connection.name : null,
      createFromName: willCreate ? template.name : null,
    };
  });
  const connUsableBySourceId = new Map(
    connectionMatches.filter((m) => m.matched || m.willCreate).map((m) => [m.sourceId, m]),
  );

  // ---- 行数据可写性 ----
  const entityDataPreview = [];
  for (const item of entityData) {
    const entry = {
      entityCode: item.entityCode,
      dbType: item.dbType || null,
      rowCount: item.rowCount ?? null,
    };
    if (item.rowsOmitted) {
      entry.writable = false;
      entry.reason = item.omitReason || '导出时已跳过行数据';
    } else if (!SUPPORTED_ROW_DB.includes(item.dbType)) {
      entry.writable = false;
      entry.reason = `目标暂仅支持 postgresql/mysql 行数据写入,当前 ${item.dbType || '未知'}`;
    } else if (item.connectionSourceId && !connUsableBySourceId.has(item.connectionSourceId)) {
      entry.writable = false;
      entry.reason = '文件中的源连接在目标实例未匹配到,且无可用于创建本地连接的同类型凭证模板';
    } else {
      const targetEntity = await models.BizdataEntity.findOne({
        where: { code: item.entityCode },
        attributes: ['code', 'version'],
        raw: true,
      });
      if (!targetEntity) {
        if (options.dataMode === 'data_only') {
          entry.writable = false;
          entry.reason = '目标无同 code 实体,data_only 模式跳过写数';
        } else {
          entry.writable = true;
          entry.reason = '目标不存在,将随结构导入后创建';
        }
      } else if (Number(targetEntity.version) !== Number(item.entityVersion)) {
        entry.writable = false;
        entry.reason = `版本不一致:目标 v${targetEntity.version},文件 v${item.entityVersion}`;
      } else {
        entry.writable = true;
        entry.reason = 'ok';
      }
    }
    entityDataPreview.push(entry);
  }

  // ---- 缺失引用 ----
  const missingReferences = [];
  for (const rel of entities.relations || []) {
    for (const [field, label] of [['from_entity_id', 'from'], ['to_entity_id', 'to']]) {
      const code = entityItems.find((e) => e.id === rel[field])?.code;
      if (!code) missingReferences.push(`实体关系「${rel.name || rel.id}」${label} 端实体不在本次导出集合内,导入时将跳过该关系`);
    }
  }
  for (const s of apiItems) {
    if (s.entity_id && !entityItems.some((e) => e.id === s.entity_id)) {
      missingReferences.push(`API 服务「${s.code}」引用的实体不在本次导出集合内,导入后 entity_id 将为空`);
    }
  }
  for (const w of webhooks) {
    if (w.trigger_api_service_code && !apiCodeSet.has(w.trigger_api_service_code)) {
      missingReferences.push(`Webhook「${w.code}」绑定的 API 服务「${w.trigger_api_service_code}」不在本次导出集合内`);
    }
  }
  for (const c of metricCards) {
    if (!metricItems.some((m) => m.id === c.metric_id)) {
      missingReferences.push(`指标卡片「${c.code}」引用的指标不在本次导出集合内,导入时将跳过`);
    }
  }
  for (const item of entityData) {
    if (item.entityCode && !entityCodeSet.has(item.entityCode)) {
      missingReferences.push(`行数据实体「${item.entityCode}」不在 entities 节内,该条行数据将被跳过`);
    }
  }

  const largeEntities = entityData
    .filter((item) => Number(item.rowCount) > 100000)
    .map((item) => ({ entityCode: item.entityCode, rowCount: item.rowCount }));
  if (largeEntities.length) {
    warnings.push(`以下实体行数超过 10 万,导入耗时可能较长: ${largeEntities.map((e) => e.entityCode).join(', ')}`);
  }
  const unmatchedConns = connectionMatches.filter((m) => !m.matched && !m.willCreate);
  const willCreateConns = connectionMatches.filter((m) => m.willCreate);
  if (willCreateConns.length) {
    warnings.push(`有 ${willCreateConns.length} 条源连接未匹配,导入时将用目标同类型连接凭证创建本地连接(不使用源库 host/密码): ${willCreateConns.map((c) => c.name).join(', ')}`);
  }
  if (unmatchedConns.length) {
    warnings.push(`有 ${unmatchedConns.length} 条源连接无法匹配且目标无同类型凭证模板,关联实体行数据将失败(请先在「数据库连接」页建好本地连接): ${unmatchedConns.map((c) => c.name).join(', ')}`);
  }
  // scope 覆盖提示:文件应用配置的 bizdata_scope_codes
  const scopeCodes = safeFileScopeCodes(file);
  if (scopeCodes.length) {
    const orphanEntity = entityItems.find((e) => !prefixHit(e.code, scopeCodes));
    if (orphanEntity) warnings.push(`实体「${orphanEntity.code}」不在应用 bizdata_scope_codes 前缀内(文件来源异常,仍会按文件导入)`);
  }

  return {
    format: file.format,
    formatVersion: file.formatVersion,
    options,
    application: { code: appCode, name: file.application?.name || null },
    targetApplicationExists: Boolean(targetApp),
    sections: {
      entities: {
        items: entityItems.length,
        fields: sectionCount(entities.fields),
        enums: sectionCount(entities.enums),
        relations: sectionCount(entities.relations),
        scopeDocs: sectionCount(entities.scopeDocs),
        databaseConnections: hints.length,
        connectionsHint: hints.length,
        physicalTables: physicalTables.length,
      },
      apiServices: {
        items: apiItems.length,
        operations: sectionCount(apiServices.operations),
        permissions: sectionCount(apiServices.permissions),
      },
      collectionPipelines: {
        items: pipelineItems.length,
        applications: sectionCount(pipelines.applications),
      },
      outboundWebhooks: webhooks.length,
      metrics: { items: metricItems.length, cards: metricCards.length },
      hooks: hooks.length,
      skills: {
        items: skillItems.length,
        tools: toolItems.length,
        scopes: sectionCount(skills.scopes),
        skillTools: sectionCount(skills.skillTools),
        applications: sectionCount(skills.applications),
      },
      metadata: { tables: metadataTables.length, fields: metadataFields.length },
      uac: {
        users: sectionCount(eadaf.users),
        departments: sectionCount(eadaf.departments),
        roles: sectionCount(eadaf.roles),
        permissions: sectionCount(eadaf.permissions),
        userRoles: sectionCount(eadaf.userRoles),
        rolePermissions: sectionCount(eadaf.rolePermissions),
        dataPermissionRules: sectionCount(eadaf.dataPermissionRules),
      },
      storageBuckets: buckets.length,
      storageObjects: storageObjects.length,
      entityData: { items: entityData.length, totalRows: entityData.reduce((s, i) => s + (Number(i.rowCount) || 0), 0) },
    },
    conflicts,
    hookMultiMatch,
    connectionMatches,
    physicalTables,
    entityData: entityDataPreview,
    missingReferences,
    largeEntities,
    warnings,
  };
}

/** 导入主流程共用的文件解析与校验入口 */
async function loadAndValidateFile(filePath) {
  const file = await parseExportFile(filePath);
  if (file.application?.code === 'EADAF') {
    throw Object.assign(new Error('内置系统应用 EADAF 不允许导入'), { status: 400 });
  }
  if (!file.application?.code) {
    throw Object.assign(new Error('文件缺少 application.code'), { status: 400 });
  }
  return file;
}

function cleanupFile(filePath) {
  return cleanupUpload(filePath);
}

module.exports = {
  parseExportFile,
  previewImportFile,
  loadAndValidateFile,
  matchTargetConnection,
  findCredentialTemplate,
  getFileConnectionHints,
  cleanupFile,
  SUPPORTED_ROW_DB,
};
