import { useCallback, useEffect, useMemo, useState } from 'react';

import { message, modal } from '@/utils/antdAppApis';
import {
  getBusinessDataSchema,
  getDatabaseConnections,
  getMaterializationRuns,
  getMaterializationStatus,
  postMaterializationExecute,
  postMaterializationPreview,
} from '@/services/EADAF/api/businessData';
import {
  getApiData,
  getApiErrorMessage,
  getMaterializationTargetLabel,
  getTargetNotFoundPayload,
  isApiSuccess,
  isTargetNotFoundError,
  parseApiListResponse,
} from '@/utils/apiResponse';
import { buildScopeTree } from '../../utils/buildScopeTree';
import type { ScopeDomainTreeNode } from '@/components/ScopeDomainTree';

export function getEntityCodeLeaf(code?: string): string {
  return (code || '').split(':').slice(-1)[0] || code || '';
}

export function useMaterializationEntities(connectionId?: string) {
  const [entities, setEntities] = useState<API.BusinessDataEntity[]>([]);
  const [statusItems, setStatusItems] = useState<API.MaterializationStatusItem[]>([]);
  const [loading, setLoading] = useState(false);

  const erEntities = useMemo(
    () => entities.filter((e) => e.entityKind === 'er_table'),
    [entities],
  );

  // 构建完整多级域树（不再扁平化）：域节点承载层级，叶子节点携带物化状态供勾选 + 版本渲染。
  // 旧实现用 flattenScopeTree 把树拍平成一层 scope 分组，丢失了中间层级（"第一二层合在一起"）。
  const scopeTree = useMemo<ScopeDomainTreeNode[]>(() => {
    const statusByEntityId = new Map(
      statusItems.filter((item) => item.entityId).map((item) => [item.entityId!, item]),
    );
    const tree = buildScopeTree(erEntities);

    const toDomainTree = (nodes: typeof tree): ScopeDomainTreeNode[] =>
      nodes.map((node) => {
        const hasChildren = Boolean(node.children?.length);
        const entity = node.entity;
        // 叶子（实体）：挂 leafData，供 ScopeDomainTree 的 checkable + renderLeafTitle 使用
        if (!hasChildren && entity) {
          const status = statusByEntityId.get(entity.id!);
          return {
            code: node.code,
            name: node.name,
            leafData: {
              value: entity.id!,
              currentVersion: status?.currentVersion ?? entity.version,
              materializedVersion: status?.materializedVersion,
              staleStatus: status?.staleStatus ?? 'not_materialized',
            },
          };
        }
        // 域节点：保留子树
        return {
          code: node.code,
          name: node.name,
          ...(hasChildren ? { children: toDomainTree(node.children!) } : {}),
        };
      });

    return toDomainTree(tree);
  }, [erEntities, statusItems]);

  const loadEntities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBusinessDataSchema();
      const data = getApiData<API.BusinessDataSchema>(res);
      if (isApiSuccess(res) && data) {
        setEntities(data.entities || []);
      } else {
        message.error(getApiErrorMessage(res, '加载实体失败'));
      }
    } catch (error) {
      message.error(getApiErrorMessage(error, '加载实体失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    if (!connectionId) {
      setStatusItems([]);
      return;
    }
    try {
      const res = await getMaterializationStatus({ connectionId });
      const data = getApiData<API.MaterializationStatusItem[]>(res);
      if (isApiSuccess(res)) {
        setStatusItems(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      message.error(getApiErrorMessage(error, '加载物化状态失败'));
    }
  }, [connectionId]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadEntities(), loadStatus()]);
  }, [loadEntities, loadStatus]);

  useEffect(() => {
    void loadEntities();
  }, [loadEntities]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  return { entities, erEntities, scopeTree, loading, loadEntities, loadStatus, loadAll };
}

export function useDatabaseConnections() {
  const [connections, setConnections] = useState<API.DatabaseConnection[]>([]);
  const [loading, setLoading] = useState(false);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDatabaseConnections();
      const data = getApiData<API.DatabaseConnection[]>(res);
      if (isApiSuccess(res)) {
        setConnections(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      message.error(getApiErrorMessage(error, '加载数据库连接失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const defaultConnection = useMemo(
    () => connections.find((c) => c.isDefault) || connections[0],
    [connections],
  );

  return { connections, defaultConnection, loading, loadConnections };
}

export function useMaterializationRuns(connectionId?: string, page = 1, pageSize = 10) {
  const [runs, setRuns] = useState<API.MaterializationRun[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadRuns = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const res = await getMaterializationRuns({
        page: nextPage,
        size: pageSize,
        connectionId,
      });
      const { items, total: count } = parseApiListResponse<API.MaterializationRun>(res);
      setRuns(items);
      setTotal(count);
    } catch (error) {
      message.error(getApiErrorMessage(error, '加载物化历史失败'));
    } finally {
      setLoading(false);
    }
  }, [connectionId, page, pageSize]);

  useEffect(() => {
    void loadRuns(page);
  }, [connectionId, page, pageSize, loadRuns]);

  return { runs, total, page, pageSize, loading, loadRuns };
}

interface PreviewExecuteOptions {
  selectedIds: string[];
  connectionId?: string;
  targetSchema: string;
  dbType?: string;
  erEntities: API.BusinessDataEntity[];
  onSuccess?: () => void;
}

export function useMaterializationActions() {
  const [executing, setExecuting] = useState(false);
  const [preview, setPreview] = useState<API.MaterializationPreview | null>(null);

  const handlePreview = useCallback(async (options: PreviewExecuteOptions) => {
    setExecuting(true);
    try {
      const res = await postMaterializationPreview({
        entityIds: options.selectedIds.length ? options.selectedIds : undefined,
        targetSchema: options.targetSchema,
        connectionId: options.connectionId,
      });
      const data = getApiData<API.MaterializationPreview>(res);
      if (isApiSuccess(res) && data) {
        setPreview(data);
        message.success('预览已生成');
        options.onSuccess?.();
      } else {
        message.error(getApiErrorMessage(res, '预览失败'));
      }
    } finally {
      setExecuting(false);
    }
  }, []);

  const handleExecute = useCallback(async (options: PreviewExecuteOptions) => {
    const runExecute = async (createTargetIfMissing = false) => {
      const expectedVersions: Record<string, number> = {};
      options.erEntities
        .filter((e) => !options.selectedIds.length || options.selectedIds.includes(e.id!))
        .forEach((e) => {
          if (e.id && e.version != null) expectedVersions[e.id] = e.version;
        });

      const res = await postMaterializationExecute(
        {
          entityIds: options.selectedIds.length ? options.selectedIds : undefined,
          targetSchema: options.targetSchema,
          connectionId: options.connectionId,
          dryRun: false,
          createTargetIfMissing,
          expectedVersions,
        },
        { skipErrorHandler: true },
      );

      if (isApiSuccess(res)) {
        message.success('物化执行成功');
        const result = getApiData<API.MaterializationExecuteResult>(res);
        if (result?.preview) setPreview(result.preview);
        options.onSuccess?.();
        return;
      }
      message.error(getApiErrorMessage(res, '物化失败'));
    };

    setExecuting(true);
    try {
      await runExecute(false);
    } catch (e: unknown) {
      if (isTargetNotFoundError(e)) {
        const payload = getTargetNotFoundPayload(e);
        const dbType = payload?.dbType || options.dbType;
        const targetSchema = payload?.targetSchema || options.targetSchema;
        const label = getMaterializationTargetLabel(dbType);
        modal.confirm({
          title: `${label}「${targetSchema}」不存在`,
          content: `是否创建该${label}并继续物化？`,
          okText: '创建并继续',
          cancelText: '取消',
          onOk: async () => {
            setExecuting(true);
            try {
              await runExecute(true);
            } catch (err: unknown) {
              message.error(getApiErrorMessage(err, '物化失败'));
            } finally {
              setExecuting(false);
            }
          },
        });
        return;
      }
      message.error(getApiErrorMessage(e, '物化失败'));
    } finally {
      setExecuting(false);
    }
  }, []);

  return { executing, preview, setPreview, handlePreview, handleExecute };
}
