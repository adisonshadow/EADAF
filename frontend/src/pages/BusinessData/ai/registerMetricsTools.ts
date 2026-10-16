import { registerFunctionCall, unregisterFunctionCall } from '@eadaf/ai-base';
import { createMutatingHandler } from '@/ai/toolMutation';
import { history } from '@/utils/navigation';
import {
  deleteBizdataMetric,
  deleteBizdataMetricCard,
  getBizdataMetric,
  getBizdataMetricCard,
  getBizdataMetricCardSuggest,
  getBizdataMetricCards,
  getBizdataMetricRuns,
  getBizdataMetricValue,
  getBizdataMetricValues,
  getBizdataMetrics,
  getBizdataMetricsDashboard,
  patchBizdataMetric,
  patchBizdataMetricCard,
  postBizdataMetric,
  postBizdataMetricCard,
  postBizdataMetricExecute,
  postBizdataMetricExecuteBatch,
} from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';

const DOMAIN = 'bizdata';
const LIST_SURFACE = 'bizdata.metrics.list';
const CREATE_SURFACE = 'bizdata.metrics.create';
const EDIT_SURFACE = 'bizdata.metrics.edit';
const DASHBOARD_SURFACE = 'bizdata.metrics.dashboard';

function editOrCreateScope(args: Record<string, unknown>) {
  return args.metricId ? EDIT_SURFACE : CREATE_SURFACE;
}

const TOOL_NAMES = [
  'bizdata_metric_list',
  'bizdata_metric_filter',
  'bizdata_metric_get',
  'bizdata_metric_upsert',
  'bizdata_metric_delete',
  'bizdata_metric_execute',
  'bizdata_metric_execute_batch',
  'bizdata_metric_list_runs',
  'bizdata_metric_list_values',
  'bizdata_metric_get_value',
  'bizdata_metric_get_dashboard',
  'bizdata_metric_suggest_definition',
  'bizdata_metric_navigate',
  'bizdata_metric_card_list',
  'bizdata_metric_card_get',
  'bizdata_metric_card_upsert',
  'bizdata_metric_card_delete',
  'bizdata_metric_card_suggest',
] as const;

async function resolveCardId(args: Record<string, unknown>) {
  if (args.cardId) return String(args.cardId);
  const code = String(args.code || args.cardCode || '').trim();
  if (code) {
    const res = await getBizdataMetricCards({ size: 200 });
    const data = getApiData<API.BizdataMetricCardList>(res);
    const exact = data?.items?.find((item) => item.code === code);
    if (exact?.id) return exact.id;
  }
  throw new Error('请提供 cardId 或 code');
}

async function resolveMetricId(args: Record<string, unknown>) {
  if (args.metricId) return String(args.metricId);
  const code = String(args.code || '').trim();
  if (code) {
    const res = await getBizdataMetrics({ codePrefix: code, size: 100 });
    const data = getApiData<API.BizdataMetricList>(res);
    const exact = data?.items?.find((item) => item.code === code);
    if (exact?.id) return exact.id;
    if (data?.items?.length === 1 && data.items[0]?.id) return data.items[0].id!;
  }
  throw new Error('请提供 metricId 或 code，或在 Surface 上下文中操作');
}

/** 写后回读：GET by id + list 命中同一 code */
async function verifyMetricPersisted(metricId: string, expectedCode?: string) {
  const getRes = await getBizdataMetric(metricId);
  if (!isApiSuccess(getRes)) {
    return {
      verified: false,
      rereadOk: false,
      listedOk: false,
      message: getApiErrorMessage(getRes, '创建后回读指标失败'),
    };
  }
  const got = getApiData<API.BizdataMetric>(getRes);
  const code = String(got?.code || expectedCode || '').trim();
  const rereadOk = Boolean(got?.id);
  let listedOk = false;
  if (code) {
    const listRes = await getBizdataMetrics({ codePrefix: code, size: 100 });
    const items = getApiData<API.BizdataMetricList>(listRes)?.items || [];
    listedOk = items.some((item) => item.id === metricId || item.code === code);
  }
  const codeMatch = !expectedCode || got?.code === expectedCode;
  const verified = rereadOk && listedOk && codeMatch;
  return {
    verified,
    rereadOk,
    listedOk,
    metricId: got?.id,
    code: got?.code,
    message: verified
      ? `指标已落库并回读成功：${got?.code}`
      : `指标写后校验失败（reread=${rereadOk}, listed=${listedOk}, codeMatch=${codeMatch}）`,
  };
}

/** 写后回读：GET card + dashboard domains 中可见 */
async function verifyCardPersisted(cardId: string, expectedCode?: string, domainCode?: string) {
  const getRes = await getBizdataMetricCard(cardId);
  if (!isApiSuccess(getRes)) {
    return {
      verified: false,
      rereadOk: false,
      onDashboard: false,
      message: getApiErrorMessage(getRes, '创建后回读卡片失败'),
    };
  }
  const got = getApiData<API.BizdataMetricCard>(getRes);
  const rereadOk = Boolean(got?.id);
  const code = String(got?.code || expectedCode || '').trim();
  const dashRes = await getBizdataMetricsDashboard({
    domainCode: domainCode || got?.domainCode,
  });
  const domains = getApiData<API.BizdataMetricDashboard>(dashRes)?.domains || [];
  const onDashboard = domains.some((d) =>
    (d.cards || []).some((c) => c.id === cardId || (!!code && c.code === code)),
  );
  const codeMatch = !expectedCode || got?.code === expectedCode;
  const verified = rereadOk && onDashboard && codeMatch;
  return {
    verified,
    rereadOk,
    onDashboard,
    cardId: got?.id,
    code: got?.code,
    domainCode: got?.domainCode,
    message: verified
      ? `看板卡片已落库且出现在 dashboard：${got?.code}`
      : `卡片写后校验失败（reread=${rereadOk}, onDashboard=${onDashboard}, codeMatch=${codeMatch}）`,
  };
}

export function registerMetricsTools() {
  registerFunctionCall({
    name: 'bizdata_metric_list',
    description:
      '列出【指标定义】metrics（怎么算）。不是看板卡片；看板卡片用 bizdata_metric_card_list / get_dashboard',
    parameters: {
      type: 'object',
      properties: {
        codePrefix: { type: 'string', description: '如 sales 或 sales:order' },
        status: { type: 'string', enum: ['enabled', 'disabled'] },
        page: { type: 'integer' },
        size: { type: 'integer' },
      },
    },
    handler: async (args) => {
      const res = await getBizdataMetrics({
        codePrefix: args.codePrefix as string,
        status: args.status as string,
        page: args.page as number,
        size: args.size as number,
      });
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'bizdata_metric_filter',
    description: '按页面过滤项检索指标（code 前缀 + 状态），返回全部命中项；面向检索而非分页浏览',
    parameters: {
      type: 'object',
      properties: {
        codePrefix: { type: 'string', description: 'code 前缀，如 sales 或 sales:order' },
        status: { type: 'string', enum: ['enabled', 'disabled'] },
      },
    },
    handler: async (args) => {
      const res = await getBizdataMetrics({
        codePrefix: args.codePrefix as string,
        status: args.status as string,
        size: -1,
      });
      const data = getApiData<API.BizdataMetricList>(res);
      return { items: data?.items || [], total: data?.items?.length || 0 };
    },
  });

  registerFunctionCall({
    name: 'bizdata_metric_get',
    description: '获取指标详情（SQL、公式、调度等）',
    parameters: {
      type: 'object',
      properties: {
        metricId: { type: 'string' },
        code: { type: 'string' },
      },
    },
    handler: async (args) => {
      const id = await resolveMetricId(args as Record<string, unknown>);
      const res = await getBizdataMetric(id);
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'bizdata_metric_upsert',
    description:
      '创建或更新【指标定义】SQL/公式（metrics）。不会出现在看板。看板卡片请用 bizdata_metric_card_upsert。成功须 verified=true',
    requiresVerification: true,
    parameters: {
      type: 'object',
      // code 与 label 必填，与指标管理页表单一致：
      // 列表页用 CodePathTreeTable 按冒号分层 code 渲染，空 code 的指标会被树丢弃而"消失"。
      required: ['code', 'label', 'metricType'],
      properties: {
        metricId: { type: 'string' },
        code: {
          type: 'string',
          description: '指标编码，建议用冒号分层（如 web:user:total_count），列表页按此分层展示',
        },
        label: { type: 'string', description: '指标名称' },
        description: { type: 'string' },
        metricType: { type: 'string', enum: ['sql', 'formula'] },
        connectionId: { type: 'string' },
        queryScript: { type: 'string' },
        formulaConfig: { type: 'object' },
        computeMode: { type: 'string', enum: ['scheduled', 'on_demand', 'both'] },
        scheduleType: { type: 'string', enum: ['manual', 'hourly', 'daily', 'cron'] },
        scheduleConfig: { type: 'object' },
        unit: { type: 'string' },
        status: { type: 'string', enum: ['enabled', 'disabled'] },
      },
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'metric.updated',
      scope: editOrCreateScope,
      buildResourceId: (args, data) =>
        String((data as API.BizdataMetric | undefined)?.id || args.metricId || ''),
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const body: Partial<API.BizdataMetric> = {
          code: args.code as string,
          label: args.label as string,
          description: args.description as string,
          metricType: args.metricType as API.BizdataMetric['metricType'],
          connectionId: args.connectionId as string,
          queryScript: args.queryScript as string,
          formulaConfig: args.formulaConfig as API.BizdataMetric['formulaConfig'],
          computeMode: args.computeMode as API.BizdataMetric['computeMode'],
          scheduleType: args.scheduleType as API.BizdataMetric['scheduleType'],
          scheduleConfig: args.scheduleConfig as API.BizdataMetric['scheduleConfig'],
          unit: args.unit as string,
          status: args.status as API.BizdataMetric['status'],
        };
        let saved: API.BizdataMetric | undefined;
        if (args.metricId) {
          const res = await patchBizdataMetric(String(args.metricId), body);
          if (!isApiSuccess(res)) throw new Error(getApiErrorMessage(res, '更新失败'));
          saved = getApiData<API.BizdataMetric>(res);
        } else {
          const res = await postBizdataMetric(body);
          if (!isApiSuccess(res)) throw new Error(getApiErrorMessage(res, '创建失败'));
          saved = getApiData<API.BizdataMetric>(res);
        }
        if (!saved?.id) throw new Error('指标保存成功但未返回 id');
        const _verification = await verifyMetricPersisted(saved.id, body.code || saved.code);
        return { ...saved, _verification };
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_metric_delete',
    description: '删除业务指标',
    parameters: {
      type: 'object',
      properties: { metricId: { type: 'string' }, code: { type: 'string' } },
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'metric.deleted',
      scope: LIST_SURFACE,
      buildResourceId: (args) => String(args.metricId || args.code || ''),
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const id = await resolveMetricId(args as Record<string, unknown>);
        const res = await deleteBizdataMetric(id);
        if (!isApiSuccess(res)) throw new Error(getApiErrorMessage(res, '删除失败'));
        return { deleted: true, metricId: id };
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_metric_execute',
    description: '手动执行单个指标计算',
    parameters: {
      type: 'object',
      properties: { metricId: { type: 'string' }, code: { type: 'string' } },
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'metric.executed',
      scope: (args) => String(args.metricId || args.code || LIST_SURFACE),
      buildResourceId: (args) => String(args.metricId || args.code || ''),
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const id = await resolveMetricId(args as Record<string, unknown>);
        const res = await postBizdataMetricExecute(id);
        if (!isApiSuccess(res)) {
          return { success: false, error: getApiErrorMessage(res, '执行失败') };
        }
        const data = getApiData<Record<string, unknown>>(res);
        return { success: true, ...(data ?? {}) };
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_metric_execute_batch',
    description: '按 code 前缀批量执行指标（公式指标须依赖项已有结果）',
    parameters: {
      type: 'object',
      properties: {
        codePrefix: { type: 'string', description: '如 sales 或 sales:order' },
      },
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'metric.executed',
      scope: LIST_SURFACE,
      buildResourceId: (args) => String(args.codePrefix || 'batch'),
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const res = await postBizdataMetricExecuteBatch({
          codePrefix: args.codePrefix as string,
        });
        if (!isApiSuccess(res)) {
          return { success: false, error: getApiErrorMessage(res, '批量执行失败') };
        }
        const data = getApiData<Record<string, unknown>>(res);
        return { success: true, ...(data ?? {}) };
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_metric_list_runs',
    description: '分页获取指标执行记录',
    parameters: {
      type: 'object',
      properties: {
        metricId: { type: 'string' },
        code: { type: 'string' },
        page: { type: 'integer' },
        size: { type: 'integer' },
      },
    },
    handler: async (args) => {
      const id = await resolveMetricId(args as Record<string, unknown>);
      const res = await getBizdataMetricRuns(id, {
        page: args.page as number,
        size: args.size as number,
      });
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'bizdata_metric_list_values',
    description: '分页获取指标历史计算值',
    parameters: {
      type: 'object',
      properties: {
        metricId: { type: 'string' },
        code: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
        dimensionKey: { type: 'string' },
        page: { type: 'integer' },
        size: { type: 'integer' },
      },
    },
    handler: async (args) => {
      const id = await resolveMetricId(args as Record<string, unknown>);
      const res = await getBizdataMetricValues(id, {
        from: args.from as string,
        to: args.to as string,
        dimensionKey: args.dimensionKey as string,
        page: args.page as number,
        size: args.size as number,
      });
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'bizdata_metric_get_value',
    description: '获取指标最新值（可选 refresh=true 先执行再读）',
    parameters: {
      type: 'object',
      properties: {
        metricId: { type: 'string' },
        code: { type: 'string' },
        refresh: { type: 'boolean' },
      },
    },
    handler: async (args) => {
      const id = await resolveMetricId(args as Record<string, unknown>);
      const res = await getBizdataMetricValue(id, args.refresh === true);
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'bizdata_metric_get_dashboard',
    description:
      '读取看板：返回 domains[].cards。空 cards 表示尚未创建看板卡片（有指标定义也不显示）。创建卡片后必须用本 Tool 验收',
    parameters: {
      type: 'object',
      properties: {
        codePrefix: { type: 'string' },
        domainCode: { type: 'string' },
        refresh: { type: 'boolean', description: '为 true 时对 on_demand 指标即时重算' },
      },
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'metric.dashboard_refreshed',
      scope: DASHBOARD_SURFACE,
      buildResourceId: () => 'dashboard',
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const res = await getBizdataMetricsDashboard({
          codePrefix: args.codePrefix as string,
          domainCode: args.domainCode as string,
          refresh: args.refresh === true,
        });
        return getApiData(res);
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_metric_card_list',
    description: '列出【看板卡片】配置（metric_cards）。不是指标定义列表；查指标用 bizdata_metric_list',
    parameters: {
      type: 'object',
      properties: {
        domainCode: { type: 'string' },
        status: { type: 'string', enum: ['enabled', 'disabled'] },
        page: { type: 'integer' },
        size: { type: 'integer' },
      },
    },
    handler: async (args) => {
      const res = await getBizdataMetricCards({
        domainCode: args.domainCode as string,
        status: args.status as string,
        page: args.page as number,
        size: args.size as number,
      });
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'bizdata_metric_card_get',
    description: '获取指标卡片详情',
    parameters: {
      type: 'object',
      properties: { cardId: { type: 'string' }, code: { type: 'string' } },
    },
    handler: async (args) => {
      const id = await resolveCardId(args as Record<string, unknown>);
      const res = await getBizdataMetricCard(id);
      if (!isApiSuccess(res)) throw new Error(getApiErrorMessage(res, '获取卡片失败'));
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'bizdata_metric_card_upsert',
    description:
      '创建或更新【看板卡片】metric_cards（绑定已有 metric + vizType）。禁止用 metric_upsert 代替。成功须 verified=true 且 onDashboard',
    requiresVerification: true,
    parameters: {
      type: 'object',
      required: ['code', 'title', 'domainCode', 'vizType'],
      properties: {
        cardId: { type: 'string' },
        code: { type: 'string', description: '卡片 code，建议 {metricCode}:{viz}，如 fmms:production:workcard_count:trend' },
        title: { type: 'string' },
        description: { type: 'string' },
        domainCode: { type: 'string', description: '看板分层域，如 fmms' },
        metricId: { type: 'string' },
        metricCode: { type: 'string', description: '绑定的指标定义 code（与卡片 code 不同）' },
        vizType: { type: 'string', enum: ['statistic_trend', 'line', 'bar', 'ring'] },
        config: { type: 'object' },
        sortOrder: { type: 'integer' },
        status: { type: 'string', enum: ['enabled', 'disabled'] },
      },
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'metric.card_upserted',
      scope: DASHBOARD_SURFACE,
      buildResourceId: (args, data) =>
        String((data as API.BizdataMetricCard | undefined)?.id || args.cardId || args.code || ''),
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const body = {
          code: args.code as string,
          title: args.title as string,
          description: args.description as string,
          domainCode: args.domainCode as string,
          metricId: args.metricId as string,
          metricCode: args.metricCode as string,
          vizType: args.vizType as API.BizdataMetricCardVizType,
          config: args.config as API.BizdataMetricCardConfig,
          sortOrder: args.sortOrder as number,
          status: args.status as 'enabled' | 'disabled',
        };
        let saved: API.BizdataMetricCard | undefined;
        if (args.cardId) {
          const res = await patchBizdataMetricCard(String(args.cardId), body);
          if (!isApiSuccess(res)) throw new Error(getApiErrorMessage(res, '更新卡片失败'));
          saved = getApiData<API.BizdataMetricCard>(res);
        } else {
          const res = await postBizdataMetricCard(body);
          if (!isApiSuccess(res)) throw new Error(getApiErrorMessage(res, '创建卡片失败'));
          saved = getApiData<API.BizdataMetricCard>(res);
        }
        if (!saved?.id) throw new Error('卡片保存成功但未返回 id');
        const _verification = await verifyCardPersisted(
          saved.id,
          body.code || saved.code,
          body.domainCode || saved.domainCode,
        );
        return { ...saved, _verification };
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_metric_card_delete',
    description: '删除指标看板卡片（不删除底层指标）',
    parameters: {
      type: 'object',
      properties: { cardId: { type: 'string' }, code: { type: 'string' } },
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'metric.card_deleted',
      scope: DASHBOARD_SURFACE,
      buildResourceId: (args) => String(args.cardId || args.code || ''),
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const id = await resolveCardId(args as Record<string, unknown>);
        const res = await deleteBizdataMetricCard(id);
        if (!isApiSuccess(res)) throw new Error(getApiErrorMessage(res, '删除卡片失败'));
        return { deleted: true, cardId: id };
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_metric_card_suggest',
    description: '根据指标历史值建议看板卡片配置，并打开看板新建表单草稿',
    parameters: {
      type: 'object',
      properties: {
        metricId: { type: 'string' },
        code: { type: 'string', description: '指标 code' },
        metricCode: { type: 'string' },
      },
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'metric.card_suggested',
      scope: DASHBOARD_SURFACE,
      buildResourceId: (args) => String(args.metricId || args.code || args.metricCode || ''),
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const metricCode = (args.metricCode || args.code) as string | undefined;
        let metricId = args.metricId as string | undefined;
        if (!metricId && metricCode) {
          metricId = await resolveMetricId({ code: metricCode });
        }
        if (!metricId && !metricCode) {
          throw new Error('请提供 metricId 或 code');
        }
        const res = await getBizdataMetricCardSuggest({ metricId, metricCode });
        if (!isApiSuccess(res)) throw new Error(getApiErrorMessage(res, '建议卡片失败'));
        return getApiData(res);
      },
    }),
  });

  registerFunctionCall({
    name: 'bizdata_metric_suggest_definition',
    description: '将 AI 生成的 SQL / 公式配置同步到当前指标编辑页（mutation）',
    parameters: {
      type: 'object',
      properties: {
        metricId: { type: 'string' },
        queryScript: { type: 'string' },
        formulaConfig: { type: 'object' },
        description: { type: 'string' },
        unit: { type: 'string' },
      },
    },
    handler: createMutatingHandler({
      domain: DOMAIN,
      type: 'metric.updated',
      scope: editOrCreateScope,
      buildResourceId: (args) => String(args.metricId || ''),
      buildPayload: (args) => ({
        queryScript: args.queryScript,
        formulaConfig: args.formulaConfig,
        description: args.description,
        unit: args.unit,
      }),
      handler: async (args) => ({
        queryScript: args.queryScript,
        formulaConfig: args.formulaConfig,
        description: args.description,
        unit: args.unit,
      }),
    }),
  });

  registerFunctionCall({
    name: 'bizdata_metric_navigate',
    description: '在指标 list / dashboard / create / edit 页面间跳转',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['list', 'dashboard', 'create', 'edit'] },
        metricId: { type: 'string' },
      },
      required: ['target'],
    },
    handler: async (args) => {
      const target = args.target as string;
      const id = args.metricId as string | undefined;
      let path = '/business_data/metrics';
      if (target === 'dashboard') path = '/business_data/metrics/dashboard';
      else if (target === 'create') path = '/business_data/metrics/create';
      else if (target === 'edit' && id) path = `/business_data/metrics/${id}/edit`;
      history.push(path);
      return { navigated: true, path };
    },
  });
}

export function unregisterMetricsTools() {
  TOOL_NAMES.forEach((name) => unregisterFunctionCall(name));
}
