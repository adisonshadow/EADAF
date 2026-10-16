const { quoteIdent } = require('./sqlDialect');
const { extractSqlNamedParams, resolveDefinitionScript } = require('./operationParameterSchemas');

/**
 * 不参与 filter 解析的结构化参数字段。
 *
 * `app`：SSO 应用密钥签发的用户 JWT 调受保护路由时必须带 `?app=<application_id>`
 * （见 middlewares/auth.js 用它选择验签密钥），它不是业务过滤条件。
 */
const STRUCTURAL_PARAM_KEYS = new Set([
  'limit', 'skip', 'filter', 'body', 'set', 'id', 'field', 'pipeline', 'operation', 'app',
]);

const COLUMN_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isFilterableValue(value) {
  if (value === undefined) return false;
  if (value !== null && typeof value === 'object') return false;
  return true;
}

function getSqlParamNameSet(service) {
  return new Set(
    extractSqlNamedParams(resolveDefinitionScript(service)).map((name) => name.toLowerCase()),
  );
}

/**
 * 合并 filter 到 SQL 命名参数：顶层同名字段优先，filter 仅填补空缺。
 * 用于自定义 definition SQL 的 :param 替换。
 */
function buildSqlExecutionParameters(parameters, service) {
  const script = resolveDefinitionScript(service);
  if (!script) return parameters || {};

  const filter = parameters?.filter;
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
    return parameters || {};
  }

  const sqlNames = extractSqlNamedParams(script);
  const merged = { ...(parameters || {}) };
  sqlNames.forEach((name) => {
    if (merged[name] != null) return;
    const filterValue = filter[name];
    if (isFilterableValue(filterValue)) {
      merged[name] = filterValue;
    }
  });
  return merged;
}

/**
 * 从 parameters.filter + 顶层标量字段解析等值过滤条件（外层 WHERE）。
 * - 顶层同名字段优先于 filter
 * - 已在 definition SQL 中作为 :param 的字段不再重复过滤（由 SQL 替换处理）
 */
function resolveFilterEntries(parameters, service) {
  const sqlParamNames = getSqlParamNameSet(service);
  const merged = {};

  const filter = parameters?.filter;
  if (filter && typeof filter === 'object' && !Array.isArray(filter)) {
    Object.entries(filter).forEach(([key, value]) => {
      if (!COLUMN_NAME_RE.test(key)) return;
      if (STRUCTURAL_PARAM_KEYS.has(key)) return;
      if (!isFilterableValue(value)) return;
      if (sqlParamNames.has(key.toLowerCase())) return;
      merged[key] = value;
    });
  }

  Object.entries(parameters || {}).forEach(([key, value]) => {
    if (STRUCTURAL_PARAM_KEYS.has(key)) return;
    if (!COLUMN_NAME_RE.test(key)) return;
    if (!isFilterableValue(value)) return;
    if (sqlParamNames.has(key.toLowerCase())) return;
    merged[key] = value;
  });

  return Object.entries(merged).map(([key, value]) => ({ key, value }));
}

/**
 * 将过滤条目转为参数化 WHERE 子句（等值 / IS NULL）。
 * @param {{ startIndex?: number, qualifier?: string, dbType?: string, quoteIdentFn?: (name: string) => string }} [options]
 * @returns {{ clause: string, bindings: unknown[], nextIndex: number }}
 */
function buildParameterizedWhere(entries, {
  startIndex = 1,
  qualifier = '',
  dbType = 'postgresql',
  quoteIdentFn,
} = {}) {
  if (!entries.length) {
    return { clause: '', bindings: [], nextIndex: startIndex };
  }

  const quote = quoteIdentFn || ((name) => quoteIdent(name, dbType));
  const prefix = qualifier ? `${qualifier}.` : '';
  const conditions = [];
  const bindings = [];
  let idx = startIndex;

  entries.forEach(({ key, value }) => {
    const col = `${prefix}${quote(key)}`;
    if (value === null) {
      conditions.push(`${col} IS NULL`);
      return;
    }
    conditions.push(`${col} = $${idx}`);
    bindings.push(value);
    idx += 1;
  });

  return {
    clause: ` WHERE ${conditions.join(' AND ')}`,
    bindings,
    nextIndex: idx,
  };
}

module.exports = {
  STRUCTURAL_PARAM_KEYS,
  buildSqlExecutionParameters,
  resolveFilterEntries,
  buildParameterizedWhere,
};
