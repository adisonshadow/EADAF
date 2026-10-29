import { PageContainer } from '@ant-design/pro-components';
import { Button, Input, Space, Table, Typography } from 'antd';
import { message } from '@/utils/antdAppApis';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getAdminOperationLogs } from '@/services/EADAF/api/adminOperationLogs';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import { OPERATION_LOG_DOMAIN, OPERATION_LOG_TYPE } from '@/enums';
import { useInitialState } from '@/providers/InitialStateProvider';
import dayjs from 'dayjs';

type AuditLog = {
  logId: string;
  createdAt?: string;
  operatorName?: string;
  operatorThreeMemberRole?: string | null;
  domain?: string;
  operationType?: string;
  resourceName?: string;
  status?: string;
};

const ROLE_LABEL: Record<string, string> = {
  system_admin: '系统管理员',
  security_admin: '安全保密管理员',
};

function storageKey(userId?: string) {
  return `eadaf.three-member-audit.${userId || 'anonymous'}`;
}

type Staging = { comment: string; items: AuditLog[] };

function readStaging(userId?: string): Staging {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { comment: '', items: [] };
    const parsed = JSON.parse(raw) as Staging;
    return {
      comment: parsed.comment || '',
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { comment: '', items: [] };
  }
}

export default function ThreeMemberAuditPage() {
  const { initialState } = useInitialState();
  const userId = initialState?.currentUser?.user_id;
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [staging, setStaging] = useState<Staging>({ comment: '', items: [] });
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  useEffect(() => {
    setStaging(readStaging(userId));
  }, [userId]);

  const persist = (next: Staging) => {
    setStaging(next);
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminOperationLogs({
        page: 1,
        size: 100,
        operatorThreeMemberRoles: 'system_admin,security_admin',
        ...(typeFilter.length === 1 ? { operationType: typeFilter[0] } : {}),
      });
      if (!isApiSuccess(res)) {
        message.error('加载审计日志失败');
        return;
      }
      const items = (getApiData<{ items?: AuditLog[] }>(res)?.items || []) as AuditLog[];
      const filtered = typeFilter.length > 1
        ? items.filter((item) => item.operationType && typeFilter.includes(item.operationType))
        : items;
      setLogs(filtered);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const typeOptions = useMemo(
    () => Object.entries(OPERATION_LOG_TYPE).map(([value, meta]) => ({
      value,
      label: String((meta as { text?: string }).text || value),
    })),
    [],
  );

  const addSelected = () => {
    const picked = logs.filter((item) => selectedKeys.includes(item.logId));
    if (!picked.length) {
      message.warning('请先选择日志');
      return;
    }
    const map = new Map(staging.items.map((item) => [item.logId, item]));
    picked.forEach((item) => map.set(item.logId, item));
    persist({ ...staging, items: [...map.values()] });
    message.success(`暂存 ${map.size} 条`);
  };

  const printReport = () => {
    if (!staging.items.length) {
      message.warning('暂存区是空的');
      return;
    }
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) {
      message.error('浏览器拦截了新窗口，请允许弹出后重试');
      return;
    }
    const rows = staging.items.map((item) => `
      <tr>
        <td>${item.createdAt ? dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss') : ''}</td>
        <td>${ROLE_LABEL[item.operatorThreeMemberRole || ''] || ''}</td>
        <td>${item.operatorName || ''}</td>
        <td>${(OPERATION_LOG_TYPE[item.operationType || ''] as { text?: string } | undefined)?.text || item.operationType || ''}</td>
        <td>${(OPERATION_LOG_DOMAIN[item.domain || ''] as { text?: string } | undefined)?.text || item.domain || ''}</td>
        <td>${item.resourceName || ''}</td>
      </tr>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>三员审计报告</title>
      <style>
        body { font-family: "Songti SC", "SimSun", serif; padding: 24px; color: #111; }
        h1 { font-size: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        td, th { border: 1px solid #ccc; padding: 6px 8px; font-size: 12px; text-align: left; }
        .comment { white-space: pre-wrap; margin-top: 12px; }
      </style></head><body>
      <h1>三员审计报告</h1>
      <p>导出时间：${dayjs().format('YYYY-MM-DD HH:mm:ss')}</p>
      <h2>安全风险评语</h2>
      <div class="comment">${(staging.comment || '（未填写）').replace(/</g, '&lt;')}</div>
      <table>
        <thead><tr><th>时间</th><th>身份</th><th>操作者</th><th>类型</th><th>模块</th><th>资源</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <PageContainer title={<></>}>
      <Typography.Paragraph type="secondary">
        只核查系统管理员和安全保密管理员的操作。勾选后放入暂存区（保存在本浏览器），填写评语后用浏览器打印为 PDF。
      </Typography.Paragraph>
      <Space wrap style={{ marginBottom: 16 }}>
        <span>操作类型</span>
        {typeOptions.map((option) => {
          const active = typeFilter.includes(option.value);
          return (
            <Button
              key={option.value}
              size="small"
              type={active ? 'primary' : 'default'}
              onClick={() => {
                setTypeFilter((prev) => (
                  prev.includes(option.value)
                    ? prev.filter((item) => item !== option.value)
                    : [...prev, option.value]
                ));
              }}
            >
              {option.label}
            </Button>
          );
        })}
        <Button onClick={() => void load()}>刷新</Button>
        <Button onClick={addSelected}>加入暂存</Button>
      </Space>
      <Table
        rowKey="logId"
        loading={loading}
        dataSource={logs}
        pagination={{ pageSize: 20 }}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: (keys) => setSelectedKeys(keys.map(String)),
        }}
        columns={[
          {
            title: '时间',
            dataIndex: 'createdAt',
            width: 180,
            render: (value) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'),
          },
          {
            title: '身份',
            dataIndex: 'operatorThreeMemberRole',
            width: 140,
            render: (value) => ROLE_LABEL[value] || '—',
          },
          { title: '操作者', dataIndex: 'operatorName', width: 120 },
          {
            title: '类型',
            dataIndex: 'operationType',
            width: 120,
            render: (value) => (OPERATION_LOG_TYPE[value] as { text?: string } | undefined)?.text || value,
          },
          {
            title: '模块',
            dataIndex: 'domain',
            width: 120,
            render: (value) => (OPERATION_LOG_DOMAIN[value] as { text?: string } | undefined)?.text || value || '—',
          },
          { title: '资源', dataIndex: 'resourceName' },
        ]}
      />
      <Typography.Title level={5} style={{ marginTop: 24 }}>暂存区（{staging.items.length}）</Typography.Title>
      <Space orientation="vertical" style={{ width: '100%' }}>
        {staging.items.map((item) => (
          <div key={item.logId}>
            {item.createdAt ? dayjs(item.createdAt).format('YYYY-MM-DD HH:mm') : ''}
            {' '}
            {ROLE_LABEL[item.operatorThreeMemberRole || ''] || ''}
            {' '}
            {item.operatorName}
            {' '}
            {item.resourceName}
            <Button
              type="link"
              size="small"
              onClick={() => persist({
                ...staging,
                items: staging.items.filter((row) => row.logId !== item.logId),
              })}
            >
              移除
            </Button>
          </div>
        ))}
        <Input.TextArea
          rows={4}
          placeholder="安全风险评语"
          value={staging.comment}
          onChange={(event) => persist({ ...staging, comment: event.target.value })}
        />
        <Space>
          <Button type="primary" onClick={printReport}>导出 PDF</Button>
          <Button onClick={() => persist({ comment: staging.comment, items: [] })}>清空暂存</Button>
        </Space>
      </Space>
    </PageContainer>
  );
}
