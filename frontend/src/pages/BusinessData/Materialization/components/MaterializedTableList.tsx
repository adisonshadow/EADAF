import { Badge, Button, Space, Tooltip } from 'antd';
import UrlSyncedProTable from '@/components/UrlSyncedProTable';
import type { ProColumns } from '@ant-design/pro-components';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatTableDateTime } from '@/utils/createdUpdatedAtColumn';
import { materializedTableBrowseUrl } from '../utils/browseUrls';

interface MaterializedTableListProps {
  items: API.MaterializationStatusItem[];
  loading?: boolean;
  showConnectionInfo?: boolean;
  selectedRowKeys?: React.Key[];
  onSelectionChange?: (keys: React.Key[], rows: API.MaterializationStatusItem[]) => void;
  headerTitle?: React.ReactNode;
  headerExtra?: React.ReactNode;
}

function renderStaleBadge(item: API.MaterializationStatusItem) {
  if (item.currentVersion === item.materializedVersion) {
    return <Badge status="success" text="最新" />;
  }
  if ((item.currentVersion || 0) > (item.materializedVersion || 0)) {
    return (
      <Tooltip
        title={`模型已更新至 v${item.currentVersion}，物化仍为 v${item.materializedVersion}，建议重新物化`}
      >
        <Badge status="warning" text="非最新" />
      </Tooltip>
    );
  }
  return <Badge status="processing" text="-" />;
}

function formatDbType(dbType?: string) {
  if (dbType === 'mongodb') return 'MongoDB';
  if (dbType === 'redis') return 'Redis';
  if (dbType === 'postgresql') return 'PostgreSQL';
  if (dbType === 'mysql') return 'MySQL';
  return dbType || '-';
}

export function materializedRowKey(item: API.MaterializationStatusItem): string {
  return `${item.entityId}-${item.connectionId || 'default'}`;
}

const MaterializedTableList: React.FC<MaterializedTableListProps> = ({
  items,
  loading,
  showConnectionInfo,
  selectedRowKeys,
  onSelectionChange,
  headerTitle,
  headerExtra,
}) => {
  const navigate = useNavigate();

  const columns: ProColumns<API.MaterializationStatusItem>[] = [
    {
      title: 'Entity',
      render: (_, r) => (
        <div>
          <div>{r.label}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{r.code}</div>
        </div>
      ),
    },
    { title: '表名/集合', dataIndex: 'tableName' },
    ...(showConnectionInfo
      ? ([
          { title: '连接', dataIndex: 'connectionName', ellipsis: true },
          {
            title: '类型',
            dataIndex: 'dbType',
            width: 80,
            render: (_, r) => formatDbType(r.dbType ?? undefined),
          },
          { title: 'Schema/前缀', dataIndex: 'targetSchema' },
        ] as ProColumns<API.MaterializationStatusItem>[])
      : []),
    {
      title: '模型版本',
      dataIndex: 'currentVersion',
      width: 60,
      render: (_, r) => `v${r.currentVersion}`,
    },
    {
      title: '物化版本',
      dataIndex: 'materializedVersion',
      width: 60,
      render: (_, r) => (r.materializedVersion != null ? `v${r.materializedVersion}` : '-'),
    },
    {
      title: '状态',
      width: 80,
      render: (_, r) => renderStaleBadge(r),
    },
    {
      title: '最后物化',
      dataIndex: 'lastMaterializedAt',
      width: 140,
      render: (_, r) => formatTableDateTime(r.lastMaterializedAt),
    },
    {
      title: '操作',
      width: 140,
      fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            onClick={() =>
              navigate(
                materializedTableBrowseUrl(r.entityId!, 'schema', r.connectionId || undefined),
              )
            }
          >
            表结构
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() =>
              navigate(materializedTableBrowseUrl(r.entityId!, 'data', r.connectionId || undefined))
            }
          >
            数据
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <UrlSyncedProTable<API.MaterializationStatusItem>
      headerTitle={headerTitle}
      toolBarRender={headerExtra ? () => [headerExtra] : undefined}
      rowKey={materializedRowKey}
      loading={loading}
      columns={columns}
      dataSource={items.filter((i) => i.entityId)}
      search={false}
      options={false}
      defaultPageSize={20}
      urlFilterKeys={[]}
      rowSelection={
        onSelectionChange
          ? {
              selectedRowKeys,
              onChange: (keys, rows) => onSelectionChange(keys, rows),
            }
          : undefined
      }
      scroll={{ x: showConnectionInfo ? 1100 : 900 }}
    />
  );
};

export default MaterializedTableList;
