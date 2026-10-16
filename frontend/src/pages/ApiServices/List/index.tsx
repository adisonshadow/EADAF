import {
  CheckSquareFilled,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SignatureFilled,
  WarningOutlined,
} from '@ant-design/icons';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { useScopeFromUrl, useTableUrlState } from '@/hooks/useUrlQueryState';
import type { ProColumns } from '@ant-design/pro-components';

import { Button, Popconfirm, Splitter, Tag, Tooltip, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAIChatPrompts, useChatReference, useAISurface } from '@eadaf/ai-base';
import { buildApiServiceListPrompts } from '@/ai/pageChatPrompts';
import { useNavigate } from 'react-router-dom';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import { augmentColumnsWithChatReference } from '@/utils/augmentColumnsWithChatReference';
import { buildApiServiceReference } from '@/ai/chatReferenceBuilders';
import { apiServiceStatusEnum } from '@/enums';
import { renderStatusBadge } from '@/utils/statusBadge';
import {
  deleteApiService,
  getApiServiceTree,
  getApiServices,
  postApiServicePublish,
} from '@/services/EADAF/api/apiServices';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
} from '@/utils/apiResponse';
import ApiServiceDomainTree from '../components/ApiServiceDomainTree';
import {
  buildApiServiceDomainTree,
  filterServicesByDomainPrefix,
  type ApiServiceListItem,
} from '../utils/buildApiServiceDomainTree';
import {
  getTransportProtocolLabel,
  normalizeTransportProtocols,
} from '../utils/apiServiceTransport';

const { Text } = Typography;

const VIEWPORT_HEIGHT = 'calc(100vh - 56px)';

const LIST_FILTER_KEYS = ['status', 'tag', 'code'] as const;

type ListFilters = {
  status?: string;
  tag?: string;
  keyword?: string;
};

function formValuesToListFilters(formValues: Record<string, unknown>): ListFilters {
  return {
    status: (formValues.status as string | undefined) || undefined,
    tag: (formValues.tag as string | undefined) || undefined,
    keyword: (formValues.code as string | undefined) || undefined,
  };
}

function matchKeyword(item: ApiServiceListItem, keyword?: string) {
  const q = keyword?.trim().toLowerCase();
  if (!q) return true;
  return (
    item.code?.toLowerCase().includes(q)
    || item.name?.toLowerCase().includes(q)
    || item.routePath?.toLowerCase().includes(q)
  );
}

const columns = (
  onPublish: (id: string) => void,
  onDelete: (id: string) => void,
  onTest: (record: ApiServiceListItem) => void,
  onEdit: (record: ApiServiceListItem) => void,
): ProColumns<ApiServiceListItem>[] => [
  {
    title: 'code',
    dataIndex: 'code',
    copyable: true,
    ellipsis: true,
    width: 240,
    hideInSearch: false,
    fieldProps: { placeholder: 'code / 名称 / route' },
    formItemProps: { label: '关键字' },
  },
  { title: '名称', dataIndex: 'name', width: 140, hideInSearch: true },
  {
    title: '版本',
    dataIndex: 'version',
    width: 72,
    hideInSearch: true,
    render: (_, record) => (record.version != null ? `v${record.version}` : '-'),
  },
  {
    title: 'API URL',
    dataIndex: 'apiUrl',
    width: 120,
    ellipsis: true,
    copyable: true,
    hideInSearch: true,
  },
  {
    title: '绑定实体',
    dataIndex: 'entityCode',
    ellipsis: true,
    width: 180,
    hideInSearch: true,
    render: (_, record) => record.entityCode || <Text type="secondary">跨实体/脚本</Text>,
  },
  { title: 'route_path', dataIndex: 'routePath', ellipsis: true, width: 200, hideInSearch: true },
  {
    title: '协议',
    dataIndex: 'transportProtocols',
    width: 120,
    hideInSearch: true,
    render: (_, record) =>
      normalizeTransportProtocols(record.transportProtocols).map((p) => (
        <Tag key={p}>{getTransportProtocolLabel(p)}</Tag>
      )),
  },
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
    title: '标签',
    dataIndex: 'tag',
    hideInTable: true,
    fieldProps: { placeholder: '标签精确匹配' },
  },
  {
    title: '标签',
    dataIndex: 'tags',
    hideInSearch: true,
    render: (_, record) => record.tags?.map((t) => <Tag key={t}>{t}</Tag>),
  },
  {
    ...TABLE_ACTION_COLUMN_BASE,
    width: 120,
    render: (_, record) => (
      <TableActions>
        <TableActionButton
          title="测试请求"
          icon={<PlayCircleOutlined />}
          onClick={() => onTest(record)}
        />
        <TableActionButton
          title="编辑"
          icon={<EditOutlined />}
          onClick={() => onEdit(record)}
        />
        {(record.status === 'draft' || record.status === 'disabled') && (
          <Popconfirm title="确定发布该 API 服务？" onConfirm={() => onPublish(record.id)}>
            <Tooltip title="未发布">
              <Button
                type="link"
                size="small"
                icon={<SignatureFilled style={{ color: '#fa8c16' }} />}
                onClick={(e) => e.stopPropagation()}
              />
            </Tooltip>
          </Popconfirm>
        )}
        {record.status === 'published' && (
          <TableActionButton
            title="已发布"
            icon={<CheckSquareFilled style={{ color: '#52c41a' }} />}
            disabled
          />
        )}
        <Popconfirm title="确定删除该 API 服务？" onConfirm={() => onDelete(record.id)}>
          <Tooltip title="删除">
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => e.stopPropagation()}
            />
          </Tooltip>
        </Popconfirm>
      </TableActions>
    ),
  },
];

function mapApiService(item: API.ApiService): ApiServiceListItem {
  const apiUrl = item.basePath || (item.routePath ? `/api/v1/data/${item.routePath}` : undefined);
  return {
    id: item.id!,
    code: item.code!,
    name: item.name,
    status: item.status,
    version: item.version,
    transportProtocols: item.transportProtocols,
    entityCode: item.entityCode,
    routePath: item.routePath,
    apiUrl,
    tags: item.tags,
  };
}

const ApiServiceListPage: React.FC = () => {
  const navigate = useNavigate();
  const [domainPrefix, setDomainPrefix] = useScopeFromUrl();
  const { formValues } = useTableUrlState({
    defaultPageSize: 10,
    filterKeys: [...LIST_FILTER_KEYS],
  });
  const listFilters = useMemo(() => formValuesToListFilters(formValues), [formValues]);
  const [allServices, setAllServices] = useState<ApiServiceListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [domainTree, setDomainTree] = useState<ReturnType<typeof buildApiServiceDomainTree>>([]);
  const { references } = useChatReference();
  const chatPrompts = useMemo(() => buildApiServiceListPrompts(references), [references]);
  useAIChatPrompts(chatPrompts);

  const loadData = useCallback(async (filters: ListFilters) => {
    setLoading(true);
    try {
      const [listRes, treeRes] = await Promise.all([
        getApiServices({
          size: -1,
          status: filters.status,
          tag: filters.tag,
        }),
        getApiServiceTree(),
      ]);
      const listData = getApiData<API.ApiServiceListResult>(listRes);
      const items = listData?.items?.map(mapApiService) || [];
      setAllServices(items);

      const treeData = getApiData<API.ApiServiceDomainTreeItem[]>(treeRes);
      if (isApiSuccess(treeRes) && Array.isArray(treeData) && treeData.length) {
        setDomainTree(treeData as ReturnType<typeof buildApiServiceDomainTree>);
      } else {
        setDomainTree(buildApiServiceDomainTree(items));
      }
    } catch (error) {
      message.error(getApiErrorMessage(error, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(listFilters);
  }, [loadData, listFilters]);

  useAISurface({
    id: 'api-services.list',
    domain: 'bizdata',
    label: 'API 服务列表',
    read: () => ({
      domainPrefix,
      serviceCount: allServices.length,
      filters: listFilters,
    }),
    refresh: () => loadData(listFilters),
    applyMutation: (mutation: any) => {
      if (mutation.type.startsWith('apiservice.')) {
        void loadData(listFilters);
      }
    },
    matchMutation: (mutation: any) =>
      mutation.domain === 'bizdata' && mutation.type.startsWith('apiservice.'),
  });

  const filteredServices = useMemo(() => {
    const byDomain = filterServicesByDomainPrefix(allServices, domainPrefix);
    return byDomain.filter((item) => matchKeyword(item, listFilters.keyword));
  }, [allServices, domainPrefix, listFilters.keyword]);

  const handlePublish = async (id: string) => {
    const res = await postApiServicePublish(id);
    if (isApiSuccess(res)) {
      message.success('发布成功');
      void loadData(listFilters);
    } else {
      message.error(getApiErrorMessage(res, '发布失败'));
    }
  };

  const handleDelete = async (id: string) => {
    const res = await deleteApiService(id);
    if (isApiSuccess(res)) {
      message.success('已删除');
      void loadData(listFilters);
    } else {
      message.error(getApiErrorMessage(res, '删除失败'));
    }
  };

  const treeData = domainTree.length ? domainTree : buildApiServiceDomainTree(allServices);
  const search = useProTableSearchCollapse('api-services.list', { defaultCollapsed: false });

  return (
    <>
      <div style={{ height: VIEWPORT_HEIGHT }}>
        <Splitter style={{ height: '100%' }}>
          <Splitter.Panel
            defaultSize={260}
            min={200}
            max="40%"
            collapsible
          >
            <div style={{ height: '100%', overflow: 'auto', paddingRight: 8 }}>
              <ApiServiceDomainTree
                treeData={treeData}
                selectedDomain={domainPrefix}
                onSelectDomain={setDomainPrefix}
                loading={loading}
              />
            </div>
          </Splitter.Panel>
          <Splitter.Panel>
            <div style={{ height: '100%', overflow: 'auto', paddingLeft: 4 }}>
              <UrlSyncedProTable<ApiServiceListItem>
                engine="nuqs"
                {...DEFAULT_PRO_TABLE_OPTIONS}
                rowKey="id"
                headerTitle={
                  domainPrefix ? (
                    <span>
                      当前域：<Tag>{domainPrefix}</Tag>
                    </span>
                  ) : (
                    '显示全部 API 服务'
                  )
                }
                search={search}
                scroll={{ x: 'max-content' }}
                loading={loading}
                columns={augmentColumnsWithChatReference(
                  columns(
                    handlePublish,
                    handleDelete,
                    (record) => navigate(`/api_services/${record.id}/test`),
                    (record) => navigate(`/api_services/${record.id}/edit`),
                  ),
                  'name',
                  buildApiServiceReference,
                )}
                dataSource={filteredServices}
                defaultPageSize={10}
                urlFilterKeys={[...LIST_FILTER_KEYS]}
                locale={{ emptyText: '暂无 API 服务，请先新建' }}
                toolBarRender={() => [
                  <Button
                    key="create"
                    type="primary" className="btn-gradient-primary"
                    icon={<PlusOutlined />}
                    onClick={() => navigate('/api_services/create')}
                  >
                    新建
                  </Button>,
                  <Button
                    key="exception-responses"
                    className="btn-function"
                    icon={<WarningOutlined />}
                    onClick={() => navigate('/api_services/exception-responses')}
                  >
                    异常响应
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

export default ApiServiceListPage;
