const { z } = require('zod');
const { Op } = require('sequelize');
const { getOperationMeta } = require('./operationCatalog');
const { DEFAULT_SECURITY_CONFIG } = require('./apiServiceConstants');
const BizdataEnum = require('../../models/bizdata_enum');
const {
  discoverHandlerParams,
  guessParamJsonSchema,
} = require('./handlerParamDiscovery');
const { stripSqlComments } = require('./sqlTextUtils');
const SAMPLE_UUID = '00000000-0000-4000-8000-000000000001';
const FILE_FIELD_MARKERS = /@file|@storage|objectId|storage|文件引用|文件字段|StorageObjectId|FileReference/i;
const ADB_ENUM_TAG_RE = /@adb-enum\s+([A-Za-z_][A-Za-z0-9_:]*)/i;
const LEGACY_ENUM_RE = /枚举\s+([A-Za-z_][A-Za-z0-9_:]*)/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractInterfaceEnumCode(...texts) {
  const joined = texts.filter(Boolean).join(' ');
  if (!String(joined).trim()) return undefined;
  const tagged = joined.match(ADB_ENUM_TAG_RE);
  if (tagged?.[1]) return tagged[1];
  const legacy = joined.match(LEGACY_ENUM_RE);
  if (legacy?.[1]) return legacy[1];
  return undefined;
}

const WRITE_OPERATIONS = new Set([
  'insertOne', 'create', 'insertMany', 'save', 'updateOne', 'updateMany',
  'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'clone',
]);

const READ_OPERATIONS = new Set([
  'find', 'findOne', 'findById', 'count', 'countDocuments', 'distinct', 'exists', 'aggregate',
]);

function resolveSecurityConfig(service) {
  return { ...DEFAULT_SECURITY_CONFIG, ...(service?.securityConfig || {}) };
}

function resolveDefinitionScript(service) {
  if (service?.definitionScript && String(service.definitionScript).trim()) {
    return String(service.definitionScript).trim();
  }
  const overrides = service?.scriptOverrides || {};
  if (overrides.__definition__ && String(overrides.__definition__).trim()) {
    return String(overrides.__definition__).trim();
  }
  return null;
}

/**
 * 解析设计期 TypeScript interface（与前端 parseInterfaceFields 对齐）：
 * - type StatusType = getADBEnumByCode<"code">（合法 TS 泛型类型）
 * - 兼容 getADBEnumByCode("code")
 * - status?: StatusType / StatusType[]
 * - 兼容 @adb-enum / 「枚举 code」
 */
function parseAdbEnumTypeAliases(interfaceText) {
  const map = new Map();
  const text = String(interfaceText || '');
  const re = /type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*getADBEnumByCode\s*(?:<\s*['"]([^'"]+)['"]\s*>|\(\s*['"]([^'"]+)['"]\s*\))\s*;?/g;
  let match = re.exec(text);
  while (match) {
    const code = match[2] || match[3];
    if (code) map.set(match[1], code);
    match = re.exec(text);
  }
  return map;
}

/** 从 `startIdx`（指向 `{`）起做括号配对，返回闭合 `}` 下标；失败返回 -1 */
function findMatchingBrace(text, startIdx) {
  if (startIdx < 0 || startIdx >= text.length || text[startIdx] !== '{') return -1;
  let depth = 0;
  for (let i = startIdx; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractInterfaceBody(text) {
  const source = String(text || '');
  const re = /\binterface\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\{/g;
  let match;
  let lastOpen = -1;
  while ((match = re.exec(source)) !== null) {
    lastOpen = match.index + match[0].length - 1;
  }
  if (lastOpen >= 0) {
    const close = findMatchingBrace(source, lastOpen);
    if (close > lastOpen) return source.slice(lastOpen + 1, close);
    return source.slice(lastOpen + 1);
  }
  const firstBrace = source.indexOf('{');
  if (firstBrace >= 0) {
    const close = findMatchingBrace(source, firstBrace);
    if (close > firstBrace) return source.slice(firstBrace + 1, close);
  }
  return source;
}

function resolveInterfaceFieldType(typeRaw, aliasMap) {
  const type = String(typeRaw || '').trim().replace(/[;,\s]+$/, '');
  const arrayMatch = type.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*\[\s*\]$/)
    || type.match(/^Array\s*<\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*>$/i);
  if (arrayMatch) {
    const alias = arrayMatch[1];
    const enumCode = aliasMap.get(alias);
    return {
      tsType: enumCode ? 'string[]' : type,
      typeLabel: `${alias}[]`,
      isArray: true,
      enumCode: enumCode || undefined,
    };
  }
  const enumCode = aliasMap.get(type);
  if (enumCode) {
    return {
      tsType: 'string',
      typeLabel: type,
      isArray: false,
      enumCode,
    };
  }
  const isArray = /\[\]$/.test(type) || /^Array\s*</i.test(type);
  return {
    tsType: type,
    typeLabel: type,
    isArray,
    enumCode: undefined,
  };
}

function buildInterfaceFieldMeta({
  name,
  optional,
  typePart,
  description,
  inlineComment,
  line,
  aliasMap,
}) {
  const resolved = resolveInterfaceFieldType(typePart, aliasMap);
  const commentEnum = extractInterfaceEnumCode(description, inlineComment, line);
  const commentText = `${description || ''} ${line} ${typePart}`;
  const isFile = FILE_FIELD_MARKERS.test(commentText);
  return {
    description: description || undefined,
    isFile,
    required: !optional,
    tsType: resolved.tsType,
    typeLabel: resolved.typeLabel,
    isArray: Boolean(resolved.isArray),
    enumCode: resolved.enumCode || commentEnum || undefined,
  };
}

/**
 * 解析 RequestParams interface。
 * - 顶层字段写入 fields
 * - `body: { ... }` / `set: { ... }` 内联对象：fields 记为 Record，嵌套字段写入 nestedFields[name]
 * 避免把 `body: {` 误解析成 tsType=`{` → string，进而把内部字段抬到顶层必填。
 */
function parseRequestParameterInterface(interfaceText) {
  const fields = {};
  const nestedFields = {};
  const fileFields = new Set();
  const text = String(interfaceText || '').trim();
  if (!text) return { fields, nestedFields, fileFields };

  const aliasMap = parseAdbEnumTypeAliases(text);
  const body = extractInterfaceBody(text);
  const lines = body.split('\n');

  let pendingComment = '';
  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    i += 1;
    if (!line) continue;

    const singleLineBlock = line.match(/^\/\*\*\s*(.*?)\s*\*\/$/);
    if (singleLineBlock) {
      pendingComment = singleLineBlock[1]?.replace(/\*/g, ' ').trim() || '';
      continue;
    }

    const inlineBlockStart = line.match(/^\/\*\*\s*(.*)$/);
    if (inlineBlockStart) {
      pendingComment = inlineBlockStart[1]?.trim() || '';
      continue;
    }
    const leadingStar = line.match(/^\*\s?(.*)$/);
    if (leadingStar && !line.startsWith('*/')) {
      const content = leadingStar[1]?.trim();
      if (content && content !== '/') {
        pendingComment = pendingComment ? `${pendingComment} ${content}` : content;
      }
      continue;
    }
    if (line === '*/' || line.startsWith('*/')) {
      continue;
    }

      const nestedObjMatch = line.match(
      /^([A-Za-z_$][A-Za-z0-9_$]*)\s*(\?)?\s*:\s*\{(.*)$/,
    );
    if (nestedObjMatch) {
      const name = nestedObjMatch[1];
      const optional = nestedObjMatch[2] === '?';
      const afterBrace = nestedObjMatch[3] || '';
      const description = pendingComment || undefined;
      let depth = 1;
      const collected = [];
      const consume = (chunk) => {
        for (let c = 0; c < chunk.length; c += 1) {
          const ch = chunk[c];
          if (ch === '{') depth += 1;
          else if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
              collected.push(chunk.slice(0, c));
              return true;
            }
          }
        }
        collected.push(chunk);
        return false;
      };
      let closed = consume(afterBrace);
      while (!closed && i < lines.length) {
        closed = consume(lines[i]);
        i += 1;
      }
      const inner = collected.join('\n');

      const nestedParsed = parseRequestParameterInterface(
        `interface __Nested {\n${inner}\n}`,
      );
      nestedFields[name] = nestedParsed.fields;
      nestedParsed.fileFields.forEach((f) => fileFields.add(f));

      fields[name] = {
        description,
        isFile: false,
        required: !optional,
        tsType: 'Record<string, unknown>',
        typeLabel: 'object',
        isArray: false,
        enumCode: undefined,
      };
      pendingComment = '';
      continue;
    }

    const propMatch = line.match(
      /^([A-Za-z_$][A-Za-z0-9_$]*)\s*(\?)?\s*:\s*([^;\/]+?)\s*;?\s*(?:\/\/(.*))?$/,
    );
    if (!propMatch) continue;

    const name = propMatch[1];
    const optional = propMatch[2] === '?';
    const typePart = propMatch[3].trim().replace(/[;,\s]+$/, '');
    const inlineComment = propMatch[4]?.trim();
    let description = pendingComment;
    if (inlineComment) {
      description = description
        ? `${description} ${inlineComment}`
        : inlineComment;
    }
    // 裸 `{` 已被上面分支处理；此处再兜底避免 tsType=`{`
    if (typePart === '{' || typePart.startsWith('{')) {
      fields[name] = {
        description: description || undefined,
        isFile: false,
        required: !optional,
        tsType: 'Record<string, unknown>',
        typeLabel: 'object',
        isArray: false,
        enumCode: undefined,
      };
      pendingComment = '';
      continue;
    }

    const meta = buildInterfaceFieldMeta({
      name,
      optional,
      typePart,
      description,
      inlineComment,
      line,
      aliasMap,
    });
    fields[name] = meta;
    if (meta.isFile) fileFields.add(name);
    pendingComment = '';
  }

  return { fields, nestedFields, fileFields };
}

function mapInterfaceTypeToZod(tsType, { required = false, isFile = false } = {}) {
  let base;
  if (isFile) {
    base = z.string().uuid();
  } else {
    const unionEnum = parseStringUnionEnum(tsType);
    if (unionEnum) {
      base = z.enum(unionEnum);
    } else {
      const normalized = String(tsType || '').toLowerCase();
      // 数组必须优先于 number/boolean/record：否则 number[] / Array<number> 会被误判为 number
      if (normalized.includes('[]') || normalized.startsWith('array<') || normalized.includes('array<')) {
        base = z.array(z.unknown());
      } else if (normalized.includes('number')) base = zodCoerceNumber();
      else if (normalized.includes('boolean')) base = z.coerce.boolean();
      else if (normalized.includes('object') || normalized.includes('record')) {
        base = z.record(z.unknown());
      } else {
        base = z.string();
      }
    }
  }
  return required ? base : base.optional();
}

/** 避免 z.coerce.number() 把 undefined 变成 NaN（误报 body.xxx received nan） */
function zodCoerceNumber() {
  return z.preprocess((val) => {
    if (val === undefined || val === null) return undefined;
    if (typeof val === 'string' && val.trim() === '') return undefined;
    if (typeof val === 'number' && Number.isNaN(val)) return undefined;
    if (typeof val === 'number') return val;
    if (typeof val === 'string' || typeof val === 'boolean') {
      const n = Number(val);
      return Number.isFinite(n) ? n : val;
    }
    return val;
  }, z.number());
}

function mapInterfaceFieldsToZodShape(fields) {
  const shape = {};
  Object.entries(fields || {}).forEach(([name, meta]) => {
    shape[name] = mapInterfaceTypeToZod(meta.tsType, {
      required: Boolean(meta.required),
      isFile: Boolean(meta.isFile),
    });
  });
  return shape;
}

function unwrapZodOptional(schema) {
  let current = schema;
  let wasOptional = false;
  // Zod 3: _def.typeName === 'ZodOptional'；Zod 4: type/def.type === 'optional' 或 .unwrap()
  while (current) {
    const typeName = current._def?.typeName || current.def?.type || current.type;
    const isOptional = typeName === 'ZodOptional' || typeName === 'optional'
      || typeof current.unwrap === 'function';
    if (!isOptional) break;
    // 避免把非 optional 但碰巧有 unwrap 的类型误拆（Zod 4 optional 才有 unwrap）
    if (typeName !== 'ZodOptional' && typeName !== 'optional' && !current.def?.innerType) {
      break;
    }
    wasOptional = true;
    current = typeof current.unwrap === 'function'
      ? current.unwrap()
      : (current._def?.innerType || current.def?.innerType);
  }
  return { inner: current, wasOptional };
}

/** updateOne：interface 合并后强制 body/set 内层字段全部可选（PATCH 部分更新） */
function forcePartialUpdateContainers(jsonSchema, zodSchema, operation) {
  if (!['updateOne', 'findOneAndUpdate'].includes(operation)) {
    return { jsonSchema, zodSchema };
  }

  let nextJson = jsonSchema;
  if (jsonSchema?.properties) {
    nextJson = {
      ...jsonSchema,
      properties: { ...jsonSchema.properties },
    };
    ['body', 'set'].forEach((key) => {
      const container = nextJson.properties[key];
      if (!container || typeof container !== 'object') return;
      const nextContainer = { ...container };
      delete nextContainer.required;
      nextJson.properties[key] = nextContainer;
    });
  }

  let nextZod = zodSchema;
  try {
    const shape = typeof zodSchema?.shape === 'object'
      ? zodSchema.shape
      : (typeof zodSchema?._def?.shape === 'function' ? zodSchema._def.shape() : null);
    if (shape && typeof shape === 'object') {
      const nextShape = { ...shape };
      let changed = false;
      ['body', 'set'].forEach((key) => {
        if (!nextShape[key]) return;
        const { inner, wasOptional } = unwrapZodOptional(nextShape[key]);
        if (inner && typeof inner.partial === 'function') {
          let partialObj = inner.partial();
          if (typeof partialObj.passthrough === 'function') {
            partialObj = partialObj.passthrough();
          }
          nextShape[key] = wasOptional ? partialObj.optional() : partialObj;
          changed = true;
        }
      });
      if (changed) {
        nextZod = z.object(nextShape).passthrough();
      }
    }
  } catch {
    // 保持原 zod
  }

  return { jsonSchema: nextJson, zodSchema: nextZod };
}

/**
 * GET query 兼容 + 写 body 规范化：
 * - filter JSON 字符串 / filter[k]
 * - body/set：拒绝实体未建模字段（须与 fieldKey / 物化表列一致）
 */
/**
 * 系统托管字段：由物化表默认值/平台自动维护，客户端既不能写、也不该必填。
 * 写校验（getEntityWritableFieldKeys）和 body 结构（buildEntityBodyZod/Schema）必须用同一份清单，
 * 否则会出现「传了报未建模字段、不传报必填」的自相矛盾。
 */
const SYSTEM_MANAGED_FIELD_KEYS = new Set(['created_at', 'updated_at', 'createdAt', 'updatedAt']);

function isSystemManagedFieldKey(key) {
  return SYSTEM_MANAGED_FIELD_KEYS.has(key);
}

function getEntityWritableFieldKeys(entity) {
  const set = new Set();
  (entity?.fields || []).forEach((field) => {
    const key = field.fieldKey || field.field_key;
    if (!key || key === 'id') return;
    if (isSystemManagedFieldKey(key)) return;
    set.add(key);
  });
  return set;
}

function assertBodyFieldsAllowed(body, entity, pathLabel = 'body') {
  const allowed = getEntityWritableFieldKeys(entity);
  if (!allowed.size || !body || typeof body !== 'object' || Array.isArray(body)) {
    return body;
  }
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (!unknown.length) return body;
  throw Object.assign(
    new Error(
      `${pathLabel} 含未建模字段: ${unknown.join(', ')}。`
      + '字段名须与实体 fieldKey / 物化表列一致；'
      + '勿传入表中不存在的列',
    ),
    { status: 400, unknownFields: unknown },
  );
}

function normalizeWriteBody(body, entity, pathLabel = 'body') {
  if (body == null) return body;
  return assertBodyFieldsAllowed(body, entity, pathLabel);
}

function coerceInvokeParameters(parameters = {}, entity = null, service = null) {
  const next = { ...(parameters || {}) };

  Object.keys(parameters || {}).forEach((key) => {
    const match = /^filter\[([A-Za-z_][A-Za-z0-9_]*)\]$/.exec(key);
    if (!match) return;
    if (!next.filter || typeof next.filter !== 'object' || Array.isArray(next.filter)) {
      next.filter = {};
    }
    next.filter[match[1]] = parameters[key];
    delete next[key];
  });

  if (typeof next.filter === 'string') {
    const trimmed = next.filter.trim();
    if (!trimmed) {
      delete next.filter;
    } else {
      try {
        next.filter = JSON.parse(trimmed);
      } catch {
        // 留给 zod 报错
      }
    }
  }

  // TypeScript Handler 以 requestParameterInterface 为准，允许自定义 body（如 PCS 推送载荷）
  const scriptMode = service?.scriptMode || service?.script_mode || 'sql';
  if (scriptMode !== 'typescript') {
    if (next.body !== undefined) {
      next.body = normalizeWriteBody(next.body, entity, 'body');
    }
    if (next.set !== undefined) {
      next.set = normalizeWriteBody(next.set, entity, 'set');
    }
  }

  return next;
}

function mergeInterfaceIntoZod(zodSchema, service, jsonSchema) {
  const interfaceText = service?.requestParameterInterface
    || service?.request_parameter_interface
    || '';
  const { fields, nestedFields } = parseRequestParameterInterface(interfaceText);
  if (!Object.keys(fields).length) return zodSchema;

  const targetKey = resolveInterfaceMergeTarget(jsonSchema || { properties: {} });

  if (targetKey === 'root') {
    const shape = mapInterfaceFieldsToZodShape(fields);
    return Object.keys(shape).length ? zodSchema.extend(shape) : zodSchema;
  }

  // body / set：用嵌套字段强化容器 schema，禁止把内部字段抬到顶层必填
  const containerMeta = fields[targetKey];
  const nested = nestedFields?.[targetKey] || {};
  const nestedShape = mapInterfaceFieldsToZodShape(nested);
  let containerZod = Object.keys(nestedShape).length
    ? z.object(nestedShape).passthrough()
    : z.record(z.unknown());
  if (!containerMeta || !containerMeta.required) {
    containerZod = containerZod.optional();
  }
  return zodSchema.extend({ [targetKey]: containerZod });
}

function mergeDiscoveredHandlerParams(jsonSchema, zodSchema, service) {
  const mode = service?.scriptMode || service?.script_mode || 'sql';
  if (mode !== 'typescript') {
    return { jsonSchema, zodSchema };
  }

  const { names } = discoverHandlerParams(service);
  if (!names.length) return { jsonSchema, zodSchema };

  const next = {
    ...jsonSchema,
    properties: { ...(jsonSchema?.properties || {}) },
  };
  const zodShape = {};

  names.forEach((name) => {
    if (next.properties[name]) return;
    const schema = guessParamJsonSchema(name);
    next.properties[name] = schema;
    if (schema.type === 'boolean') {
      zodShape[name] = z.coerce.boolean().optional();
    } else if (schema.type === 'integer') {
      zodShape[name] = z.coerce.number().int().optional();
    } else if (schema.format === 'uuid') {
      zodShape[name] = z.string().uuid().optional();
    } else {
      zodShape[name] = z.string().optional();
    }
  });

  const nextZod = Object.keys(zodShape).length
    ? zodSchema.extend(zodShape)
    : zodSchema;
  return { jsonSchema: next, zodSchema: nextZod };
}

function collectInterfaceFileFields(service) {
  const interfaceText = service?.requestParameterInterface
    || service?.request_parameter_interface
    || '';
  return parseRequestParameterInterface(interfaceText).fileFields;
}

function parseStringUnionEnum(tsType) {
  const trimmed = String(tsType || '').trim();
  if (!trimmed.includes('|')) return null;
  const parts = trimmed.split('|').map((part) => part.trim().replace(/^['"]|['"]$/g, ''));
  const reserved = new Set(['string', 'number', 'boolean', 'null', 'undefined', 'void', 'any', 'unknown']);
  if (!parts.length || !parts.every((part) => part && !reserved.has(part.toLowerCase()))) {
    return null;
  }
  return parts;
}

function enumValuesFromRecord(enumRecord) {
  const items = enumRecord?.items || {};
  const itemKeys = Object.keys(items);
  if (itemKeys.length) return itemKeys;
  const values = enumRecord?.values || {};
  return Object.keys(values);
}

function readFieldEnumCode(field) {
  const columnInfo = field?.columnInfo || field?.column_info || {};
  return columnInfo.enumConfig?.enumCode
    || columnInfo.enum_config?.enum_code
    || columnInfo.enumCode
    || columnInfo.enum_code
    || null;
}

function enumLabelsFromRecord(enumRecord, enumValues) {
  const source = { ...(enumRecord?.items || {}), ...(enumRecord?.values || {}) };
  const labels = {};
  enumValues.forEach((key) => {
    const meta = source[key];
    labels[key] = typeof meta === 'string' ? meta : (meta?.label || String(key));
  });
  return labels;
}

function resolveFieldEnumValues(field, enumMap) {
  if (!field || !enumMap) return null;
  const columnInfo = field.columnInfo || field.column_info || {};
  const extendType = String(columnInfo.extendType || columnInfo.extend_type || '').toLowerCase();
  const enumCode = readFieldEnumCode(field);
  if (extendType !== 'adb-enum' && !enumCode) return null;
  if (!enumCode) return null;
  const enumRecord = enumMap.get(String(enumCode));
  if (!enumRecord) return null;
  const values = enumValuesFromRecord(enumRecord);
  return values.length ? values : null;
}

function resolveFieldEnumLabels(field, enumMap, enumValues) {
  if (!field || !enumMap || !enumValues?.length) return null;
  const enumCode = readFieldEnumCode(field);
  if (!enumCode) return null;
  const enumRecord = enumMap.get(String(enumCode));
  if (!enumRecord) return null;
  return enumLabelsFromRecord(enumRecord, enumValues);
}

function applyEnumToPropertySchema(prop, field, enumMap) {
  const enumValues = resolveFieldEnumValues(field, enumMap);
  if (!enumValues?.length) return prop;
  const next = { ...prop, type: 'string', enum: enumValues };
  const labels = resolveFieldEnumLabels(field, enumMap, enumValues);
  if (labels && Object.keys(labels).length) {
    next['x-enum-labels'] = labels;
  }
  return next;
}

async function loadEnumMapByCodes(codes) {
  const unique = [...new Set([...codes].map((c) => String(c || '').trim()).filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await BizdataEnum.findAll({
    where: { code: { [Op.in]: unique } },
  });
  const map = new Map();
  rows.forEach((row) => {
    const data = row.toJSON ? row.toJSON() : row;
    map.set(String(data.code), {
      code: data.code,
      items: data.items || {},
      values: data.values || {},
    });
  });
  return map;
}

function collectInterfaceEnumCodes(service) {
  const interfaceText = service?.requestParameterInterface
    || service?.request_parameter_interface
    || '';
  const { fields } = parseRequestParameterInterface(interfaceText);
  const codes = new Set();
  Object.values(fields).forEach((meta) => {
    if (meta?.enumCode) codes.add(String(meta.enumCode));
  });
  return codes;
}

/**
 * 加载枚举：实体 adb-enum 字段 + requestParameterInterface 中的 @adb-enum。
 * @param {object|null} entity
 * @param {object|null} [service]
 */
async function loadEnumMapForEntity(entity, service = null) {
  const codes = new Set();
  (entity?.fields || []).forEach((field) => {
    const enumCode = readFieldEnumCode(field);
    if (enumCode) codes.add(String(enumCode));
  });
  collectInterfaceEnumCodes(service).forEach((code) => codes.add(code));
  return loadEnumMapByCodes(codes);
}

function applyEnumCodeToPropertySchema(prop, enumCode, enumMap, { isArray = false, typeLabel } = {}) {
  if (!enumCode || !enumMap) return prop;
  const enumRecord = enumMap.get(String(enumCode));
  if (!enumRecord) return prop;
  const enumValues = enumValuesFromRecord(enumRecord);
  if (!enumValues.length) return prop;
  const labels = enumLabelsFromRecord(enumRecord, enumValues);
  const itemSchema = { type: 'string', enum: enumValues };
  if (labels && Object.keys(labels).length) {
    itemSchema['x-enum-labels'] = labels;
  }
  if (isArray || prop?.type === 'array') {
    const next = {
      ...(prop || {}),
      type: 'array',
      items: { ...(prop?.items && typeof prop.items === 'object' ? prop.items : {}), ...itemSchema },
    };
    if (typeLabel) next['x-type-label'] = typeLabel;
    next['x-adb-enum-code'] = enumCode;
    return next;
  }
  const next = { ...(prop || {}), type: 'string', enum: enumValues };
  if (labels && Object.keys(labels).length) {
    next['x-enum-labels'] = labels;
  }
  if (typeLabel) next['x-type-label'] = typeLabel;
  next['x-adb-enum-code'] = enumCode;
  return next;
}

function enrichPropertiesWithInterfaceEnums(properties, service, enumMap) {
  if (!properties || !enumMap) return;
  const interfaceText = service?.requestParameterInterface
    || service?.request_parameter_interface
    || '';
  const { fields } = parseRequestParameterInterface(interfaceText);
  Object.entries(fields).forEach(([name, meta]) => {
    if (!meta?.enumCode || !properties[name]) return;
    properties[name] = applyEnumCodeToPropertySchema(properties[name], meta.enumCode, enumMap, {
      isArray: Boolean(meta.isArray),
      typeLabel: meta.typeLabel,
    });
  });
}

function mapInterfaceTypeToJsonSchema(tsType) {
  const unionEnum = parseStringUnionEnum(tsType);
  if (unionEnum) {
    return { type: 'string', enum: unionEnum };
  }
  const normalized = String(tsType || '').toLowerCase();
  // 数组必须优先于 number/boolean/record：否则 number[] / Array<number> 会被误判为 number
  if (normalized.includes('[]') || normalized.startsWith('array<') || normalized.includes('array<')) {
    const itemIsNumber = /\bnumber\b/.test(normalized) || normalized.includes('<number');
    const itemIsObject = normalized.includes('object') || normalized.includes('record');
    let items = { type: 'string' };
    if (itemIsNumber) items = { type: 'number' };
    else if (itemIsObject) items = { type: 'object', additionalProperties: true };
    return { type: 'array', items };
  }
  if (normalized.includes('number')) return { type: 'number' };
  if (normalized.includes('boolean')) return { type: 'boolean' };
  if (normalized.includes('object') || normalized.includes('record')) {
    return { type: 'object', additionalProperties: true };
  }
  return { type: 'string' };
}

function resolveInterfaceMergeTarget(jsonSchema) {
  const props = jsonSchema?.properties;
  if (!props) return 'root';
  if (props.body && props.body.type === 'object') return 'body';
  if (props.set && props.set.type === 'object') return 'set';
  return 'root';
}

function mergeInterfaceFieldsIntoProperties(properties, fields, requiredSet) {
  Object.entries(fields).forEach(([name, meta]) => {
    let baseSchema;
    if (meta.isFile) {
      baseSchema = { type: 'string', format: 'uuid', description: meta.description || 'storage objectId' };
    } else if (meta.isArray) {
      const fromType = mapInterfaceTypeToJsonSchema(meta.tsType);
      baseSchema = {
        type: 'array',
        items: fromType.items || { type: 'string' },
        ...(meta.description ? { description: meta.description } : {}),
      };
    } else {
      baseSchema = {
        ...mapInterfaceTypeToJsonSchema(meta.tsType),
        ...(meta.description ? { description: meta.description } : {}),
      };
    }
    if (meta.typeLabel) {
      baseSchema['x-type-label'] = meta.typeLabel;
    }
    if (meta.enumCode) {
      baseSchema['x-adb-enum-code'] = meta.enumCode;
    }

    if (!properties[name]) {
      properties[name] = baseSchema;
    } else {
      properties[name] = {
        ...properties[name],
        ...baseSchema,
        ...(meta.description ? { description: meta.description } : {}),
        ...(meta.isFile ? { format: 'uuid', type: 'string' } : {}),
        ...(meta.typeLabel ? { 'x-type-label': meta.typeLabel } : {}),
        ...(meta.enumCode ? { 'x-adb-enum-code': meta.enumCode } : {}),
        ...(meta.isArray ? { type: 'array', items: properties[name].items || baseSchema.items || { type: 'string' } } : {}),
      };
    }

    if (meta.required) requiredSet.add(name);
    else requiredSet.delete(name);
  });
}

function mergeInterfaceMetadata(jsonSchema, service) {
  const interfaceText = service?.requestParameterInterface
    || service?.request_parameter_interface
    || '';
  const { fields, nestedFields } = parseRequestParameterInterface(interfaceText);
  if (!jsonSchema?.properties || !Object.keys(fields).length) return jsonSchema;

  const next = {
    ...jsonSchema,
    properties: { ...jsonSchema.properties },
  };
  const targetKey = resolveInterfaceMergeTarget(next);

  if (targetKey === 'root') {
    const requiredSet = new Set(next.required || []);
    mergeInterfaceFieldsIntoProperties(next.properties, fields, requiredSet);
    if (requiredSet.size) next.required = [...requiredSet];
    else delete next.required;
    return next;
  }

  const container = {
    ...next.properties[targetKey],
    type: 'object',
    properties: { ...(next.properties[targetKey].properties || {}) },
  };
  const requiredSet = new Set(container.required || []);
  // 优先合并嵌套字段；跳过容器自身，避免 body.properties.body
  const toMerge = nestedFields?.[targetKey] && Object.keys(nestedFields[targetKey]).length
    ? nestedFields[targetKey]
    : Object.fromEntries(Object.entries(fields).filter(([name]) => name !== targetKey));
  mergeInterfaceFieldsIntoProperties(container.properties, toMerge, requiredSet);
  if (requiredSet.size) container.required = [...requiredSet];
  else delete container.required;
  next.properties[targetKey] = container;

  // interface 要求 body/set 必填时，同步到根 required
  if (fields[targetKey]?.required) {
    const rootRequired = new Set(next.required || []);
    rootRequired.add(targetKey);
    next.required = [...rootRequired];
  }

  if (next.properties[targetKey] && typeof next.properties[targetKey] === 'object') {
    next.properties[targetKey] = {
      ...next.properties[targetKey],
      additionalProperties: false,
    };
  }

  return next;
}

function validateFileObjectIds(parameters, fileFields) {
  if (!fileFields?.size) return;

  const checkValue = (fieldName, value, pathPrefix) => {
    if (value == null || value === '') return;
    if (typeof value === 'string' && UUID_RE.test(value)) return;
    throw Object.assign(
      new Error(
        `参数 ${pathPrefix}${fieldName} 须为 storage objectId（UUID），请先通过文件存储上传接口获取，不支持 multipart/base64`,
      ),
      { status: 400 },
    );
  };

  fileFields.forEach((fieldName) => {
    if (Object.prototype.hasOwnProperty.call(parameters || {}, fieldName)) {
      checkValue(fieldName, parameters[fieldName], '');
      return;
    }
    ['body', 'set'].forEach((container) => {
      if (parameters?.[container] && Object.prototype.hasOwnProperty.call(parameters[container], fieldName)) {
        checkValue(fieldName, parameters[container][fieldName], `${container}.`);
      }
    });
  });
}

function extractSqlNamedParams(script) {
  if (!script) return [];
  // 忽略注释中的 :name（如「-- 过滤条件示例: AND status = :status」），避免吞掉业务 filter
  const matches = stripSqlComments(script).match(/(?<!:):(\w+)/g) || [];
  const reserved = new Set(['limit', 'skip']);
  return [...new Set(matches.map((m) => m.slice(1)).filter((name) => !reserved.has(name.toLowerCase())))];
}

function filterEntityFields(fields, securityConfig) {
  const denylist = new Set((securityConfig.fieldDenylist || []).map(String));
  const allowlist = securityConfig.fieldAllowlist;
  return (fields || []).filter((field) => {
    const key = field.fieldKey || field.field_key;
    if (!key || denylist.has(key)) return false;
    if (Array.isArray(allowlist) && allowlist.length) {
      return allowlist.includes(key);
    }
    return true;
  });
}

function pgTypeToJsonSchema(field, enumMap) {
  const typeorm = field.typeormConfig || field.typeorm_config || {};
  const pgType = String(typeorm.type || 'varchar').toLowerCase();
  if (['int', 'integer', 'bigint', 'smallint', 'numeric', 'decimal', 'float', 'double', 'real'].some((t) => pgType.includes(t))) {
    return { type: 'number' };
  }
  if (pgType.includes('bool')) {
    return { type: 'boolean' };
  }
  if (pgType.includes('json')) {
    return { type: 'object' };
  }
  if (pgType.includes('uuid')) {
    return { type: 'string', format: 'uuid' };
  }
  if (pgType.includes('timestamp') || pgType.includes('date')) {
    return { type: 'string', format: 'date-time' };
  }
  const enumValues = resolveFieldEnumValues(field, enumMap);
  if (enumValues?.length) {
    const schema = { type: 'string', enum: enumValues };
    const labels = resolveFieldEnumLabels(field, enumMap, enumValues);
    if (labels && Object.keys(labels).length) {
      schema['x-enum-labels'] = labels;
    }
    return schema;
  }
  return { type: 'string' };
}

function mockValueForField(field) {
  const typeorm = field.typeormConfig || field.typeorm_config || {};
  const pgType = String(typeorm.type || 'varchar').toLowerCase();
  const key = field.fieldKey || field.field_key;
  if (typeorm.primary || key === 'id') {
    return SAMPLE_UUID;
  }
  if (['int', 'integer', 'bigint', 'smallint', 'numeric', 'decimal', 'float', 'double', 'real'].some((t) => pgType.includes(t))) {
    return 1;
  }
  if (pgType.includes('bool')) {
    return true;
  }
  if (pgType.includes('json')) {
    return {};
  }
  if (pgType.includes('uuid')) {
    return SAMPLE_UUID;
  }
  if (pgType.includes('timestamp') || pgType.includes('date')) {
    return new Date().toISOString();
  }
  return `sample_${key}`;
}

function buildEntityBodySchema(fields, enumMap, { partial = false } = {}) {
  const properties = {};
  const required = [];
  fields.forEach((field) => {
    const key = field.fieldKey || field.field_key;
    if (!key || key === 'id') return;
    const schema = pgTypeToJsonSchema(field, enumMap);
    const typeorm = field.typeormConfig || field.typeorm_config || {};
    properties[key] = {
      ...schema,
      description: field.columnInfo?.label || field.column_info?.label || key,
    };
    // 系统字段不进 required：它们由平台填，客户端不该传
    if (!partial && typeorm.nullable === false && !isSystemManagedFieldKey(key)) {
      required.push(key);
    }
  });
  return {
    type: 'object',
    properties,
    additionalProperties: false,
    ...(!partial && required.length ? { required } : {}),
  };
}

function buildEntityBodyZod(fields, enumMap, { partial = false } = {}) {
  const shape = {};
  fields.forEach((field) => {
    const key = field.fieldKey || field.field_key;
    if (!key || key === 'id') return;
    const typeorm = field.typeormConfig || field.typeorm_config || {};
    const pgType = String(typeorm.type || 'varchar').toLowerCase();
    const enumValues = resolveFieldEnumValues(field, enumMap);
    let schema;
    if (enumValues?.length) {
      schema = z.enum(enumValues);
    } else if (['int', 'integer', 'bigint', 'smallint', 'numeric', 'decimal', 'float', 'double', 'real'].some((t) => pgType.includes(t))) {
      schema = zodCoerceNumber();
    } else if (pgType.includes('bool')) {
      schema = z.coerce.boolean();
    } else if (pgType.includes('json')) {
      schema = z.record(z.unknown());
    } else {
      schema = z.string();
    }
    if (partial || typeorm.nullable !== false || isSystemManagedFieldKey(key)) {
      schema = schema.optional();
    }
    shape[key] = schema;
  });
  // strict：拒绝未建模字段进入 INSERT（避免 SQL 缺列）
  return z.object(shape).strict();
}

function buildSqlParamSchemas(script, fields, enumMap) {
  void fields;
  void enumMap;
  const names = extractSqlNamedParams(script);
  const properties = {};
  names.forEach((name) => {
    properties[name] = { type: 'string', description: `SQL 命名参数 :${name}` };
  });
  return properties;
}

function buildSqlParamZod(sqlProps) {
  const properties = sqlProps && typeof sqlProps === 'object' ? sqlProps : {};
  const shape = {};
  Object.keys(properties).forEach((name) => {
    const prop = properties[name];
    if (Array.isArray(prop?.enum) && prop.enum.length) {
      shape[name] = z.enum(prop.enum).optional();
      return;
    }
    shape[name] = z.union([z.string(), z.number(), z.boolean()]).optional();
  });
  return z.object(shape).passthrough();
}

function enrichPropertiesWithEntityEnums(properties, entityFields, enumMap) {
  if (!properties || !entityFields?.length || !enumMap) return;
  const fieldByKey = new Map();
  entityFields.forEach((field) => {
    const key = field.fieldKey || field.field_key;
    if (key) fieldByKey.set(key, field);
  });
  Object.keys(properties).forEach((name) => {
    const field = fieldByKey.get(name);
    if (!field) return;
    properties[name] = applyEnumToPropertySchema(properties[name] || { type: 'string' }, field, enumMap);
  });
}

function buildBaseSchemas(service, operation, entity, enumMap = null) {
  const securityConfig = resolveSecurityConfig(service);
  const meta = getOperationMeta(operation);
  const script = resolveDefinitionScript(service);
  const fields = filterEntityFields(entity?.fields, securityConfig);
  const maxLimit = Number(securityConfig.maxLimit) || 100;
  const defaultLimit = Math.min(Number(securityConfig.defaultLimit) || 20, maxLimit);

  const sqlProps = buildSqlParamSchemas(script, fields, enumMap);
  const sqlZod = buildSqlParamZod(sqlProps);
  const bodyJson = buildEntityBodySchema(fields, enumMap);
  const bodyZod = buildEntityBodyZod(fields, enumMap);

  let jsonSchema = { type: 'object', properties: {} };
  let zodSchema = z.object({}).passthrough();

  // 通用 filter 对象 schema（开放属性，带示例）
  const filterSchema = {
    type: 'object',
    additionalProperties: true,
    description:
      '查询过滤条件（字段名 → 等值匹配；null 表示 IS NULL）。'
      + ' GET 可将 JSON 对象序列化为字符串：filter={"stationNo":"D01"}；'
      + '亦支持顶层同名字段（如 stationNo=D01）与 filter[stationNo]=D01。'
      + ' 同名字段：顶层参数（含 SQL :param）优先于 filter。',
    example: { status: 'active' },
  };

  const filterZod = z.preprocess((val) => {
    if (typeof val !== 'string') return val;
    const trimmed = val.trim();
    if (!trimmed) return undefined;
    try {
      return JSON.parse(trimmed);
    } catch {
      return val;
    }
  }, z.record(z.unknown()).optional());

  if (operation === 'find') {
    jsonSchema = {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: maxLimit, default: defaultLimit, description: '每页返回条数' },
        skip: { type: 'integer', minimum: 0, default: 0, description: '跳过的记录数（分页偏移）' },
        filter: filterSchema,
        ...sqlProps,
      },
    };
    zodSchema = z.object({
      limit: z.coerce.number().int().min(1).max(maxLimit).optional(),
      skip: z.coerce.number().int().min(0).optional(),
      filter: filterZod,
    }).merge(sqlZod);
  } else if (operation === 'count' || operation === 'countDocuments') {
    jsonSchema = {
      type: 'object',
      properties: {
        filter: filterSchema,
        ...sqlProps,
      },
    };
    zodSchema = z.object({
      filter: filterZod,
    }).merge(sqlZod);
  } else if (operation === 'findOne' || operation === 'exists') {
    jsonSchema = {
      type: 'object',
      properties: {
        filter: filterSchema,
        ...sqlProps,
      },
    };
    zodSchema = z.object({
      filter: filterZod,
    }).merge(sqlZod);
  } else if (operation === 'findById' || operation === 'deleteOne' || operation === 'save' || operation === 'replaceOne') {
    jsonSchema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', format: 'uuid', description: '资源 ID（路径参数）', example: SAMPLE_UUID },
        ...sqlProps,
      },
    };
    zodSchema = z.object({
      id: z.string().min(1),
    }).merge(sqlZod);
    if (operation === 'save' || operation === 'replaceOne') {
      jsonSchema.properties.body = { ...bodyJson, description: '全量替换的请求体（实体字段）' };
      zodSchema = zodSchema.extend({ body: bodyZod.optional() });
    }
  } else if (operation === 'create' || operation === 'insertOne') {
    jsonSchema = {
      type: 'object',
      properties: {
        body: { ...bodyJson, description: '新建记录的请求体（实体字段）' },
        ...sqlProps,
      },
    };
    zodSchema = z.object({
      body: bodyZod.optional(),
    }).merge(sqlZod);
  } else if (operation === 'updateOne' || operation === 'findOneAndUpdate') {
    const partialBodyJson = buildEntityBodySchema(fields, enumMap, { partial: true });
    const partialBodyZod = buildEntityBodyZod(fields, enumMap, { partial: true });
    jsonSchema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', format: 'uuid', description: '资源 ID（路径参数）', example: SAMPLE_UUID },
        body: {
          ...partialBodyJson,
          description: '部分更新字段（PATCH 语义：仅传需修改的字段）',
        },
        set: {
          ...partialBodyJson,
          description: '与 body 等效的更新字段（别名）；部分更新',
        },
        ...sqlProps,
      },
    };
    zodSchema = z.object({
      id: z.string().min(1),
      body: partialBodyZod.optional(),
      set: partialBodyZod.optional(),
    }).merge(sqlZod);
  } else if (operation === 'aggregate') {
    jsonSchema = {
      type: 'object',
      properties: {
        pipeline: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
          description: '聚合管道阶段（类 Mongo 聚合语法）',
          example: [{ $match: { status: 'active' } }, { $group: { _id: '$type', count: { $sum: 1 } } }],
        },
        ...sqlProps,
      },
    };
    zodSchema = z.object({
      pipeline: z.array(z.record(z.unknown())).optional(),
    }).merge(sqlZod);
  } else if (operation === 'distinct') {
    jsonSchema = {
      type: 'object',
      required: ['field'],
      properties: {
        field: { type: 'string', description: '去重字段名', example: 'status' },
        filter: filterSchema,
        ...sqlProps,
      },
    };
    zodSchema = z.object({
      field: z.string().min(1),
      filter: filterZod,
    }).merge(sqlZod);
  } else {
    jsonSchema = {
      type: 'object',
      properties: { ...sqlProps },
    };
    zodSchema = sqlZod;
  }

  jsonSchema = mergeInterfaceMetadata(jsonSchema, service);
  zodSchema = mergeInterfaceIntoZod(zodSchema, service, jsonSchema);

  const partialForced = forcePartialUpdateContainers(jsonSchema, zodSchema, operation);
  jsonSchema = partialForced.jsonSchema;
  zodSchema = partialForced.zodSchema;

  const mergedHandler = mergeDiscoveredHandlerParams(jsonSchema, zodSchema, service);
  jsonSchema = mergedHandler.jsonSchema;
  zodSchema = mergedHandler.zodSchema;

  if (jsonSchema?.properties) {
    // 仅当 requestParameterInterface 通过 getADBEnumByCode / @adb-enum 声明时注入枚举；
    // 不再按实体同名字段强制 Select，保证 Edit/Test/Create 与 interface 一致。
    enrichPropertiesWithInterfaceEnums(jsonSchema.properties, service, enumMap);
  }

  return { jsonSchema, zodSchema, meta, securityConfig, fields, script, defaultLimit };
}

/**
 * 自定义 SQL 命名参数中，未在 schema.required 且 interface 标记为可选（field?）的参数。
 * 未填写时不报错，按「字段 = 字段」恒真条件跳过过滤。
 */
function resolveOptionalSqlParamNames(service, operation, entity, enumMap = null) {
  const script = resolveDefinitionScript(service);
  if (!script) return new Set();

  const { jsonSchema } = buildBaseSchemas(service, operation, entity, enumMap);
  const names = extractSqlNamedParams(script);
  const required = new Set(Array.isArray(jsonSchema?.required) ? jsonSchema.required : []);
  const interfaceText = service?.requestParameterInterface
    || service?.request_parameter_interface
    || '';
  const { fields: ifaceFields } = parseRequestParameterInterface(interfaceText);

  const optional = new Set();
  names.forEach((name) => {
    if (['limit', 'skip'].includes(name.toLowerCase())) return;
    if (ifaceFields[name]?.required === false) {
      optional.add(name);
      return;
    }
    if (!required.has(name)) {
      optional.add(name);
    }
  });
  return optional;
}

function buildMockParameters(service, operation, entity, enumMap = null) {
  const { jsonSchema, zodSchema, fields, script, defaultLimit, securityConfig } = buildBaseSchemas(service, operation, entity, enumMap);
  void zodSchema;

  const mock = {};
  if (operation === 'find') {
    mock.limit = defaultLimit;
    mock.skip = 0;
  }

  extractSqlNamedParams(script).forEach((name) => {
    mock[name] = `sample_${name}`;
  });

  // TypeScript Handler：按 schema 属性补全 interface / 发现的命名参数示例
  const mode = service?.scriptMode || service?.script_mode || 'sql';
  if (mode === 'typescript' && jsonSchema?.properties) {
    Object.entries(jsonSchema.properties).forEach(([name, prop]) => {
      if (mock[name] !== undefined) return;
      if (['filter', 'body', 'set', 'pipeline'].includes(name)) return;
      if (prop?.type === 'boolean') {
        mock[name] = false;
        return;
      }
      if (prop?.type === 'integer' || prop?.type === 'number') {
        mock[name] = name === 'limit' ? defaultLimit : (name === 'skip' ? 0 : 1);
        return;
      }
      if (prop?.format === 'uuid') {
        mock[name] = SAMPLE_UUID;
        return;
      }
      if (prop?.type === 'object' || prop?.type === 'array') return;
      mock[name] = `sample_${name}`;
    });
  }

  if (['findById', 'deleteOne', 'updateOne', 'save', 'replaceOne', 'findOneAndUpdate'].includes(operation)) {
    mock.id = SAMPLE_UUID;
  }

  if (['create', 'insertOne', 'updateOne', 'save', 'replaceOne', 'findOneAndUpdate'].includes(operation)) {
    const body = {};
    filterEntityFields(fields, securityConfig).forEach((field) => {
      const key = field.fieldKey || field.field_key;
      if (!key || key === 'id') return;
      body[key] = mockValueForField(field);
    });
    if (Object.keys(body).length) {
      mock.body = body;
      if (operation === 'updateOne' || operation === 'findOneAndUpdate') {
        mock.set = { ...body };
      }
    }
  }

  if (operation === 'aggregate') {
    mock.pipeline = [{ $match: {} }, { $limit: 10 }];
  }

  if (operation === 'distinct') {
    const firstField = filterEntityFields(fields, securityConfig)[0];
    mock.field = firstField?.fieldKey || firstField?.field_key || 'id';
  }

  return mock;
}

function validateParameters(service, operation, parameters, entity, enumMap = null) {
  const { zodSchema } = buildBaseSchemas(service, operation, entity, enumMap);
  const coerced = coerceInvokeParameters(parameters || {}, entity, service);
  const parsed = zodSchema.safeParse(coerced);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    const err = new Error(`参数校验失败: ${issues.map((i) => `${i.path || '(root)'}: ${i.message}`).join('; ')}`);
    err.status = 400;
    err.validationErrors = issues;
    throw err;
  }
  validateFileObjectIds(parsed.data, collectInterfaceFileFields(service));
  return parsed.data;
}

function getParameterSchema(service, operation, entity, enumMap = null) {
  const { jsonSchema, zodSchema } = buildBaseSchemas(service, operation, entity, enumMap);
  return { jsonSchema, zodSchema };
}

function isWriteOperation(operation) {
  return WRITE_OPERATIONS.has(operation);
}

function isReadOperation(operation) {
  return READ_OPERATIONS.has(operation);
}

function resolveHandlerScript(service) {
  if (service?.handlerScript && String(service.handlerScript).trim()) {
    return String(service.handlerScript).trim();
  }
  const overrides = service?.scriptOverrides || {};
  if (overrides.__handler__ && String(overrides.__handler__).trim()) {
    return String(overrides.__handler__).trim();
  }
  return null;
}

function isOperationExecutable(service, operation, options = {}) {
  const allowWriteOperations = Boolean(options.allowWriteOperations);
  if (service?.scriptMode === 'typescript') {
    const handler = resolveHandlerScript(service);
    if (!handler) {
      return { executable: false, reason: 'TypeScript Handler 脚本为空' };
    }
    return { executable: true };
  }

  const script = resolveDefinitionScript(service);
  const hasTable = Boolean(service?.tableName);
  const hasScript = Boolean(script);

  if (!hasTable && !hasScript) {
    return { executable: false, reason: '服务未绑定物化表或 SQL 定义' };
  }

  if (isWriteOperation(operation)) {
    if (hasScript && !hasTable) {
      if (!allowWriteOperations) {
        return {
          executable: false,
          reason: '自定义 SQL 服务的写操作测试暂不支持自动执行，可先校验参数结构',
        };
      }
      return { executable: true };
    }
    if (!hasTable) {
      return { executable: false, reason: '写操作测试需要绑定实体表' };
    }
    return { executable: true };
  }

  if (operation === 'aggregate') {
    return { executable: false, reason: 'aggregate 测试执行暂未实现，可先校验参数结构' };
  }

  return { executable: true };
}

function buildRequestPreview(service, operation, parameters, entity) {
  void entity;
  const meta = getOperationMeta(operation);
  const basePath = service.basePath || `/api/v1/data/${service.routePath}`;
  const routePattern = meta?.routePattern || '';
  const pathParams = {};
  let url = `${basePath}${routePattern}`;

  const hasId = routePattern.includes(':id') && parameters?.id != null;
  const hasField = routePattern.includes(':field') && parameters?.field != null;
  if (hasId) {
    pathParams.id = parameters.id;
    url = url.replace(':id', encodeURIComponent(String(parameters.id)));
  }
  if (hasField) {
    pathParams.field = parameters.field;
    url = url.replace(':field', encodeURIComponent(String(parameters.field)));
  }

  const query = {};
  const httpMethod = String(meta?.httpMethod || 'GET').toUpperCase();
  // GET / HEAD / DELETE：参数在 URL query string，无 request body
  const isQueryMethod = httpMethod === 'GET' || httpMethod === 'HEAD' || httpMethod === 'DELETE';

  if (isQueryMethod) {
    // 所有顶级非 path 参数 → query string
    const pathParamKeys = new Set(Object.keys(pathParams));
    if (parameters && typeof parameters === 'object') {
      Object.entries(parameters).forEach(([key, value]) => {
        if (pathParamKeys.has(key)) return;
        if (key === 'body' || key === 'set') return; // GET 不应有 body
        if (value != null) query[key] = value;
      });
    }
    return {
      method: httpMethod,
      url,
      pathParams,
      query: Object.keys(query).length ? query : undefined,
      body: undefined,
    };
  }

  // POST / PUT / PATCH：分页 + SQL 命名参数走 query，body/set 走请求体
  if (operation === 'find') {
    if (parameters?.limit != null) query.limit = parameters.limit;
    if (parameters?.skip != null) query.skip = parameters.skip;
  }

  extractSqlNamedParams(resolveDefinitionScript(service)).forEach((name) => {
    if (parameters?.[name] != null) {
      query[name] = parameters[name];
    }
  });

  const body = parameters?.body || parameters?.set || undefined;

  return {
    method: httpMethod,
    url,
    pathParams,
    query: Object.keys(query).length ? query : undefined,
    body,
  };
}

function pascalCase(value) {
  return String(value || 'Record')
    .split(/[_\s:-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function pgTypeToTsType(field) {
  const typeorm = field.typeormConfig || field.typeorm_config || {};
  const pgType = String(typeorm.type || 'varchar').toLowerCase();
  if (['int', 'integer', 'bigint', 'smallint', 'numeric', 'decimal', 'float', 'double', 'real'].some((t) => pgType.includes(t))) {
    return 'number';
  }
  if (pgType.includes('bool')) return 'boolean';
  if (pgType.includes('json')) return 'Record<string, unknown>';
  if (pgType.includes('uuid')) return 'string';
  if (pgType.includes('timestamp') || pgType.includes('date')) return 'string';
  return 'string';
}

function buildEntityRecordSchema(fields) {
  const properties = {};
  const required = [];
  (fields || []).forEach((field) => {
    const key = field.fieldKey || field.field_key;
    if (!key) return;
    const schema = pgTypeToJsonSchema(field);
    const typeorm = field.typeormConfig || field.typeorm_config || {};
    properties[key] = {
      ...schema,
      description: field.columnInfo?.label || field.column_info?.label || key,
    };
    if (typeorm.primary || key === 'id' || typeorm.nullable === false) {
      required.push(key);
    }
  });
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
  };
}

function buildEntityRecordInterface(entity, securityConfig, interfaceName) {
  const fields = filterEntityFields(entity?.fields, securityConfig);
  if (!fields.length) return '';

  const lines = [`interface ${interfaceName} {`];
  fields.forEach((field) => {
    const key = field.fieldKey || field.field_key;
    if (!key) return;
    const typeorm = field.typeormConfig || field.typeorm_config || {};
    const label = field.columnInfo?.label || field.column_info?.label || key;
    const optional = typeorm.primary || key === 'id' || typeorm.nullable === false ? '' : '?';
    lines.push(`  /** ${label} */`);
    lines.push(`  ${key}${optional}: ${pgTypeToTsType(field)};`);
  });
  lines.push('}');
  return lines.join('\n');
}

function parsePrimaryInterfaceName(interfaceText) {
  const match = String(interfaceText || '').trim().match(/interface\s+(\w+)/);
  return match?.[1] || null;
}

function formatRefEntity(entityCode) {
  const code = String(entityCode || '').trim();
  if (!code) return null;
  return code.startsWith('@') ? code : `@${code}`;
}

function buildRefEntitySchema(entityCode) {
  const ref = formatRefEntity(entityCode);
  return ref ? { $refEntity: ref } : { type: 'object', additionalProperties: true };
}

function wrapEnvelopeSchema(dataSchema) {
  return {
    type: 'object',
    properties: {
      code: { type: 'integer', example: 200 },
      message: { type: 'string', example: 'success' },
      data: dataSchema,
    },
    required: ['code', 'message', 'data'],
  };
}

function buildResponsesSchemaEntry(innerSchema, description = '获取成功') {
  return {
    description,
    content: {
      'application/json': {
        schema: wrapEnvelopeSchema(innerSchema),
      },
    },
  };
}

function buildDefaultResponsesSchema(operation, entityCode) {
  const entityRef = buildRefEntitySchema(entityCode);
  const looseItem = { type: 'object', additionalProperties: true, nullable: true };

  let dataSchema;
  if (operation === 'find') {
    dataSchema = {
      type: 'object',
      properties: {
        items: { type: 'array', items: entityCode ? entityRef : { type: 'object' } },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer', example: 100 },
            page: { type: 'integer', example: 1 },
            pageSize: { type: 'integer', example: 10 },
            totalPages: { type: 'integer', example: 10 },
            hasNext: { type: 'boolean', example: true },
          },
          required: ['total', 'page', 'pageSize', 'totalPages', 'hasNext'],
        },
      },
      required: ['items', 'pagination'],
    };
  } else if (operation === 'count' || operation === 'countDocuments') {
    dataSchema = {
      type: 'object',
      properties: { count: { type: 'integer', example: 1 } },
      required: ['count'],
    };
  } else if (operation === 'distinct') {
    dataSchema = {
      type: 'object',
      properties: { values: { type: 'array', items: { type: 'string' }, example: ['sample'] } },
      required: ['values'],
    };
  } else if (operation === 'deleteOne' || operation === 'findOneAndDelete') {
    dataSchema = {
      type: 'object',
      properties: {
        item: entityCode ? { ...entityRef, nullable: true } : looseItem,
        deleted: { type: 'integer', example: 1 },
      },
    };
  } else if (operation === 'updateOne' || operation === 'findOneAndUpdate') {
    dataSchema = {
      type: 'object',
      properties: {
        item: entityCode ? { ...entityRef, nullable: true } : looseItem,
        matched: { type: 'integer', example: 1 },
      },
    };
  } else if (['create', 'insertOne', 'findById', 'findOne', 'save', 'replaceOne'].includes(operation)) {
    dataSchema = {
      type: 'object',
      properties: {
        item: entityCode ? { ...entityRef, nullable: true } : looseItem,
      },
      required: ['item'],
    };
  } else if (operation === 'aggregate') {
    dataSchema = {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
      required: ['items'],
    };
  } else if (operation === 'exists') {
    dataSchema = {
      type: 'object',
      properties: { exists: { type: 'boolean', example: false } },
      required: ['exists'],
    };
  } else {
    dataSchema = { type: 'object', additionalProperties: true };
  }

  return {
    200: buildResponsesSchemaEntry(dataSchema),
  };
}

function extractInnerResponseSchema(responsesSchema) {
  if (!responsesSchema || typeof responsesSchema !== 'object') return { type: 'object' };
  const entry = responsesSchema['200'] || responsesSchema[200];
  const schema = entry?.content?.['application/json']?.schema;
  return schema && typeof schema === 'object' ? schema : { type: 'object' };
}

function buildResponseInterfaceText(service, operation, entity, securityConfig) {
  const fields = filterEntityFields(entity?.fields, securityConfig);
  const recordName = `${pascalCase(entity?.code || service?.entityCode || 'Entity')}Record`;
  const recordInterface = buildEntityRecordInterface(entity, securityConfig, recordName);
  const requestInterfaceText = service?.requestParameterInterface
    || service?.request_parameter_interface
    || '';
  const requestInterfaceName = parsePrimaryInterfaceName(requestInterfaceText);
  const hasEntityFields = fields.length > 0;
  const itemRecordType = hasEntityFields
    ? recordName
    : (requestInterfaceName ? `(${requestInterfaceName} & { id: string })` : 'Record<string, unknown>');

  let responseWrapper;
  if (operation === 'find') {
    responseWrapper = `interface Response {\n  code: number;\n  message: string;\n  data: {\n    items: ${itemRecordType}[];\n    pagination: {\n      total: number;\n      page: number;\n      pageSize: number;\n      totalPages: number;\n      hasNext: boolean;\n    };\n  };\n}`;
  } else if (operation === 'count' || operation === 'countDocuments') {
    responseWrapper = 'interface Response {\n  code: number;\n  message: string;\n  data: { count: number };\n}';
  } else if (operation === 'distinct') {
    responseWrapper = 'interface Response {\n  code: number;\n  message: string;\n  data: { values: string[] };\n}';
  } else if (operation === 'deleteOne' || operation === 'findOneAndDelete') {
    responseWrapper = `interface Response {\n  code: number;\n  message: string;\n  data: { item: ${itemRecordType} | null; deleted: number };\n}`;
  } else if (operation === 'updateOne' || operation === 'findOneAndUpdate') {
    responseWrapper = `interface Response {\n  code: number;\n  message: string;\n  data: { item: ${itemRecordType} | null; matched: number };\n}`;
  } else if (['create', 'insertOne', 'findById', 'findOne', 'save', 'replaceOne'].includes(operation)) {
    responseWrapper = `interface Response {\n  code: number;\n  message: string;\n  data: { item: ${itemRecordType} | null };\n}`;
  } else if (operation === 'aggregate') {
    responseWrapper = 'interface Response {\n  code: number;\n  message: string;\n  data: { items: Record<string, unknown>[] };\n}';
  } else if (operation === 'exists') {
    responseWrapper = 'interface Response {\n  code: number;\n  message: string;\n  data: { exists: boolean };\n}';
  } else {
    responseWrapper = 'interface Response {\n  code: number;\n  message: string;\n  data: Record<string, unknown>;\n}';
  }

  if (recordInterface) {
    return `${recordInterface}\n\n${responseWrapper}`;
  }
  if (requestInterfaceText.trim()) {
    return `${requestInterfaceText.trim()}\n\n${responseWrapper}`;
  }
  return responseWrapper;
}

function getResponseOverrides(service, operation) {
  const securityConfig = resolveSecurityConfig(service);
  const overrides = securityConfig?.responseOverrides?.[operation];
  if (!overrides || typeof overrides !== 'object') return null;
  return overrides;
}

function getResponseDescriptor(service, operation, entity) {
  const securityConfig = resolveSecurityConfig(service);
  const entityCode = entity?.code || service?.entityCode || service?.entity_code || null;
  const overrides = getResponseOverrides(service, operation);

  const responsesSchema = overrides?.responsesSchema
    && typeof overrides.responsesSchema === 'object'
    ? overrides.responsesSchema
    : buildDefaultResponsesSchema(operation, entityCode);

  const responseSchema = extractInnerResponseSchema(responsesSchema);
  const responseInterface = buildResponseInterfaceText(service, operation, entity, securityConfig);

  return {
    responseInterface,
    responsesSchema,
    responseSchema,
  };
}

function hasNullItemInResponseExample(example) {
  if (!example || typeof example !== 'object') return false;
  const { data } = example;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (!Object.prototype.hasOwnProperty.call(data, 'item')) return false;
  return data.item == null;
}

function resolveResponseExample(responseExample, operation, mockParameters, entityCode, entity, service) {
  if (!hasNullItemInResponseExample(responseExample)) return responseExample;
  const rebuilt = buildResponseExample(operation, mockParameters, entityCode, entity, service);
  const item = rebuilt?.data?.item;
  if (item == null) return responseExample;
  return {
    ...responseExample,
    data: { ...responseExample.data, item },
  };
}

function getResponseDefinition(service, operation, entity, mockParameters) {
  const descriptor = getResponseDescriptor(service, operation, entity);
  const overrides = getResponseOverrides(service, operation);
  const entityCode = entity?.code || service?.entityCode;
  let responseExample = overrides?.responseExample != null
    ? overrides.responseExample
    : buildResponseExample(
      operation,
      mockParameters,
      entityCode,
      entity,
      service,
    );
  responseExample = resolveResponseExample(
    responseExample,
    operation,
    mockParameters,
    entityCode,
    entity,
    service,
  );
  return {
    ...descriptor,
    responseExample,
  };
}

/**
 * 根据操作类型 + mock 请求参数，构建一个 200 成功响应的示例（与 Schema 分离）。
 */
function buildResponseExample(operation, mockParameters, entityCode, entity, service) {
  let sampleItem = mockParameters?.set || mockParameters?.body || null;
  if (sampleItem && typeof sampleItem === 'object' && mockParameters?.id) {
    sampleItem = { id: mockParameters.id, ...sampleItem };
  }
  if (!sampleItem && entity) {
    const mock = buildMockParameters(service || {}, operation, entity);
    if (mock.body && typeof mock.body === 'object' && Object.keys(mock.body).length) {
      sampleItem = { id: SAMPLE_UUID, ...mock.body };
    }
  }
  if (!sampleItem && entityCode) {
    const shortName = String(entityCode).split(':').pop() || 'record';
    sampleItem = {
      id: SAMPLE_UUID,
      name: `sample_${shortName}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  const envelope = (data) => ({ code: 200, message: 'success', data });

  switch (operation) {
    case 'find':
      return envelope({
        items: sampleItem ? [sampleItem] : [],
        pagination: {
          total: sampleItem ? 1 : 0,
          page: 1,
          pageSize: mockParameters?.limit ?? mockParameters?.pageSize ?? 10,
          totalPages: sampleItem ? 1 : 0,
          hasNext: false,
        },
      });
    case 'count':
    case 'countDocuments':
      return envelope({ count: 1 });
    case 'distinct':
      return envelope({ values: ['sample'] });
    case 'deleteOne':
    case 'findOneAndDelete':
      return envelope({ item: sampleItem, deleted: 1 });
    case 'updateOne':
    case 'findOneAndUpdate':
      return envelope({ item: sampleItem, matched: 1 });
    case 'create':
    case 'insertOne':
    case 'findById':
    case 'findOne':
    case 'save':
    case 'replaceOne':
      return envelope({ item: sampleItem });
    case 'aggregate':
      return envelope({ items: [{ _id: 'group1', count: 1 }] });
    case 'exists':
      return envelope({ exists: false });
    default:
      return envelope({});
  }
}

function parseRefEntityCode(refEntity) {
  const raw = String(refEntity || '').trim();
  if (!raw) return null;
  return raw.startsWith('@') ? raw.slice(1) : raw;
}

function buildEntitySchemaForEntity(entity, securityConfig = DEFAULT_SECURITY_CONFIG) {
  const fields = filterEntityFields(entity?.fields, securityConfig);
  if (!fields.length) return { type: 'object', additionalProperties: true };
  return buildEntityRecordSchema(fields);
}

function buildEntitySchemaResolver(entityByCode, securityConfig = DEFAULT_SECURITY_CONFIG) {
  const cache = entityByCode instanceof Map ? entityByCode : new Map();
  return (entityCode) => {
    const entity = cache.get(entityCode);
    if (!entity) return null;
    return buildEntitySchemaForEntity(entity, securityConfig);
  };
}

function resolveRefEntityInSchema(schema, resolveEntitySchema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) {
    return schema.map((item) => resolveRefEntityInSchema(item, resolveEntitySchema));
  }
  if (schema.$refEntity) {
    const entityCode = parseRefEntityCode(schema.$refEntity);
    const resolved = entityCode ? resolveEntitySchema(entityCode) : null;
    if (resolved) {
      const { $refEntity, ...rest } = schema;
      return { ...resolved, ...rest };
    }
    const { $refEntity, ...rest } = schema;
    return { type: 'object', additionalProperties: true, ...rest };
  }
  const result = { ...schema };
  Object.keys(result).forEach((key) => {
    if (result[key] && typeof result[key] === 'object') {
      result[key] = resolveRefEntityInSchema(result[key], resolveEntitySchema);
    }
  });
  return result;
}

function resolveResponsesSchema(responsesSchema, resolveEntitySchema) {
  if (!responsesSchema || typeof responsesSchema !== 'object') return responsesSchema;
  const resolved = {};
  Object.entries(responsesSchema).forEach(([status, entry]) => {
    if (!entry || typeof entry !== 'object') {
      resolved[status] = entry;
      return;
    }
    const nextEntry = { ...entry };
    const content = entry.content?.['application/json'];
    if (content?.schema) {
      nextEntry.content = {
        ...entry.content,
        'application/json': {
          ...content,
          schema: resolveRefEntityInSchema(content.schema, resolveEntitySchema),
        },
      };
    }
    resolved[status] = nextEntry;
  });
  return resolved;
}

module.exports = {
  SAMPLE_UUID,
  extractSqlNamedParams,
  getParameterSchema,
  loadEnumMapForEntity,
  resolveOptionalSqlParamNames,
  getResponseDescriptor,
  getResponseDefinition,
  buildDefaultResponsesSchema,
  buildResponseExample,
  resolveRefEntityInSchema,
  resolveResponsesSchema,
  formatRefEntity,
  parseRefEntityCode,
  buildEntitySchemaForEntity,
  buildEntitySchemaResolver,
  validateParameters,
  coerceInvokeParameters,
  forcePartialUpdateContainers,
  normalizeWriteBody,
  buildMockParameters,
  buildRequestPreview,
  isWriteOperation,
  isReadOperation,
  isOperationExecutable,
  resolveDefinitionScript,
  resolveHandlerScript,
  parseRequestParameterInterface,
  discoverHandlerParams,
  guessParamJsonSchema,
};
