import {
  getDatabaseConnections,
  getMaterializedTableRows,
  getMaterializedTableSchema,
  postDatabaseConnection,
  postMaterializedMockData,
} from '@/services/EADAF/api/businessData';
import { registerFunctionCall, unregisterFunctionCall } from '@eadaf/ai-base';
import { createMutatingHandler } from '@/ai/toolMutation';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';
import { resolveBizDataEntityId } from './bizdataFieldUtils';

const BIZDATA_MATERIALIZATION_SURFACE = 'bizdata.materialization.browse';
const BIZDATA_CONNECTIONS_SURFACE = 'bizdata.database.connections';

const TOOL_NAMES = [
  'bizdata_list_database_connections',
  'bizdata_create_database_connection',
  'bizdata_browse_materialized_schema',
  'bizdata_browse_materialized_rows',
  'bizdata_insert_mock_data',
] as const;

async function resolveMaterializationEntityId(args: Record<string, unknown>): Promise<string> {
  if (args.entityId) return String(args.entityId);
  if (args.entityCode) return resolveBizDataEntityId(args);
  throw new Error('须指定 entityId 或 entityCode');
}

export function registerMaterializationTools() {
  registerFunctionCall({
    name: 'bizdata_list_database_connections',
    description: '列出已配置的数据库连接（id、名称、dbType、host、port、databaseName、targetSchema）',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: createMutatingHandler({
      domain: 'bizdata',
      type: 'materialization.connection.listed',
      scope: BIZDATA_CONNECTIONS_SURFACE,
      buildPayload: (_args, data) => data,
      handler: async () => {
        const res = await getDatabaseConnections();
        const data = getApiData(res);
        if (!isApiSuccess(res) || !Array.isArray(data)) {
          throw new Error(getApiErrorMessage(res, '获取数据库连接列表失败'));
        }
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_create_database_connection',
    description:
      '创建数据库连接。dbType 仅小写 postgresql|mysql|mongodb|redis。失败时只修参重试本 Tool，禁止探枚举/Swagger/裸 HTTP。PostgreSQL/MySQL：databaseName+targetSchema；MongoDB：targetSchema=databaseName；Redis：DB 索引+Key 前缀，账号可选。注意：只登记 EADAF 连接元数据，不会在目标服务器 CREATE DATABASE；缺库时物化用 createTargetIfMissing',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '连接显示名称' },
        dbType: {
          type: 'string',
          enum: ['postgresql', 'mysql', 'mongodb', 'redis'],
          description: '数据库类型',
        },
        host: { type: 'string' },
        port: { type: 'integer' },
        username: { type: 'string', description: 'PG/MySQL/Mongo 必填；Redis 可选' },
        password: { type: 'string', description: 'PG/MySQL/Mongo 通常必填；Redis 可选' },
        databaseName: {
          type: 'string',
          description: 'PG/MySQL/Mongo 库名；Redis 为 "0"–"15"',
        },
        targetSchema: {
          type: 'string',
          description: 'PG schema；MySQL 物化目标库；Mongo 与 databaseName 相同；Redis Key 前缀',
        },
        isDefault: { type: 'boolean' },
      },
      required: ['name', 'dbType', 'host', 'databaseName'],
    },
    handler: createMutatingHandler({
      domain: 'bizdata',
      type: 'materialization.connection.created',
      scope: BIZDATA_CONNECTIONS_SURFACE,
      buildResourceId: (_args, data) => (data as API.DatabaseConnection)?.id,
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const dbType = String(args.dbType || '');
        if (!['postgresql', 'mysql', 'mongodb', 'redis'].includes(dbType)) {
          throw new Error('dbType 仅支持 postgresql、mysql、mongodb 或 redis');
        }
        const databaseName = String(args.databaseName ?? '');
        if (!databaseName) throw new Error('databaseName 为必填项');
        let targetSchema =
          args.targetSchema != null && String(args.targetSchema).trim()
            ? String(args.targetSchema).trim()
            : undefined;
        if (dbType === 'mongodb') {
          targetSchema = databaseName;
        } else if (!targetSchema) {
          targetSchema = 'bizdata_mat';
        }
        const body = {
          name: String(args.name || '').trim(),
          dbType: dbType as 'postgresql' | 'mysql' | 'mongodb' | 'redis',
          host: String(args.host || '').trim() || 'localhost',
          port: args.port != null ? Number(args.port) : undefined,
          username: args.username != null ? String(args.username) : undefined,
          password: args.password != null ? String(args.password) : undefined,
          databaseName,
          targetSchema,
          isDefault: Boolean(args.isDefault),
        };
        if (!body.name) throw new Error('name 为必填项');
        if (dbType !== 'redis' && !body.username) {
          throw new Error(`${dbType} 须提供 username`);
        }
        if (dbType !== 'redis' && !body.password) {
          throw new Error(`${dbType} 须提供 password`);
        }
        if (dbType === 'redis') {
          const idx = Number(databaseName);
          if (!Number.isInteger(idx) || idx < 0 || idx > 15) {
            throw new Error('Redis databaseName 须为 0–15 的数字索引');
          }
        }
        const res = await postDatabaseConnection(body);
        const data = getApiData(res);
        if (!isApiSuccess(res) || !data) {
          throw new Error(getApiErrorMessage(res, '创建数据库连接失败'));
        }
        return data as API.DatabaseConnection;
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_browse_materialized_schema',
    description: '读取已物化物理表的列定义（插入 MOCK 前必须先调用，rows 的 key 须与 columns.name 一致）',
    parameters: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        entityCode: { type: 'string', description: '如 production:Plan' },
        connectionId: { type: 'string' },
      },
      required: ['connectionId'],
    },
    handler: async (args) => {
      const entityId = await resolveMaterializationEntityId(args);
      const connectionId = String(args.connectionId || '');
      if (!connectionId) throw new Error('connectionId 为必填项');
      const res = await getMaterializedTableSchema(entityId, { connectionId });
      const data = getApiData(res);
      if (!data) throw new Error(getApiErrorMessage(res, '获取物化表结构失败'));
      return data;
    },
  });

  registerFunctionCall({
    name: 'bizdata_browse_materialized_rows',
    description: '分页读取已物化物理表数据（开发预览）',
    parameters: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        entityCode: { type: 'string' },
        connectionId: { type: 'string' },
        page: { type: 'integer' },
        pageSize: { type: 'integer' },
      },
      required: ['connectionId'],
    },
    handler: async (args) => {
      const entityId = await resolveMaterializationEntityId(args);
      const connectionId = String(args.connectionId || '');
      if (!connectionId) throw new Error('connectionId 为必填项');
      const res = await getMaterializedTableRows(entityId, {
        connectionId,
        page: Number(args.page) || 1,
        size: Number(args.pageSize || args.size) || 20,
      });
      const data = getApiData(res);
      if (!data) throw new Error(getApiErrorMessage(res, '获取物化表数据失败'));
      return data;
    },
  });

  registerFunctionCall({
    name: 'bizdata_insert_mock_data',
    description:
      '向已物化物理表插入 MOCK 测试数据；须先 bizdata_browse_materialized_schema，rows 列名须与物理表一致',
    parameters: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        entityCode: { type: 'string' },
        connectionId: { type: 'string' },
        rows: {
          type: 'array',
          items: { type: 'object' },
          description: '行对象数组，key 为物理表列名（columns.name）',
        },
        rowCount: { type: 'integer', description: '仅供参考，须传 rows' },
      },
      required: ['connectionId', 'rows'],
    },
    handler: createMutatingHandler({
      domain: 'bizdata',
      type: 'materialization.mock_data.inserted',
      scope: BIZDATA_MATERIALIZATION_SURFACE,
      buildResourceId: (args) => String(args.entityId || args.entityCode || ''),
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const entityId = await resolveMaterializationEntityId(args);
        const connectionId = String(args.connectionId || '');
        if (!connectionId) throw new Error('connectionId 为必填项');
        const rows = args.rows as Record<string, unknown>[] | undefined;
        if (!Array.isArray(rows) || !rows.length) {
          throw new Error('rows 不能为空');
        }
        const res = await postMaterializedMockData(
          entityId,
          { connectionId, rows },
          { connectionId },
        );
        const data = getApiData(res);
        if (!data) throw new Error(getApiErrorMessage(res, 'MOCK 数据插入失败'));
        return data;
      },
    }),
  });
}

export function unregisterMaterializationTools() {
  TOOL_NAMES.forEach((name) => unregisterFunctionCall(name));
}
