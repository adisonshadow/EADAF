import { getDatabaseConnections, getMaterializationStatus } from '@/services/EADAF/api/businessData';
import { getApiData } from '@/utils/apiResponse';
import {
  deriveScopePrefixes,
  matchTargetSchema,
  pickBestConnection,
  schemaMatchToReason,
  scoreConnections,
  type ConnectionResolveHints,
} from './apiServiceConnectionResolveLogic';

export type ResolveApiServiceConnectionOptions = ConnectionResolveHints;

export interface ResolvedApiServiceConnection {
  connectionId: string;
  connectionName?: string;
  dbType?: string;
  targetSchema?: string;
  reason: string;
  matchedEntityCount?: number;
  alternatives?: Array<{ connectionId: string; connectionName?: string; matchedEntityCount: number }>;
}

export async function resolveApiServiceConnection(
  options: ResolveApiServiceConnectionOptions = {},
): Promise<ResolvedApiServiceConnection> {
  const explicitId = options.connectionId?.trim();
  const [connRes, statusRes] = await Promise.all([
    getDatabaseConnections(),
    getMaterializationStatus(),
  ]);

  const connections = getApiData<API.DatabaseConnection[]>(connRes) || [];
  if (!Array.isArray(connections) || !connections.length) {
    throw new Error('系统未配置任何数据库连接，请先在业务数据模块添加连接');
  }

  const scopePrefixes = deriveScopePrefixes(options);
  const statusItems = getApiData<API.MaterializationStatusItem[]>(statusRes) || [];

  if (explicitId) {
    const conn = connections.find((c) => c.id === explicitId);
    if (!conn) throw new Error(`数据库连接 ${explicitId} 不存在`);
    const schema = matchTargetSchema(conn, statusItems, options);
    return {
      connectionId: conn.id!,
      connectionName: conn.name,
      dbType: conn.dbType,
      targetSchema: schema.targetSchema,
      reason: schemaMatchToReason(schema.match, options, 'explicit_connection_id'),
    };
  }

  if (connections.length === 1) {
    const conn = connections[0];
    const schema = matchTargetSchema(conn, statusItems, options);
    const scores = scoreConnections(statusItems, options, scopePrefixes);
    return {
      connectionId: conn.id!,
      connectionName: conn.name,
      dbType: conn.dbType,
      targetSchema: schema.targetSchema,
      reason: schemaMatchToReason(schema.match, options, 'single_available_connection'),
      matchedEntityCount: scores.get(conn.id!) || (schema.match === 'none' ? 0 : 1),
    };
  }

  const scores = scoreConnections(statusItems, options, scopePrefixes);
  const best = pickBestConnection(connections, scores);

  if (!best?.id) {
    throw new Error('无法根据主实体/Scope 物化记录推断数据库连接');
  }

  const schema = matchTargetSchema(best, statusItems, options);
  const matchedEntityCount = scores.get(best.id) || 0;
  const alternatives = [...scores.entries()]
    .filter(([id]) => id !== best.id)
    .map(([connectionId, count]) => {
      const conn = connections.find((c) => c.id === connectionId);
      return { connectionId, connectionName: conn?.name, matchedEntityCount: count };
    })
    .sort((a, b) => b.matchedEntityCount - a.matchedEntityCount);

  let fallback = 'default_or_fallback_connection';
  if (matchedEntityCount > 0) {
    fallback = 'materialized_entities_matched';
  } else if (best.isDefault) {
    fallback = 'default_connection';
  } else if (best.dbType === 'postgresql') {
    fallback = 'postgresql_fallback';
  }

  return {
    connectionId: best.id,
    connectionName: best.name,
    dbType: best.dbType,
    targetSchema: schema.targetSchema,
    reason: schemaMatchToReason(schema.match, options, fallback),
    matchedEntityCount,
    alternatives: alternatives.length ? alternatives : undefined,
  };
}
