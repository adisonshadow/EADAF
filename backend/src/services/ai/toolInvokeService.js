const salesData = require('../demo/salesDataService');
const materializationService = require('../businessData/materializationService');
const materializedTableBrowseService = require('../businessData/materializedTableBrowseService');
const { executeToolWithEnvelope } = require('./executeToolWithEnvelope');
const { executeHttpRequest } = require('./httpRequestToolService');
const { queryApiContract } = require('./apiContractToolService');
const { validateToolArgs } = require('../../utils/validateToolArgs');
const { normalizeToolResult } = require('../../utils/normalizeToolResult');
const { writeOperationLog } = require('../operationAudit/writeOperationLog');

/** server_builtin 绕过 HTTP 中间件时补记操作日志；永不抛错。 */
function logBuiltinAudit(record) {
  try {
    writeOperationLog(record);
  } catch (_) {
    /* ignore */
  }
}

function builtinAuditBase(context = {}, overrides = {}) {
  return {
    operator_id: context.userId || null,
    operator_name: null,
    operator_type: 'USER',
    application_id: null,
    domain: 'bizdata',
    user_id: null,
    resource_name: null,
    old_data: null,
    new_data: null,
    ip: null,
    user_agent: null,
    trace_id: context.traceId || null,
    duration_ms: null,
    request_summary: { source: 'server_builtin' },
    ...overrides,
  };
}

const BUILTIN_HANDLERS = {
  /** 公共 HTTP 请求（类 curl）；context.userToken 用于受信主机鉴权 */
  http_request: async (args, context = {}) => executeHttpRequest(args, context),
  /** 平台/业务 API 契约查询：先查契约再调用，避免模型猜路径与参数名 */
  eadaf_api_contract: async (args, context = {}) => queryApiContract(args, context),
  demo_echo: async (args) => ({
    echoed: args,
    message: 'Server builtin echo succeeded'
  }),
  demo_order_lookup: async (args) => {
    const orderId = String(args.orderId || args.order_id || 'unknown');
    return {
      orderId,
      status: 'shipped',
      items: [{ sku: 'DEMO-001', name: '示例商品', qty: 1 }],
      total: 99.9
    };
  },
  sales_get_order: async (args) => {
    const orderNo = args.orderNo || args.order_no || args.orderId || args.order_id;
    const order = await salesData.getOrderByOrderNo(orderNo);
    if (!order) {
      return { found: false, orderNo, message: '未找到订单' };
    }
    return { found: true, order };
  },
  sales_search_orders: async (args) => salesData.searchOrders(args),
  sales_order_stats_by_status: async () => salesData.orderStatsByStatus(),
  sales_order_stats_by_period: async (args) => salesData.orderStatsByPeriod(args),
  sales_list_complaints: async (args) => salesData.listComplaints(args),
  sales_get_complaint: async (args) => {
    const id = args.id || args.complaintId || args.complaint_id;
    const complaint = await salesData.getComplaintById(id);
    if (!complaint) {
      return { found: false, id, message: '未找到投诉记录' };
    }
    return { found: true, complaint };
  },
  sales_complaint_stats_by_type: async () => salesData.complaintStatsByType(),
  sales_complaint_stats_by_status: async () => salesData.complaintStatsByStatus(),
  bizdata_preview_materialization: async (args) => materializationService.buildPreview({
    entityIds: args.entityIds || args.entity_ids,
    targetSchema: args.targetSchema || args.target_schema,
    connectionId: args.connectionId || args.connection_id
  }),
  bizdata_execute_materialization: async (args, context = {}) => {
    const connectionId = args.connectionId || args.connection_id || '';
    const started = Date.now();
    try {
      const result = await materializationService.executeMaterialization({
        entityIds: args.entityIds || args.entity_ids,
        targetSchema: args.targetSchema || args.target_schema,
        connectionId: args.connectionId || args.connection_id,
        dryRun: args.dryRun ?? args.dry_run ?? false,
        expectedVersions: args.expectedVersions || args.expected_versions || {},
        createTargetIfMissing: args.createTargetIfMissing ?? args.create_target_if_missing ?? false
      });
      const failed = result && result.ok === false;
      logBuiltinAudit(builtinAuditBase(context, {
        operation_type: 'EXECUTE',
        resource_type: 'materialization',
        resource_id: String(result?.id || connectionId || ''),
        status: failed ? 'FAILED' : 'SUCCESS',
        error_message: failed ? String(result?.error?.message || result?.message || '').slice(0, 2000) || null : null,
        duration_ms: Date.now() - started,
        request_summary: {
          source: 'server_builtin',
          tool: 'bizdata_execute_materialization',
        },
      }));
      return result;
    } catch (err) {
      if (err?.name === 'MaterializationTargetNotFoundError') {
        const payload = {
          ok: false,
          kind: 'business_error',
          error: {
            code: 'TARGET_NOT_FOUND',
            message: err.message,
            hint:
              '目标 Schema/库不存在。请 ask_user 确认后，用相同参数 + createTargetIfMissing=true 重试。禁止 http_request/重载 Skill/同参重试。bizdata_create_database_connection 只登记连接、不建物理库。',
          },
          data: {
            targetSchema: err.targetSchema,
            dbType: err.dbType,
            connectionId: err.connectionId,
            createTargetIfMissing: false,
          },
          meta: { tool: 'bizdata_execute_materialization' },
        };
        logBuiltinAudit(builtinAuditBase(context, {
          operation_type: 'EXECUTE',
          resource_type: 'materialization',
          resource_id: String(err.connectionId || connectionId || ''),
          status: 'FAILED',
          error_message: String(err.message || '').slice(0, 2000) || null,
          duration_ms: Date.now() - started,
          request_summary: { source: 'server_builtin', tool: 'bizdata_execute_materialization' },
        }));
        return payload;
      }
      logBuiltinAudit(builtinAuditBase(context, {
        operation_type: 'EXECUTE',
        resource_type: 'materialization',
        resource_id: String(connectionId || ''),
        status: 'FAILED',
        error_message: String(err?.message || '').slice(0, 2000) || null,
        duration_ms: Date.now() - started,
        request_summary: { source: 'server_builtin', tool: 'bizdata_execute_materialization' },
      }));
      throw err;
    }
  },
  bizdata_list_materialization_runs: async (args) => materializationService.listRuns({
    page: args.page || 1,
    size: args.pageSize || args.page_size || 10,
    connectionId: args.connectionId || args.connection_id
  }),
  bizdata_get_materialization_status: async (args) => materializationService.getMaterializationStatus({
    connectionId: args.connectionId || args.connection_id,
    entityCodes: args.entityCodes || args.entity_codes || args.entityCode || args.entity_code,
    entityIds: args.entityIds || args.entity_ids || args.entityId || args.entity_id
  }),
  bizdata_browse_materialized_schema: async (args) => materializedTableBrowseService.getTableSchema({
    entityId: args.entityId || args.entity_id,
    entityCode: args.entityCode || args.entity_code,
    connectionId: args.connectionId || args.connection_id
  }),
  bizdata_browse_materialized_rows: async (args) => materializedTableBrowseService.queryTableRows({
    entityId: args.entityId || args.entity_id,
    entityCode: args.entityCode || args.entity_code,
    connectionId: args.connectionId || args.connection_id,
    page: args.page || 1,
    size: args.pageSize || args.page_size || args.size || 20
  }),
  bizdata_insert_mock_data: async (args, context = {}) => {
    const entityId = args.entityId || args.entity_id || '';
    const started = Date.now();
    try {
      const result = await materializedTableBrowseService.insertMockData({
        entityId: args.entityId || args.entity_id,
        entityCode: args.entityCode || args.entity_code,
        connectionId: args.connectionId || args.connection_id,
        rows: args.rows || [],
        rowCount: args.rowCount || args.row_count
      });
      const failed = result && result.ok === false;
      logBuiltinAudit(builtinAuditBase(context, {
        operation_type: 'CREATE',
        resource_type: 'materialized_mock',
        resource_id: String(entityId || args.entityCode || args.entity_code || ''),
        status: failed ? 'FAILED' : 'SUCCESS',
        error_message: failed ? String(result?.error?.message || result?.message || '').slice(0, 2000) || null : null,
        duration_ms: Date.now() - started,
        request_summary: { source: 'server_builtin', tool: 'bizdata_insert_mock_data' },
      }));
      return result;
    } catch (err) {
      logBuiltinAudit(builtinAuditBase(context, {
        operation_type: 'CREATE',
        resource_type: 'materialized_mock',
        resource_id: String(entityId || args.entityCode || args.entity_code || ''),
        status: 'FAILED',
        error_message: String(err?.message || '').slice(0, 2000) || null,
        duration_ms: Date.now() - started,
        request_summary: { source: 'server_builtin', tool: 'bizdata_insert_mock_data' },
      }));
      throw err;
    }
  },
  /**
   * MS3：服务端 JS 编排占位。完整 tools 桥接后续接 toolInvoke；
   * 当前仅做受限表达式计算（无 tools），Python 返回明确不支持说明。
   */
  run_code: async (args) => {
    const language = String(args.language || 'javascript').toLowerCase();
    const source = String(args.source || '').trim();
    if (!source) {
      throw Object.assign(new Error('source 不能为空'), { status: 400 });
    }
    if (language === 'python') {
      return {
        ok: false,
        message: 'Python 运行时尚未启用；请使用 javascript 或直接调用业务 Tool',
      };
    }
    if (language !== 'javascript' && language !== 'js') {
      throw Object.assign(new Error(`不支持的 language: ${language}`), { status: 400 });
    }
    // 安全默认：服务端暂不执行任意用户脚本（防 RCE）。仅回显校验通过。
    return {
      ok: true,
      language: 'javascript',
      accepted: true,
      message:
        '服务端 run_code 已登记；请在浏览器侧使用 harness run_code（client Tool）编排已注册 client Tool。',
      sourceChars: source.length,
    };
  },
};

const EXECUTION_TYPES = ['client', 'server_http', 'server_builtin'];

async function invokeServerHttp(config, args, context = {}) {
  const url = config?.url;
  if (!url) {
    throw new Error('server_http 工具缺少 url 配置');
  }

  const method = (config.method || 'POST').toUpperCase();
  const headers = { 'Content-Type': 'application/json', ...(config.headers || {}) };
  // 可选：server_config.forwardUserToken=true 时注入当前用户 JWT
  if (config.forwardUserToken && context.userToken) {
    headers.Authorization = `Bearer ${context.userToken}`;
  }
  const response = await fetch(url, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(args)
  });

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  if (contentType.includes('application/json')) {
    return JSON.parse(text);
  }
  return { result: text };
}

async function invokeServerBuiltin(config, args, context = {}) {
  const handlerName = config?.handler;
  if (!handlerName || !BUILTIN_HANDLERS[handlerName]) {
    throw new Error(`未注册的 builtin handler: ${handlerName || '(empty)'}`);
  }
  return BUILTIN_HANDLERS[handlerName](args, context);
}

async function invokeTool(tool, args = {}, logContext = {}) {
  const functionName = tool.function_name || tool.functionName || '(unknown)';
  const executionType = tool.execution_type || tool.executionType;
  const requiresVerification = tool.requires_verification === true || tool.requiresVerification === true;
  const invokeContext = {
    userToken: logContext.userToken || null,
    userId: logContext.userId || null,
    traceId: logContext.traceId || null,
    /** 当前请求声明的应用（`?app=` / SSO JWT 自述）；eadaf_api_contract 用它兜底 app 参数 */
    requestedApp: logContext.requestedApp || null,
  };

  const parametersSchema = tool.parameters_schema || tool.parametersSchema;
  const validation = validateToolArgs(args && typeof args === 'object' ? args : {}, parametersSchema);
  if (!validation.valid) {
    const message = `参数校验失败: ${validation.message}`;
    return normalizeToolResult({
      tool: functionName,
      rawResult: {
        ok: false,
        kind: 'business_error',
        error: {
          code: 'INVALID_ARGS',
          message,
          hint: '请按 error.message 修正参数后重试',
          category: 'invalid_args',
          retryable: true,
        },
        agentHint: '请按 error.message 修正参数后重试',
        meta: { tool: functionName },
      },
      requiresVerification,
    });
  }

  if (tool.execution_type === 'client') {
    return executeToolWithEnvelope({
      name: functionName,
      args,
      executionType: 'client',
      requiresVerification,
      logContext,
      fn: async () => ({
        executionType: 'client',
        message: 'Client tool must be executed in the browser via functionRegistry',
      }),
    });
  }

  if (tool.execution_type === 'server_http') {
    return executeToolWithEnvelope({
      name: functionName,
      args,
      executionType: 'server_http',
      requiresVerification,
      logContext,
      fn: async () => {
        const result = await invokeServerHttp(tool.server_config || {}, args, invokeContext);
        return { executionType: 'server_http', result };
      },
    });
  }

  if (tool.execution_type === 'server_builtin') {
    return executeToolWithEnvelope({
      name: functionName,
      args,
      executionType: 'server_builtin',
      requiresVerification,
      logContext,
      fn: async () => {
        const result = await invokeServerBuiltin(tool.server_config || {}, args, invokeContext);
        return { executionType: 'server_builtin', result };
      },
    });
  }

  return executeToolWithEnvelope({
    name: functionName,
    args,
    executionType: executionType || 'unknown',
    requiresVerification,
    logContext,
    fn: async () => {
      throw new Error(`不支持的 execution_type: ${tool.execution_type}`);
    },
  });
}

function formatOpenAITool(tool) {
  const functionName = tool.function_name || tool.functionName;
  const description = tool.description || tool.name;
  const parameters = tool.parameters_schema || tool.parametersSchema || { type: 'object', properties: {} };
  return {
    type: 'function',
    function: {
      name: functionName,
      description,
      parameters
    }
  };
}

module.exports = {
  EXECUTION_TYPES,
  invokeTool,
  formatOpenAITool
};
