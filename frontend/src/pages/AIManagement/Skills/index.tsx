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
import { buildAISkillListPrompts } from '@/ai/pageChatPrompts';
import { useNavigate } from 'react-router-dom';
import { useAIListSurface } from '@/ai/useAIListSurface';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { deleteAdminSkillsId, getAdminSkills } from '@/services/EADAF/api/adminSkills';
import { isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import { augmentColumnsWithChatReference } from '@/utils/augmentColumnsWithChatReference';
import { buildAISkillListReference } from '@/ai/chatReferenceBuilders';
import { skillTableColumns } from './schema';

const SkillsPage: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const navigate = useNavigate();
  const { references } = useChatReference();
  const chatPrompts = useMemo(() => buildAISkillListPrompts(references), [references]);
  useAIChatPrompts(chatPrompts);

  useAIListSurface('aibase.skills.list', 'Skill 列表', actionRef);
  const search = useProTableSearchCollapse('ai-management.skills');

  const handleDelete = (id: string, name?: string) => {
    modal.confirm({
      title: '确认删除该 Skill？',
      content: name ? `将永久删除「${name}」，此操作不可恢复。` : '删除后不可恢复。',
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        const response = await deleteAdminSkillsId({ id });
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
        headerTitle="Skill 列表"
        columns={[
          ...augmentColumnsWithChatReference(skillTableColumns, 'name', buildAISkillListReference),
          {
            ...TABLE_ACTION_COLUMN_BASE,
            width: 70,
            render: (_, record) => (
              <TableActions>
                <TableActionButton
                  title="编辑"
                  icon={<EditOutlined />}
                  onClick={() => navigate(`/ai_management/skills/${record.id}/edit`)}
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
          const visibility = params.visibility as string | undefined;
          const response = await getAdminSkills({
            page: params.current,
            size: params.pageSize,
            name: params.name || undefined,
            slug: params.slug || undefined,
            description: params.description || undefined,
            isActive:
              params.isActive === undefined || params.isActive === ''
                ? undefined
                : params.isActive,
            isGlobal: visibility === 'global' ? true : undefined,
            isDedicated: visibility === 'dedicated' ? true : undefined,
          });
          return parseApiListResponse(response);
        }}
        toolBarRender={() => [
          <Button
            key="create"
            type="primary" className="btn-gradient-primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/ai_management/skills/create')}
          >
            新建 Skill
          </Button>,
        ]}
        options={DEFAULT_PRO_TABLE_OPTIONS}
      />
    </PageContainer>
  );
};

export default SkillsPage;
