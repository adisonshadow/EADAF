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
import { buildAIScopePrompts } from '@/ai/pageChatPrompts';
import { useNavigate } from 'react-router-dom';
import { useAIListSurface } from '@/ai/useAIListSurface';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { deleteAdminScopesId, getAdminScopes } from '@/services/EADAF/api/adminScopes';
import { isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import { augmentColumnsWithChatReference } from '@/utils/augmentColumnsWithChatReference';
import { buildAIScopeReference } from '@/ai/chatReferenceBuilders';
import { scopeTableColumns } from './schema';

const ScopesPage: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const navigate = useNavigate();
  const { references } = useChatReference();
  const chatPrompts = useMemo(() => buildAIScopePrompts(references), [references]);
  useAIChatPrompts(chatPrompts);

  useAIListSurface('aibase.scopes.list', 'Scope 列表', actionRef);
  const search = useProTableSearchCollapse('ai-management.scopes');

  const handleDelete = (id: string) => {
    modal.confirm({
      title: '确认停用该 Scope？',
      onOk: async () => {
        const response = await deleteAdminScopesId({ id });
        if (!isApiSuccess(response)) {
          message.error('停用失败');
          return;
        }
        message.success('已停用');
        actionRef.current?.reload();
      },
    });
  };

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <UrlSyncedProTable
        actionRef={actionRef}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        search={search}
        headerTitle="Scope 列表"
        columns={[
          ...augmentColumnsWithChatReference(scopeTableColumns, 'name', buildAIScopeReference),
          {
            ...TABLE_ACTION_COLUMN_BASE,
            width: 70,
            render: (_, record) => (
              <TableActions>
                <TableActionButton
                  title="编辑"
                  icon={<EditOutlined />}
                  onClick={() => navigate(`/ai_management/scopes/${record.id}/edit`)}
                />
                <TableActionButton
                  title="停用"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(record.id)}
                />
              </TableActions>
            ),
          },
        ]}
        request={async (params) => {
          const response = await getAdminScopes({
            page: params.current,
            size: params.pageSize,
          });
          return parseApiListResponse(response);
        }}
        toolBarRender={() => [
          <Button
            key="create"
            type="primary" className="btn-gradient-primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/ai_management/scopes/create')}
          >
            新建 Scope
          </Button>,
        ]}
        options={DEFAULT_PRO_TABLE_OPTIONS}
      />
    </PageContainer>
  );
};

export default ScopesPage;
