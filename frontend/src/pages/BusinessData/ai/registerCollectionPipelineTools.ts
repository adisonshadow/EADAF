import { registerFunctionCall, unregisterFunctionCall } from '@eadaf/ai-base';
import { createMutatingHandler } from '@/ai/toolMutation';
import { history } from '@/utils/navigation';
import {
  deleteCollectionPipeline,
  getCollectionPipeline,
  getCollectionPipelineTestProfile,
  getCollectionPipelines,
  patchCollectionPipeline,
  postCollectionPipeline,
  postCollectionPipelineDisable,
  postCollectionPipelinePublish,
  postCollectionPipelineTest,
} from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';

const DOMAIN = 'bizdata';
const TEST_SURFACE = 'bizdata.collection-pipeline.test';
const EDIT_SURFACE = 'bizdata.collection-pipeline.edit';
const CREATE_SURFACE = 'bizdata.collection-pipeline.create';

function editOrCreateScope(args: Record<string, unknown>) {
  return args.pipelineId ? EDIT_SURFACE : CREATE_SURFACE;
}

const TOOL_NAMES = [
  'collection_pipeline_list',
  'collection_pipeline_filter',
  'collection_pipeline_get',
  'collection_pipeline_upsert',
  'collection_pipeline_publish',
  'collection_pipeline_disable',
  'collection_pipeline_delete',
  'collection_pipeline_get_test_profile',
  'collection_pipeline_run_test',
  'collection_pipeline_suggest_scripts',
  'collection_pipeline_navigate',
] as const;

async function resolvePipelineId(args: Record<string, unknown>) {
  if (args.pipelineId) return String(args.pipelineId);
  if (args.code) {
    const res = await getCollectionPipelines({ codePrefix: String(args.code), size: 50 });
    const data = getApiData<API.CollectionPipelineList>(res);
    const exact = data?.items?.find((item) => item.code === args.code);
    if (exact?.id) return exact.id;
  }
  throw new Error('请提供 pipelineId 或在 Surface 上下文中操作');
}

/** 写后回读：GET + list 命中 */
async function verifyPipelinePersisted(pipelineId: string, expectedCode?: string) {
  const getRes = await getCollectionPipeline(pipelineId);
  if (!isApiSuccess(getRes)) {
    return {
      verified: false,
      rereadOk: false,
      listedOk: false,
      message: getApiErrorMessage(getRes, '创建后回读管道失败'),
    };
  }
  const got = getApiData<API.CollectionPipeline>(getRes);
  const code = String(got?.code || expectedCode || '').trim();
  const rereadOk = Boolean(got?.id);
  let listedOk = false;
  if (code) {
    const listRes = await getCollectionPipelines({ codePrefix: code, size: 100 });
    const items = getApiData<API.CollectionPipelineList>(listRes)?.items || [];
    listedOk = items.some((item) => item.id === pipelineId || item.code === code);
  }
  const codeMatch = !expectedCode || got?.code === expectedCode;
  const verified = rereadOk && listedOk && codeMatch;
  return {
    verified,
    rereadOk,
    listedOk,
    pipelineId: got?.id,
    code: got?.code,
    status: got?.status,
    path: '/api_services/collection-pipelines',
    message: verified
      ? `管道已落库并出现在列表：${got?.code}（列表路径 /api_services/collection-pipelines，左侧选域 ${String(got?.code || '').split(':')[0] || '全部'}）`
      : `管道写后校验失败（reread=${rereadOk}, listed=${listedOk}, codeMatch=${codeMatch}）`,
  };
}

export function registerCollectionPipelineTools() {
  registerFunctionCall({
    name: 'collection_pipeline_list',
    description: '列出采集管道',
    parameters: {
      type: 'object',
      properties: {
        codePrefix: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'published', 'disabled'] },
        protocolType: { type: 'string', enum: ['serial', 'modbus_rtu', 'modbus_tcp'] },
        page: { type: 'integer' },
        size: { type: 'integer' },
      },
    },
    handler: async (args) => {
      const res = await getCollectionPipelines({
        codePrefix: args.codePrefix as string,
        status: args.status as string,
        protocolType: args.protocolType as string,
        page: args.page as number,
        size: args.size as number,
      });
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'collection_pipeline_filter',
    description: '按页面过滤项检索采集管道（code 前缀 + 状态 + 协议类型），返回全部命中项；面向检索而非分页浏览',
    parameters: {
      type: 'object',
      properties: {
        codePrefix: { type: 'string', description: 'code 前缀' },
        status: { type: 'string', enum: ['draft', 'published', 'disabled'] },
        protocolType: { type: 'string', enum: ['serial', 'modbus_rtu', 'modbus_tcp'] },
      },
    },
    handler: async (args) => {
      const res = await getCollectionPipelines({
        codePrefix: args.codePrefix as string,
        status: args.status as string,
        protocolType: args.protocolType as string,
        size: -1,
      });
      const data = getApiData<API.CollectionPipelineList>(res);
      return { items: data?.items || [], total: data?.items?.length || 0 };
    },
  });

  registerFunctionCall({
    name: 'collection_pipeline_get',
    description: '获取采集管道详情',
    parameters: {
      type: 'object',
      properties: {
        pipelineId: { type: 'string' },
        code: { type: 'string' },
      },
    },
    handler: async (args) => {
      const id = await resolvePipelineId(args as Record<string, unknown>);
      const res = await getCollectionPipeline(id);
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'collection_pipeline_upsert',
    description:
      '创建或更新采集管道并持久化（含 parseScript/storeScript）。成功须 verified=true。suggest_scripts 仅草稿不能代替本 Tool',
    requiresVerification: true,
    parameters: {
      type: 'object',
      properties: {
        pipelineId: { type: 'string', description: '有则更新；创建时省略' },
        scopeCode: { type: 'string', description: '如 fmms；与 pipelineSlug 组成 code' },
        pipelineSlug: { type: 'string', description: '如 digital_measure → code=fmms:digital_measure' },
        name: { type: 'string' },
        description: { type: 'string' },
        protocolType: { type: 'string', enum: ['serial', 'modbus_rtu', 'modbus_tcp'] },
        entityId: { type: 'string', description: '已物化 ER 实体 UUID' },
        sampleData: { type: 'string', description: '测试用原始样本（文本或 hex）' },
        targetStructure: { type: 'string', description: '目标 TS interface 文本' },
        parseScript: {
          type: 'string',
          description:
            '须导出 function parse(raw, ctx)。仅可用参数 raw、ctx；禁止未声明变量 channel/val/idx 等',
        },
        storeScript: {
          type: 'string',
          description:
            '须导出 async function store(data, ctx)。用 ctx.queryPg + ctx.tableQualified；禁止 ctx.bizdata',
        },
        restrictSources: { type: 'boolean' },
        applicationIds: { type: 'array', items: { type: 'string' } },
      },
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'collection_pipeline.updated',
      scope: editOrCreateScope,
      buildResourceId: (args, data) =>
        String((data as API.CollectionPipeline | undefined)?.id || args.pipelineId || ''),
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const body = {
          scopeCode: args.scopeCode as string,
          pipelineSlug: args.pipelineSlug as string,
          name: args.name as string,
          description: args.description as string,
          protocolType: args.protocolType as API.CollectionPipelineProtocolType,
          entityId: args.entityId as string,
          sampleData: args.sampleData as string,
          targetStructure: args.targetStructure as string,
          parseScript: args.parseScript as string,
          storeScript: args.storeScript as string,
          restrictSources: args.restrictSources as boolean,
          applicationIds: args.applicationIds as string[],
        };
        let saved: API.CollectionPipeline | undefined;
        if (args.pipelineId) {
          const res = await patchCollectionPipeline(String(args.pipelineId), body);
          if (!isApiSuccess(res)) throw new Error(getApiErrorMessage(res, '更新失败'));
          saved = getApiData<API.CollectionPipeline>(res);
        } else {
          const res = await postCollectionPipeline(body);
          if (!isApiSuccess(res)) throw new Error(getApiErrorMessage(res, '创建失败'));
          saved = getApiData<API.CollectionPipeline>(res);
        }
        if (!saved?.id) throw new Error('管道保存成功但未返回 id');
        const expectedCode =
          body.scopeCode && body.pipelineSlug
            ? `${body.scopeCode}:${body.pipelineSlug}`
            : saved.code;
        const _verification = await verifyPipelinePersisted(saved.id, expectedCode);
        return { ...saved, _verification };
      },
    }),
  });

  registerFunctionCall({
    name: 'collection_pipeline_publish',
    description: '发布采集管道',
    parameters: {
      type: 'object',
      properties: { pipelineId: { type: 'string' }, code: { type: 'string' } },
    },
    handler: async (args) => {
      const id = await resolvePipelineId(args as Record<string, unknown>);
      const res = await postCollectionPipelinePublish(id);
      if (!isApiSuccess(res)) throw new Error(getApiErrorMessage(res, '发布失败'));
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'collection_pipeline_disable',
    description: '禁用采集管道',
    parameters: {
      type: 'object',
      properties: { pipelineId: { type: 'string' }, code: { type: 'string' } },
    },
    handler: async (args) => {
      const id = await resolvePipelineId(args as Record<string, unknown>);
      const res = await postCollectionPipelineDisable(id);
      if (!isApiSuccess(res)) throw new Error(getApiErrorMessage(res, '禁用失败'));
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'collection_pipeline_delete',
    description: '删除采集管道',
    parameters: {
      type: 'object',
      properties: { pipelineId: { type: 'string' }, code: { type: 'string' } },
    },
    handler: async (args) => {
      const id = await resolvePipelineId(args as Record<string, unknown>);
      const res = await deleteCollectionPipeline(id);
      if (!isApiSuccess(res)) throw new Error(getApiErrorMessage(res, '删除失败'));
      return { deleted: true, pipelineId: id };
    },
  });

  registerFunctionCall({
    name: 'collection_pipeline_get_test_profile',
    description: '获取采集管道测试配置',
    parameters: {
      type: 'object',
      properties: { pipelineId: { type: 'string' }, code: { type: 'string' } },
    },
    handler: async (args) => {
      const id = await resolvePipelineId(args as Record<string, unknown>);
      const res = await getCollectionPipelineTestProfile(id);
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'collection_pipeline_run_test',
    description:
      '执行采集管道测试（读库中已持久化脚本；事务回滚）。须先 upsert 脚本；仅 suggest_scripts 不会生效',
    parameters: {
      type: 'object',
      properties: {
        pipelineId: { type: 'string' },
        code: { type: 'string' },
        rawInput: { type: 'string' },
        runType: { type: 'string', enum: ['test', 'ai_test'] },
      },
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'collection_pipeline.test_completed',
      scope: TEST_SURFACE,
      buildResourceId: (args) => String(args.pipelineId || args.code || ''),
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const id = await resolvePipelineId(args as Record<string, unknown>);
        try {
          const res = await postCollectionPipelineTest(id, {
            rawInput: args.rawInput as string,
            runType: (args.runType as string) || 'ai_test',
          });
          if (isApiSuccess(res)) {
            const data = getApiData<API.CollectionPipelineTestResult>(res);
            return {
              success: true,
              verified: true,
              ...data,
              _verification: {
                verified: true,
                message: '测试请求成功（存储是否回滚见 rolledBack）',
              },
            };
          }
          return {
            success: false,
            verified: false,
            error: getApiErrorMessage(res, '测试失败'),
            _verification: { verified: false, message: getApiErrorMessage(res, '测试失败') },
          };
        } catch (err) {
          return {
            success: false,
            verified: false,
            error: getApiErrorMessage(err, '测试失败'),
            _verification: { verified: false, message: getApiErrorMessage(err, '测试失败') },
          };
        }
      },
    }),
  });

  registerFunctionCall({
    name: 'collection_pipeline_suggest_scripts',
    description:
      '仅把 parse/store 草稿同步到编辑页表单（不写库）。测试前必须再用 collection_pipeline_upsert 持久化',
    parameters: {
      type: 'object',
      properties: {
        pipelineId: { type: 'string' },
        parseScript: { type: 'string' },
        storeScript: { type: 'string' },
        targetStructure: { type: 'string' },
      },
      required: ['parseScript', 'storeScript'],
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'collection_pipeline.updated',
      scope: editOrCreateScope,
      buildResourceId: (args) => String(args.pipelineId || ''),
      buildPayload: (args) => ({
        parseScript: args.parseScript,
        storeScript: args.storeScript,
        targetStructure: args.targetStructure,
        _draftOnly: true,
      }),
      handler: async (args) => ({
        parseScript: args.parseScript,
        storeScript: args.storeScript,
        targetStructure: args.targetStructure,
        persisted: false,
        _verification: {
          verified: true,
          persisted: false,
          message:
            '草稿已同步到编辑页（persisted=false）。run_test 读的是库内脚本，必须再调用 collection_pipeline_upsert 持久化',
        },
      }),
    }),
  });

  registerFunctionCall({
    name: 'collection_pipeline_navigate',
    description: '跳转到采集管道 list / create / edit / test',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['list', 'create', 'edit', 'test'] },
        pipelineId: { type: 'string' },
      },
      required: ['target'],
    },
    handler: async (args) => {
      const target = args.target as string;
      const id = args.pipelineId as string | undefined;
      let path = '/api_services/collection-pipelines';
      if (target === 'create') path = '/api_services/collection-pipelines/create';
      else if (target === 'edit' && id) path = `/api_services/collection-pipelines/${id}/edit`;
      else if (target === 'test' && id) path = `/api_services/collection-pipelines/${id}/test`;
      history.push(path);
      return { navigated: true, path };
    },
  });
}

export function unregisterCollectionPipelineTools() {
  TOOL_NAMES.forEach((name) => unregisterFunctionCall(name));
}
