import {
  CheckSquareFilled,
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { ActionType } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { useAISurface } from '@eadaf/ai-base';
import { Button, Popconfirm, Splitter, Tag } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useScopeFromUrl } from '@/hooks/useUrlQueryState';
import { apiServiceStatusEnum } from '@/enums';
import { renderStatusBadge } from '@/utils/statusBadge';
import ApiServiceDomainTree from '@/pages/ApiServices/components/ApiServiceDomainTree';
import {
  buildApiServiceDomainTree,
  type ApiServiceDomainTreeItem,
} from '@/utils/buildApiServiceDomainTree';
import {
  deleteCollectionPipeline,
  getCollectionPipelines,
  postCollectionPipelinePublish,
} from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';

const PROTOCOL_LABEL: Record<string, string> = {
  serial: '串口',
  modbus_rtu: 'Modbus RTU',
  modbus_tcp: 'Modbus TCP',
};

const VIEWPORT_HEIGHT = 'calc(100vh - 56px)';

const CollectionPipelineListPage: React.FC = () => {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [domainPrefix, setDomainPrefix] = useScopeFromUrl();
  const [allPipelines, setAllPipelines] = useState<API.CollectionPipeline[]>([]);
  const [loading, setLoading] = useState(false);

  useAISurface({
    id: 'bizdata.collection-pipelines.list',
    domain: 'bizdata',
    label: '采集管道列表',
    read: () => ({
      path: '/api_services/collection-pipelines',
      count: allPipelines.length,
      domainPrefix: domainPrefix || null,
    }),
    refresh: () => loadAllPipelines(),
    matchMutation: (mutation) =>
      mutation.domain === 'bizdata'
      && (mutation.type === 'collection_pipeline.updated'
        || mutation.type === 'collection_pipeline.deleted'
        || mutation.type === 'collection_pipeline.test_completed'),
    applyMutation: async () => {
      await loadAllPipelines();
      actionRef.current?.reload();
    },
  });

  // 一次性拉取全部管道，供左侧域树 + 右侧过滤
  const loadAllPipelines = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCollectionPipelines({ page: 1, size: -1 });
      const data = getApiData<API.CollectionPipelineList>(res);
      setAllPipelines(data?.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAllPipelines();
  }, [loadAllPipelines]);

  // 构建左侧域树（复用 ApiServiceDomainTree，code 冒号分层）
  const domainTree = useMemo<ApiServiceDomainTreeItem[]>(() => {
    const items = allPipelines.map((p) => ({
      id: p.id || '',
      code: p.code || '',
      name: p.name,
    }));
    return buildApiServiceDomainTree(items);
  }, [allPipelines]);

  // 右侧表格按选中域过滤
  const filteredPipelines = useMemo(() => {
    if (!domainPrefix) return allPipelines;
    return allPipelines.filter(
      (p) => p.code === domainPrefix || p.code?.startsWith(`${domainPrefix}:`),
    );
  }, [allPipelines, domainPrefix]);

  const handlePublish = async (id: string) => {
    const res = await postCollectionPipelinePublish(id);
    if (isApiSuccess(res)) {
      message.success('已发布');
      await loadAllPipelines();
    } else {
      message.error(getApiErrorMessage(res, '发布失败'));
    }
  };

  const handleDelete = async (id: string) => {
    const res = await deleteCollectionPipeline(id);
    if (isApiSuccess(res)) {
      message.success('已删除');
      await loadAllPipelines();
    } else {
      message.error(getApiErrorMessage(res, '删除失败'));
    }
  };

  const columns: ProColumns<API.CollectionPipeline>[] = [
    { title: 'code', dataIndex: 'code', copyable: true, ellipsis: true, width: 220 },
    { title: '名称', dataIndex: 'name', width: 140 },
    {
      title: '协议',
      dataIndex: 'protocolType',
      width: 120,
      render: (_, r) => PROTOCOL_LABEL[r.protocolType || ''] || r.protocolType,
    },
    {
      title: '采集 API',
      dataIndex: 'basePath',
      ellipsis: true,
      copyable: true,
      width: 220,
      render: (_, r) => r.basePath || `/api/v1/ingest/${r.routePath}`,
    },
    { title: '实体', dataIndex: 'entityCode', ellipsis: true, width: 180 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      valueType: 'select',
      valueEnum: apiServiceStatusEnum,
      render: (_, record) =>
        renderStatusBadge(
          record.status === 'disabled' ? 'draft' : (record.status || 'draft'),
          apiServiceStatusEnum,
        ),
    },
    {
      ...TABLE_ACTION_COLUMN_BASE,
      dataIndex: 'option',
      width: 120,
      render: (_, record) => (
        <TableActions>
          <TableActionButton
            title="编辑"
            icon={<EditOutlined />}
            onClick={() => navigate(`/api_services/collection-pipelines/${record.id}/edit`)}
          />
          <TableActionButton
            title="测试"
            icon={<PlayCircleOutlined />}
            onClick={() => navigate(`/api_services/collection-pipelines/${record.id}/test`)}
          />
          {record.status === 'draft' || record.status === 'disabled' ? (
            <TableActionButton
              title="发布"
              icon={<CloudUploadOutlined />}
              onClick={() => void handlePublish(record.id!)}
            />
          ) : null}
          {record.status === 'published' ? (
            <TableActionButton
              title="已发布"
              icon={<CheckSquareFilled style={{ color: '#52c41a' }} />}
              disabled
            />
          ) : null}
          <Popconfirm title="确定删除该采集管道？" onConfirm={() => void handleDelete(record.id!)}>
            <TableActionButton title="删除" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </TableActions>
      ),
    },
  ];

  return (
    <>
      <div style={{ height: VIEWPORT_HEIGHT }}>
        <Splitter style={{ height: '100%' }}>
          <Splitter.Panel defaultSize={260} min={200} max="40%" collapsible>
            <div style={{ height: '100%', overflow: 'auto', paddingRight: 8 }}>
              <ApiServiceDomainTree
                treeData={domainTree}
                selectedDomain={domainPrefix}
                onSelectDomain={setDomainPrefix}
                loading={loading}
              />
            </div>
          </Splitter.Panel>
          <Splitter.Panel>
            <div style={{ height: '100%', overflow: 'auto', paddingLeft: 4 }}>
              <UrlSyncedProTable<API.CollectionPipeline>
                headerTitle={
                  domainPrefix ? (
                    <span>当前域：<Tag>{domainPrefix}</Tag></span>
                  ) : (
                    '全部采集管道'
                  )
                }
                actionRef={actionRef}
                rowKey="id"
                scroll={{ x: 'max-content' }}
                columns={columns}
                dataSource={filteredPipelines}
                loading={loading}
                search={false}
                defaultPageSize={10}
                urlFilterKeys={[]}
                options={DEFAULT_PRO_TABLE_OPTIONS}
                toolBarRender={() => [
                  <Button
                    key="create"
                    type="primary"
                    className="btn-gradient-primary"
                    icon={<PlusOutlined />}
                    onClick={() => navigate('/api_services/collection-pipelines/create')}
                  >
                    新建管道
                  </Button>,
                ]}
              />
            </div>
          </Splitter.Panel>
        </Splitter>
      </div>
    </>
  );
};

export default CollectionPipelineListPage;
