import {
  deleteBizdataDataStandard,
  getBizdataDataStandards,
  getBizdataMetadataByTarget,
  getBizdataMetadataTable,
  getBizdataMetadataTables,
  postBizdataDataStandard,
  postBizdataMetadataField,
  postBizdataMetadataSyncFromSchema,
  postBizdataMetadataTable,
  putBizdataDataStandard,
  putBizdataMetadataTable,
  putBizdataMetadataTableFields,
} from '@/services/EADAF/api/businessData';
import { registerFunctionCall, unregisterFunctionCall } from '@eadaf/ai-base';
import { createMutatingHandler } from '@/ai/toolMutation';
import { getApiData, getApiErrorMessage, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import {
  assertApiData,
  resolveMetadataTableByIdOrCode,
  resolveMetadataTableId,
  resolveMetadataTarget,
  resolveStandardId,
} from './metadataToolUtils';

const METADATA_DOMAIN = 'bizdata';
const DATA_STANDARDS_SURFACE = 'bizdata.data-standards';
const METADATA_CATALOG_SURFACE = 'bizdata.metadata-catalog';

const TOOL_NAMES = [
  'bizdata_list_data_standards',
  'bizdata_create_data_standard',
  'bizdata_update_data_standard',
  'bizdata_delete_data_standard',
  'bizdata_list_metadata_tables',
  'bizdata_get_metadata_table',
  'bizdata_get_metadata_by_target',
  'bizdata_upsert_metadata_table',
  'bizdata_update_metadata_table',
  'bizdata_upsert_metadata_field',
  'bizdata_update_metadata_fields',
  'bizdata_sync_metadata_from_schema',
] as const;

async function mapFieldsWithStandard(
  fields: API.BizdataMetadataField[],
  args: Record<string, unknown>,
): Promise<API.BizdataMetadataField[]> {
  const defaultStandardId = await resolveStandardId(args);
  return Promise.all(
    fields.map(async (field) => ({
      ...field,
      standardId: field.standardId ?? (await resolveStandardId(field as Record<string, unknown>)) ?? defaultStandardId,
    })),
  );
}

export function registerMetadataTools() {
  registerFunctionCall({
    name: 'bizdata_list_data_standards',
    description: '列出数据标准',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string' },
        status: { type: 'string', enum: ['enabled', 'disabled'] },
        page: { type: 'integer' },
        size: { type: 'integer' },
      },
    },
    handler: async (args) =>
      assertApiData(
        await getBizdataDataStandards({
          keyword: args.keyword as string,
          status: args.status as string,
          page: (args.page as number) || 1,
          size: (args.size as number) || 50,
        }),
        '获取数据标准列表失败',
      ),
  });

  registerFunctionCall({
    name: 'bizdata_create_data_standard',
    description: '创建数据标准',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        code: { type: 'string' },
        version: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', enum: ['enabled', 'disabled'] },
      },
      required: ['name', 'code', 'version'],
    },
    handler: createMutatingHandler({
      domain: METADATA_DOMAIN,
      type: 'data_standard.created',
      scope: DATA_STANDARDS_SURFACE,
      buildResourceId: (_args, data) => (data as API.BizdataDataStandard)?.id,
      handler: async (args) =>
        assertApiData<API.BizdataDataStandard>(
          await postBizdataDataStandard({
            name: String(args.name),
            code: String(args.code),
            version: String(args.version),
            description: args.description as string,
            status: (args.status as API.BizdataDataStandard['status']) || 'enabled',
          }),
          '创建数据标准失败',
        ),
    }),
  });

  registerFunctionCall({
    name: 'bizdata_update_data_standard',
    description: '更新数据标准',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        code: { type: 'string' },
        version: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', enum: ['enabled', 'disabled'] },
      },
      required: ['id'],
    },
    handler: createMutatingHandler({
      domain: METADATA_DOMAIN,
      type: 'data_standard.updated',
      scope: DATA_STANDARDS_SURFACE,
      buildResourceId: (args) => String(args.id),
      handler: async (args) =>
        assertApiData<API.BizdataDataStandard>(
          await putBizdataDataStandard(String(args.id), {
            name: args.name as string,
            code: args.code as string,
            version: args.version as string,
            description: args.description as string,
            status: args.status as API.BizdataDataStandard['status'],
          }),
          '更新数据标准失败',
        ),
    }),
  });

  registerFunctionCall({
    name: 'bizdata_delete_data_standard',
    description: '删除数据标准',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    handler: createMutatingHandler({
      domain: METADATA_DOMAIN,
      type: 'data_standard.deleted',
      scope: DATA_STANDARDS_SURFACE,
      buildResourceId: (args) => String(args.id),
      buildPayload: () => ({ success: true }),
      handler: async (args) => {
        const res = await deleteBizdataDataStandard(String(args.id));
        if (!isApiSuccess(res)) {
          throw new Error(getApiErrorMessage(res, '删除数据标准失败'));
        }
        return { success: true, id: String(args.id) };
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_list_metadata_tables',
    description: '列出逻辑元数据表',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string' },
        targetType: { type: 'string', enum: ['entity', 'metric', 'enum'] },
        page: { type: 'integer' },
        size: { type: 'integer' },
      },
    },
    handler: async (args) =>
      assertApiData(
        await getBizdataMetadataTables({
          keyword: args.keyword as string,
          targetType: args.targetType as string,
          page: (args.page as number) || 1,
          size: (args.size as number) || 50,
        }),
        '获取元数据表列表失败',
      ),
  });

  registerFunctionCall({
    name: 'bizdata_get_metadata_table',
    description: '获取元数据表详情（含字段）；优先传 code（如 equipment:Device），勿编造 id',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '元数据表 UUID（须来自 list 响应）' },
        code: { type: 'string', description: '逻辑编码，如 equipment:Device' },
        entityCode: { type: 'string', description: '同 code，实体场景' },
      },
    },
    handler: async (args) => {
      const key = String(args.id ?? args.code ?? args.entityCode ?? '').trim();
      if (!key) {
        throw new Error('缺少 id 或 code/entityCode');
      }
      const tableId = await resolveMetadataTableByIdOrCode(key);
      return assertApiData(
        await getBizdataMetadataTable(tableId),
        '获取元数据表详情失败',
      );
    },
  });

  registerFunctionCall({
    name: 'bizdata_get_metadata_by_target',
    description: '按 entity/metric/enum 获取元数据（可用 entityCode 代替 targetId）',
    parameters: {
      type: 'object',
      properties: {
        targetType: { type: 'string', enum: ['entity', 'metric', 'enum'] },
        targetId: { type: 'string' },
        entityCode: { type: 'string', description: '实体 code，如 equipment:Device' },
        metricCode: { type: 'string' },
        fieldKey: { type: 'string' },
      },
      required: ['targetType'],
    },
    handler: async (args) => {
      const target = await resolveMetadataTarget(args);
      const res = await getBizdataMetadataByTarget({
        targetType: target.targetType,
        targetId: target.targetId,
        fieldKey: args.fieldKey as string | undefined,
      });
      if (!isApiSuccess(res)) {
        throw new Error(getApiErrorMessage(res, '获取元数据失败'));
      }
      return getApiData(res) ?? { table: null, field: null, target };
    },
  });

  registerFunctionCall({
    name: 'bizdata_upsert_metadata_table',
    description: '按 entityCode 或 targetId 保存逻辑元数据表',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '逻辑编码，如 equipment:Device' },
        entityCode: { type: 'string' },
        targetType: { type: 'string', enum: ['entity', 'metric', 'enum'] },
        targetId: { type: 'string' },
        metadataCode: { type: 'string' },
        standardId: { type: 'string' },
        standardCode: { type: 'string' },
        standardVersion: { type: 'string' },
        businessMeaning: { type: 'string' },
        status: { type: 'string', enum: ['enabled', 'disabled'] },
      },
      required: ['targetType'],
    },
    handler: createMutatingHandler({
      domain: METADATA_DOMAIN,
      type: 'metadata.table.upserted',
      scope: METADATA_CATALOG_SURFACE,
      buildResourceId: (_args, data) => (data as API.BizdataMetadataTable)?.id,
      handler: async (args) => {
        const target = await resolveMetadataTarget(args);
        const standardId = await resolveStandardId(args);
        return assertApiData<API.BizdataMetadataTable>(
          await postBizdataMetadataTable({
            code: target.code,
            targetType: target.targetType,
            targetId: target.targetId,
            metadataCode: args.metadataCode as string,
            standardId: standardId ?? null,
            businessMeaning: args.businessMeaning as string,
            status: (args.status as API.BizdataMetadataTable['status']) || 'enabled',
          }),
          '保存元数据表失败',
        );
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_update_metadata_table',
    description: '更新元数据表',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        metadataCode: { type: 'string' },
        standardId: { type: 'string' },
        standardCode: { type: 'string' },
        standardVersion: { type: 'string' },
        businessMeaning: { type: 'string' },
        status: { type: 'string', enum: ['enabled', 'disabled'] },
      },
      required: ['id'],
    },
    handler: createMutatingHandler({
      domain: METADATA_DOMAIN,
      type: 'metadata.table.updated',
      scope: METADATA_CATALOG_SURFACE,
      buildResourceId: (args) => String(args.id),
      handler: async (args) => {
        const standardId = await resolveStandardId(args);
        return assertApiData<API.BizdataMetadataTable>(
          await putBizdataMetadataTable(String(args.id), {
            metadataCode: args.metadataCode as string,
            standardId: standardId ?? (args.standardId as string | null),
            businessMeaning: args.businessMeaning as string,
            status: args.status as API.BizdataMetadataTable['status'],
          }),
          '更新元数据表失败',
        );
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_upsert_metadata_field',
    description: '保存单条字段元数据（可用 entityCode + 自动解析 metadataTableId）',
    parameters: {
      type: 'object',
      properties: {
        metadataTableId: { type: 'string' },
        entityCode: { type: 'string' },
        targetType: { type: 'string', enum: ['entity', 'metric', 'enum'] },
        targetId: { type: 'string' },
        fieldKey: { type: 'string' },
        metadataCode: { type: 'string' },
        standardId: { type: 'string' },
        standardCode: { type: 'string' },
        standardVersion: { type: 'string' },
        businessMeaning: { type: 'string' },
        sensitivityLevel: { type: 'string' },
        alias: { type: 'string' },
        dataType: { type: 'string' },
        enumCode: { type: 'string' },
      },
      required: ['fieldKey'],
    },
    handler: createMutatingHandler({
      domain: METADATA_DOMAIN,
      type: 'metadata.field.upserted',
      scope: METADATA_CATALOG_SURFACE,
      buildResourceId: (_args, data) => (data as API.BizdataMetadataField)?.id,
      handler: async (args) => {
        const tableId = await resolveMetadataTableId(args);
        const standardId = await resolveStandardId(args);
        return assertApiData<API.BizdataMetadataField>(
          await postBizdataMetadataField(tableId, {
            fieldKey: String(args.fieldKey),
            metadataCode: args.metadataCode as string,
            standardId: standardId ?? null,
            businessMeaning: args.businessMeaning as string,
            sensitivityLevel: args.sensitivityLevel as string,
            alias: args.alias as string,
            dataType: args.dataType as string,
            enumCode: args.enumCode as string,
          }),
          '保存元数据字段失败',
        );
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_update_metadata_fields',
    description: '批量更新元数据字段（可用 entityCode 定位表）',
    parameters: {
      type: 'object',
      properties: {
        metadataTableId: { type: 'string' },
        entityCode: { type: 'string' },
        targetType: { type: 'string', enum: ['entity', 'metric', 'enum'] },
        targetId: { type: 'string' },
        standardCode: { type: 'string' },
        standardVersion: { type: 'string' },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fieldKey: { type: 'string' },
              metadataCode: { type: 'string' },
              standardId: { type: 'string' },
              standardCode: { type: 'string' },
              businessMeaning: { type: 'string' },
              sensitivityLevel: { type: 'string' },
              alias: { type: 'string' },
              dataType: { type: 'string' },
              enumCode: { type: 'string' },
            },
          },
        },
      },
      required: ['fields'],
    },
    handler: createMutatingHandler({
      domain: METADATA_DOMAIN,
      type: 'metadata.fields.updated',
      scope: METADATA_CATALOG_SURFACE,
      buildResourceId: (args) => String(args.metadataTableId || args.entityCode || ''),
      handler: async (args) => {
        const tableId = await resolveMetadataTableId(args);
        const fields = await mapFieldsWithStandard(
          (args.fields as API.BizdataMetadataField[]) || [],
          args,
        );
        return assertApiData<API.BizdataMetadataField[]>(
          await putBizdataMetadataTableFields(tableId, fields),
          '批量更新元数据字段失败',
        );
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_sync_metadata_from_schema',
    description: '从数据模型同步元数据骨架',
    parameters: { type: 'object', properties: {} },
    handler: createMutatingHandler({
      domain: METADATA_DOMAIN,
      type: 'metadata.synced',
      scope: METADATA_CATALOG_SURFACE,
      handler: async () =>
        assertApiData<Record<string, number>>(
          await postBizdataMetadataSyncFromSchema(),
          '同步元数据骨架失败',
        ),
    }),
  });
}

export function unregisterMetadataTools() {
  TOOL_NAMES.forEach((name) => unregisterFunctionCall(name));
}
