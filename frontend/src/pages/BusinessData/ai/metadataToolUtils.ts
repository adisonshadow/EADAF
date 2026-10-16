import {
  getBizdataDataStandards,
  getBizdataMetadataByTarget,
  getBizdataMetadataTable,
  getBizdataMetadataTables,
  getBizdataMetrics,
} from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { isUuid, resolveBizDataEntityId } from './bizdataFieldUtils';

export async function assertApiData<T>(response: unknown, fallbackMessage: string): Promise<T> {
  if (!isApiSuccess(response)) {
    throw new Error(getApiErrorMessage(response, fallbackMessage));
  }
  const data = getApiData<T>(response);
  if (data === undefined || data === null) {
    throw new Error(fallbackMessage);
  }
  return data;
}

export async function resolveStandardId(args: Record<string, unknown>): Promise<string | null | undefined> {
  if (args.standardId) return String(args.standardId);

  const stdCode = args.standardCode ?? args.standard_code;
  if (!stdCode) return undefined;

  const res = await getBizdataDataStandards({ keyword: String(stdCode), size: 100 });
  const items = parseApiListResponse<API.BizdataDataStandard>(res).items;
  const version = args.standardVersion ?? args.standard_version;
  const match = items.find(
    (item) =>
      item.code === stdCode && (version == null || version === '' || item.version === version),
  );
  if (!match?.id) {
    throw new Error(`找不到数据标准: ${stdCode}${version ? `@${version}` : ''}，请先创建`);
  }
  return match.id;
}

export async function resolveMetadataTarget(args: Record<string, unknown>): Promise<{
  targetType: 'entity' | 'metric' | 'enum';
  targetId: string;
  code: string;
}> {
  const targetType = (args.targetType ?? args.target_type ?? 'entity') as 'entity' | 'metric' | 'enum';

  if (args.targetId || args.target_id) {
    const targetId = String(args.targetId ?? args.target_id).trim();
    const code = String(args.code ?? args.entityCode ?? args.entity_code ?? args.metricCode ?? args.enumCode ?? '');
    if (!isUuid(targetId)) {
      if (targetType === 'entity') {
        return resolveMetadataTarget({ targetType, entityCode: code || targetId });
      }
      throw new Error(
        `targetId 必须是 list 返回的 UUID，不能编造（收到: ${targetId}）。请用 entityCode / code 查询`,
      );
    }
    if (!code) throw new Error('缺少 code（逻辑编码，如 equipment:Device）');
    return { targetType, targetId, code };
  }

  if (targetType === 'entity') {
    const entityCode = String(args.entityCode ?? args.entity_code ?? args.code ?? '').trim();
    if (!entityCode) throw new Error('缺少 targetId 或 entityCode');
    const targetId = await resolveBizDataEntityId({ entityCode });
    return { targetType, targetId, code: entityCode };
  }

  if (targetType === 'metric') {
    const metricCode = String(args.metricCode ?? args.metric_code ?? args.code ?? '').trim();
    if (!metricCode) throw new Error('缺少 targetId 或 metricCode');
    const res = await getBizdataMetrics({ codePrefix: metricCode, size: 100 });
    const items = parseApiListResponse<API.BizdataMetric>(res).items;
    const metric = items.find((item) => item.code === metricCode) || items[0];
    if (!metric?.id) throw new Error(`找不到指标: ${metricCode}`);
    return { targetType, targetId: metric.id, code: metricCode };
  }

  throw new Error('enum 类型请提供 targetId');
}

/** 按 UUID 或逻辑 code（如 equipment:Device）解析元数据表 id */
export async function resolveMetadataTableByIdOrCode(
  idOrCode: string,
): Promise<string> {
  const raw = idOrCode.trim();
  if (isUuid(raw)) return raw;

  const res = await getBizdataMetadataTables({ keyword: raw, size: 100 });
  const items = parseApiListResponse<API.BizdataMetadataTable>(res).items;
  const normalized = raw.replace(/^entity-/, '').replace(/-/g, ':');
  const mdNormalized = raw.replace(/^md-/, '').replace(/-/g, ':');
  const match =
    items.find((item) => item.code === raw) ||
    items.find((item) => item.code === normalized) ||
    items.find((item) => item.code === mdNormalized) ||
    items.find((item) => {
      if (!raw.startsWith('md-')) return false;
      const parts = raw.replace(/^md-/, '').split('-');
      if (parts.length < 2) return false;
      const scope = parts[0];
      const name = parts
        .slice(1)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join('');
      return item.code === `${scope}:${name}`;
    }) ||
    items.find((item) => item.code?.toLowerCase() === raw.toLowerCase());

  if (match?.id) return match.id;

  throw new Error(
    `无效的元数据表标识「${raw}」。请用 bizdata_list_metadata_tables 获取真实 id，或传 entityCode（如 equipment:Device）配合 bizdata_get_metadata_by_target`,
  );
}

export async function resolveMetadataTableId(args: Record<string, unknown>): Promise<string> {
  if (args.metadataTableId || args.metadata_table_id) {
    return resolveMetadataTableByIdOrCode(String(args.metadataTableId ?? args.metadata_table_id));
  }

  const target = await resolveMetadataTarget(args);
  const res = await getBizdataMetadataByTarget({
    targetType: target.targetType,
    targetId: target.targetId,
  });
  const data = getApiData<API.BizdataMetadataByTarget>(res);
  const tableId = data?.table?.id;
  if (!tableId) {
    throw new Error(`元数据表不存在: ${target.code}，请先调用 bizdata_upsert_metadata_table 或 bizdata_sync_metadata_from_schema`);
  }
  return tableId;
}
