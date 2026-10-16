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
import { buildAIModelListPrompts } from '@/ai/pageChatPrompts';
import { useNavigate } from 'react-router-dom';
import { useAIListSurface } from '@/ai/useAIListSurface';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { deleteAdminModelsId, getAdminModels } from '@/services/EADAF/api/adminModels';
import { isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import { augmentColumnsWithChatReference } from '@/utils/augmentColumnsWithChatReference';
import { buildAIModelReference } from '@/ai/chatReferenceBuilders';
import { modelTableColumns } from './schema';

const ModelsPage: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const navigate = useNavigate();
  const { references } = useChatReference();
  const chatPrompts = useMemo(() => buildAIModelListPrompts(references), [references]);
  useAIChatPrompts(chatPrompts);

  useAIListSurface('aibase.models.list', 'AI 模型列表', actionRef);
  const search = useProTableSearchCollapse('ai-management.models');

  const handleDelete = (record: API.AdminAiModel) => {
    modal.confirm({
      title: '确认停用',
      content: `确定要停用模型「${record.displayName}」吗？`,
      onOk: async () => {
        const response = await deleteAdminModelsId({ id: record.id || '' });
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
      <UrlSyncedProTable<API.AdminAiModel>
        actionRef={actionRef}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        search={search}
        headerTitle="AI 模型列表"
        columns={[
          ...augmentColumnsWithChatReference(modelTableColumns, 'displayName', buildAIModelReference),
          {
            ...TABLE_ACTION_COLUMN_BASE,
            width: 70,
            render: (_, record) => (
              <TableActions>
                <TableActionButton
                  title="编辑"
                  icon={<EditOutlined />}
                  onClick={() => navigate(`/ai_management/models/${record.id}/edit`)}
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
          const response = await getAdminModels({
            page: params.current,
            size: params.pageSize,
          });
          const { items, total, success } = parseApiListResponse<API.AdminAiModel>(response);
          return { data: items, total, success };
        }}
        toolBarRender={() => [
          <Button
            key="create"
            type="primary" className="btn-gradient-primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/ai_management/models/create')}
          >
            新建模型
          </Button>,
        ]}
        defaultPageSize={10}
        options={DEFAULT_PRO_TABLE_OPTIONS}
      />
    </PageContainer>
  );
};

export default ModelsPage;
