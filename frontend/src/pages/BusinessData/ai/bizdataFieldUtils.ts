import { getBusinessDataEntities, getBusinessDataEntity } from '@/services/EADAF/api/businessData';
import { getApiData, parseApiListResponse } from '@/utils/apiResponse';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** status / *_status / state / *_state / type / *_type */
export const ENUM_LIKE_FIELD_RE = /(^status$|_status$|^state$|_state$|_type$|^type$)/i;

/** 判断是否为 PostgreSQL UUID（避免 AI 编造 id 导致后端 500） */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** 由 fieldKey 推导建议 enumCode 后缀，如 station_type → StationType */
export function suggestEnumNameFromFieldKey(fieldKey: string): string {
  return fieldKey
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/** 可执行的枚举字段修复提示（给 AI 下一步） */
export function buildEnumFieldFixHint(fieldKey: string, enumCodeHint?: string): string {
  const enumCode = enumCodeHint || `<Scope>:${suggestEnumNameFromFieldKey(fieldKey)}`;
  return (
    `修复：1) bizdata_list_enums 2) 无则 bizdata_create_enum(code="${enumCode}", values) ` +
    `3) update/create_entity 字段传 { "fieldKey": "${fieldKey}", "type": "adb-enum", "enumCode": "${enumCode}" } ` +
    `4) bizdata_validate_model。禁止只用 varchar，或只传 type=adb-enum 不传 enumCode，或只改 typeormConfig.type`
  );
}

/** 将 AI 常见字段写法规范化为 API 结构 */
export function normalizeBizDataField(raw: Record<string, unknown>, index = 0): API.BusinessDataField {
  const fieldKey = String(raw.fieldKey || raw.field_key || raw.name || raw.key || '').trim();
  if (!fieldKey) {
    throw new Error(`fields[${index}] 缺少 fieldKey/name`);
  }

  const columnInfo = { ...((raw.columnInfo || raw.column_info || {}) as Record<string, unknown>) };
  if (raw.label && columnInfo.label == null) {
    columnInfo.label = raw.label;
  }

  const rawTypeorm = (raw.typeormConfig || raw.typeorm_config || {}) as Record<string, unknown>;
  const typeormConfig: Record<string, unknown> = {
    ...rawTypeorm,
    type: rawTypeorm.type || raw.type || 'varchar',
  };
  if (raw.length != null && typeormConfig.length == null) {
    typeormConfig.length = raw.length;
  }
  if (raw.nullable != null && typeormConfig.nullable == null) {
    typeormConfig.nullable = raw.nullable;
  }
  if (raw.unique != null && typeormConfig.unique == null) {
    typeormConfig.unique = raw.unique;
  }
  if (raw.primary != null && typeormConfig.primary == null) {
    typeormConfig.primary = raw.primary;
  }
  if (typeormConfig.nullable === undefined) {
    typeormConfig.nullable = true;
  }

  const rawEnumConfig = (raw.enumConfig || raw.enum_config || {}) as Record<string, unknown>;
  const enumCode = String(
    raw.enumCode || raw.enum_code || rawEnumConfig.enumCode || rawEnumConfig.enum_code || '',
  ).trim();
  const isEnumField =
    raw.type === 'adb-enum' ||
    raw.extendType === 'adb-enum' ||
    columnInfo.extendType === 'adb-enum' ||
    !!enumCode;

  if (ENUM_LIKE_FIELD_RE.test(fieldKey) && !isEnumField) {
    throw new Error(
      `fields[${index}] 字段「${fieldKey}」疑似状态/类型字段，须使用 type=adb-enum 并关联 enumCode。${buildEnumFieldFixHint(fieldKey)}`,
    );
  }

  if (isEnumField) {
    columnInfo.extendType = 'adb-enum';
    columnInfo.enumConfig = {
      ...((columnInfo.enumConfig || {}) as Record<string, unknown>),
      ...rawEnumConfig,
      ...(enumCode ? { enumCode } : {}),
      isMultiple: Boolean(rawEnumConfig.isMultiple),
    };
    if (!enumCode) {
      throw new Error(
        `fields[${index}] 枚举字段「${fieldKey}」缺少 enumCode。${buildEnumFieldFixHint(fieldKey)}`,
      );
    }
    typeormConfig.type = 'varchar';
  }

  return {
    fieldKey,
    columnInfo,
    typeormConfig,
    sortOrder: (raw.sortOrder ?? raw.sort_order ?? index) as number,
  };
}

/** 默认合并已有字段，避免 AI 只传新增字段时覆盖清空 */
export function mergeEntityFields(
  existing: API.BusinessDataField[],
  incoming: API.BusinessDataField[],
  replace = false,
): API.BusinessDataField[] {
  if (replace) {
    return incoming.map((field, index) => ({
      ...field,
      sortOrder: field.sortOrder ?? index,
    }));
  }

  const map = new Map<string, API.BusinessDataField>();
  existing.forEach((field, index) => {
    if (field.fieldKey) {
      map.set(field.fieldKey, { ...field, sortOrder: field.sortOrder ?? index });
    }
  });

  incoming.forEach((field, index) => {
    if (!field.fieldKey) return;
    const prev = map.get(field.fieldKey);
    map.set(field.fieldKey, {
      ...prev,
      ...field,
      columnInfo: { ...prev?.columnInfo, ...field.columnInfo },
      typeormConfig: { ...prev?.typeormConfig, ...field.typeormConfig },
      sortOrder: field.sortOrder ?? prev?.sortOrder ?? map.size + index,
    });
  });

  return Array.from(map.values()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function resolveBizDataEntityId(args: Record<string, unknown>): Promise<string> {
  const entityCode = args.entityCode ? String(args.entityCode).trim() : '';

  async function findByCode(code: string): Promise<string> {
    const res = await getBusinessDataEntities({ codePrefix: code, size: 100 });
    const listData = getApiData<{ items?: API.BusinessDataEntity[] }>(res);
    const items = listData?.items ?? parseApiListResponse<API.BusinessDataEntity>(res).items;
    const entity = items.find((item) => item.code === code) || items[0];
    if (!entity?.id) {
      throw new Error(`找不到实体: ${code}`);
    }
    return entity.id;
  }

  if (entityCode) {
    return findByCode(entityCode);
  }

  if (args.entityId) {
    const raw = String(args.entityId).trim();
    if (isUuid(raw)) return raw;

    try {
      return await findByCode(raw);
    } catch {
      // AI 编造 id 如 entity-equipment-device → 尝试推导 equipment:Device
      if (raw.startsWith('entity-')) {
        const parts = raw.replace(/^entity-/, '').split('-');
        if (parts.length >= 2) {
          const scope = parts[0];
          const entityName = parts
            .slice(1)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');
          const guess = `${scope}:${entityName}`;
          try {
            return await findByCode(guess);
          } catch {
            // fall through
          }
        }
      }
      throw new Error(
        `无效的 entityId「${raw}」。请用 bizdata_list_entity_summaries 或 bizdata_get_entity 获取真实 UUID，或传 entityCode（如 equipment:Device）`,
      );
    }
  }

  throw new Error('缺少 entityId 或 entityCode');
}

export async function loadEntityFields(entityId: string): Promise<API.BusinessDataField[]> {
  const res = await getBusinessDataEntity(entityId);
  const entity = getApiData<API.BusinessDataEntity>(res);
  return entity?.fields || [];
}

function randomIndexId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 规范化为 layout.indexes 项 */
export function normalizeBizDataIndex(
  raw: Record<string, unknown>,
  index = 0,
): API.BusinessDataIndex {
  const name = String(raw.name || '').trim();
  if (!name) {
    throw new Error(`indexes[${index}] 缺少 name`);
  }
  const fieldsRaw = raw.fields;
  const fields = Array.isArray(fieldsRaw)
    ? fieldsRaw.map((f) => String(f).trim()).filter(Boolean)
    : [];
  if (!fields.length) {
    throw new Error(`indexes[${index}] 缺少 fields（字段 fieldKey 数组）`);
  }
  return {
    id: String(raw.id || randomIndexId()),
    name,
    fields,
    unique: Boolean(raw.unique),
    type: (raw.type as API.BusinessDataIndex['type']) || 'btree',
  };
}

export function readEntityIndexes(entity: API.BusinessDataEntity): API.BusinessDataIndex[] {
  const raw = entity.layout?.indexes;
  return Array.isArray(raw) ? raw : [];
}

/** 默认按 name 合并索引，replace=true 时全量替换 */
export function mergeEntityIndexes(
  existing: API.BusinessDataIndex[],
  incoming: API.BusinessDataIndex[],
  replace = false,
): API.BusinessDataIndex[] {
  if (replace) return incoming;
  const map = new Map<string, API.BusinessDataIndex>();
  existing.forEach((item) => {
    if (item.name) map.set(item.name, item);
  });
  incoming.forEach((item) => {
    const prev = map.get(item.name);
    map.set(item.name, {
      ...prev,
      ...item,
      id: item.id || prev?.id || randomIndexId(),
    });
  });
  return Array.from(map.values());
}

export async function loadEntity(entityId: string): Promise<API.BusinessDataEntity> {
  const res = await getBusinessDataEntity(entityId);
  const entity = getApiData<API.BusinessDataEntity>(res);
  if (!entity) {
    throw new Error('获取实体失败');
  }
  return entity;
}
