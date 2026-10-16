import {
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { ActionType } from '@ant-design/pro-components';
import { Button, Drawer, Splitter } from 'antd';
import { message, modal } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAIChatPrompts, useAISurface, useChatReference } from '@eadaf/ai-base';
import { buildMetricPrompts } from '@/ai/pageChatPrompts';
import { useNavigate } from 'react-router-dom';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import ScopeDomainTree from '@/components/ScopeDomainTree';
import { useScopeFromUrl, useTableUrlState } from '@/hooks/useUrlQueryState';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import {
  deleteBizdataMetric,
  getBizdataMetricRuns,
  getBizdataMetrics,
  postBizdataMetricExecute,
} from '@/services/EADAF/api/businessData';
import { isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { metricRunColumns, metricTableColumns } from './schema';

const METRIC_FILTER_KEYS = ['code', 'status', 'metricType', 'computeMode'] as const;

type MetricListFilters = {
  keyword?: string;
  status?: string;
  metricType?: string;
  computeMode?: string;
};

function formValuesToMetricFilters(formValues: Record<string, unknown>): MetricListFilters {
  return {
    keyword: (formValues.code as string | undefined) || undefined,
    status: (formValues.status as string | undefined) || undefined,
    metricType: (formValues.metricType as string | undefined) || undefined,
    computeMode: (formValues.computeMode as string | undefined) || undefined,
  };
}

function matchMetricFilters(item: API.BizdataMetric, filters: MetricListFilters): boolean {
  if (filters.status && item.status !== filters.status) return false;
  if (filters.metricType && item.metricType !== filters.metricType) return false;
  if (filters.computeMode && item.computeMode !== filters.computeMode) return false;
  const q = filters.keyword?.trim().toLowerCase();
  if (q) {
    const hit =
      item.code?.toLowerCase().includes(q)
      || item.label?.toLowerCase().includes(q);
    if (!hit) return false;
  }
  return true;
}

const MetricsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<API.BizdataMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [runsOpen, setRunsOpen] = useState(false);
  const [runsMetric, setRunsMetric] = useState<API.BizdataMetric | null>(null);
  const [selectedScope, setSelectedScope] = useScopeFromUrl();
  const { formValues } = useTableUrlState({
    defaultPageSize: 20,
    filterKeys: [...METRIC_FILTER_KEYS],
  });
  const listFilters = useMemo(() => formValuesToMetricFilters(formValues), [formValues]);
  const runsActionRef = useRef<ActionType | undefined>(undefined);
  const { references } = useChatReference();
  const chatPrompts = useMemo(() => buildMetricPrompts(references), [references]);
  useAIChatPrompts(chatPrompts);
  const search = useProTableSearchCollapse('business_data.metrics', { labelWidth: 100 });

  useAISurface({
    id: 'bizdata.metrics.list',
    domain: 'bizdata',
    label: '指标列表',
    read: () => ({
      path: '/business_data/metrics',
      count: metrics.length,
      filters: listFilters,
      selectedScope,
    }),
    refresh: () => loadMetrics(),
    matchMutation: (mutation) =>
      mutation.domain === 'bizdata'
      && (mutation.type === 'metric.updated'
        || mutation.type === 'metric.deleted'
        || mutation.type === 'metric.executed'),
    applyMutation: async () => {
      await loadMetrics();
    },
  });

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getBizdataMetrics({ page: 1, size: 500 });
      const { items } = parseApiListResponse<API.BizdataMetric>(response);
      setMetrics(items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const filteredMetrics = useMemo(() => {
    const byScope = !selectedScope
      ? metrics
      : metrics.filter(
          (m) => m.code === selectedScope || m.code?.startsWith(`${selectedScope}:`),
        );
    return byScope.filter((m) => matchMetricFilters(m, listFilters));
  }, [metrics, selectedScope, listFilters]);

  const handleExecute = async (record: API.BizdataMetric) => {
    if (!record.id) return;
    const response = await postBizdataMetricExecute(record.id);
    if (isApiSuccess(response)) {
      message.success('执行成功');
      await loadMetrics();
    } else {
      message.error(response.message || '执行失败');
    }
  };

  const handleDelete = (record: API.BizdataMetric) => {
    modal.confirm({
      title: '确认删除',
      content: `确定删除指标「${record.label}」吗？`,
      onOk: async () => {
        if (!record.id) return;
        const response = await deleteBizdataMetric(record.id);
        if (isApiSuccess(response)) {
          message.success('已删除');
          await loadMetrics();
        } else {
          message.error(response.message || '删除失败');
        }
      },
    });
  };

  const tableColumns = [
    ...metricTableColumns,
    {
      ...TABLE_ACTION_COLUMN_BASE,
      width: 100,
      render: (_: unknown, record: API.BizdataMetric) => (
        <TableActions>
          <TableActionButton
            title="执行"
            icon={<PlayCircleOutlined />}
            onClick={() => handleExecute(record)}
          />
          <TableActionButton
            title="运行记录"
            icon={<UnorderedListOutlined />}
            onClick={() => {
              setRunsMetric(record);
              setRunsOpen(true);
              runsActionRef.current?.reload();
            }}
          />
          <TableActionButton
            title="编辑"
            icon={<EditOutlined />}
            onClick={() => navigate(`/business_data/metrics/${record.id}/edit`)}
          />
          <TableActionButton
            title="删除"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          />
        </TableActions>
      ),
    },
  ];

  return (
    <>
      <div style={{ height: 'calc(100vh - 56px)' }}>
        <Splitter style={{ height: '100%' }}>
          <Splitter.Panel defaultSize={220} min={180} max="40%">
            <div style={{ height: '100%', overflow: 'auto', paddingRight: 8 }}>
              <ScopeDomainTree
                items={metrics}
                selectedScope={selectedScope}
                onSelect={setSelectedScope}
                loading={loading}
                emptyDescription="暂无域"
              />
            </div>
          </Splitter.Panel>
          <Splitter.Panel>
            <div style={{ height: '100%', overflow: 'auto', paddingLeft: 4 }}>
              <UrlSyncedProTable<API.BizdataMetric>
                headerTitle={selectedScope ? `指标（${selectedScope}）` : '全部指标'}
                rowKey="id"
                loading={loading}
                dataSource={filteredMetrics}
                columns={tableColumns}
                search={search}
                scroll={{ x: 'max-content' }}
                defaultPageSize={20}
                urlFilterKeys={[...METRIC_FILTER_KEYS]}
                pagination={{
                  showQuickJumper: true,
                  pageSizeOptions: [10, 20, 50, 100],
                }}
                options={DEFAULT_PRO_TABLE_OPTIONS}
                toolBarRender={() => [
                  <Button
                    key="create"
                    type="primary"
                    className="btn-gradient-primary"
                    icon={<PlusOutlined />}
                    onClick={() => navigate('/business_data/metrics/create')}
                  >
                    新建指标
                  </Button>,
                  <Button key="dashboard" className="btn-function" onClick={() => navigate('/business_data/metrics/dashboard')}>
                    指标看板
                  </Button>,
                ]}
              />
            </div>
          </Splitter.Panel>
        </Splitter>
      </div>

      <Drawer
        title={`运行记录 - ${runsMetric?.label || ''}`}
        width={720}
        open={runsOpen}
        onClose={() => setRunsOpen(false)}
        destroyOnClose
      >
        <UrlSyncedProTable<API.BizdataMetricRun>
          syncUrl={false}
          actionRef={runsActionRef}
          rowKey="id"
          search={false}
          options={false}
          columns={metricRunColumns}
          request={async (params) => {
            if (!runsMetric?.id) return { data: [], total: 0, success: true };
            const response = await getBizdataMetricRuns(runsMetric.id, {
              page: params.current,
              size: params.pageSize,
            });
            const { items, total, success } = parseApiListResponse<API.BizdataMetricRun>(response);
            return { data: items, total, success };
          }}
          pagination={{ pageSize: 10 }}
        />
      </Drawer>
    </>
  );
};

export default MetricsListPage;
