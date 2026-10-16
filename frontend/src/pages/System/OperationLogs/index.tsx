import { EyeOutlined } from '@ant-design/icons';
import { ActionType, PageContainer, ProDescriptions } from '@ant-design/pro-components';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { Collapse, Drawer, Spin, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useRef, useState } from 'react';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import {
  getAdminOperationLogs,
  getAdminOperationLogsId,
} from '@/services/EADAF/api/adminOperationLogs';
import { isApiSuccess, parseApiListResponse, getApiData } from '@/utils/apiResponse';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import { operationLogTableColumns } from './schema';

const { Text } = Typography;

function JsonBlock({ value }: { value: unknown }) {
  if (value == null) return <Text type="secondary">—</Text>;
  return (
    <pre
      style={{
        margin: 0,
        maxHeight: 280,
        overflow: 'auto',
        fontSize: 12,
        background: 'rgba(0,0,0,0.04)',
        padding: 12,
        borderRadius: 6,
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

const OperationLogsPage: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Record<string, any>>();
  const search = useProTableSearchCollapse('system.operation-logs');

  const openDetail = async (logId: string) => {
    try {
      setLoading(true);
      setDrawerOpen(true);
      setDetail(undefined);
      const response = await getAdminOperationLogsId({ logId });
      if (!isApiSuccess(response)) {
        message.error('获取操作日志详情失败');
        return;
      }
      setDetail(getApiData<Record<string, any>>(response));
    } catch {
      message.error('获取操作日志详情失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <UrlSyncedProTable
        headerTitle="操作日志"
        actionRef={actionRef}
        rowKey="logId"
        search={search}
        scroll={{ x: 'max-content' }}
        columns={[
          ...operationLogTableColumns,
          {
            ...TABLE_ACTION_COLUMN_BASE,
            width: 50,
            render: (_, record) => (
              <TableActions>
                <TableActionButton
                  title="详情"
                  icon={<EyeOutlined />}
                  onClick={() => openDetail(record.logId)}
                />
              </TableActions>
            ),
          },
        ]}
        request={async (params) => {
          const response = await getAdminOperationLogs({
            page: params.current,
            size: params.pageSize,
            domain: params.domain,
            operationType: params.operationType,
            status: params.status,
            operatorName: params.operatorName,
            keyword: params.keyword,
            traceId: params.traceId,
            startTime: params.startTime,
            endTime: params.endTime,
            resourceType: params.resourceType,
            resourceId: params.resourceId,
          });
          return parseApiListResponse(response);
        }}
        options={DEFAULT_PRO_TABLE_OPTIONS}
      />

      <Drawer
        title="操作日志详情"
        width={720}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        <Spin spinning={loading}>
          {detail && (
            <>
              <ProDescriptions column={1} dataSource={detail}>
                <ProDescriptions.Item label="时间" dataIndex="createdAt" valueType="dateTime" />
                <ProDescriptions.Item label="操作者" dataIndex="operatorName" />
                <ProDescriptions.Item label="操作者类型" dataIndex="operatorType" />
                <ProDescriptions.Item label="模块" dataIndex="domain" />
                <ProDescriptions.Item label="操作类型" dataIndex="operationType" />
                <ProDescriptions.Item label="资源类型" dataIndex="resourceType" />
                <ProDescriptions.Item label="资源 ID" dataIndex="resourceId" copyable />
                <ProDescriptions.Item label="资源名称" dataIndex="resourceName" />
                <ProDescriptions.Item label="状态" dataIndex="status" />
                <ProDescriptions.Item label="错误信息" dataIndex="errorMessage" />
                <ProDescriptions.Item label="IP" dataIndex="ip" />
                <ProDescriptions.Item label="User-Agent" dataIndex="userAgent" />
                <ProDescriptions.Item label="耗时(ms)" dataIndex="durationMs" />
                <ProDescriptions.Item label="Trace ID" dataIndex="traceId" copyable />
              </ProDescriptions>
              <Collapse
                style={{ marginTop: 16 }}
                items={[
                  {
                    key: 'old',
                    label: '变更前 (oldData)',
                    children: <JsonBlock value={detail.oldData} />,
                  },
                  {
                    key: 'new',
                    label: '变更后 (newData)',
                    children: <JsonBlock value={detail.newData} />,
                  },
                  {
                    key: 'req',
                    label: '请求摘要 (requestSummary)',
                    children: <JsonBlock value={detail.requestSummary} />,
                  },
                ]}
              />
            </>
          )}
        </Spin>
      </Drawer>
    </PageContainer>
  );
};

export default OperationLogsPage;
