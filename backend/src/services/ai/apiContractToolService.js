/**
 * `eadaf_api_contract` —— 给 AI 用的「API 契约查询」server_builtin Tool。
 *
 * 解决什么问题：模型在调平台/业务 API 时经常**猜路径、猜参数名**（/api/v1/bizdata、
 * /api/v1/orders、page_size vs pageSize…），一次任务里要试错好几轮。
 * 这里把公开的 OpenAPI 契约（`GET /api/v1/applications-public/{key}/apis.json`，免登录）
 * 做成可**按关键词/路径过滤**的查询：先查契约 → 再按契约调用。
 *
 * 为什么不直接让模型 GET 那份 JSON：YS 一份就有 140KB，远超单条 Tool 结果预算
 * （ai-base 默认 8000 字符），整份塞进上下文会被截断，反而更乱。
 */
const { getPublicApiOpenApi } = require('../applicationApiOpenApiService');
const { Application } = require('../../models');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_DESCRIPTION_CHARS = 240;

function normalizePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  // 允许直接粘贴完整 URL：只取 pathname 部分
  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      path = new URL(raw).pathname;
    } catch {
      path = raw;
    }
  }
  if (!path.startsWith('/')) path = `/${path}`;
  return path.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
}

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function truncate(value, max = MAX_DESCRIPTION_CHARS) {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** OpenAPI paths → 扁平 operation 列表 */
function flattenOperations(openapi) {
  const rows = [];
  const paths = openapi?.paths && typeof openapi.paths === 'object' ? openapi.paths : {};
  for (const [path, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== 'object') continue;
    for (const [method, operation] of Object.entries(methods)) {
      if (!HTTP_METHODS.includes(method)) continue; // 跳过 x-* 扩展字段
      if (!operation || typeof operation !== 'object') continue;
      rows.push({ path, method: method.toUpperCase(), operation });
    }
  }
  return rows;
}

function collectParamNames(operation) {
  const params = Array.isArray(operation.parameters) ? operation.parameters : [];
  const names = params.map((param) => param?.name).filter(Boolean);
  const requiredNames = params.filter((param) => param?.required).map((param) => param?.name).filter(Boolean);
  return { names, requiredNames };
}

function collectBodySchema(operation) {
  const content = operation.requestBody?.content;
  const jsonSchema = content?.['application/json']?.schema || content?.['*/*']?.schema;
  if (!jsonSchema || typeof jsonSchema !== 'object') return null;
  const properties = jsonSchema.properties && typeof jsonSchema.properties === 'object'
    ? jsonSchema.properties
    : {};
  return {
    required: Array.isArray(jsonSchema.required) ? jsonSchema.required : [],
    properties: Object.keys(properties).map((name) => ({
      name,
      type: properties[name]?.type || 'string',
      description: truncate(properties[name]?.description || '', 120) || undefined,
    })),
  };
}

function toSummaryRow({ path, method, operation }) {
  const { names, requiredNames } = collectParamNames(operation);
  const body = collectBodySchema(operation);
  return {
    method,
    path,
    summary: truncate(operation.summary || operation.operationId || ''),
    operationId: operation.operationId || undefined,
    params: names.length ? names : undefined,
    requiredParams: requiredNames.length ? requiredNames : undefined,
    bodyRequired: body?.required.length ? body.required : undefined,
    bodyProps: body?.properties.length ? body.properties.map((item) => item.name) : undefined,
  };
}

function toDetailRow({ path, method, operation }) {
  const row = toSummaryRow({ path, method, operation });
  const params = Array.isArray(operation.parameters) ? operation.parameters : [];
  return {
    ...row,
    parameters: params.length
      ? params.map((param) => ({
        name: param.name,
        in: param.in,
        required: Boolean(param.required),
        type: param?.schema?.type || 'string',
        format: param?.schema?.format || undefined,
        description: truncate(param.description || param?.schema?.description || '', 160) || undefined,
        example: param.example ?? param?.schema?.example,
      }))
      : undefined,
    requestBody: collectBodySchema(operation) || undefined,
    description: truncate(operation.description || ''),
  };
}

/** 应用未指定时，给出可选应用清单，省掉模型一次盲猜 */
async function listAvailableApps() {
  const apps = await Application.findAll({
    where: { status: 'ACTIVE' },
    attributes: ['application_id', 'code', 'name', 'api_enabled'],
    order: [['code', 'ASC']],
  });
  return apps.map((app) => {
    const row = app.toJSON ? app.toJSON() : app;
    return { code: row.code, name: row.name, apiEnabled: row.api_enabled === true };
  });
}

/**
 * @param {object} args
 * @param {string} [args.app] 应用 code 或 application_id；缺省时用请求上下文里的应用
 * @param {string} [args.keyword] 按 path / summary / operationId 模糊匹配
 * @param {string} [args.path] 精确或前缀路径，如 /api/v1/business-data/entities
 * @param {'summary'|'detail'} [args.detail] summary=一行一个 operation；detail=带参数与请求体 schema
 * @param {number} [args.limit]
 * @param {{ requestedApp?: string|null }} [context] 请求上下文（`?app=` / JWT 自述的应用）
 */
async function queryApiContract(args = {}, context = {}) {
  const app = String(
    args.app
    || args.applicationKey
    || args.application_id
    || context.requestedApp
    || '',
  ).trim();
  if (!app) {
    return {
      ok: false,
      error: {
        code: 'APP_REQUIRED',
        message: '缺少 app（应用 code 或 application_id）',
        hint: '把 app 设为当前应用 code，例如 YS / EADAF / SFDEP；下方是可选项',
      },
      applications: await listAvailableApps(),
    };
  }

  const openapi = await getPublicApiOpenApi(app);
  if (openapi?.error) {
    return {
      ok: false,
      error: { code: 'APP_NOT_FOUND', message: String(openapi.error), hint: '确认应用 code 是否存在且已启用 API' },
      applications: await listAvailableApps(),
    };
  }

  const limit = clampLimit(args.limit);
  const keyword = String(args.keyword || '').trim().toLowerCase();
  const pathFilter = normalizePath(args.path || '');

  const all = flattenOperations(openapi);
  const matched = all.filter((row) => {
    if (pathFilter && pathFilter !== '/') {
      const samePath = row.path === pathFilter;
      const underPath = row.path.startsWith(`${pathFilter}/`);
      // 支持粘贴完整 URL（带查询串/具体 id 的情况）：退化为前缀匹配
      if (!samePath && !underPath) return false;
    }
    if (keyword) {
      const haystack = `${row.path} ${row.method} ${row.operation.summary || ''} ${row.operation.operationId || ''}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });

  // 命中很少时直接给细节：省掉「先 summary 再 detail」的第二轮
  const requestedDetail = String(args.detail || '').toLowerCase();
  const detail = requestedDetail === 'detail' || requestedDetail === 'summary'
    ? requestedDetail
    : matched.length > 0 && matched.length <= 3
      ? 'detail'
      : 'summary';

  const operations = matched
    .slice(0, limit)
    .map((row) => (detail === 'detail' ? toDetailRow(row) : toSummaryRow(row)));

  const result = {
    ok: true,
    app,
    detail,
    totalOperations: all.length,
    matchedOperations: matched.length,
    returned: operations.length,
    operations,
  };

  if (!matched.length) {
    result.hint = '没有匹配项。换个 keyword（如 entities / data / storage / metrics）或去掉 path 再查；也可以先不传过滤条件看总览。';
  } else if (matched.length > operations.length) {
    result.hint = `只返回前 ${operations.length} 个匹配；请收窄 keyword/path，或调大 limit（最大 ${MAX_LIMIT}）。`;
  }
  if (detail === 'summary') {
    result.hint = result.hint
      || '需要参数名/必填/请求体细节时，用 detail="detail" + path 精确到单个接口再查一次；调用时路径与参数名逐字照抄。';
  }
  if (detail === 'detail' && operations.some((op) => (op.params || []).length)) {
    result.callTip = 'GET/HEAD/DELETE 参数放 query string；POST/PUT/PATCH 参数放 JSON body。列表类接口先取一页（page/size 等以契约为准）并读 data.pagination.total，用分页翻页，不要靠枚举前缀凑全量。';
  }
  return result;
}

module.exports = { queryApiContract, normalizePath, flattenOperations };
