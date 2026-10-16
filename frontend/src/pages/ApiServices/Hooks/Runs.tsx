import { useAISurface } from '@eadaf/ai-base';
import { EyeOutlined, RedoOutlined } from '@ant-design/icons';
import { ActionType } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { UrlSyncedProTable } from '@/components/UrlSyncedProTable';
import { Button, Descriptions, Drawer, Popconfirm } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TableActionButton, TableActions, TABLE_ACTION_COLUMN_BASE } from '@/components/TableActions';
import { DEFAULT_PRO_TABLE_OPTIONS } from '@/constants/proTable';
import {
  getAutomationHook,
  getAutomationHookRuns,
  postAutomationHookRunRetry,
} from '@/services/EADAF/api/automationHooks';
import { getApiData, getApiErrorMessage, isApiSuccess, parseApiListResponse } from '@/utils/apiResponse';
import { useProTableSearchCollapse } from '@/hooks/useProTableSearchCollapse';
import PageContainerTitleWithBack from '@/components/PageContainerTitleWithBack';
import { hookRunStatusEnum, hookTriggerSourceEnum, renderHookRunStatus } from './schema';

const HookRunsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const search = useProTableSearchCollapse('api-services.hooks.runs');
  const [hookName, setHookName] = useState('');
  const [detail, setDetail] = useState<API.HookRun | null>(null);
  const [replaying, setReplaying] = useState(false);

  React.useEffect(() => {
    if (!id) return;
    getAutomationHook(id).then((res) => {
      if (isApiSuccess(res)) setHookName(getApiData<API.Hook>(res)?.name || '');
    });
  }, [id]);

  const handleReplay = async (run: API.HookRun) => {
    setReplaying(true);
    try {
      const res = await postAutomationHookRunRetry(run.id);
      if (isApiSuccess(res)) {
        message.success(`重放完成：${res.data?.run?.status || '-'}`);
        actionRef.current?.reload();
      } else {
        message.error(getApiErrorMessage(res, '重放失败'));
      }
    } finally {
      setReplaying(false);
    }
  };

  useAISurface({
    id: `apiservice.hook.runs:${id || ''}`,
    domain: 'apiservice',
    label: '钩子运行历史',
    read: () => ({ hookId: id, hookName }),
    refresh: () => actionRef.current?.reload(),
    matchMutation: (m) => String(m.type || '').startsWith('hook.'),
  });

  const columns: ProColumns<API.HookRun>[] = [
    {
      title: '时间',
      dataIndex: 'startedAt',
      width: 170,
      render: (_, r) => (r.startedAt || '').slice(0, 19).replace('T', ' '),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      valueType: 'select',
      valueEnum: hookRunStatusEnum,
      render: (_, r) => renderHookRunStatus(r.status),
    },
    {
      title: '来源',
      dataIndex: 'triggerSource',
      width: 80,
      valueType: 'select',
      valueEnum: hookTriggerSourceEnum,
    },
    { title: '第几次', dataIndex: 'attempt', width: 80 },
    { title: '耗时', dataIndex: 'durationMs', width: 90, render: (_, r) => `${r.durationMs ?? '-'} ms` },
    { title: '错误', dataIndex: 'error', width: 260, ellipsis: true, render: (_, r) => r.error || '-' },
  ];

  return (
    <>
      <UrlSyncedProTable<API.HookRun>
        headerTitle={`运行历史${hookName ? `：${hookName}` : ''}`}
        actionRef={actionRef}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        columns={[
          ...columns,
          {
            ...TABLE_ACTION_COLUMN_BASE,
            dataIndex: 'option',
            width: 100,
            render: (_, record) => (
              <TableActions>
                <TableActionButton title="详情" icon={<EyeOutlined />} onClick={() => setDetail(record)} />
                <Popconfirm title="用该次运行的原始负载重跑？" onConfirm={() => void handleReplay(record)}>
                  <TableActionButton title="重放" icon={<RedoOutlined />} />
                </Popconfirm>
              </TableActions>
            ),
          },
        ]}
        search={search}
        options={DEFAULT_PRO_TABLE_OPTIONS}
        request={async (params) => {
          if (!id) return { data: [], total: 0, success: true };
          const res = await getAutomationHookRuns(id, {
            page: params.current,
            size: params.pageSize,
            status: (params.status as string | undefined) || undefined,
          });
          return parseApiListResponse<API.HookRun>(res);
        }}
        toolBarRender={() => [
          <Button key="back" onClick={() => navigate('/api_services/hooks')}>
            返回列表
          </Button>,
        ]}
        onRow={(record) => ({ onClick: () => setDetail(record) })}
      />

      <Drawer
        title={
          <PageContainerTitleWithBack title="运行详情" backTo={`/api_services/hooks/${id}/runs`} />
        }
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        width={720}
      >
        {detail ? (
          <Descriptions
            size="small"
            bordered
            column={1}
            items={[
              { key: 'status', label: '状态', children: renderHookRunStatus(detail.status) },
              { key: 'event', label: '事件', children: `${detail.eventType}（depth ${detail.eventDepth}）` },
              { key: 'source', label: '来源', children: detail.triggerSource },
              { key: 'duration', label: '耗时', children: `${detail.durationMs ?? '-'} ms` },
              ...(detail.error ? [{ key: 'error', label: '错误', children: detail.error }] : []),
              {
                key: 'payload',
                label: '事件负载',
                children: (
                  <pre className="hook-runs__json">
                    {JSON.stringify(detail.payload?.payload ?? detail.payload, null, 2)}
                  </pre>
                ),
              },
              {
                key: 'output',
                label: '动作输出',
                children: (
                  <pre className="hook-runs__json">{JSON.stringify(detail.output ?? null, null, 2)}</pre>
                ),
              },
              {
                key: 'logs',
                label: '脚本日志',
                children: (
                  <pre className="hook-runs__json">{(detail.logs || []).join('\n') || '-'}</pre>
                ),
              },
              {
                key: 'snapshot',
                label: '动作配置快照（脱敏）',
                children: (
                  <pre className="hook-runs__json">
                    {JSON.stringify(detail.actionConfigSnapshot ?? null, null, 2)}
                  </pre>
                ),
              },
            ]}
          />
        ) : null}
      </Drawer>
    </>
  );
};

export default HookRunsPage;
