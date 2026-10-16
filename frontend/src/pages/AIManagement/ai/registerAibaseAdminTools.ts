import {
  getAdminScopes,
  getAdminScopesId,
  patchAdminScopesId,
  postAdminScopes,
} from '@/services/EADAF/api/adminScopes';
import {
  getAdminSkills,
  getAdminSkillsId,
  patchAdminSkillsId,
  postAdminSkills,
} from '@/services/EADAF/api/adminSkills';
import {
  getAdminTools,
  getAdminToolsId,
  patchAdminToolsId,
  postAdminTools,
} from '@/services/EADAF/api/adminTools';
import { registerFunctionCall, unregisterFunctionCall, invalidateSkillCache } from '@eadaf/ai-base';
import { createMutatingHandler } from '@/ai/toolMutation';
import { getApiData, parseApiListResponse } from '@/utils/apiResponse';

const AIBASE_DOMAIN = 'aibase';

const TOOL_NAMES = [
  'aibase_list_scopes',
  'aibase_get_scope',
  'aibase_create_scope',
  'aibase_update_scope',
  'aibase_list_tools',
  'aibase_get_tool',
  'aibase_create_tool',
  'aibase_update_tool',
  'aibase_list_skills',
  'aibase_get_skill',
  'aibase_create_skill',
  'aibase_update_skill',
] as const;

function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export function registerAibaseAdminTools() {
  registerFunctionCall({
    name: 'aibase_list_scopes',
    description: '列出 AI Scope',
    parameters: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        size: { type: 'integer' },
        isActive: { type: 'boolean' },
      },
    },
    handler: async (args) => {
      const res = await getAdminScopes({
        page: args.page as number,
        size: (args.size as number) || 100,
        isActive: args.isActive as boolean | undefined,
      });
      return getApiData(res) ?? parseApiListResponse(res).items;
    },
  });

  registerFunctionCall({
    name: 'aibase_get_scope',
    description: '获取 Scope 详情',
    parameters: {
      type: 'object',
      properties: { scopeId: { type: 'string' } },
      required: ['scopeId'],
    },
    handler: async (args) => getApiData(await getAdminScopesId({ id: String(args.scopeId) })),
  });

  registerFunctionCall({
    name: 'aibase_create_scope',
    description: '创建 Scope',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        slug: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['name', 'slug'],
    },
    handler: createMutatingHandler({
      domain: AIBASE_DOMAIN,
      type: 'scope.created',
      scope: 'aibase.scopes.list',
      buildResourceId: (_args, data) => (data as { id?: string })?.id,
      handler: async (args) => {
        const res = await postAdminScopes({
          name: String(args.name),
          slug: String(args.slug),
          description: args.description as string,
        });
        const data = getApiData(res);
        if (!data) throw new Error('创建 Scope 失败');
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'aibase_update_scope',
    description: '更新 Scope',
    parameters: {
      type: 'object',
      properties: {
        scopeId: { type: 'string' },
        name: { type: 'string' },
        slug: { type: 'string' },
        description: { type: 'string' },
        isActive: { type: 'boolean' },
      },
      required: ['scopeId'],
    },
    handler: createMutatingHandler({
      domain: AIBASE_DOMAIN,
      type: 'scope.updated',
      scope: 'aibase.scopes.list',
      buildResourceId: (args) => String(args.scopeId),
      handler: async (args) => {
        const res = await patchAdminScopesId(
          { id: String(args.scopeId) },
          pickDefined({
            name: args.name as string | undefined,
            slug: args.slug as string | undefined,
            description: args.description as string | undefined,
            isActive: args.isActive as boolean | undefined,
          }),
        );
        const data = getApiData(res);
        if (!data) throw new Error('更新 Scope 失败');
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'aibase_list_tools',
    description: '列出 AI Tool',
    parameters: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        size: { type: 'integer' },
        scopeId: { type: 'string' },
        executionType: { type: 'string' },
        isActive: { type: 'boolean' },
      },
    },
    handler: async (args) => {
      const res = await getAdminTools({
        page: args.page as number,
        size: (args.size as number) || 100,
        scopeId: args.scopeId as string,
        executionType: args.executionType as string,
        isActive: args.isActive as boolean | undefined,
      });
      return getApiData(res) ?? parseApiListResponse(res).items;
    },
  });

  registerFunctionCall({
    name: 'aibase_get_tool',
    description: '获取 Tool 详情',
    parameters: {
      type: 'object',
      properties: { toolId: { type: 'string' } },
      required: ['toolId'],
    },
    handler: async (args) => getApiData(await getAdminToolsId({ id: String(args.toolId) })),
  });

  registerFunctionCall({
    name: 'aibase_create_tool',
    description: '创建 Tool',
    parameters: {
      type: 'object',
      properties: {
        scopeId: { type: 'string' },
        name: { type: 'string' },
        slug: { type: 'string' },
        functionName: { type: 'string' },
        description: { type: 'string' },
        executionType: { type: 'string' },
        parametersSchema: { type: 'object' },
        reviewMarkdown: { type: 'string' },
        serverConfig: { type: 'object' },
      },
      required: ['scopeId', 'name', 'functionName', 'executionType'],
    },
    handler: createMutatingHandler({
      domain: AIBASE_DOMAIN,
      type: 'tool.created',
      scope: 'aibase.tools.list',
      buildResourceId: (_args, data) => (data as { id?: string })?.id,
      handler: async (args) => {
        const res = await postAdminTools({
          scopeId: String(args.scopeId),
          name: String(args.name),
          slug: args.slug as string,
          functionName: String(args.functionName),
          description: args.description as string,
          executionType: String(args.executionType),
          parametersSchema: (args.parametersSchema as object) || {},
          reviewMarkdown: args.reviewMarkdown as string,
          serverConfig: args.serverConfig as object,
        });
        const data = getApiData(res);
        if (!data) throw new Error('创建 Tool 失败');
        invalidateSkillCache();
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'aibase_update_tool',
    description: '更新 Tool',
    parameters: {
      type: 'object',
      properties: {
        toolId: { type: 'string' },
        scopeId: { type: 'string' },
        name: { type: 'string' },
        slug: { type: 'string' },
        functionName: { type: 'string' },
        description: { type: 'string' },
        executionType: { type: 'string' },
        parametersSchema: { type: 'object' },
        reviewMarkdown: { type: 'string' },
        serverConfig: { type: 'object' },
        isActive: { type: 'boolean' },
      },
      required: ['toolId'],
    },
    handler: createMutatingHandler({
      domain: AIBASE_DOMAIN,
      type: 'tool.updated',
      buildResourceId: (args) => String(args.toolId),
      handler: async (args) => {
        const res = await patchAdminToolsId(
          { id: String(args.toolId) },
          pickDefined({
            scopeId: args.scopeId as string | undefined,
            name: args.name as string | undefined,
            slug: args.slug as string | undefined,
            functionName: args.functionName as string | undefined,
            description: args.description as string | undefined,
            executionType: args.executionType as string | undefined,
            parametersSchema: args.parametersSchema as object | undefined,
            reviewMarkdown: args.reviewMarkdown as string | undefined,
            serverConfig: args.serverConfig as object | undefined,
            isActive: args.isActive as boolean | undefined,
          }),
        );
        const data = getApiData(res);
        if (!data) throw new Error('更新 Tool 失败');
        invalidateSkillCache();
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'aibase_list_skills',
    description: '列出 AI Skill',
    parameters: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        size: { type: 'integer' },
        isActive: { type: 'boolean' },
      },
    },
    handler: async (args) => {
      const res = await getAdminSkills({
        page: args.page as number,
        size: (args.size as number) || 100,
        isActive: args.isActive as boolean | undefined,
      });
      return getApiData(res) ?? parseApiListResponse(res).items;
    },
  });

  registerFunctionCall({
    name: 'aibase_get_skill',
    description: '获取 Skill 详情',
    parameters: {
      type: 'object',
      properties: { skillId: { type: 'string' } },
      required: ['skillId'],
    },
    handler: async (args) => getApiData(await getAdminSkillsId({ id: String(args.skillId) })),
  });

  registerFunctionCall({
    name: 'aibase_create_skill',
    description: '创建 Skill',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        slug: { type: 'string' },
        description: { type: 'string' },
        contentMarkdown: { type: 'string' },
        scopeId: { type: 'string' },
        toolIds: { type: 'array', items: { type: 'string' } },
        isGlobal: { type: 'boolean' },
        isDedicated: { type: 'boolean' },
        applicationIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'slug'],
    },
    handler: createMutatingHandler({
      domain: AIBASE_DOMAIN,
      type: 'skill.created',
      scope: 'aibase.skills.list',
      buildResourceId: (_args, data) => (data as { id?: string })?.id,
      handler: async (args) => {
        const res = await postAdminSkills({
          name: String(args.name),
          slug: String(args.slug),
          description: args.description as string,
          contentMarkdown: args.contentMarkdown as string,
          scopeId: args.scopeId as string,
          toolIds: args.toolIds as string[],
          isGlobal: args.isGlobal as boolean | undefined,
          isDedicated: args.isDedicated as boolean | undefined,
          applicationIds: args.applicationIds as string[],
        });
        const data = getApiData(res);
        if (!data) throw new Error('创建 Skill 失败');
        invalidateSkillCache();
        return data;
      },
    }),
  });

  registerFunctionCall({
    name: 'aibase_update_skill',
    description: '更新 Skill',
    parameters: {
      type: 'object',
      properties: {
        skillId: { type: 'string' },
        name: { type: 'string' },
        slug: { type: 'string' },
        description: { type: 'string' },
        contentMarkdown: { type: 'string' },
        scopeId: { type: 'string' },
        toolIds: { type: 'array', items: { type: 'string' } },
        isGlobal: { type: 'boolean' },
        isDedicated: { type: 'boolean' },
        applicationIds: { type: 'array', items: { type: 'string' } },
        isActive: { type: 'boolean' },
      },
      required: ['skillId'],
    },
    handler: createMutatingHandler({
      domain: AIBASE_DOMAIN,
      type: 'skill.updated',
      buildResourceId: (args) => String(args.skillId),
      handler: async (args) => {
        const res = await patchAdminSkillsId(
          { id: String(args.skillId) },
          pickDefined({
            name: args.name as string | undefined,
            slug: args.slug as string | undefined,
            description: args.description as string | undefined,
            contentMarkdown: args.contentMarkdown as string | undefined,
            scopeId: args.scopeId as string | undefined,
            toolIds: args.toolIds as string[] | undefined,
            isGlobal: args.isGlobal as boolean | undefined,
            isDedicated: args.isDedicated as boolean | undefined,
            applicationIds: args.applicationIds as string[] | undefined,
            isActive: args.isActive as boolean | undefined,
          }),
        );
        const data = getApiData(res);
        if (!data) throw new Error('更新 Skill 失败');
        invalidateSkillCache();
        return data;
      },
    }),
  });
}

export function unregisterAibaseAdminTools() {
  TOOL_NAMES.forEach((name) => unregisterFunctionCall(name));
}
