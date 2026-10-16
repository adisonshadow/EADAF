import { registerFunctionCall, unregisterFunctionCall } from '@eadaf/ai-base';
import { createMutatingHandler } from '@/ai/toolMutation';
import { history } from '@/utils/navigation';
import {
  getAutomationHooks,
  getAutomationHook,
  postAutomationHook,
  putAutomationHook,
  deleteAutomationHook,
  postAutomationHookEnable,
  postAutomationHookDisable,
  postAutomationHookTest,
  getAutomationHookRuns,
  postAutomationHookRunRetry,
  getAutomationHookEventTypes,
  postAutomationHookValidateScript,
} from '@/services/EADAF/api/automationHooks';
import { isApiSuccess, getApiData } from '@/utils/apiResponse';

const DOMAIN = 'apiservice';

const TOOL_NAMES = [
  'hook_list_event_types',
  'hook_list_hooks',
  'hook_get_hook',
  'hook_create_hook',
  'hook_update_hook',
  'hook_delete_hook',
  'hook_enable_hook',
  'hook_disable_hook',
  'hook_check_script',
  'hook_test_hook',
  'hook_list_runs',
  'hook_retry_run',
  'hook_suggest_config',
  'hook_navigate',
];

function editOrCreateScope(args: Record<string, unknown>) {
  const id = String(args.hookId || args.id || '');
  return id ? `apiservice.hook.edit:${id}` : 'apiservice.hook.create';
}

function registerHookTools() {
  // ===== 读：事件目录（AI 了解可用事件与负载结构的第一入口） =====
  registerFunctionCall({
    name: 'hook_list_event_types',
    description:
      '列出钩子可用的事件类型目录（含负载 JSON Schema 与示例）。创建钩子前必须先调用本工具确认事件类型与 payload 结构',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: async () => {
      const res = await getAutomationHookEventTypes();
      if (!isApiSuccess(res)) return { error: res.message || '事件目录获取失败' };
      return { data: getApiData<API.HookEventType[]>(res) };
    },
  });

  // ===== 读：钩子列表 =====
  registerFunctionCall({
    name: 'hook_list_hooks',
    description: '列出钩子（可按状态过滤），含最近运行与近7天成功率',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'draft|enabled|disabled|auto_disabled，不传查全部' },
      },
      required: [],
    },
    handler: async (args) => {
      const res = await getAutomationHooks({
        status: (args.status as string) || undefined,
        size: 100,
      });
      if (!isApiSuccess(res)) return { error: res.message || '钩子列表获取失败' };
      const data = getApiData<API.HookListResult>(res);
      return { data: data?.items || [] };
    },
  });

  // ===== 读：钩子详情 =====
  registerFunctionCall({
    name: 'hook_get_hook',
    description: '获取钩子完整配置（触发条件、动作、失败策略；密钥已脱敏）',
    parameters: {
      type: 'object',
      properties: { hookId: { type: 'string', description: '钩子 id' } },
      required: ['hookId'],
    },
    handler: async (args) => {
      const res = await getAutomationHook(String(args.hookId));
      if (!isApiSuccess(res)) return { error: res.message || '钩子不存在' };
      return { data: getApiData<API.Hook>(res) };
    },
  });

  // ===== 写：创建（含 _verification 回读校验） =====
  registerFunctionCall({
    name: 'hook_create_hook',
    description:
      '创建钩子（草稿状态）。script 动作会先经类型检查，未通过会返回诊断信息。创建成功后建议调用 hook_test_hook 试跑验证',
    parameters: buildHookSaveSchema(),
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'hook.created',
      scope: 'apiservice.hook.create',
      buildResourceId: (data) => (data as API.Hook | undefined)?.id,
      buildPayload: (data) => data,
      handler: async (args) => {
        const input = buildHookSaveInput(args);
        const res = await postAutomationHook(input);
        if (!isApiSuccess(res)) return { error: res.message || '创建失败' };
        const created = getApiData<API.Hook>(res);
        const verification = await verifyHookById(created?.id, input);
        return { data: { ...created, _verification: verification } };
      },
    }),
  });

  // ===== 写：更新（含 _verification 回读校验） =====
  registerFunctionCall({
    name: 'hook_update_hook',
    description: '更新钩子配置（version+1；密钥留空保留）',
    parameters: buildHookSaveSchema(true),
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'hook.updated',
      scope: (args) => editOrCreateScope(args),
      buildResourceId: () => undefined,
      buildPayload: (data) => data,
      handler: async (args) => {
        const id = String(args.hookId || args.id || '');
        const input = buildHookSaveInput(args);
        const res = await putAutomationHook(id, input);
        if (!isApiSuccess(res)) return { error: res.message || '更新失败' };
        const updated = getApiData<API.Hook>(res);
        const verification = await verifyHookById(id, input);
        return { data: { ...updated, _verification: verification } };
      },
    }),
  });

  // ===== 写：删除/启停 =====
  registerFunctionCall({
    name: 'hook_delete_hook',
    description: '软删钩子（运行历史保留）',
    parameters: {
      type: 'object',
      properties: { hookId: { type: 'string' } },
      required: ['hookId'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'hook.deleted',
      scope: 'apiservice.hook.list',
      buildResourceId: (data) => (data as { id?: string } | undefined)?.id,
      handler: async (args) => {
        const res = await deleteAutomationHook(String(args.hookId));
        if (!isApiSuccess(res)) return { error: res.message || '删除失败' };
        return { data: res.data };
      },
    }),
  });

  registerFunctionCall({
    name: 'hook_enable_hook',
    description: '启用钩子（清零连续失败计数；配置不完整会报错）',
    parameters: {
      type: 'object',
      properties: { hookId: { type: 'string' } },
      required: ['hookId'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'hook.enabled',
      scope: 'apiservice.hook.list',
      buildResourceId: (data) => (data as API.Hook | undefined)?.id,
      handler: async (args) => {
        const res = await postAutomationHookEnable(String(args.hookId));
        if (!isApiSuccess(res)) return { error: res.message || '启用失败（请检查配置完整性）' };
        return { data: getApiData<API.Hook>(res) };
      },
    }),
  });

  registerFunctionCall({
    name: 'hook_disable_hook',
    description: '禁用钩子',
    parameters: {
      type: 'object',
      properties: { hookId: { type: 'string' } },
      required: ['hookId'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'hook.disabled',
      scope: 'apiservice.hook.list',
      buildResourceId: (data) => (data as API.Hook | undefined)?.id,
      handler: async (args) => {
        const res = await postAutomationHookDisable(String(args.hookId));
        if (!isApiSuccess(res)) return { error: res.message || '禁用失败' };
        return { data: getApiData<API.Hook>(res) };
      },
    }),
  });

  // ===== 脚本类型检查 =====
  registerFunctionCall({
    name: 'hook_check_script',
    description:
      '对钩子 TypeScript 脚本做语法/类型检查（诊断含行号）。保存 script 类型钩子前必须检查通过。脚本签名 handler(event, ctx)，可用 event.payload / ctx.log(...) / db(实体code)',
    parameters: {
      type: 'object',
      properties: { source: { type: 'string', description: '脚本源码' } },
      required: ['source'],
    },
    handler: async (args) => {
      const res = await postAutomationHookValidateScript({ source: String(args.source || '') });
      if (!isApiSuccess(res)) return { error: res.message || '检查请求失败' };
      return { data: res.data };
    },
  });

  // ===== 试跑 =====
  registerFunctionCall({
    name: 'hook_test_hook',
    description:
      '用 mock 负载试跑钩子（不产生正式统计）。返回条件是否匹配、运行状态/输出/日志。验证钩子正确性的必经步骤',
    parameters: {
      type: 'object',
      properties: {
        hookId: { type: 'string' },
        mockPayload: { type: 'object', description: '模拟事件负载，结构参考事件目录的 example' },
      },
      required: ['hookId'],
    },
    handler: async (args) => {
      const res = await postAutomationHookTest(String(args.hookId), {
        mockPayload: (args.mockPayload as object) || {},
      });
      if (!isApiSuccess(res)) return { error: res.message || '试跑失败' };
      return { data: getApiData<API.HookTestResult>(res) };
    },
  });

  // ===== 运行历史 / 重放 =====
  registerFunctionCall({
    name: 'hook_list_runs',
    description: '查询钩子运行历史（可按状态过滤），用于排查"为什么没触发/为什么失败"',
    parameters: {
      type: 'object',
      properties: {
        hookId: { type: 'string' },
        status: { type: 'string', description: 'success|failed|timeout|skipped|suppressed' },
      },
      required: ['hookId'],
    },
    handler: async (args) => {
      const res = await getAutomationHookRuns(String(args.hookId), {
        status: (args.status as string) || undefined,
        size: 20,
      });
      if (!isApiSuccess(res)) return { error: res.message || '运行历史获取失败' };
      const data = getApiData<API.HookRunListResult>(res);
      return {
        data: (data?.items || []).map((r) => ({
          id: r.id,
          status: r.status,
          triggerSource: r.triggerSource,
          eventDepth: r.eventDepth,
          attempt: r.attempt,
          durationMs: r.durationMs,
          error: r.error,
          startedAt: r.startedAt,
        })),
      };
    },
  });

  registerFunctionCall({
    name: 'hook_retry_run',
    description: '用历史运行的原始负载重放一次钩子（新 event_id，trigger_source=replay）',
    parameters: {
      type: 'object',
      properties: { runId: { type: 'string' } },
      required: ['runId'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'hook.run_retried',
      scope: 'apiservice.hook.list',
      buildResourceId: () => undefined,
      handler: async (args) => {
        const res = await postAutomationHookRunRetry(String(args.runId));
        if (!isApiSuccess(res)) return { error: res.message || '重放失败' };
        return { data: getApiData<API.HookTestResult>(res) };
      },
    }),
  });

  // ===== 表单草稿回写（"AI 一键编写"按钮的落点，不落库） =====
  registerFunctionCall({
    name: 'hook_suggest_config',
    description:
      '将钩子配置草稿同步到当前打开的钩子表单（不保存）。用户在表单页点击 AI 编写后由模型调用；字段与 hook_create_hook 相同',
    parameters: buildHookSaveSchema(),
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'hook.draft',
      scope: (args) => editOrCreateScope(args),
      buildResourceId: () => undefined,
      buildPayload: (data) => data,
      handler: async () => {
        return { data: { synced: true, hint: '草稿已同步到表单，用户确认后点击保存' } };
      },
    }),
  });

  // ===== 导航 =====
  registerFunctionCall({
    name: 'hook_navigate',
    description: '跳转到钩子管理相关页面（列表/新建/编辑/运行历史）',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'list|create|edit|runs' },
        hookId: { type: 'string' },
      },
      required: ['target'],
    },
    handler: async (args) => {
      const target = String(args.target || 'list');
      const hid = String(args.hookId || '');
      if (target === 'list') history.push('/api_services/hooks');
      else if (target === 'create') history.push('/api_services/hooks/create');
      else if (target === 'edit' && hid) history.push(`/api_services/hooks/${hid}/edit`);
      else if (target === 'runs' && hid) history.push(`/api_services/hooks/${hid}/runs`);
      return { navigated: true };
    },
  });
}

function buildHookSaveSchema(forUpdate = false) {
  return {
    type: 'object',
    properties: {
      ...(forUpdate ? { hookId: { type: 'string', description: '钩子 id' } } : {}),
      name: { type: 'string', description: '钩子名称' },
      description: { type: 'string', description: '用途说明（可选）' },
      eventType: {
        type: 'string',
        description: '事件类型，取值须来自 hook_list_event_types（如 auth.user.login / bizdata.record.updated / apiservice.invoked / schedule.cron）',
      },
      eventFilter: {
        type: 'object',
        description: '触发过滤：{entityCodes?: string[], apiServiceIds?: string[], changedFields?: string[], invokeStatus?: string[], cron?: string}；schedule.cron 必填 cron（五段式）',
        properties: {},
      },
      conditionExpr: {
        type: 'string',
        description: '可选 JS 布尔表达式，绑定 payload，如 payload.after.amount > 10000',
      },
      actionType: {
        type: 'string',
        description: '动作类型：http_request（外呼）| internal_api（调内部已发布 API）| script（TS 脚本）',
      },
      actionConfig: {
        type: 'object',
        description:
          '动作配置。http_request: {method,url,bodyTemplate(支持{{payload.*}}插值),auth:{type,keyName,secret},responseConfig}；internal_api: {apiServiceId,operation,parametersTemplate}；script: {source}',
        properties: {},
      },
      failurePolicy: {
        type: 'object',
        description: '可选：{retry=2, disableThreshold=10, concurrency=3, timeoutMs}',
        properties: {},
      },
    },
    required: [...(forUpdate ? ['hookId'] : []), 'name', 'eventType', 'actionType', 'actionConfig'],
  };
}

function buildHookSaveInput(args: Record<string, unknown>): API.HookSaveInput {
  return {
    name: String(args.name || ''),
    description: args.description ? String(args.description) : null,
    eventType: String(args.eventType || ''),
    eventFilter: (args.eventFilter as API.HookEventFilter) || {},
    conditionExpr: args.conditionExpr ? String(args.conditionExpr) : null,
    actionType: String(args.actionType || 'script') as API.HookSaveInput['actionType'],
    actionConfig: (args.actionConfig as API.HookActionConfig) || {},
    failurePolicy: (args.failurePolicy as API.HookFailurePolicy) || {},
    status: 'draft',
  };
}

/** 创建/更新后回读校验（全站硬约束：未 verified 不得声称成功） */
async function verifyHookById(id: string | undefined, input: API.HookSaveInput) {
  if (!id) {
    return { verified: false, message: '创建结果缺少 id，无法回读校验' };
  }
  const res = await getAutomationHook(id);
  if (!isApiSuccess(res)) {
    return { verified: false, message: `回读失败：${res.message || '钩子不存在'}` };
  }
  const hook = getApiData<API.Hook>(res);
  const checks = {
    nameMatches: hook?.name === input.name,
    eventTypeMatches: hook?.eventType === input.eventType,
    actionTypeMatches: hook?.actionType === input.actionType,
  };
  const verified = Boolean(checks.nameMatches && checks.eventTypeMatches && checks.actionTypeMatches);
  return {
    ...checks,
    verified,
    message: verified
      ? `已回读确认钩子「${hook?.name}」配置生效（草稿状态，需启用后才触发）`
      : '回读发现配置不一致，请检查',
  };
}

function unregisterHookTools() {
  TOOL_NAMES.forEach((name) => unregisterFunctionCall(name));
}

export { registerHookTools, unregisterHookTools };
