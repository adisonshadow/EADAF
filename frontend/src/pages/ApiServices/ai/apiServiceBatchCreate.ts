import { getBusinessDataEntity, getBusinessDataEntities } from '@/services/EADAF/api/businessData';
import {
  postApiService,
  postApiServicePublish,
} from '@/services/EADAF/api/apiServices';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
} from '@/utils/apiResponse';
import {
  API_SERVICE_OPERATION_SUFFIX,
  normalizeApiServiceCode,
  scopeCodeFromEntityCode,
  suggestApiServiceCodeFromEntity,
} from './apiServiceCodeUtils';
import { resolveApiServiceConnection } from './apiServiceConnectionResolve';
import { verifyApiServiceListed, verifyApiServicePublished } from './apiServiceVerify';
import { buildRequestParameterInterface } from './buildRequestParameterInterface';

export const DEFAULT_CRUD_OPERATIONS = ['find', 'create', 'updateOne', 'deleteOne'] as const;

const OPERATION_SUFFIX: Record<string, string> = API_SERVICE_OPERATION_SUFFIX;

const OPERATION_LABEL: Record<string, string> = {
  find: '列表查询',
  findOne: '单条查询',
  findById: '按 ID 查询',
  create: '创建',
  insertOne: '创建',
  updateOne: '更新',
  updateMany: '批量更新',
  deleteOne: '删除',
  deleteMany: '批量删除',
  count: '计数',
  aggregate: '聚合',
};

export interface BatchServiceDraft {
  code: string;
  name: string;
  definitionScript: string;
  enabledOperations: [string];
  entityId?: string;
  entityCode?: string;
}

export interface BatchCreateArgs {
  connectionId?: string;
  scopeCode?: string;
  entityCode?: string;
  entityCodes?: string[];
  entityId?: string;
  entityIds?: string[];
  operations?: string[];
  namePrefix?: string;
  tags?: string[];
  publish?: boolean;
  services?: Array<{
    code?: string;
    name?: string;
    definitionScript?: string;
    operation?: string;
    enabledOperations?: string[];
  }>;
}

export interface BatchCreateResult {
  created: API.ApiService[];
  skipped: Array<{ code?: string; operation?: string; reason: string }>;
  failed: Array<{ code?: string; operation?: string; error: string }>;
  publishFailed?: Array<{ code?: string; error: string }>;
  connectionId: string;
  connectionName?: string;
  targetSchema?: string;
  total: number;
  successCount: number;
  skippedCount: number;
  publishRequested?: boolean;
  publishedCount?: number;
  _verification?: {
    verified: boolean;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    publishFailedCount?: number;
    publishedCount?: number;
    message?: string;
  };
}

function isDuplicateError(message: string): boolean {
  return /已存在|409|duplicate|exists/i.test(message);
}

async function resolveEntityByCode(entityCode: string): Promise<API.BusinessDataEntity | undefined> {
  const res = await getBusinessDataEntities({ codePrefix: entityCode, size: 200 });
  const data = getApiData<{ items?: API.BusinessDataEntity[] }>(res);
  const items = data?.items || [];
  return items.find((item) => item.code === entityCode) || items[0];
}

async function resolveEntity(args: BatchCreateArgs): Promise<API.BusinessDataEntity | undefined> {
  if (args.entityId) {
    const res = await getBusinessDataEntity(String(args.entityId));
    return getApiData<API.BusinessDataEntity>(res) || undefined;
  }
  const entityIds = args.entityIds?.filter(Boolean) || [];
  if (entityIds.length) {
    const res = await getBusinessDataEntity(entityIds[0]);
    return getApiData<API.BusinessDataEntity>(res) || undefined;
  }
  const entityCode =
    args.entityCode?.trim() ||
    args.entityCodes?.[0]?.trim() ||
    undefined;
  if (!entityCode) return undefined;
  return resolveEntityByCode(entityCode);
}

async function resolveEntitiesForBatch(args: BatchCreateArgs): Promise<API.BusinessDataEntity[]> {
  if (Array.isArray(args.services) && args.services.length) {
    const entity = await resolveEntity(args);
    return entity ? [entity] : [];
  }

  const codes = [
    ...(args.entityCode?.trim() ? [args.entityCode.trim()] : []),
    ...(args.entityCodes?.map((c) => c.trim()).filter(Boolean) || []),
  ];
  const uniqueCodes = [...new Set(codes)];

  if (uniqueCodes.length > 1) {
    const entities: API.BusinessDataEntity[] = [];
    for (const code of uniqueCodes) {
      const entity = await resolveEntityByCode(code);
      if (entity) entities.push(entity);
    }
    return entities;
  }

  const entity = await resolveEntity(args);
  return entity ? [entity] : [];
}

function operationSuffix(operation: string): string {
  return OPERATION_SUFFIX[operation] || operation.charAt(0).toUpperCase() + operation.slice(1);
}

export function buildDefaultSql(
  tableName: string,
  targetSchema: string,
  operation: string,
  dbType: string = 'postgresql',
): string {
  const isMysql = dbType === 'mysql';
  const qualified = isMysql
    ? `\`${targetSchema}\`.\`${tableName}\``
    : `"${targetSchema}"."${tableName}"`;
  switch (operation) {
    case 'find':
      return `SELECT *\nFROM ${qualified}\nWHERE 1 = 1\n-- 业务字段等值过滤由网关 filter / 顶层参数自动施加（勿在注释中写 :param）\nORDER BY id DESC\n-- 分页由网关施加 limit/skip，勿在 SQL 内写 LIMIT/OFFSET`;
    case 'findOne':
    case 'findById':
      return `SELECT *\nFROM ${qualified}\nWHERE id = :id\nLIMIT 1`;
    case 'create':
    case 'insertOne':
      return `-- create 操作：Gateway 将基于请求体生成 INSERT\n-- 以下为结构参考\nSELECT *\nFROM ${qualified}\nWHERE 1 = 0`;
    case 'updateOne':
      return isMysql
        ? `UPDATE ${qualified}\nSET updated_at = NOW()\n--  SET col = value（写操作字段来自 body/set，勿在注释中写 :param）\nWHERE id = :id`
        : `UPDATE ${qualified}\nSET updated_at = NOW()\n--  SET col = value（写操作字段来自 body/set，勿在注释中写 :param）\nWHERE id = :id\nRETURNING *`;
    case 'deleteOne':
      return isMysql
        ? `DELETE FROM ${qualified}\nWHERE id = :id`
        : `DELETE FROM ${qualified}\nWHERE id = :id\nRETURNING id`;
    case 'count':
      return `SELECT COUNT(*) AS total\nFROM ${qualified}\nWHERE 1 = 1`;
    case 'aggregate':
      return `SELECT COUNT(*) AS total\nFROM ${qualified}\nWHERE 1 = 1\n-- aggregate 可扩展 GROUP BY`;
    default:
      return `SELECT *\nFROM ${qualified}\nLIMIT 100`;
  }
}

function requireTargetSchema(targetSchema: string | undefined, context: string): string {
  const schema = targetSchema?.trim();
  if (!schema) {
    throw new Error(
      `${context}：无法得到 targetSchema（已尝试该实体物化记录及同域已物化实体，禁止回落到系统默认 bizdata_mat）。请先对该域执行物化（bizdata_execute_materialization），或调用 apiservice_resolve_connection。`,
    );
  }
  return schema;
}

export function buildCrudServiceDrafts(
  entity: API.BusinessDataEntity,
  operations: string[],
  options?: { namePrefix?: string; targetSchema?: string; dbType?: string },
): BatchServiceDraft[] {
  const tableName = entity.tableName || entity.code?.split(':').pop() || 'Entity';
  const targetSchema = requireTargetSchema(options?.targetSchema, `实体 ${entity.code || entity.id}`);
  const label = options?.namePrefix || entity.label || entity.code || 'API';
  const dbType = options?.dbType || 'postgresql';

  return operations.map((operation) => {
    const suffix = operationSuffix(operation);
    const code = suggestApiServiceCodeFromEntity(String(entity.code || ''), suffix);
    const opLabel = OPERATION_LABEL[operation] || operation;
    return {
      code,
      name: `${label} - ${opLabel}`,
      definitionScript: buildDefaultSql(tableName, targetSchema, operation, dbType),
      enabledOperations: [operation],
      entityId: entity.id,
      entityCode: entity.code,
    };
  });
}

export function normalizeBatchDrafts(
  args: BatchCreateArgs,
  entities: API.BusinessDataEntity[],
  targetSchema?: string,
  dbType: string = 'postgresql',
): BatchServiceDraft[] {
  if (Array.isArray(args.services) && args.services.length) {
    const entity = entities[0];
    return args.services.map((item) => {
      const operation =
        item.operation ||
        (Array.isArray(item.enabledOperations) ? item.enabledOperations[0] : 'find');
      const entityCode = entity?.code || args.entityCode;
      const code = normalizeApiServiceCode(item.code, {
        entityCode: entityCode ? suggestApiServiceCodeFromEntity(entityCode, operationSuffix(operation)) : undefined,
        scopeCode: args.scopeCode,
        fallbackName: item.name,
      });
      const schema = requireTargetSchema(
        targetSchema,
        `批量创建 ${code || operation}`,
      );
      const tableName = entity?.tableName || entity?.code?.split(':').pop() || 'Entity';
      return {
        code,
        name: item.name || code,
        definitionScript:
          item.definitionScript || buildDefaultSql(tableName, schema, operation, dbType),
        enabledOperations: [operation],
        entityId: entity?.id,
        entityCode: entity?.code,
      };
    });
  }

  if (!entities.length) {
    throw new Error('批量创建需要 entityCode/entityId 或显式 services 列表');
  }

  const operations =
    args.operations?.length ? args.operations : [...DEFAULT_CRUD_OPERATIONS];

  return entities.flatMap((entity) =>
    buildCrudServiceDrafts(entity, operations, {
      namePrefix: args.namePrefix,
      targetSchema,
      dbType,
    }),
  );
}

export async function executeBatchCreateServices(args: BatchCreateArgs): Promise<BatchCreateResult> {
  const entities = await resolveEntitiesForBatch(args);
  const entityCodes = [
    ...(args.entityCode ? [args.entityCode] : []),
    ...(args.entityCodes || []),
    ...(entities.map((e) => e.code).filter(Boolean) as string[]),
  ];

  const derivedScope =
    args.scopeCode?.trim() ||
    entityCodes.map((code) => scopeCodeFromEntityCode(code)).find(Boolean);

  const resolved = await resolveApiServiceConnection({
    connectionId: args.connectionId,
    scopeCode: derivedScope,
    entityCodes: entityCodes.length ? entityCodes : undefined,
    entityIds: [
      ...(args.entityId ? [String(args.entityId)] : []),
      ...(args.entityIds || []),
      ...(entities.map((e) => e.id).filter(Boolean) as string[]),
    ],
  });

  const targetSchema = requireTargetSchema(
    resolved.targetSchema,
    `连接推断（${resolved.reason}）`,
  );
  const drafts = normalizeBatchDrafts(args, entities, targetSchema, resolved.dbType || 'postgresql');
  const created: API.ApiService[] = [];
  const skipped: BatchCreateResult['skipped'] = [];
  const failed: BatchCreateResult['failed'] = [];
  const publishFailed: NonNullable<BatchCreateResult['publishFailed']> = [];

  for (const draft of drafts) {
    try {
      const entityForIface =
        entities.find((e) => e.id === draft.entityId || e.code === draft.entityCode) || entities[0];
      const requestParameterInterface = buildRequestParameterInterface(
        draft.enabledOperations[0],
        entityForIface?.fields || [],
      );
      const createRes = await postApiService({
        code: draft.code,
        name: draft.name,
        tags: args.tags,
        connectionId: resolved.connectionId,
        entityId: draft.entityId,
        targetSchema,
        definitionScript: draft.definitionScript,
        enabledOperations: draft.enabledOperations,
        requestParameterInterface: requestParameterInterface || undefined,
      });

      if (!isApiSuccess(createRes)) {
        const errMsg = getApiErrorMessage(createRes, '创建失败');
        if (isDuplicateError(errMsg)) {
          skipped.push({
            code: draft.code,
            operation: draft.enabledOperations[0],
            reason: errMsg,
          });
        } else {
          failed.push({
            code: draft.code,
            operation: draft.enabledOperations[0],
            error: errMsg,
          });
        }
        continue;
      }

      let service = getApiData<API.ApiService>(createRes);
      if (!service?.id && createRes && typeof createRes === 'object' && 'id' in createRes) {
        service = createRes as unknown as API.ApiService;
      }

      if (!service?.id) {
        try {
          const listed = await verifyApiServiceListed(draft.code);
          service = {
            id: listed.id,
            code: listed.code,
            name: listed.name,
            status: listed.status,
          } as API.ApiService;
        } catch {
          // fall through to failed
        }
      }

      if (!service?.id) {
        failed.push({
          code: draft.code,
          operation: draft.enabledOperations[0],
          error: getApiErrorMessage(createRes, '创建成功但未返回服务 ID'),
        });
        continue;
      }

      if (args.publish === true) {
        try {
          const pubRes = await postApiServicePublish(service.id, { skipErrorHandler: true });
          const published = getApiData<API.ApiService>(pubRes);
          if (!published?.id) {
            publishFailed.push({
              code: draft.code,
              error: '发布接口未返回服务',
            });
            service = { ...service, status: service.status || 'draft' };
          } else {
            const verified = await verifyApiServicePublished(published.id, draft.code);
            const nextStatus = verified.status;
            const normalizedStatus: API.ApiService['status'] =
              nextStatus === 'published' || nextStatus === 'disabled' || nextStatus === 'draft'
                ? nextStatus
                : 'published';
            service = { ...published, status: normalizedStatus };
          }
        } catch (pubErr) {
          publishFailed.push({
            code: draft.code,
            error: getApiErrorMessage(pubErr, pubErr instanceof Error ? pubErr.message : '发布失败'),
          });
        }
      }
      if (service?.id) {
        created.push(service);
      }
    } catch (error) {
      const errMsg = getApiErrorMessage(error, error instanceof Error ? error.message : String(error));
      if (isDuplicateError(errMsg)) {
        skipped.push({
          code: draft.code,
          operation: draft.enabledOperations[0],
          reason: errMsg,
        });
      } else {
        failed.push({
          code: draft.code,
          operation: draft.enabledOperations[0],
          error: errMsg,
        });
      }
    }
  }

  const publishRequested = args.publish === true;
  const publishedCount = publishRequested
    ? created.filter((item) => item.status === 'published').length
    : 0;
  const allPublished = !publishRequested || (publishFailed.length === 0 && publishedCount === created.length);

  return {
    created,
    skipped,
    failed,
    publishFailed,
    connectionId: resolved.connectionId,
    connectionName: resolved.connectionName,
    targetSchema,
    total: drafts.length,
    successCount: created.length,
    skippedCount: skipped.length,
    publishRequested,
    publishedCount,
    _verification: {
      verified: failed.length === 0 && created.length > 0 && allPublished,
      successCount: created.length,
      failedCount: failed.length,
      skippedCount: skipped.length,
      publishFailedCount: publishFailed.length,
      publishedCount,
      message:
        failed.length > 0
          ? `批量创建有 ${failed.length} 项失败`
          : publishFailed.length > 0
            ? `批量发布有 ${publishFailed.length} 项失败`
            : publishRequested && publishedCount < created.length
              ? `仅 ${publishedCount}/${created.length} 项 status=published`
              : created.length === 0
                ? '未创建任何 API 服务'
                : publishRequested
                  ? `已创建并发布 ${publishedCount} 个服务`
                  : `已创建 ${created.length} 个 draft 服务（未发布）`,
    },
  };
}
