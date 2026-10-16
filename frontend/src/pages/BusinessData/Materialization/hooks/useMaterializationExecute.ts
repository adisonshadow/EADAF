import { useCallback, useMemo, useState } from 'react';

import { message, modal } from '@/utils/antdAppApis';
import { buildScopeTree, flattenScopeTree } from '../../utils/buildScopeTree';
import { getEntityCodeLeaf } from './useMaterializationData';
import {
  getBusinessDataSchema,
  getDatabaseConnections,
  getMaterializationRuns,
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

export function useMaterializationExecute() {
  const [executing, setExecuting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entities, setEntities] = useState<API.BusinessDataEntity[]>([]);
  const [connections, setConnections] = useState<API.DatabaseConnection[]>([]);
  const [runs, setRuns] = useState<API.MaterializationRun[]>([]);
  const [runTotal, setRunTotal] = useState(0);
  const [runPage, setRunPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [connectionId, setConnectionId] = useState<string>();
  const [targetSchema, setTargetSchema] = useState('bizdata_mat');
  const [preview, setPreview] = useState<API.MaterializationPreview | null>(null);

  const erEntities = useMemo(
    () => entities.filter((e) => e.entityKind === 'er_table'),
    [entities],
  );

  const groupedOptions = useMemo(() => {
    const tree = buildScopeTree(erEntities);
    const flat = flattenScopeTree(tree).filter((node) => !node.isScopeNode && node.entity);
    const groups = new Map<string, { label: string; value: string }[]>();

    flat.forEach((node) => {
      const entity = node.entity!;
      const scopePath = (entity.code || '').split(':').slice(0, -1).join(':') || 'root';
      const list = groups.get(scopePath) || [];
      list.push({
        label: `${entity.label} (${getEntityCodeLeaf(entity.code)}) v${entity.version}`,
        value: entity.id!,
      });
      groups.set(scopePath, list);
    });

    return Array.from(groups.entries()).map(([scope, options]) => ({ scope, options }));
  }, [erEntities]);

  const selectedConnection = useMemo(
    () => connections.find((c) => c.id === connectionId),
    [connections, connectionId],
  );

  const loadConnections = useCallback(async () => {
    const res = await getDatabaseConnections();
    const data = getApiData<API.DatabaseConnection[]>(res);
    if (isApiSuccess(res) && Array.isArray(data)) {
      setConnections(data);
      setConnectionId((prev) => {
        if (prev && data.some((c) => c.id === prev)) return prev;
        return data.find((c) => c.isDefault)?.id || data[0]?.id;
      });
      const defaultConn = data.find((c) => c.isDefault) || data[0];
      if (defaultConn?.targetSchema) {
        setTargetSchema((prev) => (prev === 'bizdata_mat' ? defaultConn.targetSchema! : prev));
      }
    }
  }, []);

  const loadRuns = useCallback(async (page = runPage, connId = connectionId) => {
    const res = await getMaterializationRuns({
      page,
      size: 10,
      connectionId: connId,
    });
    const { items, total } = parseApiListResponse<API.MaterializationRun>(res);
    setRuns(items);
    setRunTotal(total);
    setRunPage(page);
  }, [connectionId, runPage]);

  const loadPageData = useCallback(async () => {
    setLoading(true);
    try {
      const schemaRes = await getBusinessDataSchema();
      const schemaData = getApiData<API.BusinessDataSchema>(schemaRes);
      if (isApiSuccess(schemaRes) && schemaData) {
        setEntities(schemaData.entities || []);
      } else {
        message.error(getApiErrorMessage(schemaRes, '加载实体失败'));
      }
      await loadConnections();
      await loadRuns(1);
    } catch (error) {
      message.error(getApiErrorMessage(error, '加载物化数据失败'));
    } finally {
      setLoading(false);
    }
  }, [loadConnections, loadRuns]);

  const handlePreview = async () => {
    if (!connectionId) {
      message.warning('请先选择数据库连接');
      return;
    }
    setExecuting(true);
    try {
      const res = await postMaterializationPreview({
        entityIds: selectedIds.length ? selectedIds : undefined,
        targetSchema,
        connectionId,
      });
      const data = getApiData<API.MaterializationPreview>(res);
      if (isApiSuccess(res) && data) {
        setPreview(data);
        message.success('预览已生成');
      } else {
        message.error(getApiErrorMessage(res, '预览失败'));
      }
    } finally {
      setExecuting(false);
    }
  };

  const handleExecute = async () => {
    if (!connectionId) {
      message.warning('请先选择数据库连接');
      return;
    }

    const runExecute = async (createTargetIfMissing = false) => {
      const expectedVersions: Record<string, number> = {};
      erEntities
        .filter((e) => !selectedIds.length || selectedIds.includes(e.id!))
        .forEach((e) => {
          if (e.id && e.version != null) expectedVersions[e.id] = e.version;
        });

      const res = await postMaterializationExecute(
        {
          entityIds: selectedIds.length ? selectedIds : undefined,
          targetSchema,
          connectionId,
          dryRun: false,
          createTargetIfMissing,
          expectedVersions,
        },
        { skipErrorHandler: true },
      );

      if (isApiSuccess(res)) {
        message.success('物化执行成功');
        await loadRuns(1);
        const result = getApiData<API.MaterializationExecuteResult>(res);
        if (result?.preview) setPreview(result.preview);
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
        const dbType = payload?.dbType || selectedConnection?.dbType;
        const schema = payload?.targetSchema || targetSchema;
        const label = getMaterializationTargetLabel(dbType);
        modal.confirm({
          title: `${label}「${schema}」不存在`,
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
  };

  return {
    executing,
    loading,
    entities,
    erEntities,
    connections,
    runs,
    runTotal,
    runPage,
    selectedIds,
    setSelectedIds,
    connectionId,
    setConnectionId,
    targetSchema,
    setTargetSchema,
    preview,
    groupedOptions,
    selectedConnection,
    loadPageData,
    loadConnections,
    loadRuns,
    handlePreview,
    handleExecute,
  };
}
