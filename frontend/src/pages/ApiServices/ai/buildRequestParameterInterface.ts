import { getBusinessDataEntity, getBusinessDataEntities } from '@/services/EADAF/api/businessData';
import { getApiData, parseApiListResponse } from '@/utils/apiResponse';

const SKIP_BODY_KEYS = new Set([
  'id',
  'created_at',
  'updated_at',
  'createdAt',
  'updatedAt',
  'deleted_at',
  'deletedAt',
]);

function fieldTsType(field: API.BusinessDataField): string {
  const columnInfo = (field.columnInfo || {}) as Record<string, unknown>;
  const typeorm = (field.typeormConfig || {}) as Record<string, unknown>;
  const extendType = String(columnInfo.extendType || columnInfo.extend_type || '').toLowerCase();
  const rawType = String(columnInfo.type || typeorm.type || 'varchar').toLowerCase();

  if (extendType === 'adb-media') return 'string'; // storage objectId
  if (extendType.includes('guid') || extendType.includes('uuid') || rawType.includes('uuid')) {
    return 'string';
  }
  if (['int', 'integer', 'bigint', 'smallint', 'numeric', 'decimal', 'float', 'double', 'real', 'number'].some((t) =>
    rawType.includes(t),
  )) {
    return 'number';
  }
  if (rawType.includes('bool')) return 'boolean';
  if (rawType.includes('json')) return 'Record<string, unknown>';
  if (rawType.includes('[]') || rawType === 'array') return 'string[]';
  return 'string';
}

function fieldRequired(field: API.BusinessDataField): boolean {
  const columnInfo = (field.columnInfo || {}) as Record<string, unknown>;
  const typeorm = (field.typeormConfig || {}) as Record<string, unknown>;
  if (columnInfo.nullable === false || typeorm.nullable === false) return true;
  if (columnInfo.nullable === true || typeorm.nullable === true) return false;
  return false;
}

function fieldComment(field: API.BusinessDataField): string | undefined {
  const columnInfo = (field.columnInfo || {}) as Record<string, unknown>;
  const label = columnInfo.label != null ? String(columnInfo.label) : '';
  const extendType = String(columnInfo.extendType || '').toLowerCase();
  const parts: string[] = [];
  if (label) parts.push(label);
  if (extendType === 'adb-media') parts.push('须为 storage objectId（UUID）');
  return parts.length ? parts.join('；') : undefined;
}

function fieldEnumCode(field: API.BusinessDataField): string | undefined {
  const columnInfo = (field.columnInfo || {}) as Record<string, unknown>;
  const extendType = String(columnInfo.extendType || '').toLowerCase();
  if (extendType !== 'adb-enum') return undefined;
  const enumCode = (columnInfo.enumConfig as { enumCode?: string } | undefined)?.enumCode;
  return enumCode ? String(enumCode).trim() : undefined;
}

function toEnumTypeAlias(fieldKey: string, enumCode: string): string {
  const fromCode = String(enumCode).split(':').pop() || '';
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(fromCode)) {
    return /Type$/i.test(fromCode) ? fromCode : `${fromCode}Type`;
  }
  const pascal = String(fieldKey)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `${pascal || 'Enum'}Type`;
}

/** enumCode → type 别名（同一枚举复用同一别名） */
function collectEnumTypeAliases(fields: API.BusinessDataField[]): Map<string, string> {
  const byCode = new Map<string, string>();
  const usedNames = new Set<string>();
  fields.forEach((field) => {
    const key = String(field.fieldKey || '').trim();
    const enumCode = fieldEnumCode(field);
    if (!key || !enumCode || byCode.has(enumCode)) return;
    let alias = toEnumTypeAlias(key, enumCode);
    if (usedNames.has(alias)) alias = `${alias}_${byCode.size}`;
    usedNames.add(alias);
    byCode.set(enumCode, alias);
  });
  return byCode;
}

function renderEnumTypeAliases(aliasByCode: Map<string, string>): string[] {
  return [...aliasByCode.entries()].map(
    ([code, alias]) => `type ${alias} = getADBEnumByCode<"${code}">;`,
  );
}

function bodyFieldLines(
  fields: API.BusinessDataField[],
  indent = '  ',
  aliasByCode: Map<string, string> = new Map(),
  options: { allOptional?: boolean } = {},
): string[] {
  const lines: string[] = [];
  fields.forEach((field) => {
    const key = String(field.fieldKey || '').trim();
    if (!key || SKIP_BODY_KEYS.has(key)) return;
    const optional = options.allOptional || !fieldRequired(field) ? '?' : '';
    const comment = fieldComment(field);
    if (comment) lines.push(`${indent}/** ${comment} */`);
    const enumCode = fieldEnumCode(field);
    const alias = enumCode ? aliasByCode.get(enumCode) : undefined;
    const mediaTag =
      String(((field.columnInfo || {}) as Record<string, unknown>).extendType || '').toLowerCase() === 'adb-media'
        ? ' // @file storage objectId'
        : '';
    const tsType = alias || fieldTsType(field);
    lines.push(`${indent}${key}${optional}: ${tsType};${alias ? '' : mediaTag}`);
  });
  return lines;
}

function withAliases(aliasByCode: Map<string, string>, interfaceBlock: string): string {
  const aliasLines = renderEnumTypeAliases(aliasByCode);
  if (!aliasLines.length) return interfaceBlock;
  return `${aliasLines.join('\n')}\n\n${interfaceBlock}`;
}

/** 按主 operation + 实体字段生成设计期 RequestParams interface */
export function buildRequestParameterInterface(
  operation: string,
  fields: API.BusinessDataField[] = [],
): string {
  const op = String(operation || 'find').trim();
  const aliasByCode = collectEnumTypeAliases(fields);
  const bodyLines = bodyFieldLines(fields, '    ', aliasByCode);

  if (op === 'create' || op === 'insertOne') {
    const inner = bodyLines.length ? bodyLines.join('\n') : '    [key: string]: unknown;';
    return withAliases(
      aliasByCode,
      [
        'interface RequestParams {',
        '  /** 新建记录的请求体（实体字段） */',
        '  body: {',
        inner,
        '  };',
        '}',
      ].join('\n'),
    );
  }

  if (op === 'updateOne' || op === 'findOneAndUpdate') {
    const inner = bodyLines.length
      ? bodyFieldLines(fields, '    ', aliasByCode, { allOptional: true }).join('\n')
      : '    [key: string]: unknown;';
    return withAliases(
      aliasByCode,
      [
        'interface RequestParams {',
        '  /** 资源 ID */',
        '  id: string;',
        '  /** 部分更新字段（仅传需修改的字段） */',
        '  body?: {',
        inner,
        '  };',
        '}',
      ].join('\n'),
    );
  }

  if (op === 'findById' || op === 'deleteOne' || op === 'save' || op === 'replaceOne') {
    const lines = [
      'interface RequestParams {',
      '  /** 资源 ID */',
      '  id: string;',
    ];
    if (op === 'save' || op === 'replaceOne') {
      const inner = bodyLines.length ? bodyLines.join('\n') : '    [key: string]: unknown;';
      lines.push('  /** 全量替换的请求体 */', '  body?: {', inner, '  };');
    }
    lines.push('}');
    return withAliases(aliasByCode, lines.join('\n'));
  }

  if (op === 'find') {
    const filterLines: string[] = [];
    fields.forEach((field) => {
      const key = String(field.fieldKey || '').trim();
      if (!key || SKIP_BODY_KEYS.has(key)) return;
      const enumCode = fieldEnumCode(field);
      const alias = enumCode ? aliasByCode.get(enumCode) : undefined;
      if (!alias && !enumCode) return; // find 顶层只展开枚举过滤字段，其余走 filter
      const comment = fieldComment(field);
      if (comment) filterLines.push(`  /** ${comment} */`);
      filterLines.push(`  ${key}?: ${alias || 'string'};`);
    });
    return withAliases(
      aliasByCode,
      [
        'interface RequestParams {',
        '  /** 每页条数 */',
        '  limit?: number;',
        '  /** 分页偏移 */',
        '  skip?: number;',
        ...filterLines,
        '  /** 查询过滤（字段等值） */',
        '  filter?: Record<string, unknown>;',
        '}',
      ].join('\n'),
    );
  }

  if (op === 'count' || op === 'countDocuments' || op === 'findOne' || op === 'exists') {
    return withAliases(
      aliasByCode,
      [
        'interface RequestParams {',
        '  /** 查询过滤（字段等值） */',
        '  filter?: Record<string, unknown>;',
        '}',
      ].join('\n'),
    );
  }

  if (op === 'deleteMany' || op === 'updateMany') {
    const lines = [
      'interface RequestParams {',
      '  /** 批量条件过滤 */',
      '  filter?: Record<string, unknown>;',
    ];
    if (op === 'updateMany') {
      const inner = bodyLines.length ? bodyLines.join('\n') : '    [key: string]: unknown;';
      lines.push('  /** 更新字段 */', '  body?: {', inner, '  };');
    }
    lines.push('}');
    return withAliases(aliasByCode, lines.join('\n'));
  }

  return [
    'interface RequestParams {',
    '  [key: string]: unknown;',
    '}',
  ].join('\n');
}

export async function resolveEntityForRequestInterface(options: {
  entityId?: string;
  entityCodes?: string[];
}): Promise<API.BusinessDataEntity | null> {
  if (options.entityId) {
    const res = await getBusinessDataEntity(String(options.entityId));
    const entity = getApiData<API.BusinessDataEntity>(res);
    if (entity?.id) return entity;
  }
  const code = options.entityCodes?.map((c) => String(c || '').trim()).find(Boolean);
  if (!code) return null;
  const listRes = await getBusinessDataEntities({ codePrefix: code, size: 50 });
  const { items } = parseApiListResponse<API.BusinessDataEntity>(listRes);
  return items.find((item) => item.code === code) || items[0] || null;
}

/** 缺省时按实体生成；已有非空 interface 则原样返回 */
export async function ensureRequestParameterInterface(options: {
  requestParameterInterface?: string;
  operation: string;
  entityId?: string;
  entityCodes?: string[];
}): Promise<{ interfaceText: string; autoGenerated: boolean }> {
  const existing = String(options.requestParameterInterface || '').trim();
  if (existing) {
    return { interfaceText: existing, autoGenerated: false };
  }
  const entity = await resolveEntityForRequestInterface({
    entityId: options.entityId,
    entityCodes: options.entityCodes,
  });
  if (!entity) {
    return { interfaceText: '', autoGenerated: false };
  }
  return {
    interfaceText: buildRequestParameterInterface(options.operation, entity.fields || []),
    autoGenerated: true,
  };
}

/** 空或占位 requestOverrides 时仍应自动 suggest Example */
export function shouldAutoSuggestRequestExample(requestOverrides: unknown): boolean {
  if (requestOverrides == null) return true;
  if (typeof requestOverrides !== 'object' || Array.isArray(requestOverrides)) return true;
  const entries = Object.entries(requestOverrides as Record<string, unknown>);
  if (!entries.length) return true;
  return entries.every(([, value]) => {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) return true;
    const example = (value as { requestExample?: unknown }).requestExample;
    if (example == null) return true;
    if (typeof example === 'object' && !Array.isArray(example)) {
      return Object.keys(example as Record<string, unknown>).length === 0;
    }
    if (typeof example === 'string') return !example.trim();
    return false;
  });
}
