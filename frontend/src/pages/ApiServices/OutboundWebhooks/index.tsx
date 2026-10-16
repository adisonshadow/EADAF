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
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { Button, Popconfirm } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { apiServiceStatusEnum } from '@/enums';
import { renderStatusBadge } from '@/utils/statusBadge';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import {
  deleteOutboundWebhook,
  getOutboundWebhooks,
  postOutboundWebhookPublish,
} from '@/services/EADAF/api/outboundWebhooks';
import { getApiData, getApiErrorMessage, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';

const OutboundWebhookListPage: React.FC = () => {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const search = useProTableSearchCollapse('outbound-webhooks.list');

  const handlePublish = async (id: string) => {
    try {
      const res = await postOutboundWebhookPublish(id);
      if (!isApiSuccess(res)) {
        message.error(getApiErrorMessage(res, '发布失败'));
        return;
      }
      const published = getApiData<API.OutboundWebhook>(res);
      if (published?.status !== 'published') {
        message.error('发布未生效，请检查配置是否完整');
        return;
      }
      message.success('发布成功');
      await actionRef.current?.reload();
    } catch (error) {
      message.error(getApiErrorMessage(error, '发布失败'));
    }
  };

  const handleDelete = async (id: string) => {
    const res = await deleteOutboundWebhook(id);
    if (isApiSuccess(res)) {
      message.success('已删除');
      actionRef.current?.reload();
    } else {
      message.error(res.message || '删除失败');
    }
  };

  const columns: ProColumns<API.OutboundWebhook>[] = [
    { title: '名称', dataIndex: 'name', width: 180, ellipsis: true },
    { title: '编码', dataIndex: 'code', width: 200, copyable: true, ellipsis: true },
    {
      title: '目标 URL',
      dataIndex: 'targetUrl',
      width: 280,
      ellipsis: true,
      copyable: true,
    },
    {
      title: '触发业务 API',
      dataIndex: 'triggerApiServiceCode',
      width: 180,
      ellipsis: true,
      render: (_, r) => r.triggerApiServiceCode || '-',
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
      ...TABLE_ACTION_COLUMN_BASE,
      dataIndex: 'option',
      width: 120,
      render: (_, record) => (
        <TableActions>
          <TableActionButton
            title="编辑"
            icon={<EditOutlined />}
            onClick={() => navigate(`/api_services/outbound-webhooks/${record.id}/edit`)}
          />
          <TableActionButton
            title="测试"
            icon={<PlayCircleOutlined />}
            onClick={() => navigate(`/api_services/outbound-webhooks/${record.id}/test`)}
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
          <Popconfirm title="确定删除该提交外部API配置？" onConfirm={() => void handleDelete(record.id!)}>
            <TableActionButton title="删除" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </TableActions>
      ),
    },
  ];

  return (
    <>
      <UrlSyncedProTable<API.OutboundWebhook>
        headerTitle="提交外部API"
        actionRef={actionRef}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        columns={columns}
        search={search}
        options={DEFAULT_PRO_TABLE_OPTIONS}
        request={async (params) => {
          const res = await getOutboundWebhooks({
            page: params.current,
            size: params.pageSize,
            codePrefix: params.code as string | undefined,
          });
          return parseApiListResponse(res);
        }}
        toolBarRender={() => [
          <Button
            key="create"
            type="primary"
            className="btn-gradient-primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/api_services/outbound-webhooks/create')}
          >
            新建
          </Button>,
        ]}
      />
    </>
  );
};

export default OutboundWebhookListPage;
