import { ReloadOutlined } from '@ant-design/icons';
import { Button, Select, Space, Splitter } from 'antd';
import { message } from '@/utils/antdAppApis';
import { useAISurface, useAIChatPrompts, useChatReference, sendMockUserMessage } from '@eadaf/ai-base';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildMaterializedDatabasePrompts } from '@/ai/pageChatPrompts';
import { useScopeFromUrl } from '@/hooks/useUrlQueryState';
import ScopeDomainTree from '@/components/ScopeDomainTree';
import MaterializedTableList, { materializedRowKey } from '../components/MaterializedTableList';
import { useDatabaseConnections } from '../hooks/useMaterializationData';
import { buildMockDataPrompt } from '../utils/mockDataPrompt';
import { getMaterializationStatus } from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';

const MaterializedDatabasePage: React.FC = () => {
  const [connectionId, setConnectionId] = useState<string>();
  const [items, setItems] = useState<API.MaterializationStatusItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedScope, setSelectedScope] = useScopeFromUrl();
  const connectionIdRef = useRef(connectionId);
  const prevConnectionIdRef = useRef<string | undefined>(undefined);
  connectionIdRef.current = connectionId;

  const { connections, defaultConnection } = useDatabaseConnections();
  const { references } = useChatReference();
  const chatPrompts = useMemo(() => buildMaterializedDatabasePrompts(references), [references]);
  useAIChatPrompts(chatPrompts);

  useEffect(() => {
    if (defaultConnection?.id && !connectionId) {
      setConnectionId(defaultConnection.id);
    }
  }, [defaultConnection, connectionId]);

  const loadStatus = useCallback(async () => {
    if (!connectionId) return;
    setLoading(true);
    try {
      const res = await getMaterializationStatus({ connectionId });
      const data = getApiData<API.MaterializationStatusItem[]>(res);
      if (isApiSuccess(res)) {
        setItems(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      message.error(getApiErrorMessage(error, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    setSelectedRowKeys([]);
    const prev = prevConnectionIdRef.current;
    if (prev !== undefined && prev !== connectionId) {
      setSelectedScope(undefined);
    }
    prevConnectionIdRef.current = connectionId;
  }, [connectionId, setSelectedScope]);

  const materializedItems = useMemo(
    () => items.filter((item) => item.materializedVersion != null && item.staleStatus !== 'not_materialized'),
    [items],
  );

  const filteredItems = useMemo(() => {
    if (!selectedScope) return materializedItems;
    return materializedItems.filter(
      (item) => item.code === selectedScope || item.code?.startsWith(`${selectedScope}:`),
    );
  }, [materializedItems, selectedScope]);

  const staleCount = useMemo(
    () => materializedItems.filter((i) => i.staleStatus === 'stale').length,
    [materializedItems],
  );

  const selectedItems = useMemo(
    () => filteredItems.filter((item) => selectedRowKeys.includes(materializedRowKey(item))),
    [filteredItems, selectedRowKeys],
  );

  useAISurface({
    id: 'bizdata.database.status',
    domain: 'bizdata',
    label: '数据库物化现状',
    read: () => ({
      filterConnectionId: connectionIdRef.current,
      staleCount,
      itemCount: materializedItems.length,
      selectedCount: selectedRowKeys.length,
    }),
    refresh: loadStatus,
    applyMutation: (mutation) => {
      if (mutation.type.startsWith('materialization.connection.')) return;
      if (
        mutation.type.startsWith('materialization.') ||
        mutation.scope?.includes('materialization') ||
        mutation.scope === 'bizdata.database.status'
      ) {
        void loadStatus();
      }
    },
    matchMutation: (mutation) =>
      mutation.domain === 'bizdata'
      && (mutation.type.startsWith('materialization.')
        || mutation.scope === 'bizdata.database.status'
        || mutation.scope === 'bizdata.materialization.execute')
      && !mutation.type.startsWith('materialization.connection.'),
  });

  const handleMockData = () => {
    if (!selectedItems.length) return;
    sendMockUserMessage(buildMockDataPrompt(selectedItems, connectionId));
  };

  return (
    <div style={{ height: 'calc(100vh - 56px)' }}>
      <Splitter style={{ height: '100%' }}>
        <Splitter.Panel defaultSize={300} min={220} max="40%">
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              paddingRight: 8,
              minHeight: 0,
            }}
          >
            <div style={{ flexShrink: 0, padding: '12px 16px 8px' }}>
              <Select
                style={{ width: '100%' }}
                placeholder="选择数据库连接"
                value={connectionId}
                options={connections.map((c) => ({
                  label: `${c.name} (${c.dbType})`,
                  value: c.id,
                }))}
                onChange={setConnectionId}
              />
            </div>
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              <ScopeDomainTree
                items={materializedItems}
                selectedScope={selectedScope}
                onSelect={setSelectedScope}
                loading={loading}
                emptyDescription="暂无域"
              />
            </div>
          </div>
        </Splitter.Panel>
        <Splitter.Panel>
          <div style={{ height: '100%', overflow: 'auto', paddingLeft: 4 }}>
            <MaterializedTableList
              items={filteredItems}
              loading={loading}
              showConnectionInfo
              selectedRowKeys={selectedRowKeys}
              onSelectionChange={(keys) => setSelectedRowKeys(keys)}
              headerExtra={
                <Space wrap>
                  <Button icon={<ReloadOutlined />} onClick={() => void loadStatus()}>
                    刷新
                  </Button>
                  {selectedRowKeys.length > 0 && (
                    <Button type="primary" onClick={handleMockData}>
                      AI MOCK数据
                    </Button>
                  )}
                </Space>
              }
              headerTitle={selectedScope ? `物化表（${selectedScope}）` : '全部物化表'}
            />
          </div>
        </Splitter.Panel>
      </Splitter>
    </div>
  );
};

export default MaterializedDatabasePage;
