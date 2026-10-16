import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { ActionType, PageContainer } from '@ant-design/pro-components';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { Button } from 'antd';
import { message, modal } from '@/utils/antdAppApis';
import React, { useRef, useMemo } from 'react';
import { useAIChatPrompts, useChatReference } from '@eadaf/ai-base';
import { buildAIProviderPrompts } from '@/ai/pageChatPrompts';
import { useNavigate } from 'react-router-dom';
import { useAIListSurface } from '@/ai/useAIListSurface';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { deleteAdminProvidersId, getAdminProviders } from '@/services/EADAF/api/adminProviders';
import { isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import { augmentColumnsWithChatReference } from '@/utils/augmentColumnsWithChatReference';
import { buildAIProviderReference } from '@/ai/chatReferenceBuilders';
import { providerTableColumns } from './schema';

const ProvidersPage: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const navigate = useNavigate();
  const { references } = useChatReference();
  const chatPrompts = useMemo(() => buildAIProviderPrompts(references), [references]);
  useAIChatPrompts(chatPrompts);

  useAIListSurface('aibase.providers.list', 'AI 服务商列表', actionRef);
  const search = useProTableSearchCollapse('ai-management.providers');

  const handleDelete = (record: API.AdminProvider) => {
    modal.confirm({
      title: '确认停用',
      content: `确定要停用服务商「${record.name}」吗？`,
      onOk: async () => {
        const response = await deleteAdminProvidersId({ id: record.id || '' });
        if (isApiSuccess(response)) {
          message.success('已停用');
          actionRef.current?.reload();
        } else {
          message.error(response.message || '操作失败');
        }
      },
    });
  };

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <UrlSyncedProTable<API.AdminProvider>
        actionRef={actionRef}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        search={search}
        headerTitle="AI 服务商列表"
        columns={[
          ...augmentColumnsWithChatReference(providerTableColumns, 'name', buildAIProviderReference),
          {
            ...TABLE_ACTION_COLUMN_BASE,
            width: 70,
            render: (_, record) => (
              <TableActions>
                <TableActionButton
                  title="编辑"
                  icon={<EditOutlined />}
                  onClick={() => navigate(`/ai_management/providers/${record.id}/edit`)}
                />
                <TableActionButton
                  title="停用"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(record)}
                />
              </TableActions>
            ),
          },
        ]}
        request={async (params) => {
          const response = await getAdminProviders({
            page: params.current,
            size: params.pageSize,
          });
          const { items, total, success } = parseApiListResponse<API.AdminProvider>(response);
          return { data: items, total, success };
        }}
        toolBarRender={() => [
          <Button
            key="create"
            type="primary" className="btn-gradient-primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/ai_management/providers/create')}
          >
            新建服务商
          </Button>,
        ]}
        defaultPageSize={10}
        options={DEFAULT_PRO_TABLE_OPTIONS}
      />
    </PageContainer>
  );
};

export default ProvidersPage;
