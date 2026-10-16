/**
 * 请求参数面板共用：
 * - interface → ParameterRow（结构 / 控件类型）
 * - Example 值可在默认值基础上由用户 / AI 完善，且不应为空
 */

import type { ParameterRow, ParamIn } from '@/components/OperationParameterPanel';
import { isQueryOnlyMethod } from '@/components/OperationParameterPanel';
import { optionsFromEnum } from '@/pages/BusinessData/utils/enumUtils';
import { getBusinessDataEnums } from '@/services/EADAF/api/businessData';
import { isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { parseInterfaceFields, parseNestedInterfaceFields, type InterfaceField } from './parseInterfaceFields';

export type EnumOptionsByCode = Record<
  string,
  { values: Array<string | number>; labels: Record<string, string> }
>;

function normalizeRowType(field: InterfaceField): string {
  if (field.enumCode) return 'string';
  const raw = String(field.type || 'string').trim().toLowerCase();
  if (raw.includes('boolean')) return 'boolean';
  if (raw.includes('number') || raw.includes('int') || raw.includes('float') || raw.includes('double')) {
    return 'number';
  }
  if (field.isArray || raw.includes('[]') || raw.includes('array')) return 'string';
  if (raw.includes('object') || raw.includes('record')) return 'object';
  return raw || 'string';
}

export function collectEnumCodesFromInterface(interfaceText?: string | null): string[] {
  const codes = new Set<string>();
  parseInterfaceFields(interfaceText).forEach((field) => {
    if (field.enumCode) codes.add(field.enumCode);
  });
  (['body', 'set'] as const).forEach((container) => {
    parseNestedInterfaceFields(interfaceText, container).forEach((field) => {
      if (field.enumCode) codes.add(field.enumCode);
    });
  });
  return [...codes];
}

export async function loadEnumOptionsByCodes(codes: string[]): Promise<EnumOptionsByCode> {
  const needed = [...new Set(codes.map((c) => String(c || '').trim()).filter(Boolean))];
  if (!needed.length) return {};
  const res = await getBusinessDataEnums({ page: 1, size: 200 });
  if (!isApiSuccess(res)) return {};
  const { items } = parseApiListResponse<API.BusinessDataEnum>(res);
  const next: EnumOptionsByCode = {};
  const neededSet = new Set(needed);
  (items || []).forEach((record) => {
    const code = String(record.code || '').trim();
    if (!code || !neededSet.has(code)) return;
    const options = optionsFromEnum(record);
    if (!options.length) return;
    const labels: Record<string, string> = {};
    options.forEach((opt) => {
      labels[String(opt.value)] = opt.label || String(opt.value);
    });
    next[code] = {
      values: options.map((opt) => opt.value),
      labels,
    };
  });
  return next;
}

/** 由 requestParameterInterface 生成面板参数行（Edit / Test / 文档共用） */
export function buildParameterRowsFromInterface(options: {
  interfaceText?: string | null;
  httpMethod?: string;
  routePattern?: string;
  enumOptionsByCode?: EnumOptionsByCode;
}): ParameterRow[] {
  const fields = parseInterfaceFields(options.interfaceText);
  if (!fields.length) return [];

  const isGet = isQueryOnlyMethod(options.httpMethod);
  const pathParams = new Set(
    String(options.routePattern || '')
      .match(/:[A-Za-z_][A-Za-z0-9_]*/g)
      ?.map((token) => token.slice(1)) || [],
  );
  const enumMap = options.enumOptionsByCode || {};

  return fields.map((field) => {
    const enumMeta = field.enumCode ? enumMap[field.enumCode] : undefined;
    const paramIn: ParamIn = pathParams.has(field.name)
      ? 'path'
      : isGet
        ? 'query'
        : 'body';
    const row: ParameterRow = {
      name: field.name,
      in: paramIn,
      type: normalizeRowType(field),
      typeLabel: field.typeLabel || field.type,
      required: field.required,
      description: field.description,
      isArray: field.isArray,
    };
    if (enumMeta?.values?.length) {
      row.enum = enumMeta.values;
      row.enumLabels = enumMeta.labels;
    }
    return row;
  });
}

/** 按参数行生成默认 Example（boolean→false，必填枚举取首项；可选枚举不预填） */
export function buildDefaultExampleValues(rows: ParameterRow[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  rows.forEach((row) => {
    if (row.enum?.length) {
      // 可选枚举：不预填，允许空选；必填才取首项
      if (!row.required) return;
      values[row.name] = row.isArray ? [row.enum[0]] : row.enum[0];
      return;
    }
    if (row.type === 'boolean') {
      values[row.name] = false;
      return;
    }
    if (row.type === 'number' || row.type === 'integer') {
      if (row.name === 'limit' || row.name === 'page_size' || row.name === 'pageSize') {
        values[row.name] = 20;
      } else if (row.name === 'skip' || row.name === 'offset' || row.name === 'page') {
        values[row.name] = 0;
      } else if (row.required) {
        values[row.name] = 0;
      }
      return;
    }
    if (row.isArray) {
      if (row.required) values[row.name] = [];
      return;
    }
    if (row.type === 'object') {
      if (row.required) values[row.name] = {};
      return;
    }
    // 字符串：必填给占位；可选不写入，避免「假有值」
    if (row.required) values[row.name] = '';
  });
  return values;
}

/**
 * Example 与结构对齐：保留已有值，缺失字段用默认值补齐。
 * 若整体为空对象，则整份用默认 Example。
 * 可选字段若用户已清空（键不存在），不会被再次补回。
 */
export function ensureExampleValues(
  rows: ParameterRow[],
  current?: Record<string, unknown> | null,
): Record<string, unknown> {
  const defaults = buildDefaultExampleValues(rows);
  if (!rows.length) return { ...(current || {}) };
  const cur = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  const keys = Object.keys(cur).filter((k) => cur[k] !== undefined);
  if (!keys.length) return defaults;

  const next: Record<string, unknown> = { ...cur };
  rows.forEach((row) => {
    if (next[row.name] !== undefined) return;
    if (!Object.prototype.hasOwnProperty.call(defaults, row.name)) return;
    next[row.name] = defaults[row.name];
  });
  return next;
}
