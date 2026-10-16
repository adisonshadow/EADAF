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
import { buildAIToolListPrompts } from '@/ai/pageChatPrompts';
import { useNavigate } from 'react-router-dom';
import { useAIListSurface } from '@/ai/useAIListSurface';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { deleteAdminToolsId, getAdminTools } from '@/services/EADAF/api/adminTools';
import { isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import { augmentColumnsWithChatReference } from '@/utils/augmentColumnsWithChatReference';
import { buildAIToolReference } from '@/ai/chatReferenceBuilders';
import { toolTableColumns } from './schema';

const ToolsPage: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const navigate = useNavigate();
  const { references } = useChatReference();
  const chatPrompts = useMemo(() => buildAIToolListPrompts(references), [references]);
  useAIChatPrompts(chatPrompts);

  useAIListSurface('aibase.tools.list', 'Tool 列表', actionRef);
  const search = useProTableSearchCollapse('ai-management.tools');

  const handleDelete = (id: string, name?: string) => {
    modal.confirm({
      title: '确认删除该 Tool？',
      content: name ? `将永久删除「${name}」，此操作不可恢复。` : '删除后不可恢复。',
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        const response = await deleteAdminToolsId({ id });
        if (!isApiSuccess(response)) {
          message.error('删除失败');
          return;
        }
        message.success('已删除');
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
        headerTitle="Tool 列表"
        columns={[
          ...augmentColumnsWithChatReference(toolTableColumns, 'name', buildAIToolReference),
          {
            ...TABLE_ACTION_COLUMN_BASE,
            width: 70,
            render: (_, record) => (
              <TableActions>
                <TableActionButton
                  title="编辑"
                  icon={<EditOutlined />}
                  onClick={() => navigate(`/ai_management/tools/${record.id}/edit`)}
                />
                <TableActionButton
                  title="删除"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(record.id, record.name)}
                />
              </TableActions>
            ),
          },
        ]}
        request={async (params) => {
          const response = await getAdminTools({
            page: params.current,
            size: params.pageSize,
            name: params.name || undefined,
            functionName: params.functionName || undefined,
            scopeId: params.scopeId || undefined,
            executionType: params.executionType || undefined,
            isActive: params.isActive === undefined || params.isActive === '' ? undefined : params.isActive,
          });
          return parseApiListResponse(response);
        }}
        toolBarRender={() => [
          <Button
            key="create"
            type="primary" className="btn-gradient-primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/ai_management/tools/create')}
          >
            新建 Tool
          </Button>,
        ]}
        options={DEFAULT_PRO_TABLE_OPTIONS}
      />
    </PageContainer>
  );
};

export default ToolsPage;
