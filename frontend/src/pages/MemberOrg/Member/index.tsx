import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { ActionType, PageContainer } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { useSetState } from "ahooks";
import { Button } from 'antd';
import { message, modal } from '@/utils/antdAppApis';
import React, { useCallback, useMemo, useRef } from "react";
import { useAIChatPrompts, useChatReference } from '@eadaf/ai-base';
import { buildMemberPrompts } from '@/ai/pageChatPrompts';
import { useNavigate } from 'react-router-dom';
import { useOpenDetail } from '@/hooks/useReturnToList';
import { tableColumns, useDepartmentOptions } from "./Schemas";
import { getUsers, deleteUsersUserId } from "@/services/EADAF/api/users";
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { augmentColumnsWithChatReference } from '@/utils/augmentColumnsWithChatReference';
import { buildUserReference } from '@/ai/chatReferenceBuilders';
import { useRoleOptions } from '@/hooks/useRoleOptions';

const PAGE_SIZE = 30;

interface UserRecord {
  user_id?: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  status: string;
  department_id: string;
  created_at: string;
  updated_at: string;
  avatar?: string;
  gender?: string;
}

const Page: React.FC = () => {
  const navigate = useNavigate();
  const openDetail = useOpenDetail();
  const departmentOptions = useDepartmentOptions();
  const { roleOptions } = useRoleOptions();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const { references } = useChatReference();
  const chatPrompts = useMemo(() => buildMemberPrompts(references), [references]);
  useAIChatPrompts(chatPrompts);
  const search = useProTableSearchCollapse('member-org.member', { defaultCollapsed: false });

  const [state] = useSetState({
    tableColumns: augmentColumnsWithChatReference<UserRecord>(
      [
        ...tableColumns,
        {
          ...TABLE_ACTION_COLUMN_BASE,
          dataIndex: "option",
          width: 70,
          render: (_: unknown, record: UserRecord) => (
            <TableActions>
              <TableActionButton
                title="编辑"
                key="edit"
                icon={<EditOutlined />}
                onClick={() => openDetail(`/member_org/member/${record.user_id}/edit`)}
              />
              <TableActionButton
                title="删除"
                key="delete"
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  modal.confirm({
                    title: '确认删除',
                    content: '确定要删除该成员吗？',
                    onOk: async () => {
                      if (!record.user_id) return;
                      try {
                        await deleteUsersUserId({ user_id: record.user_id });
                        message.success('删除成功');
                        actionRef.current?.reload();
                      } catch {
                        message.error('删除失败');
                      }
                    },
                  });
                }}
              />
            </TableActions>
          ),
        },
      ],
      'name',
      buildUserReference,
    ),
  });

  const { tableColumns: baseColumns } = state;

  const proTableColumns = useMemo(() => {
    return baseColumns.map((column: ProColumns<UserRecord>) => {
      if (column.dataIndex === 'department_id') {
        return {
          ...column,
          fieldProps: {
            ...(column.fieldProps as Record<string, unknown>),
            options: departmentOptions,
          },
        };
      }
      if (column.dataIndex === 'role_ids') {
        return {
          ...column,
          fieldProps: {
            ...(column.fieldProps as Record<string, unknown>),
            options: roleOptions,
          },
        };
      }
      return column;
    });
  }, [baseColumns, departmentOptions, roleOptions]);

  const loadMembers = useCallback(async (params: Record<string, unknown>) => {
    try {
      const department_id = Array.isArray(params.department_id)
        ? params.department_id[params.department_id.length - 1]
        : params.department_id;

      const response = await getUsers({
        size: PAGE_SIZE,
        page: params.current as number | undefined,
        user_id: params.user_id as string | undefined,
        username: params.username as string | undefined,
        name: params.name as string | undefined,
        email: params.email as string | undefined,
        phone: params.phone as string | undefined,
        status: params.status as API.User['status'],
        gender: params.gender as API.User['gender'],
        department_id: department_id as string | undefined,
      });

      if (response.code === 200 && response.data) {
        return {
          data: (response.data.items || []) as UserRecord[],
          success: true,
          total: response.data.total || 0,
        };
      }

      message.error(response.message || '获取成员列表失败');
      return { data: [], success: false, total: 0 };
    } catch {
      message.error('获取成员列表失败');
      return { data: [], success: false, total: 0 };
    }
  }, []);

  return (
    <>
      <PageContainer pageHeaderRender={() => <></>}>
        <UrlSyncedProTable<UserRecord>
          engine="nuqs"
          urlFilterKeys={['username', 'name', 'status']}
          defaultPageSize={PAGE_SIZE}
          headerTitle="成员列表"
          actionRef={actionRef}
          rowKey="user_id"
          scroll={{ x: 'max-content' }}
          search={search}
          toolBarRender={() => [
            <Button
              type="primary" className="btn-gradient-primary"
              key="create"
              icon={<PlusOutlined />}
              onClick={() => navigate('/member_org/member/create')}
            >
              新建
            </Button>,
          ]}
          request={loadMembers}
          columns={proTableColumns}
          pagination={{ showQuickJumper: false, showSizeChanger: false }}
          options={DEFAULT_PRO_TABLE_OPTIONS}
        />
      </PageContainer>
    </>
  );
};

export default Page;
