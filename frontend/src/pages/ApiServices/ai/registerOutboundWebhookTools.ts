import { registerFunctionCall, unregisterFunctionCall } from '@eadaf/ai-base';
import { createMutatingHandler } from '@/ai/toolMutation';
import { history } from '@/utils/navigation';
import {
  getOutboundWebhooks,
  getOutboundWebhook,
  postOutboundWebhook,
  patchOutboundWebhook,
  deleteOutboundWebhook,
  postOutboundWebhookPublish,
  postOutboundWebhookDisable,
  getOutboundWebhookTestProfile,
  postOutboundWebhookTest,
} from '@/services/EADAF/api/outboundWebhooks';
import { isApiSuccess, getApiData, parseApiListResponse } from '@/utils/apiResponse';

const DOMAIN = 'apiservice';

const TOOL_NAMES = [
  'outbound_webhook_list',
  'outbound_webhook_filter',
  'outbound_webhook_get',
  'outbound_webhook_create',
  'outbound_webhook_update',
  'outbound_webhook_upsert',
  'outbound_webhook_delete',
  'outbound_webhook_publish',
  'outbound_webhook_disable',
  'outbound_webhook_get_test_profile',
  'outbound_webhook_run_test',
  'outbound_webhook_set_mock_data',
  'outbound_webhook_suggest_scripts',
  'outbound_webhook_navigate',
];

function editOrCreateScope(args: Record<string, unknown>) {
  const id = String(args.webhookId || args.id || '');
  return id ? `apiservice.outbound_webhook.edit:${id}` : 'apiservice.outbound_webhook.create';
}

function registerOutboundWebhookTools() {
  // ===== 读：列表 =====
  registerFunctionCall({
    name: 'outbound_webhook_list',
    description: '列出提交外部API配置，可按 code 前缀与状态过滤',
    parameters: {
      type: 'object',
      properties: {
        codePrefix: { type: 'string', description: 'code 前缀，如 equipment' },
        status: { type: 'string', description: '按状态过滤：draft/published/disabled/ALL' },
        page: { type: 'integer' },
        size: { type: 'integer' },
      },
    },
    handler: async (args) => {
      const res = await getOutboundWebhooks({
        codePrefix: args.codePrefix as string | undefined,
        status: args.status as string | undefined,
        page: args.page as number | undefined,
        size: args.size as number | undefined,
      });
      const { items } = parseApiListResponse<API.OutboundWebhook>(res);
      return { items, total: items.length };
    },
  });

  // ===== 读：过滤（面向检索，返回全部命中项） =====
  registerFunctionCall({
    name: 'outbound_webhook_filter',
    description: '按页面过滤项检索提交外部API（code 前缀 + 状态），返回全部命中项；面向检索而非分页浏览',
    parameters: {
      type: 'object',
      properties: {
        codePrefix: { type: 'string', description: 'code 前缀，如 equipment' },
        status: { type: 'string', enum: ['draft', 'published', 'disabled'] },
      },
    },
    handler: async (args) => {
      const res = await getOutboundWebhooks({
        codePrefix: args.codePrefix as string | undefined,
        status: args.status as string | undefined,
        size: -1,
      });
      const { items } = parseApiListResponse<API.OutboundWebhook>(res);
      return { items, total: items.length };
    },
  });

  // ===== 读：详情 =====
  registerFunctionCall({
    name: 'outbound_webhook_get',
    description: '获取提交外部API详情',
    parameters: {
      type: 'object',
      properties: { webhookId: { type: 'string' } },
      required: ['webhookId'],
    },
    handler: async (args) => {
      const res = await getOutboundWebhook(String(args.webhookId));
      return getApiData<API.OutboundWebhook>(res);
    },
  });

  // ===== 写：创建（独立，不传 webhookId） =====
  registerFunctionCall({
    name: 'outbound_webhook_create',
    description: '创建提交外部API配置（新建）',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        targetUrl: { type: 'string' },
        triggerApiServiceId: { type: 'string' },
        triggerApiServiceCode: { type: 'string' },
        requestStructure: { type: 'string' },
        requestExample: { type: 'string', description: '发往外部的请求 Demo JSON 文本' },
        transformScript: { type: 'string' },
        mockData: { type: 'string' },
        httpMethod: { type: 'string', enum: ['POST', 'PUT', 'PATCH'] },
        authType: { type: 'string', enum: ['none', 'bearer', 'api_key'] },
        authSendMode: { type: 'string', enum: ['header', 'query'] },
        authKeyName: { type: 'string' },
        authSecret: { type: 'string', description: '写入密钥；省略则保留原密钥' },
        responseConfig: { type: 'object', description: '成功/异常契约与 rules' },
      },
      required: ['name', 'targetUrl'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'outbound_webhook.updated',
      scope: () => 'apiservice.outbound_webhook.create',
      buildResourceId: () => '',
      buildPayload: (args) => ({
        requestStructure: args.requestStructure,
        requestExample: args.requestExample,
        transformScript: args.transformScript,
        mockData: args.mockData,
        responseConfig: args.responseConfig,
      }),
      handler: async (args) => {
        const body: Partial<API.OutboundWebhook> = {
          code: args.code as string,
          name: args.name as string,
          description: args.description as string,
          targetUrl: args.targetUrl as string,
          triggerApiServiceId: args.triggerApiServiceId as string,
          triggerApiServiceCode: args.triggerApiServiceCode as string,
          requestStructure: args.requestStructure as string,
          requestExample: args.requestExample as string,
          transformScript: args.transformScript as string,
          mockData: args.mockData as string,
          httpMethod: args.httpMethod as API.OutboundWebhook['httpMethod'],
          authType: args.authType as API.OutboundWebhook['authType'],
          authSendMode: args.authSendMode as API.OutboundWebhook['authSendMode'],
          authKeyName: args.authKeyName as string,
          authSecret: args.authSecret as string,
          responseConfig: args.responseConfig as API.OutboundWebhookResponseConfig,
        };
        const res = await postOutboundWebhook(body);
        return getApiData<API.OutboundWebhook>(res);
      },
    }),
  });

  // ===== 写：更新（独立，必传 webhookId） =====
  registerFunctionCall({
    name: 'outbound_webhook_update',
    description: '更新已有提交外部API配置',
    parameters: {
      type: 'object',
      properties: {
        webhookId: { type: 'string' },
        code: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        targetUrl: { type: 'string' },
        triggerApiServiceId: { type: 'string' },
        triggerApiServiceCode: { type: 'string' },
        requestStructure: { type: 'string' },
        requestExample: { type: 'string' },
        transformScript: { type: 'string' },
        mockData: { type: 'string' },
        httpMethod: { type: 'string', enum: ['POST', 'PUT', 'PATCH'] },
        authType: { type: 'string', enum: ['none', 'bearer', 'api_key'] },
        authSendMode: { type: 'string', enum: ['header', 'query'] },
        authKeyName: { type: 'string' },
        authSecret: { type: 'string' },
        responseConfig: { type: 'object' },
      },
      required: ['webhookId'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'outbound_webhook.updated',
      scope: (args) => `apiservice.outbound_webhook.edit:${String(args.webhookId || '')}`,
      buildResourceId: (args) => String(args.webhookId || ''),
      buildPayload: (args) => ({
        requestStructure: args.requestStructure,
        requestExample: args.requestExample,
        transformScript: args.transformScript,
        mockData: args.mockData,
        responseConfig: args.responseConfig,
      }),
      handler: async (args) => {
        const body: Partial<API.OutboundWebhook> = {
          code: args.code as string,
          name: args.name as string,
          description: args.description as string,
          targetUrl: args.targetUrl as string,
          triggerApiServiceId: args.triggerApiServiceId as string,
          triggerApiServiceCode: args.triggerApiServiceCode as string,
          requestStructure: args.requestStructure as string,
          requestExample: args.requestExample as string,
          transformScript: args.transformScript as string,
          mockData: args.mockData as string,
          httpMethod: args.httpMethod as API.OutboundWebhook['httpMethod'],
          authType: args.authType as API.OutboundWebhook['authType'],
          authSendMode: args.authSendMode as API.OutboundWebhook['authSendMode'],
          authKeyName: args.authKeyName as string,
          authSecret: args.authSecret as string,
          responseConfig: args.responseConfig as API.OutboundWebhookResponseConfig,
        };
        const res = await patchOutboundWebhook(String(args.webhookId), body);
        return getApiData<API.OutboundWebhook>(res);
      },
    }),
  });

  // ===== 写：创建/更新（upsert，向后兼容） =====
  registerFunctionCall({
    name: 'outbound_webhook_upsert',
    description: '创建或更新提交外部API配置',
    parameters: {
      type: 'object',
      properties: {
        webhookId: { type: 'string', description: '更新时传入；创建时省略' },
        code: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        targetUrl: { type: 'string' },
        triggerApiServiceId: { type: 'string' },
        triggerApiServiceCode: { type: 'string' },
        requestStructure: { type: 'string' },
        requestExample: { type: 'string' },
        transformScript: { type: 'string' },
        mockData: { type: 'string' },
        httpMethod: { type: 'string', enum: ['POST', 'PUT', 'PATCH'] },
        authType: { type: 'string', enum: ['none', 'bearer', 'api_key'] },
        authSendMode: { type: 'string', enum: ['header', 'query'] },
        authKeyName: { type: 'string' },
        authSecret: { type: 'string' },
        responseConfig: { type: 'object' },
      },
      required: ['name', 'targetUrl'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'outbound_webhook.updated',
      scope: editOrCreateScope,
      buildResourceId: (args) => String(args.webhookId || ''),
      buildPayload: (args) => ({
        requestStructure: args.requestStructure,
        requestExample: args.requestExample,
        transformScript: args.transformScript,
        mockData: args.mockData,
        responseConfig: args.responseConfig,
      }),
      handler: async (args) => {
        const body: Partial<API.OutboundWebhook> = {
          code: args.code as string,
          name: args.name as string,
          description: args.description as string,
          targetUrl: args.targetUrl as string,
          triggerApiServiceId: args.triggerApiServiceId as string,
          triggerApiServiceCode: args.triggerApiServiceCode as string,
          requestStructure: args.requestStructure as string,
          requestExample: args.requestExample as string,
          transformScript: args.transformScript as string,
          mockData: args.mockData as string,
          httpMethod: args.httpMethod as API.OutboundWebhook['httpMethod'],
          authType: args.authType as API.OutboundWebhook['authType'],
          authSendMode: args.authSendMode as API.OutboundWebhook['authSendMode'],
          authKeyName: args.authKeyName as string,
          authSecret: args.authSecret as string,
          responseConfig: args.responseConfig as API.OutboundWebhookResponseConfig,
        };
        if (args.webhookId) {
          const res = await patchOutboundWebhook(String(args.webhookId), body);
          return getApiData<API.OutboundWebhook>(res);
        }
        const res = await postOutboundWebhook(body);
        return getApiData<API.OutboundWebhook>(res);
      },
    }),
  });

  // ===== 写：删除 =====
  registerFunctionCall({
    name: 'outbound_webhook_delete',
    description: '删除提交外部API配置',
    parameters: { type: 'object', properties: { webhookId: { type: 'string' } }, required: ['webhookId'] },
    handler: async (args) => {
      await deleteOutboundWebhook(String(args.webhookId));
      return { deleted: true };
    },
  });

  // ===== 写：发布/禁用 =====
  registerFunctionCall({
    name: 'outbound_webhook_publish',
    description: '发布提交外部API',
    parameters: { type: 'object', properties: { webhookId: { type: 'string' } }, required: ['webhookId'] },
    handler: async (args) => {
      const res = await postOutboundWebhookPublish(String(args.webhookId));
      return getApiData<API.OutboundWebhook>(res);
    },
  });

  registerFunctionCall({
    name: 'outbound_webhook_disable',
    description: '禁用提交外部API',
    parameters: { type: 'object', properties: { webhookId: { type: 'string' } }, required: ['webhookId'] },
    handler: async (args) => {
      const res = await postOutboundWebhookDisable(String(args.webhookId));
      return getApiData<API.OutboundWebhook>(res);
    },
  });

  // ===== 测试 =====
  registerFunctionCall({
    name: 'outbound_webhook_get_test_profile',
    description: '获取测试配置',
    parameters: { type: 'object', properties: { webhookId: { type: 'string' } }, required: ['webhookId'] },
    handler: async (args) => {
      const res = await getOutboundWebhookTestProfile(String(args.webhookId));
      return getApiData<API.OutboundWebhookTestProfile>(res);
    },
  });

  registerFunctionCall({
    name: 'outbound_webhook_run_test',
    description: '运行测试（用 Mock Data 运行处置脚本并真实 POST 外部 API）',
    parameters: {
      type: 'object',
      properties: { webhookId: { type: 'string' }, mockData: { type: 'string' } },
      required: ['webhookId'],
    },
    handler: async (args) => {
      const res = await postOutboundWebhookTest(String(args.webhookId), {
        mockData: args.mockData as string | undefined,
      });
      return getApiData<API.OutboundWebhookTestResult>(res);
    },
  });

  // ===== 写：设置 Mock Data（通过 mutation 同步到编辑器） =====
  registerFunctionCall({
    name: 'outbound_webhook_set_mock_data',
    description: '将 Mock Data 写入当前编辑/测试页（通过 mutation 同步）',
    parameters: {
      type: 'object',
      properties: { webhookId: { type: 'string' }, mockData: { type: 'string' } },
      required: ['mockData'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'outbound_webhook.updated',
      scope: (args) => {
        const id = String(args.webhookId || '');
        return id ? `apiservice.outbound_webhook.edit:${id}` : 'apiservice.outbound_webhook.test';
      },
      buildResourceId: (args) => String(args.webhookId || ''),
      buildPayload: (args) => ({ mockData: args.mockData }),
      handler: async (args) => ({ mockData: args.mockData }),
    }),
  });

  // ===== 写：建议脚本（AI 生成的脚本写入编辑器，不持久化） =====
  registerFunctionCall({
    name: 'outbound_webhook_suggest_scripts',
    description: '将请求结构、请求 Demo、处置脚本、Mock Data、异常规则草稿写入当前编辑页（通过 mutation 同步）',
    parameters: {
      type: 'object',
      properties: {
        webhookId: { type: 'string' },
        requestStructure: { type: 'string' },
        requestExample: { type: 'string' },
        transformScript: { type: 'string' },
        mockData: { type: 'string' },
        exceptionRules: {
          type: 'array',
          items: { type: 'string' },
          description: "如 code != 200、isOK != 'SUCCESS'",
        },
        responseConfig: { type: 'object' },
      },
      required: ['transformScript'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'outbound_webhook.updated',
      scope: editOrCreateScope,
      buildResourceId: (args) => String(args.webhookId || ''),
      buildPayload: (args) => ({
        requestStructure: args.requestStructure,
        requestExample: args.requestExample,
        transformScript: args.transformScript,
        mockData: args.mockData,
        exceptionRules: args.exceptionRules,
        responseConfig: args.responseConfig,
      }),
      handler: async (args) => ({
        requestStructure: args.requestStructure,
        requestExample: args.requestExample,
        transformScript: args.transformScript,
        mockData: args.mockData,
        exceptionRules: args.exceptionRules,
        responseConfig: args.responseConfig,
      }),
    }),
  });

  // ===== 导航 =====
  registerFunctionCall({
    name: 'outbound_webhook_navigate',
    description: '导航到提交外部API页面（列表/编辑/测试）',
    parameters: {
      type: 'object',
      properties: {
        webhookId: { type: 'string' },
        target: { type: 'string', enum: ['list', 'edit', 'test', 'create'] },
      },
    },
    handler: async (args) => {
      const target = (args.target as string) || 'list';
      const wid = String(args.webhookId || '');
      if (target === 'list') history.push('/api_services/outbound-webhooks');
      else if (target === 'create') history.push('/api_services/outbound-webhooks/create');
      else if (target === 'edit' && wid) history.push(`/api_services/outbound-webhooks/${wid}/edit`);
      else if (target === 'test' && wid) history.push(`/api_services/outbound-webhooks/${wid}/test`);
      return { navigated: true };
    },
  });
}

function unregisterOutboundWebhookTools() {
  TOOL_NAMES.forEach((name) => unregisterFunctionCall(name));
}

export { registerOutboundWebhookTools, unregisterOutboundWebhookTools };
