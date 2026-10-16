import {
  deleteBusinessDataRelation,
  getBusinessDataEntity,
  getBusinessDataEntities,
  getBusinessDataEntityExists,
  getBusinessDataEnumExists,
  getBusinessDataEnums,
  getBusinessDataRelations,
  getBusinessDataSchema,
  getBusinessDataScopeDoc,
  getBusinessDataScopeExists,
  patchBusinessDataEntity,
  patchBusinessDataEnum,
  postBusinessDataEntity,
  postBusinessDataEnum,
  postBusinessDataRelation,
  postEntityDeletionExecute,
  putBusinessDataEntityFields,
  putBusinessDataScopeDoc,
} from '@/services/EADAF/api/businessData';
import { registerFunctionCall, unregisterFunctionCall } from '@eadaf/ai-base';
import { createMutatingHandler } from '@/ai/toolMutation';
import { getApiData, getApiErrorMessage, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import {
  buildEnumFieldFixHint,
  ENUM_LIKE_FIELD_RE,
  loadEntity,
  loadEntityFields,
  mergeEntityFields,
  mergeEntityIndexes,
  normalizeBizDataField,
  normalizeBizDataIndex,
  readEntityIndexes,
  resolveBizDataEntityId,
} from './bizdataFieldUtils';
import {
  assertCodeRenameOnlyArgs,
  assertEntityCodeNotExists,
  executeEntityCodeRename,
} from './entityCodeRename';
import { normalizeEnumValuesItems } from '../utils/enumUtils';
import { buildRelationGraphQuery } from './relationGraphQuery';

const BIZDATA_DOMAIN = 'bizdata';
const BIZDATA_SURFACE = 'bizdata.model-designer';

async function buildEntityUpdateVerification(
  entityId: string,
  hint?: string,
): Promise<{ entity: API.BusinessDataEntity; _verification: Record<string, unknown> }> {
  const entity = await loadEntity(entityId);
  const verified = Boolean(entity?.id);
  return {
    entity,
    _verification: {
      verified,
      entityId: entity.id,
      code: entity.code,
      message: verified
        ? hint || `已验证实体「${entity.code}」已更新`
        : `更新校验失败：实体 ${entityId} 不存在或无法回读`,
    },
  };
}

const TOOL_NAMES = [
  'bizdata_list_entity_summaries',
  'bizdata_get_entity',
  'bizdata_entity',
  'bizdata_exists_entity',
  'bizdata_exists_enum',
  'bizdata_exists_scope',
  'bizdata_create_entity',
  'bizdata_update_entity',
  'bizdata_rename_entity_code',
  'bizdata_delete_entity',
  'bizdata_create_enum',
  'bizdata_update_enum',
  'bizdata_list_enums',
  'bizdata_list_relations',
  'bizdata_query_relation_graph',
  'bizdata_add_relation',
  'bizdata_delete_relation',
  'bizdata_upsert_entity_indexes',
  'bizdata_validate_model',
  'bizdata_get_scope_description',
  'bizdata_upsert_scope_description',
] as const;

type RelationInput = Record<string, unknown>;

const BIZDATA_FIELD_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    fieldKey: { type: 'string' },
    name: { type: 'string', description: '同 fieldKey' },
    label: { type: 'string' },
    type: {
      type: 'string',
      description:
        'varchar/int/uuid/decimal 等；status/state/*_type 等有限取值须用 adb-enum（配合 enumCode，先 bizdata_create_enum）',
    },
    enumCode: {
      type: 'string',
      description: '枚举 code（如 production:WorkOrderStatus）；type=adb-enum 时必填，禁止省略',
    },
    extendType: {
      type: 'string',
      description: '扩展类型；枚举可写 adb-enum（与 type=adb-enum 等价）',
    },
    enumConfig: {
      type: 'object',
      properties: {
        enumCode: { type: 'string' },
        isMultiple: { type: 'boolean' },
      },
    },
    length: { type: 'integer' },
    nullable: { type: 'boolean' },
    unique: { type: 'boolean' },
    primary: { type: 'boolean' },
    columnInfo: { type: 'object' },
    typeormConfig: { type: 'object' },
  },
} as const;

async function resetEntityModelValidated(entityId: string) {
  const entity = await loadEntity(entityId);
  if (entity.entityInfo?.modelValidated !== true) return;
  await patchBusinessDataEntity(entityId, {
    entityInfo: { ...(entity.entityInfo || {}), modelValidated: false },
  });
}

async function resolveRelationEntityIds(rel: RelationInput): Promise<{ fromEntityId: string; toEntityId: string }> {
  const fromEntityId = await resolveBizDataEntityId({
    entityId: rel.fromEntityId,
    entityCode: rel.fromEntityCode,
  });
  const toEntityId = await resolveBizDataEntityId({
    entityId: rel.toEntityId,
    entityCode: rel.toEntityCode,
  });
  return { fromEntityId, toEntityId };
}

/** manyToOne/oneToOne：from 侧外键字段候选（name / nameId / name_id / config.foreignKey） */
function findRelationFkFieldKey(
  fields: API.BusinessDataField[] | undefined,
  relationName: string,
  config?: Record<string, unknown>,
): string | null {
  const fieldKeys = new Set((fields || []).map((f) => f.fieldKey).filter(Boolean) as string[]);
  const configured =
    (typeof config?.foreignKey === 'string' && config.foreignKey) ||
    (typeof config?.joinColumn === 'string' && config.joinColumn) ||
    null;
  if (configured && fieldKeys.has(configured)) return configured;
  const name = String(relationName || '').trim();
  if (!name) return null;
  const candidates = [name, `${name}Id`, `${name}_id`, `${name}ID`];
  for (const key of candidates) {
    if (fieldKeys.has(key)) return key;
  }
  return null;
}

function enrichRelationRow(rel: API.BusinessDataRelation): API.BusinessDataRelation {
  const fromEntityCode = rel.fromEntityCode || rel.fromEntity?.code;
  const toEntityCode = rel.toEntityCode || rel.toEntity?.code;
  const directionSummary =
    rel.directionSummary ||
    (fromEntityCode && toEntityCode
      ? `${fromEntityCode} --${rel.type}--> ${toEntityCode} (name=${rel.name})`
      : undefined);
  return {
    ...rel,
    fromEntityCode,
    toEntityCode,
    directionSummary,
  };
}

async function createRelationFromInput(rel: RelationInput) {
  const { type, name, inverseName, joinTable, config } = rel;
  if (!type || !name) {
    throw new Error('关系缺少 type 或 name');
  }
  const hasFrom = rel.fromEntityId || rel.fromEntityCode;
  const hasTo = rel.toEntityId || rel.toEntityCode;
  if (!hasFrom || !hasTo) {
    throw new Error('关系须同时指定 fromEntityCode/toEntityCode（禁止只编造 UUID；推荐只用 code）');
  }
  const { fromEntityId, toEntityId } = await resolveRelationEntityIds(rel);
  const fromEntity = await loadEntity(fromEntityId);
  const toEntity = await loadEntity(toEntityId);
  const fromEntityCode = fromEntity.code;
  const toEntityCode = toEntity.code;
  const relType = String(type);
  const relName = String(name);
  const relConfig = (config as Record<string, unknown>) || undefined;

  if (relType === 'manyToOne' || relType === 'oneToOne') {
    const fkKey = findRelationFkFieldKey(fromEntity.fields, relName, relConfig);
    if (!fkKey) {
      throw new Error(
        `添加 ${relType} 关系前，源实体 ${fromEntityCode} 须先有对应外键字段` +
          `（候选：${relName} / ${relName}Id / ${relName}_id，或 config.foreignKey）。` +
          `请先 bizdata_update_entity 添加字段，再 bizdata_add_relation`,
      );
    }
  }

  const existingListRes = await getBusinessDataRelations({ entityId: fromEntityId });
  const existingList = (getApiData(existingListRes) ?? []).map(enrichRelationRow);
  const sameName = existingList.find(
    (r) => r.fromEntityId === fromEntityId && r.name === relName,
  );
  if (sameName) {
    throw new Error(
      `关系名 '${relName}' 已存在于实体 ${sameName.fromEntityCode || fromEntityCode}` +
        `（→ ${sameName.toEntityCode || sameName.toEntityId}，type=${sameName.type}）。` +
        `同一 from 实体内 name 须唯一；重名≠要加的边已存在，请核对 from/to 后换 name 或跳过`,
    );
  }
  const sameEdge = existingList.find(
    (r) =>
      r.fromEntityId === fromEntityId &&
      r.toEntityId === toEntityId &&
      r.type === relType,
  );
  if (sameEdge) {
    throw new Error(
      `关系已存在：${sameEdge.directionSummary || `${fromEntityCode} --${relType}--> ${toEntityCode}`}。` +
        `请勿用不同 name 重复添加同一条边`,
    );
  }

  const res = await postBusinessDataRelation({
    type: relType,
    name: relName,
    inverseName: inverseName ? String(inverseName) : undefined,
    fromEntityId,
    toEntityId,
    joinTable: joinTable ? String(joinTable) : undefined,
    config: relConfig,
  });
  const data = getApiData<API.BusinessDataRelation>(res);
  if (!data) throw new Error('创建关系失败');
  await resetEntityModelValidated(fromEntityId);
  await resetEntityModelValidated(toEntityId);

  const verifyRes = await getBusinessDataRelations({ entityId: fromEntityId });
  const verifiedList = (getApiData(verifyRes) ?? []).map(enrichRelationRow);
  const found = verifiedList.find(
    (r) =>
      r.id === data.id ||
      (r.fromEntityId === fromEntityId && r.toEntityId === toEntityId && r.name === relName),
  );
  const enriched = enrichRelationRow({
    ...data,
    fromEntityCode: data.fromEntityCode || fromEntityCode,
    toEntityCode: data.toEntityCode || toEntityCode,
    fromEntity: data.fromEntity || { id: fromEntityId, code: fromEntityCode, label: fromEntity.label },
    toEntity: data.toEntity || { id: toEntityId, code: toEntityCode, label: toEntity.label },
  });
  return {
    ...enriched,
    _verification: {
      verified: Boolean(found?.id),
      fromEntityCode,
      toEntityCode,
      name: relName,
      type: relType,
      relationId: found?.id || data.id,
      message: found?.id
        ? `已验证关系 ${enriched.directionSummary}`
        : `创建后回读失败：未在 ${fromEntityCode} 的关系列表中找到 name=${relName}`,
    },
  };
}

export function registerBizDataTools() {
  registerFunctionCall({
    name: 'bizdata_list_entity_summaries',
    description:
      '列出业务数据实体摘要（不含 fields，含 fieldCount）；浏览 Scope/子域、对照 API 覆盖率时的默认 Tool',
    parameters: {
      type: 'object',
      properties: {
        codePrefix: { type: 'string', description: '按 code 前缀过滤，如 fmms 或 fmms:logistics' },
        entityKind: { type: 'string', enum: ['er_table', 'json_schema'] },
        page: { type: 'integer', description: '页码，默认 1' },
        size: { type: 'integer', description: '每页条数，默认 500，最大 500' },
      },
    },
    handler: async (args) => {
      const res = await getBusinessDataEntities({
        codePrefix: args.codePrefix as string,
        entityKind: args.entityKind as string,
        page: (args.page as number) || 1,
        size: (args.size as number) || 500,
        summary: true,
      });
      const data = getApiData<API.BusinessDataEntityList>(res);
      if (data) return data;
      const { items, total, page, size } = parseApiListResponse(res);
      return { total, page, size, items };
    },
  });

  registerFunctionCall({
    name: 'bizdata_get_entity',
    description: '获取实体详情（含字段与 layout.indexes）；优先传 entityCode（如 equipment:Device）',
    parameters: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: '实体 UUID（须来自 list 响应，禁止编造）' },
        entityCode: { type: 'string', description: '实体 code，如 equipment:Device' },
      },
    },
    handler: async (args) => {
      const entityId = await resolveBizDataEntityId(args as Record<string, unknown>);
      const res = await getBusinessDataEntity(entityId);
      const data = getApiData<API.BusinessDataEntity>(res);
      if (!data) {
        throw new Error(getApiErrorMessage(res, '获取实体详情失败'));
      }
      return data;
    },
  });

  /**
   * MS4：资源级读收敛。优先使用本 Tool；旧 list/get 名保留为别名兼容。
   */
  registerFunctionCall({
    name: 'bizdata_entity',
    description:
      '业务实体资源读操作。action=list 列出摘要；action=get 取详情。' +
      '写操作仍用 bizdata_create_entity / update / delete / rename 等显式动词。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'get'], description: 'list=摘要列表；get=详情' },
        codePrefix: { type: 'string', description: 'list：按 code 前缀过滤' },
        entityKind: { type: 'string', enum: ['er_table', 'json_schema'] },
        page: { type: 'integer' },
        size: { type: 'integer' },
        entityId: { type: 'string', description: 'get：实体 UUID' },
        entityCode: { type: 'string', description: 'get：实体 code' },
      },
      required: ['action'],
    },
    handler: async (args) => {
      const action = String(args.action || '');
      if (action === 'list') {
        const res = await getBusinessDataEntities({
          codePrefix: args.codePrefix as string,
          entityKind: args.entityKind as string,
          page: (args.page as number) || 1,
          size: (args.size as number) || 500,
          summary: true,
        });
        const data = getApiData<API.BusinessDataEntityList>(res);
        if (data) return data;
        const { items, total, page, size } = parseApiListResponse(res);
        return { total, page, size, items };
      }
      if (action === 'get') {
        const entityId = await resolveBizDataEntityId(args as Record<string, unknown>);
        const res = await getBusinessDataEntity(entityId);
        const data = getApiData<API.BusinessDataEntity>(res);
        if (!data) {
          throw new Error(getApiErrorMessage(res, '获取实体详情失败'));
        }
        return data;
      }
      throw new Error(`非法 action=${action}，期望 list|get`);
    },
  });

  registerFunctionCall({
    name: 'bizdata_exists_entity',
    description:
      '按精确 code 判断实体是否已存在。AI 自动新建前必须先调用：exists=true 则改用 bizdata_update_entity / bizdata_rename_entity_code，禁止盲目 create',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '实体 code，如 sales:order:Order' },
      },
      required: ['code'],
    },
    handler: async (args) => {
      const res = await getBusinessDataEntityExists({ code: String(args.code || '').trim() });
      if (!isApiSuccess(res)) {
        throw new Error(getApiErrorMessage(res, '查询实体是否存在失败'));
      }
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'bizdata_exists_enum',
    description:
      '按精确 code 判断枚举是否已存在。AI 自动新建前必须先调用：exists=true 则改用 bizdata_update_enum，禁止盲目 create',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '枚举 code，如 production:WorkOrderStatus' },
      },
      required: ['code'],
    },
    handler: async (args) => {
      const res = await getBusinessDataEnumExists({ code: String(args.code || '').trim() });
      if (!isApiSuccess(res)) {
        throw new Error(getApiErrorMessage(res, '查询枚举是否存在失败'));
      }
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'bizdata_exists_scope',
    description:
      '判断 Scope（实体 code 前缀）下是否已有实体。新建域/子域前调用；Scope 由实体 code 推导，无独立 create_scope。exists=true 时附带 entityCount',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Scope code，如 sales 或 sales:order' },
      },
      required: ['code'],
    },
    handler: async (args) => {
      const res = await getBusinessDataScopeExists({ code: String(args.code || '').trim() });
      if (!isApiSuccess(res)) {
        throw new Error(getApiErrorMessage(res, '查询 Scope 是否存在失败'));
      }
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'bizdata_create_entity',
    description:
      '创建全新实体（code 须不存在）；新建前先 bizdata_exists_entity。可同时传 fields、indexes、relations。调整 Scope/重命名已有实体请用 bizdata_rename_entity_code，禁止 delete + create',
    requiresVerification: true,
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Scope:EntityName，如 sale:Customer' },
        label: { type: 'string' },
        entityKind: { type: 'string', enum: ['er_table', 'json_schema'] },
        tableName: { type: 'string' },
        fields: {
          type: 'array',
          description:
            '字段列表；status/state/*_type 等有限取值字段须 type=adb-enum 并指定 enumCode（先 bizdata_create_enum）',
          items: BIZDATA_FIELD_ITEM_SCHEMA,
        },
        indexes: {
          type: 'array',
          description: '可选，写入 layout.indexes；字段名须为已存在或同批 fields 中的 fieldKey',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '索引名，如 idx_customer_email' },
              fields: { type: 'array', items: { type: 'string' }, description: 'fieldKey 数组' },
              unique: { type: 'boolean' },
              type: { type: 'string', enum: ['btree', 'hash', 'gin', 'gist'] },
            },
            required: ['name', 'fields'],
          },
        },
        relations: {
          type: 'array',
          description:
            '可选，创建后建立的关系；用 fromEntityCode/toEntityCode（推荐）或 UUID；新建实体可用本实体的 code',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['oneToMany', 'manyToOne', 'oneToOne', 'manyToMany'],
              },
              name: { type: 'string' },
              inverseName: { type: 'string' },
              fromEntityCode: { type: 'string' },
              toEntityCode: { type: 'string' },
              fromEntityId: { type: 'string' },
              toEntityId: { type: 'string' },
              joinTable: { type: 'string', description: 'manyToMany 时可选中间表名' },
            },
            required: ['type', 'name'],
          },
        },
      },
      required: ['code', 'label'],
    },
    handler: createMutatingHandler({
      domain: BIZDATA_DOMAIN,
      type: 'entity.created',
      scope: BIZDATA_SURFACE,
      buildResourceId: (_args, data) => {
        const wrapped = data as { entity?: API.BusinessDataEntity };
        return wrapped?.entity?.id ?? (data as API.BusinessDataEntity)?.id;
      },
      handler: async (args) => {
        const code = String(args.code).trim();
        await assertEntityCodeNotExists(code);

        const res = await postBusinessDataEntity({
          code,
          label: String(args.label),
          entityKind: (args.entityKind as 'er_table' | 'json_schema') || 'er_table',
          tableName: args.tableName as string,
        });
        let entity = getApiData<API.BusinessDataEntity>(res);
        if (!entity?.id) throw new Error('创建实体失败');

        if (Array.isArray(args.fields) && args.fields.length) {
          const incoming = args.fields.map((field, index) =>
            normalizeBizDataField(field as Record<string, unknown>, index),
          );
          const fieldsRes = await putBusinessDataEntityFields(entity.id!, incoming);
          entity = getApiData<API.BusinessDataEntity>(fieldsRes) || entity;
        }

        if (Array.isArray(args.indexes) && args.indexes.length) {
          const incoming = args.indexes.map((idx, index) =>
            normalizeBizDataIndex(idx as Record<string, unknown>, index),
          );
          const patchRes = await patchBusinessDataEntity(entity.id!, {
            layout: { ...(entity.layout || {}), indexes: incoming },
          });
          entity = getApiData<API.BusinessDataEntity>(patchRes) || entity;
        }

        const createdRelations: API.BusinessDataRelation[] = [];
        if (Array.isArray(args.relations)) {
          for (const rel of args.relations) {
            const row = rel as RelationInput;
            const needsFrom = !row.fromEntityId && !row.fromEntityCode;
            const needsTo = !row.toEntityId && !row.toEntityCode;
            const patched: RelationInput = { ...row };
            if (needsFrom) patched.fromEntityCode = entity.code;
            if (needsTo) patched.toEntityCode = entity.code;
            createdRelations.push(await createRelationFromInput(patched));
          }
        }

        const finalEntity = await loadEntity(entity.id!);
        const expectedCode = String(args.code).trim();
        return {
          entity: finalEntity,
          relations: createdRelations,
          _verification: {
            verified: Boolean(finalEntity?.id && finalEntity.code === expectedCode),
            entityId: finalEntity.id,
            code: finalEntity.code,
            message:
              finalEntity?.code === expectedCode
                ? `已验证实体「${finalEntity.code}」已创建`
                : `创建校验失败：期望 code=${expectedCode}`,
          },
        };
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_rename_entity_code',
    description:
      '调整实体 Scope 层级或重命名 code（保留字段/索引/关系/物化/MOCK）。FMMS 按二级子 Scope 重建等批量改 Scope 必须用本 Tool；仅传 entityCode + code，禁止 delete + create',
    parameters: {
      type: 'object',
      properties: {
        entityCode: {
          type: 'string',
          description: '当前/旧实体 code，如 fmms:WorkCard',
        },
        code: {
          type: 'string',
          description: '新实体 code，如 fmms:production:WorkCard',
        },
        tableName: {
          type: 'string',
          description: '可选；ER 物理表名，不填且原为默认推导值时随 code 同步',
        },
      },
      required: ['entityCode', 'code'],
    },
    handler: createMutatingHandler({
      domain: BIZDATA_DOMAIN,
      type: 'entity.updated',
      scope: BIZDATA_SURFACE,
      buildResourceId: (_args, data) => (data as { entity?: API.BusinessDataEntity })?.entity?.id,
      buildPayload: (_args, data) => (data as { entity?: API.BusinessDataEntity })?.entity,
      handler: async (args) =>
        executeEntityCodeRename(
          String(args.entityCode),
          String(args.code),
          args.tableName as string | undefined,
        ),
    }),
  });

  registerFunctionCall({
    name: 'bizdata_update_entity',
    description:
      '更新实体 label/字段/layout/jsonSchema。改 Scope 或重命名 code 请优先用 bizdata_rename_entity_code；若用本 Tool 改 code 则仅传 entityCode + code（可选 tableName），勿传 fields 等',
    requiresVerification: true,
    parameters: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: '实体 UUID' },
        entityCode: {
          type: 'string',
          description: '定位用：当前/旧实体 code，如 fmms:WorkCard（与 entityId 二选一）',
        },
        code: {
          type: 'string',
          description: '新的实体 code，如 fmms:production:WorkCard；变更时级联更新引用',
        },
        label: { type: 'string' },
        tableName: {
          type: 'string',
          description: 'ER 表物理表名；不填且原为默认推导值时随 code 同步',
        },
        status: { type: 'string', enum: ['enabled', 'disabled', 'archived'] },
        replaceFields: { type: 'boolean', description: 'true=全量替换字段，false=与已有合并（默认）' },
        layout: {
          type: 'object',
          description:
            '实体 layout（与已有 merge；未传的 indexes 不会被清空）。索引请用 bizdata_upsert_entity_indexes，禁止用残缺 layout 整表替换 indexes',
        },
        indexes: {
          type: 'array',
          description: '可选；写入/合并 layout.indexes（等同 bizdata_upsert_entity_indexes）。优先用专用 Tool',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              fields: { type: 'array', items: { type: 'string' } },
              unique: { type: 'boolean' },
              type: { type: 'string', enum: ['btree', 'hash', 'gin', 'gist'] },
            },
            required: ['name', 'fields'],
          },
        },
        jsonSchema: { type: 'object', description: 'JSON Schema 结构（json_schema 实体）' },
        fields: {
          type: 'array',
          description:
            '字段列表；status/state/*_type 等有限取值字段须 type=adb-enum 并指定 enumCode（先 bizdata_create_enum）',
          items: BIZDATA_FIELD_ITEM_SCHEMA,
        },
      },
    },
    handler: createMutatingHandler({
      domain: BIZDATA_DOMAIN,
      type: 'entity.updated',
      scope: BIZDATA_SURFACE,
      buildResourceId: (_args, data) => (data as API.BusinessDataEntity)?.id,
      handler: async (args) => {
        const typedArgs = args as Record<string, unknown>;
        const hasCodeChange =
          args.code !== undefined && args.code !== null && String(args.code).trim().length > 0;

        if (hasCodeChange) {
          assertCodeRenameOnlyArgs(typedArgs);
          let oldCode = args.entityCode ? String(args.entityCode).trim() : '';
          if (!oldCode) {
            const entityId = await resolveBizDataEntityId(typedArgs);
            const entity = await loadEntity(entityId);
            oldCode = entity.code || '';
          }
          if (!oldCode) {
            throw new Error('修改 code 时须传 entityCode（当前/旧 code）或有效 entityId');
          }
          return executeEntityCodeRename(
            oldCode,
            String(args.code),
            args.tableName as string | undefined,
          );
        }

        const entityId = await resolveBizDataEntityId(typedArgs);
        const current = await loadEntity(entityId);
        const patchPayload: Record<string, unknown> = {};
        if (args.label) patchPayload.label = String(args.label);
        if (args.tableName !== undefined) {
          patchPayload.tableName = String(args.tableName).trim() || undefined;
        }
        if (args.status) patchPayload.status = String(args.status);
        if (args.jsonSchema !== undefined) patchPayload.jsonSchema = args.jsonSchema;

        const hasLayoutArg = args.layout !== undefined;
        const hasIndexesArg = Array.isArray(args.indexes);
        if (hasLayoutArg || hasIndexesArg) {
          const incomingLayout =
            hasLayoutArg && args.layout && typeof args.layout === 'object'
              ? { ...(args.layout as Record<string, unknown>) }
              : {};
          const { indexes: layoutIndexes, ...layoutRest } = incomingLayout;
          const mergedLayout: Record<string, unknown> = {
            ...(current.layout || {}),
            ...layoutRest,
          };
          const rawIndexes = hasIndexesArg
            ? args.indexes
            : layoutIndexes !== undefined
              ? layoutIndexes
              : undefined;
          if (rawIndexes !== undefined) {
            if (!Array.isArray(rawIndexes) || !rawIndexes.length) {
              throw new Error('indexes 不能为空数组；清空索引请用 bizdata_upsert_entity_indexes(replaceIndexes=true)');
            }
            const incoming = rawIndexes.map((idx, index) =>
              normalizeBizDataIndex(idx as Record<string, unknown>, index),
            );
            mergedLayout.indexes = mergeEntityIndexes(
              readEntityIndexes(current),
              incoming,
              false,
            );
          } else {
            mergedLayout.indexes = readEntityIndexes(current);
          }
          patchPayload.layout = mergedLayout;
        }

        if (Object.keys(patchPayload).length) {
          const patchRes = await patchBusinessDataEntity(entityId, patchPayload);
          if (!isApiSuccess(patchRes)) {
            throw new Error(getApiErrorMessage(patchRes, '更新实体失败'));
          }
        }

        if (Array.isArray(args.fields)) {
          const incoming = args.fields.map((field, index) =>
            normalizeBizDataField(field as Record<string, unknown>, index),
          );
          const existing = await loadEntityFields(entityId);
          const merged = mergeEntityFields(existing, incoming, args.replaceFields === true);
          const res = await putBusinessDataEntityFields(entityId, merged);
          const data = getApiData<API.BusinessDataEntity>(res);
          if (!data) throw new Error('更新实体字段失败');
          await resetEntityModelValidated(entityId);
          return buildEntityUpdateVerification(entityId, `已验证实体「${data.code}」字段已更新`);
        }

        if (hasLayoutArg || hasIndexesArg) {
          await resetEntityModelValidated(entityId);
        }
        return buildEntityUpdateVerification(entityId);
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_delete_entity',
    description:
      '事务化级联删除实体（含关联 API 服务/采集管道/指标/元数据目录；可选 DROP 物理表）。可传 deleteEntityIds 批量删除连通子图中选中的实体。禁止用于 Scope 调整或 code 重命名，请用 bizdata_rename_entity_code',
    parameters: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: '根实体 UUID（与 entityCode 二选一；未传 deleteEntityIds 时只删该实体）' },
        entityCode: { type: 'string', description: '实体 code，如 fmms:WorkCard（与 entityId 二选一）' },
        deleteEntityIds: {
          type: 'array',
          items: { type: 'string' },
          description: '待删除实体 UUID 列表（来自删除影响分析/用户确认；优先使用）',
        },
        dropPhysicalTables: {
          type: 'boolean',
          description: '是否 CASCADE DROP 所有物化连接上的物理表/集合，默认 false',
        },
      },
    },
    handler: createMutatingHandler({
      domain: BIZDATA_DOMAIN,
      type: 'entity.deleted',
      scope: BIZDATA_SURFACE,
      buildResourceId: (args, data) => {
        const ids = (data as { deleteEntityIds?: string[] })?.deleteEntityIds;
        if (Array.isArray(ids) && ids[0]) return String(ids[0]);
        return String(args.entityId || args.entityCode || ids?.[0] || '');
      },
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const dropPhysicalTables = !!args.dropPhysicalTables;
        let deleteEntityIds: string[] = Array.isArray(args.deleteEntityIds)
          ? (args.deleteEntityIds as unknown[]).map((id) => String(id)).filter(Boolean)
          : [];

        if (!deleteEntityIds.length) {
          const entityId = await resolveBizDataEntityId(args as Record<string, unknown>);
          deleteEntityIds = [entityId];
        }

        const primaryId = deleteEntityIds[0];
        const entity = await loadEntity(primaryId);
        const fieldCount = entity.fields?.length ?? 0;

        let result: API.EntityDeletionExecuteResult;
        try {
          const res = await postEntityDeletionExecute({
            deleteEntityIds,
            dropPhysicalTables,
          });
          const data = getApiData<API.EntityDeletionExecuteResult>(res);
          if (!isApiSuccess(res) || !data) {
            throw new Error(getApiErrorMessage(res, '删除实体失败'));
          }
          result = data;
        } catch (error) {
          throw new Error(getApiErrorMessage(error, '删除实体失败'));
        }

        for (const id of deleteEntityIds) {
          try {
            await loadEntity(id);
            throw new Error(`删除未生效：实体 ${id} 仍存在`);
          } catch (error) {
            if (error instanceof Error && error.message.startsWith('删除未生效')) {
              throw error;
            }
          }
        }

        return {
          success: true,
          deleteEntityIds: result.deleteEntityIds || deleteEntityIds,
          deletedEntityId: primaryId,
          deletedCode: entity.code,
          summary: result.summary,
          _verification: {
            verified: true,
            deletedCodes: (result.deletedEntities || []).map((e) => e.code).filter(Boolean),
            message: `已验证删除 ${result.summary?.deletedEntities ?? deleteEntityIds.length} 个实体`,
          },
          _warning:
            fieldCount > 0
              ? '该实体含字段/关系/物化数据，Scope 调整应使用 bizdata_rename_entity_code 而非 delete + create'
              : undefined,
        };
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_list_enums',
    description:
      '列出已定义的 ADB 枚举。检查选项是否完整时：优先看 items；若 items 为空而 values 有键，属数据不一致，须用 bizdata_update_enum 补齐 items（UI 以 items 计选项数）',
    parameters: {
      type: 'object',
      properties: {
        codePrefix: { type: 'string', description: '按 code 前缀过滤，如 production:' },
      },
    },
    handler: async (args) => {
      const res = await getBusinessDataEnums({ size: 200 });
      const { items } = parseApiListResponse<API.BusinessDataEnum>(res);
      const prefix = args.codePrefix ? String(args.codePrefix) : '';
      const filtered = prefix ? items.filter((item) => item.code?.startsWith(prefix)) : items;
      return filtered.map((item) => {
        const itemCount = Object.keys(item.items || {}).length;
        const valueCount = Object.keys(item.values || {}).length;
        return {
          ...item,
          optionCount: itemCount || valueCount,
          itemsEmpty: itemCount === 0 && valueCount > 0,
        };
      });
    },
  });

  registerFunctionCall({
    name: 'bizdata_create_enum',
    description:
      '创建 ADB 枚举定义；新建前先 bizdata_exists_enum（已存在则 bizdata_update_enum）。有限取值字段（status/state/type 等）须先建枚举，再在实体字段中用 type=adb-enum + enumCode 引用。推荐同时传 values 与 items；仅传 values 时服务端会自动补齐 items（UI 以 items 展示选项）',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '枚举 code，如 production:WorkOrderStatus' },
        label: { type: 'string' },
        values: {
          type: 'object',
          description: '键值映射，如 { "PENDING": "pending", "DONE": "done" }',
        },
        items: {
          type: 'object',
          description:
            '展示项（UI 选项列表来源），如 { "PENDING": { "label": "待处理", "sort": 1 } }；可与 values 同时传，缺省时由 values 自动生成',
        },
      },
      required: ['code', 'values'],
    },
    handler: createMutatingHandler({
      domain: BIZDATA_DOMAIN,
      type: 'enum.created',
      scope: BIZDATA_SURFACE,
      buildResourceId: (_args, data) => (data as { id?: string })?.id,
      handler: async (args) => {
        const normalized = normalizeEnumValuesItems(
          (args.values as Record<string, unknown>) || {},
          (args.items as Record<string, unknown>) || {},
        );
        const res = await postBusinessDataEnum({
          code: String(args.code),
          enumInfo: {
            code: args.code,
            label: args.label || args.code,
            ...(args.description ? { description: String(args.description) } : {}),
          },
          values: normalized.values as Record<string, string>,
          items: normalized.items as API.BusinessDataEnum['items'],
        });
        const data = getApiData(res);
        if (!data) throw new Error('创建枚举失败');
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_update_enum',
    description:
      '更新已有 ADB 枚举（label/values/items）；当 list 发现 items 为空但 values 有值时，须用本 Tool 补齐 items，否则枚举管理 UI 选项数为 0',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '枚举 UUID（与 code 二选一）' },
        code: { type: 'string', description: '枚举 code（与 id 二选一）' },
        label: { type: 'string' },
        description: { type: 'string' },
        values: {
          type: 'object',
          description: '键值映射；若 items 为空会自动按 values 补齐',
        },
        items: {
          type: 'object',
          description: '展示项；UI 以此为准。可只传 items 补齐空选项',
        },
      },
    },
    handler: createMutatingHandler({
      domain: BIZDATA_DOMAIN,
      type: 'enum.updated',
      scope: BIZDATA_SURFACE,
      buildResourceId: (_args, data) => (data as { id?: string })?.id,
      handler: async (args) => {
        const listRes = await getBusinessDataEnums({ size: 200 });
        const { items: enums } = parseApiListResponse<API.BusinessDataEnum>(listRes);
        const existing = args.id
          ? enums.find((item) => item.id === String(args.id))
          : args.code
            ? enums.find((item) => item.code === String(args.code))
            : undefined;
        if (!existing?.id) throw new Error('请提供已存在的枚举 id 或 code');

        const body: Partial<API.BusinessDataEnum> = {};
        if (args.label !== undefined || args.description !== undefined) {
          body.enumInfo = {
            ...(existing.enumInfo || {}),
            code: existing.code,
            label: String(args.label ?? existing.enumInfo?.label ?? existing.code),
            ...(args.description !== undefined
              ? { description: String(args.description) }
              : existing.enumInfo?.description
                ? { description: String(existing.enumInfo.description) }
                : {}),
          };
        }
        if (args.values !== undefined || args.items !== undefined) {
          const normalized = normalizeEnumValuesItems(
            (args.values as Record<string, unknown>) ??
              (existing.values as Record<string, unknown>) ??
              {},
            (args.items as Record<string, unknown>) ??
              (existing.items as Record<string, unknown>) ??
              {},
          );
          body.values = normalized.values as Record<string, string>;
          body.items = normalized.items as API.BusinessDataEnum['items'];
        }

        const res = await patchBusinessDataEnum(existing.id, body);
        const data = getApiData(res);
        if (!data) throw new Error('更新枚举失败');
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_list_relations',
    description:
      '列出实体关系（含 fromEntityCode/toEntityCode/directionSummary）；可传 entityCode 只看某实体相关边',
    parameters: {
      type: 'object',
      properties: {
        entityCode: {
          type: 'string',
          description: '按实体 code 过滤（from 或 to 命中），如 IPS:bom:BomSchemeNode',
        },
        entityId: { type: 'string', description: '按实体 UUID 过滤（不推荐，优先 entityCode）' },
      },
    },
    handler: async (args) => {
      const res = await getBusinessDataRelations({
        entityCode: args.entityCode ? String(args.entityCode) : undefined,
        entityId: args.entityId ? String(args.entityId) : undefined,
      });
      return (getApiData(res) ?? []).map(enrichRelationRow);
    },
  });

  registerFunctionCall({
    name: 'bizdata_query_relation_graph',
    description:
      '查询实体关系图谱（节点+边）；可传 scope（一级 Scope，与关系图谱页一致）或 codePrefix；用于总览缺口与 orphan 实体',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: '一级 Scope（code 第一段），如 IPS、fmms；不传则全库',
        },
        codePrefix: {
          type: 'string',
          description: '更细 code 前缀，如 IPS:bom；可与 scope 同时用（取交集）',
        },
      },
    },
    handler: async (args) => {
      const schemaRes = await getBusinessDataSchema();
      const schema = getApiData<API.BusinessDataSchema>(schemaRes);
      if (!schema) throw new Error('获取业务数据模型失败');
      const result = buildRelationGraphQuery(schema.entities || [], schema.relations || [], {
        scope: args.scope ? String(args.scope) : undefined,
        codePrefix: args.codePrefix ? String(args.codePrefix) : undefined,
      });
      if (
        result.scope &&
        result.availableScopes.length &&
        !result.availableScopes.includes(result.scope) &&
        result.nodeCount === 0
      ) {
        return {
          ...result,
          hint: `Scope「${result.scope}」下无实体；可用 availableScopes：${result.availableScopes.join(', ')}`,
        };
      }
      return result;
    },
  });

  registerFunctionCall({
    name: 'bizdata_add_relation',
    description:
      '添加实体关系；必须传 fromEntityCode/toEntityCode；manyToOne/oneToOne 前源实体须有外键字段；成功以 _verification.verified 为准',
    requiresVerification: true,
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['oneToMany', 'manyToOne', 'oneToOne', 'manyToMany'],
          description: 'oneToMany=一对多，manyToOne=多对一，oneToOne=一对一，manyToMany=多对多',
        },
        name: {
          type: 'string',
          description:
            '关系名（同一 from 实体内唯一）；推荐目标短名 camelCase（customer）或外键去 Id（materialId→material）',
        },
        inverseName: { type: 'string', description: '反向关系名（可选）' },
        fromEntityCode: {
          type: 'string',
          description: '源实体 code（必填推荐）；manyToOne 时为多方',
        },
        toEntityCode: {
          type: 'string',
          description: '目标实体 code（必填推荐）；manyToOne 时为一方',
        },
        fromEntityId: { type: 'string', description: '源实体 UUID（不推荐；须来自 list，禁止编造）' },
        toEntityId: { type: 'string', description: '目标实体 UUID（不推荐；须来自 list，禁止编造）' },
        joinTable: { type: 'string', description: 'manyToMany 中间表名（可选）' },
        config: {
          type: 'object',
          description: '可选；foreignKey 指定源实体外键 fieldKey',
        },
      },
      required: ['type', 'name', 'fromEntityCode', 'toEntityCode'],
    },
    handler: createMutatingHandler({
      domain: BIZDATA_DOMAIN,
      type: 'relation.created',
      scope: BIZDATA_SURFACE,
      buildResourceId: (_args, data) => (data as { id?: string })?.id,
      handler: async (args) => createRelationFromInput(args as RelationInput),
    }),
  });

  registerFunctionCall({
    name: 'bizdata_delete_relation',
    description: '删除实体关系',
    parameters: {
      type: 'object',
      properties: { relationId: { type: 'string' } },
      required: ['relationId'],
    },
    handler: createMutatingHandler({
      domain: BIZDATA_DOMAIN,
      type: 'relation.deleted',
      scope: BIZDATA_SURFACE,
      buildResourceId: (args) => String(args.relationId),
      buildPayload: () => ({ success: true }),
      handler: async (args) => {
        await deleteBusinessDataRelation(String(args.relationId));
        return { success: true, relationId: String(args.relationId) };
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_upsert_entity_indexes',
    description:
      '为实体创建或更新索引（写入 layout.indexes）；创建实体后应主动为主键、外键、唯一字段、常用查询字段建索引',
    parameters: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        entityCode: { type: 'string', description: '如 sale:Customer' },
        replaceIndexes: {
          type: 'boolean',
          description: 'true=全量替换索引，false=按 name 合并（默认）',
        },
        indexes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string', description: '如 idx_customer_email、pk_id' },
              fields: {
                type: 'array',
                items: { type: 'string' },
                description: 'fieldKey 数组，复合索引传多个',
              },
              unique: { type: 'boolean' },
              type: { type: 'string', enum: ['btree', 'hash', 'gin', 'gist'] },
            },
            required: ['name', 'fields'],
          },
        },
      },
      required: ['indexes'],
    },
    handler: createMutatingHandler({
      domain: BIZDATA_DOMAIN,
      type: 'entity.updated',
      scope: BIZDATA_SURFACE,
      buildResourceId: (_args, data) => (data as { entity?: API.BusinessDataEntity })?.entity?.id,
      buildPayload: (_args, data) => (data as { entity?: API.BusinessDataEntity })?.entity,
      handler: async (args) => {
        if (!Array.isArray(args.indexes) || !args.indexes.length) {
          throw new Error('indexes 不能为空');
        }
        const entityId = await resolveBizDataEntityId(args as Record<string, unknown>);
        const entity = await loadEntity(entityId);
        const incoming = args.indexes.map((idx, index) =>
          normalizeBizDataIndex(idx as Record<string, unknown>, index),
        );
        const existing = readEntityIndexes(entity);
        const merged = mergeEntityIndexes(existing, incoming, args.replaceIndexes === true);
        const fieldKeys = new Set((entity.fields || []).map((f) => f.fieldKey).filter(Boolean));
        for (const idx of merged) {
          const invalid = idx.fields.filter((k) => !fieldKeys.has(k));
          if (invalid.length) {
            throw new Error(
              `索引「${idx.name}」引用了不存在的字段: ${invalid.join(', ')}；请先 bizdata_update_entity 添加字段`,
            );
          }
        }
        const res = await patchBusinessDataEntity(entityId, {
          layout: { ...(entity.layout || {}), indexes: merged },
        });
        const data = getApiData<API.BusinessDataEntity>(res);
        if (!data) throw new Error('保存索引失败');
        await resetEntityModelValidated(entityId);
        return {
          entityId,
          indexes: readEntityIndexes(data),
          entity: await loadEntity(entityId),
        };
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_validate_model',
    description:
      '校验实体模型完整性；status/*_type 须为 adb-enum+enumCode；失败时按 errors 先 create_enum 再 update；默认 markValidated=true',
    requiresVerification: true,
    parameters: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        entityCode: { type: 'string', description: '如 production:WorkOrder' },
        markValidated: {
          type: 'boolean',
          description: '为 true 时根据校验结果更新「是否验证通过」，默认 true',
        },
      },
    },
    handler: createMutatingHandler({
      domain: BIZDATA_DOMAIN,
      type: 'entity.updated',
      scope: BIZDATA_SURFACE,
      buildResourceId: (_args, data) => (data as { entity?: API.BusinessDataEntity })?.entity?.id,
      buildPayload: (_args, data) => (data as { entity?: API.BusinessDataEntity })?.entity,
      handler: async (args) => {
        const schema = await getBusinessDataSchema();
        const data = getApiData<API.BusinessDataSchema>(schema);
        const relations = data?.relations || [];
        const markValidated = args.markValidated !== false;

        if (args.entityId || args.entityCode) {
          const entityId = await resolveBizDataEntityId(args as Record<string, unknown>);
          // 以 loadEntity 最新 layout.indexes 为准，避免 schema 列表缓存导致误报缺索引
          const entity = await loadEntity(entityId);
          if (!entity) return { isValid: false, errors: ['实体不存在'], entity: null };

          const errors: string[] = [];
          if (!entity.code?.includes(':')) errors.push('code 应包含 Scope 层级');
          if (entity.entityKind === 'er_table' && !(entity.fields?.length)) {
            errors.push('ER 实体建议至少有一个字段');
          }

          const fieldKeys = new Set((entity.fields || []).map((f) => f.fieldKey).filter(Boolean));
          const indexes = readEntityIndexes(entity);
          if (!indexes.length && (entity.fields?.length || 0) > 0) {
            const code = entity.code || String(args.entityCode || entityId);
            const pk =
              (entity.fields || []).find(
                (f) => f.typeormConfig?.primary === true || f.fieldKey === 'id',
              )?.fieldKey || 'id';
            errors.push(
              `建议为主键/外键/唯一/常用查询字段创建索引。请先调用 bizdata_upsert_entity_indexes({ entityCode: "${code}", indexes: [{ name: "pk_${pk}", fields: ["${pk}"], unique: true }] })，再重新 bizdata_validate_model；禁止同参重复校验`,
            );
          }
          indexes.forEach((idx) => {
            const invalid = (idx.fields || []).filter((k) => !fieldKeys.has(k));
            if (invalid.length) {
              errors.push(`索引「${idx.name}」引用了不存在的字段: ${invalid.join(', ')}`);
            }
          });

          (entity.fields || []).forEach((field) => {
            const key = field.fieldKey || '';
            const extendType = field.columnInfo?.extendType;
            const typeormType = String(field.typeormConfig?.type || '').toLowerCase();
            const isEnumField = extendType === 'adb-enum';
            if (ENUM_LIKE_FIELD_RE.test(key) && !isEnumField) {
              errors.push(
                `字段「${key}」疑似状态/类型字段，应使用 type=adb-enum 并关联 enumCode。${buildEnumFieldFixHint(key)}`,
              );
            }
            if (isEnumField && !field.columnInfo?.enumConfig?.enumCode) {
              errors.push(
                `枚举字段「${key}」缺少 enumConfig.enumCode。${buildEnumFieldFixHint(key)}`,
              );
            }
            if (isEnumField && typeormType && typeormType !== 'varchar') {
              errors.push(`枚举字段「${key}」的 typeorm type 应为 varchar`);
            }
          });

          const related = relations.filter(
            (r) => r.fromEntityId === entity.id || r.toEntityId === entity.id,
          );
          if (
            !related.length &&
            (entity.fields || []).some((f) => {
              const key = f.fieldKey || '';
              return key.endsWith('_id') || key === 'id';
            })
          ) {
            errors.push('存在疑似外键字段但未建立关系（bizdata_add_relation）');
          }

          const isValid = errors.length === 0;
          let resultEntity = entity;

          if (markValidated) {
            const patchRes = await patchBusinessDataEntity(entityId, {
              entityInfo: {
                ...(entity.entityInfo || {}),
                modelValidated: isValid,
              },
            });
            const patched = getApiData<API.BusinessDataEntity>(patchRes);
            if (patched) resultEntity = patched;
          }

          return {
            isValid,
            errors,
            entity: resultEntity,
            modelValidated: resultEntity.entityInfo?.modelValidated === true,
            indexCount: indexes.length,
            relationCount: related.length,
            _verification: {
              verified: isValid,
              entityId: resultEntity.id,
              code: resultEntity.code,
              message: isValid
                ? `已验证实体「${resultEntity.code}」模型校验通过`
                : `模型校验未通过：${errors.slice(0, 3).join('；')}`,
            },
          };
        }

        return {
          isValid: true,
          entityCount: data?.entities?.length || 0,
          relationCount: relations.length,
        };
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_get_scope_description',
    description:
      '读取 Scope 业务说明（Markdown）及祖先链有内容的说明；对某 Scope 建模前应先调用以获取领域知识',
    parameters: {
      type: 'object',
      properties: {
        scopeCode: {
          type: 'string',
          minLength: 1,
          description: 'Scope code，如 IPS 或 IPS:bom（与模型树节点一致）',
        },
      },
      required: ['scopeCode'],
    },
    handler: async (args) => {
      const scopeCode = String(args.scopeCode || '').trim();
      if (!scopeCode) throw new Error('scopeCode 不能为空');
      const res = await getBusinessDataScopeDoc({ code: scopeCode, includeAncestors: true });
      const data = getApiData<API.BusinessDataScopeDoc>(res);
      if (!isApiSuccess(res) || !data) {
        throw new Error(getApiErrorMessage(res, '获取 Scope 业务说明失败'));
      }
      return data;
    },
  });

  registerFunctionCall({
    name: 'bizdata_upsert_scope_description',
    description:
      '写入/更新 Scope 业务说明（领域知识、术语、规则与建模约定）；合并已有内容，禁止无故清空；空字符串会删除说明',
    requiresVerification: true,
    parameters: {
      type: 'object',
      properties: {
        scopeCode: {
          type: 'string',
          minLength: 1,
          description: 'Scope code，如 IPS 或 IPS:bom',
        },
        contentMarkdown: {
          type: 'string',
          description:
            '完整 Markdown 正文（应写入业务目标/术语/规则/实体职责划分；勿写字段 DDL）；传空字符串则删除',
        },
      },
      required: ['scopeCode', 'contentMarkdown'],
    },
    handler: createMutatingHandler({
      domain: BIZDATA_DOMAIN,
      type: 'scopeDoc.upserted',
      scope: BIZDATA_SURFACE,
      buildResourceId: (args) => String(args.scopeCode || ''),
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const scopeCode = String(args.scopeCode || '').trim();
        if (!scopeCode) throw new Error('scopeCode 不能为空');
        const contentMarkdown = args.contentMarkdown == null ? '' : String(args.contentMarkdown);
        const res = await putBusinessDataScopeDoc({ code: scopeCode, contentMarkdown });
        const data = getApiData<API.BusinessDataScopeDoc>(res);
        if (!isApiSuccess(res) || !data) {
          throw new Error(getApiErrorMessage(res, '保存 Scope 业务说明失败'));
        }
        const verified = data.code === scopeCode;
        return {
          ...data,
          _verification: {
            verified,
            scopeCode: data.code,
            hasContent: Boolean(data.hasContent),
            message: verified
              ? data.hasContent
                ? `已验证 Scope「${data.code}」业务说明已保存`
                : `已验证 Scope「${data.code}」业务说明已清空`
              : `保存校验失败：期望 code=${scopeCode}`,
          },
        };
      },
    }),
  });
}

export function unregisterBizDataTools() {
  TOOL_NAMES.forEach((name) => unregisterFunctionCall(name));
}
