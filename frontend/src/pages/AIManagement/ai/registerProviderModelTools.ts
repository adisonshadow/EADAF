import { registerFunctionCall, unregisterFunctionCall } from '@eadaf/ai-base';
import { createMutatingHandler } from '@/ai/toolMutation';
import {
  deleteAdminModelsId,
  getAdminModels,
  getAdminModelsId,
  patchAdminModelsId,
  postAdminModels,
} from '@/services/EADAF/api/adminModels';
import {
  deleteAdminProvidersId,
  getAdminProviders,
  getAdminProvidersId,
  patchAdminProvidersId,
  postAdminProviders,
} from '@/services/EADAF/api/adminProviders';
import { getApiData, parseApiListResponse } from '@/utils/apiResponse';

const DOMAIN = 'aibase';

const TOOL_NAMES = [
  'aibase_list_providers',
  'aibase_get_provider',
  'aibase_create_provider',
  'aibase_update_provider',
  'aibase_delete_provider',
  'aibase_list_models',
  'aibase_get_model',
  'aibase_create_model',
  'aibase_update_model',
  'aibase_delete_model',
] as const;

function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function parseDefaultParams(value: unknown): Record<string, unknown> | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return JSON.parse(trimmed) as Record<string, unknown>;
  }
  throw new Error('defaultParams 必须是 JSON 对象或合法 JSON 字符串');
}

export function registerProviderModelTools() {
  registerFunctionCall({
    name: 'aibase_list_providers',
    description: '列出 AI 服务商',
    parameters: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        size: { type: 'integer' },
        isActive: { type: 'boolean' },
      },
    },
    handler: async (args) => {
      const res = await getAdminProviders({
        page: args.page as number,
        size: (args.size as number) || 100,
        isActive: args.isActive as boolean | undefined,
      });
      return getApiData(res) ?? parseApiListResponse(res).items;
    },
  });

  registerFunctionCall({
    name: 'aibase_get_provider',
    description: '获取 AI 服务商详情（不含 apiKey 明文，仅 apiKeySet）',
    parameters: {
      type: 'object',
      properties: { providerId: { type: 'string' } },
      required: ['providerId'],
    },
    handler: async (args) => getApiData(await getAdminProvidersId({ id: String(args.providerId) })),
  });

  registerFunctionCall({
    name: 'aibase_create_provider',
    description: '创建 AI 服务商（OpenAI Compatible 等）',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        slug: { type: 'string', description: '可选，小写连字符；省略则自动生成' },
        baseUrl: {
          type: 'string',
          description:
            '上游 API 根地址；由 Skill 内置对照表按服务商名称自动填写，不要向用户询问',
        },
        apiKey: { type: 'string' },
        adapterType: { type: 'string', description: '默认 openai_compatible' },
      },
      required: ['name', 'baseUrl'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'provider.created',
      scope: 'aibase.providers.list',
      buildResourceId: (_args, data) => (data as { id?: string })?.id,
      handler: async (args) => {
        const res = await postAdminProviders({
          name: String(args.name),
          slug: args.slug ? String(args.slug).trim() : '',
          baseUrl: String(args.baseUrl),
          apiKey: args.apiKey ? String(args.apiKey) : undefined,
          adapterType: args.adapterType ? String(args.adapterType) : undefined,
        });
        const data = getApiData(res);
        if (!data) throw new Error('创建服务商失败');
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'aibase_update_provider',
    description: '更新 AI 服务商；传 apiKey 时将覆盖密钥',
    parameters: {
      type: 'object',
      properties: {
        providerId: { type: 'string' },
        name: { type: 'string' },
        slug: { type: 'string' },
        baseUrl: { type: 'string' },
        apiKey: { type: 'string' },
        adapterType: { type: 'string' },
        isActive: { type: 'boolean' },
      },
      required: ['providerId'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'provider.updated',
      scope: 'aibase.providers.list',
      buildResourceId: (args) => String(args.providerId),
      handler: async (args) => {
        const res = await patchAdminProvidersId(
          { id: String(args.providerId) },
          pickDefined({
            name: args.name as string | undefined,
            slug: args.slug as string | undefined,
            baseUrl: args.baseUrl as string | undefined,
            apiKey: args.apiKey as string | undefined,
            adapterType: args.adapterType as string | undefined,
            isActive: args.isActive as boolean | undefined,
          }),
        );
        const data = getApiData(res);
        if (!data) throw new Error('更新服务商失败');
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'aibase_delete_provider',
    description: '停用 AI 服务商（软删除）',
    parameters: {
      type: 'object',
      properties: { providerId: { type: 'string' } },
      required: ['providerId'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'provider.deleted',
      scope: 'aibase.providers.list',
      buildResourceId: (args) => String(args.providerId),
      handler: async (args) => {
        const res = await deleteAdminProvidersId({ id: String(args.providerId) });
        return getApiData(res) ?? { id: String(args.providerId), deleted: true };
      },
    }),
  });

  registerFunctionCall({
    name: 'aibase_list_models',
    description: '列出 AI 模型，可按服务商过滤',
    parameters: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        size: { type: 'integer' },
        providerId: { type: 'string' },
        isActive: { type: 'boolean' },
      },
    },
    handler: async (args) => {
      const res = await getAdminModels({
        page: args.page as number,
        size: (args.size as number) || 100,
        providerId: args.providerId as string | undefined,
        isActive: args.isActive as boolean | undefined,
      });
      return getApiData(res) ?? parseApiListResponse(res).items;
    },
  });

  registerFunctionCall({
    name: 'aibase_get_model',
    description: '获取 AI 模型详情（含 capabilities、inputTags、outputTags）',
    parameters: {
      type: 'object',
      properties: { modelId: { type: 'string' } },
      required: ['modelId'],
    },
    handler: async (args) => getApiData(await getAdminModelsId({ id: String(args.modelId) })),
  });

  registerFunctionCall({
    name: 'aibase_create_model',
    description: '创建 AI 模型并绑定服务商',
    parameters: {
      type: 'object',
      properties: {
        providerId: { type: 'string' },
        slug: { type: 'string', description: '可选，省略则根据 displayName 生成' },
        modelId: { type: 'string', description: '模型 ID，如 deepseek-chat' },
        displayName: { type: 'string' },
        defaultParams: { type: 'object', description: '默认参数 JSON，如 temperature' },
        capabilities: {
          type: 'array',
          items: { type: 'string' },
          description: 'text, vision, function_calling, embedding 等',
        },
        inputTags: {
          type: 'array',
          items: { type: 'string' },
          description: 'text, image, audio, video, file（文档）',
        },
        outputTags: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['providerId', 'modelId', 'displayName', 'capabilities'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'model.created',
      scope: 'aibase.models.list',
      buildResourceId: (_args, data) => (data as { id?: string })?.id,
      handler: async (args) => {
        const res = await postAdminModels({
          providerId: String(args.providerId),
          slug: args.slug ? String(args.slug).trim() : '',
          modelId: String(args.modelId),
          displayName: String(args.displayName),
          defaultParams: parseDefaultParams(args.defaultParams),
          capabilities: args.capabilities as string[],
          inputTags: Array.isArray(args.inputTags) ? (args.inputTags as string[]) : undefined,
          outputTags: Array.isArray(args.outputTags) ? (args.outputTags as string[]) : undefined,
        });
        const data = getApiData(res);
        if (!data) throw new Error('创建模型失败');
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'aibase_update_model',
    description: '更新 AI 模型配置、能力标签与输入输出模态',
    parameters: {
      type: 'object',
      properties: {
        modelId: { type: 'string' },
        providerId: { type: 'string' },
        slug: { type: 'string' },
        modelIdUpstream: { type: 'string', description: '上游 modelId 字段' },
        displayName: { type: 'string' },
        defaultParams: { type: 'object' },
        capabilities: { type: 'array', items: { type: 'string' } },
        inputTags: { type: 'array', items: { type: 'string' } },
        outputTags: { type: 'array', items: { type: 'string' } },
        isActive: { type: 'boolean' },
      },
      required: ['modelId'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'model.updated',
      scope: 'aibase.models.list',
      buildResourceId: (args) => String(args.modelId),
      handler: async (args) => {
        const res = await patchAdminModelsId(
          { id: String(args.modelId) },
          pickDefined({
            providerId: args.providerId as string | undefined,
            slug: args.slug as string | undefined,
            modelId: args.modelIdUpstream as string | undefined,
            displayName: args.displayName as string | undefined,
            defaultParams: args.defaultParams != null ? parseDefaultParams(args.defaultParams) : undefined,
            capabilities: args.capabilities as string[] | undefined,
            inputTags: args.inputTags as string[] | undefined,
            outputTags: args.outputTags as string[] | undefined,
            isActive: args.isActive as boolean | undefined,
          }),
        );
        const data = getApiData(res);
        if (!data) throw new Error('更新模型失败');
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'aibase_delete_model',
    description: '停用 AI 模型（软删除）',
    parameters: {
      type: 'object',
      properties: { modelId: { type: 'string' } },
      required: ['modelId'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'model.deleted',
      scope: 'aibase.models.list',
      buildResourceId: (args) => String(args.modelId),
      handler: async (args) => {
        const res = await deleteAdminModelsId({ id: String(args.modelId) });
        return getApiData(res) ?? { id: String(args.modelId), deleted: true };
      },
    }),
  });
}

export function unregisterProviderModelTools() {
  TOOL_NAMES.forEach((name) => unregisterFunctionCall(name));
}
