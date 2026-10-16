import {
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { ActionType } from '@ant-design/pro-components';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { Button, Popconfirm } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import { useAISurface } from '@eadaf/ai-base';
import {
  deleteAutomationHook,
  getAutomationHookEventTypes,
  getAutomationHooks,
  postAutomationHookDisable,
  postAutomationHookEnable,
} from '@/services/EADAF/api/automationHooks';
import { getApiErrorMessage, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { buildHookTableColumns, hookStatusEnum } from './schema';

const HookListPage: React.FC = () => {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const search = useProTableSearchCollapse('api-services.hooks.list');
  const [catalog, setCatalog] = useState<API.HookEventType[]>([]);
  const [rowsSnapshot, setRowsSnapshot] = useState<API.HookListItem[]>([]);

  useEffect(() => {
    getAutomationHookEventTypes().then((res) => {
      if (isApiSuccess(res)) setCatalog(res.data || []);
    });
  }, []);

  const handleToggle = useCallback(
    async (record: API.HookListItem) => {
      const enabling = record.status !== 'enabled';
      const res = enabling
        ? await postAutomationHookEnable(record.id)
        : await postAutomationHookDisable(record.id);
      if (isApiSuccess(res)) {
        message.success(enabling ? '已启用' : '已禁用');
        actionRef.current?.reload();
      } else {
        message.error(getApiErrorMessage(res, enabling ? '启用失败（请检查配置完整性）' : '禁用失败'));
      }
    },
    [],
  );

  const handleDelete = useCallback(async (record: API.HookListItem) => {
    const res = await deleteAutomationHook(record.id);
    if (isApiSuccess(res)) {
      message.success('已删除（运行历史保留）');
      actionRef.current?.reload();
    } else {
      message.error(res.message || '删除失败');
    }
  }, []);

  useAISurface({
    id: 'apiservice.hook.list',
    domain: 'apiservice',
    label: '钩子管理列表',
    read: () => ({ rows: rowsSnapshot, total: rowsSnapshot.length }),
    refresh: () => actionRef.current?.reload(),
    matchMutation: (m) => String(m.type || '').startsWith('hook.'),
  });

  const columns = buildHookTableColumns({
    catalog,
    onEdit: (r) => navigate(`/api_services/hooks/${r.id}/edit`),
    onRuns: (r) => navigate(`/api_services/hooks/${r.id}/runs`),
    onToggle: (r) => void handleToggle(r),
    onDelete: (r) => void handleDelete(r),
  });

  return (
    <UrlSyncedProTable<API.HookListItem>
      headerTitle="钩子管理"
      actionRef={actionRef}
      rowKey="id"
      scroll={{ x: 'max-content' }}
      columns={[
        ...columns,
        {
          ...TABLE_ACTION_COLUMN_BASE,
          dataIndex: 'option',
          width: 130,
          render: (_, record) => (
            <TableActions>
              <TableActionButton
                title="编辑"
                icon={<EditOutlined />}
                onClick={() => navigate(`/api_services/hooks/${record.id}/edit`)}
              />
              <TableActionButton
                title="运行历史"
                icon={<HistoryOutlined />}
                onClick={() => navigate(`/api_services/hooks/${record.id}/runs`)}
              />
              <TableActionButton
                title={record.status === 'enabled' ? '禁用' : '启用'}
                icon={<PlayCircleOutlined />}
                onClick={() => void handleToggle(record)}
              />
              <Popconfirm title="确定删除该钩子？（运行历史将保留）" onConfirm={() => void handleDelete(record)}>
                <TableActionButton title="删除" icon={<DeleteOutlined />} danger />
              </Popconfirm>
            </TableActions>
          ),
        },
      ]}
      search={search}
      options={DEFAULT_PRO_TABLE_OPTIONS}
      request={async (params) => {
        const res = await getAutomationHooks({
          page: params.current,
          size: params.pageSize,
          status: (params.status as string | undefined) || undefined,
          eventType: (params.eventType as string | undefined) || undefined,
        });
        const parsed = parseApiListResponse<API.HookListItem>(res);
        if (parsed.data) setRowsSnapshot(parsed.data);
        return parsed;
      }}
      toolBarRender={() => [
        <Button
          key="create"
          type="primary"
          className="btn-gradient-primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/api_services/hooks/create')}
        >
          新建
        </Button>,
      ]}
    />
  );
};

export default HookListPage;
