import { PageContainer } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { Alert, Button, Spin, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import { useAISurface, sendMockUserMessage } from '@eadaf/ai-base';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import {
  getMaterializedTableRows,
  getMaterializedTableSchema,
} from '@/services/EADAF/api/businessData';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';
import { buildMockDataPrompt } from '../utils/mockDataPrompt';

function formatDbType(dbType?: string) {
  if (dbType === 'mongodb') return 'MongoDB';
  if (dbType === 'redis') return 'Redis';
  if (dbType === 'postgresql') return 'PostgreSQL';
  if (dbType === 'mysql') return 'MySQL';
  return dbType || '-';
}

function formatCellValue(value: unknown): string {
  if (value == null) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const DATA_COLUMN_WIDTH = 140;

const TableDataPage: React.FC = () => {
  const navigate = useNavigate();
  const { entityId } = useParams<{ entityId: string }>();
  const [searchParams] = useSearchParams();
  const connectionId = searchParams.get('connectionId') || undefined;
  const [meta, setMeta] = useState<API.MaterializedTableRowsResult | null>(null);
  const [columnNames, setColumnNames] = useState<string[]>([]);
  const [initLoading, setInitLoading] = useState(true);
  const actionRef = useRef<ActionType | undefined>(undefined);

  useAISurface({
    id: 'bizdata.materialization.browse',
    domain: 'bizdata',
    label: '物化表数据浏览',
    read: () => ({
      entityId,
      connectionId,
      tableName: meta?.tableName,
      total: meta?.total ?? 0,
    }),
    refresh: () => {
      actionRef.current?.reload();
    },
    applyMutation: (mutation) => {
      if (mutation.type === 'materialization.mock_data.inserted') {
        actionRef.current?.reload();
      }
    },
    matchMutation: (mutation) =>
      mutation.domain === 'bizdata' && mutation.type === 'materialization.mock_data.inserted',
  });

  useEffect(() => {
    if (!entityId || !connectionId) {
      setInitLoading(false);
      return;
    }
    (async () => {
      try {
        const schemaRes = await getMaterializedTableSchema(entityId, { connectionId });
        if (isApiSuccess(schemaRes)) {
          const schema = getApiData(schemaRes);
          const names = (schema?.columns || []).map((c) => c.name!).filter(Boolean);
          if (names.length) setColumnNames(names);
        }
      } catch {
        // schema optional for column inference
      } finally {
        setInitLoading(false);
      }
    })();
  }, [entityId, connectionId]);

  const columns: ProColumns<Record<string, unknown>>[] = useMemo(() => {
    const keys = columnNames.length ? columnNames : ['id'];
    return keys.map((key) => ({
      title: key,
      dataIndex: key,
      width: DATA_COLUMN_WIDTH,
      ellipsis: true,
      render: (_, record) => formatCellValue(record[key]),
    }));
  }, [columnNames]);

  const tableScrollX = useMemo(
    () => Math.max(columns.length * DATA_COLUMN_WIDTH, 800),
    [columns.length],
  );

  const loadRows = useCallback(
    async (params: { current?: number; pageSize?: number }) => {
      if (!entityId || !connectionId) {
        return { data: [], success: false, total: 0 };
      }
      try {
        const res = await getMaterializedTableRows(entityId, {
          connectionId,
          page: params.current || 1,
          size: params.pageSize || 20,
        });
        if (!isApiSuccess(res)) {
          message.error(getApiErrorMessage(res, '加载数据失败'));
          return { data: [], success: false, total: 0 };
        }
        const data = getApiData(res);
        if (data) setMeta(data);
        const items = data?.items || [];
        if (!columnNames.length && items.length) {
          const inferred = Object.keys(items[0]);
          setColumnNames(inferred);
        }
        return {
          data: items,
          success: true,
          total: data?.total || 0,
        };
      } catch (error) {
        message.error(getApiErrorMessage(error, '加载数据失败'));
        return { data: [], success: false, total: 0 };
      }
    },
    [entityId, connectionId, columnNames.length],
  );

  if (!connectionId) {
    return (
      <PageContainer>
        <Alert type="error" showIcon title="缺少 connectionId 参数" />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={
        <PageContainerTitleWithBack
          title={meta ? `${meta.entityLabel} · 数据` : '数据浏览'}
        />
      }
      extra={
        meta
          ? [
              <Button
                key="mock"
                size="small"
                type="primary"
                onClick={() =>
                  sendMockUserMessage(
                    buildMockDataPrompt(
                      [
                        {
                          entityId: meta.entityId,
                          code: meta.entityCode,
                          label: meta.entityLabel,
                          tableName: meta.tableName,
                          connectionId: meta.connectionId,
                        },
                      ],
                      connectionId,
                    ),
                  )
                }
              >
                AI MOCK数据
              </Button>,
            ]
          : undefined
      }
    >
      <Spin spinning={initLoading}>
        {meta && (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            {meta.connectionName} · {formatDbType(meta.dbType)} · {meta.targetSchema}.{meta.tableName}
            <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
              （开发预览）
            </Typography.Text>
          </Typography.Paragraph>
        )}
        <UrlSyncedProTable<Record<string, unknown>>
          actionRef={actionRef}
          rowKey={(r, i) => String(r.id || r._key || r._id || i)}
          search={false}
          options={false}
          columns={columns}
          request={loadRows}
          scroll={{ x: tableScrollX }}
          defaultPageSize={20}
        />
      </Spin>
    </PageContainer>
  );
};

export default TableDataPage;
