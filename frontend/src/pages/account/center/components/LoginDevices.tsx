import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Empty, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { message } from '@/utils/antdAppApis';
import { history } from '@/utils/navigation';
import { clearAuth, clearSsoSid } from '@/utils/auth';
import {
  deleteAuthSessions,
  deleteAuthSessionsId,
  getAuthSessions,
} from '@/services/UAC/api/auth';

interface SessionItem {
  sid?: string;
  application_id?: string | null;
  platform?: boolean;
  ip?: string | null;
  user_agent?: string | null;
  created_at?: string | null;
  last_seen_at?: string | null;
  current?: boolean;
}

/** 把 UA 压成一眼能看懂的一句话 */
export function describeUserAgent(ua?: string | null): string {
  const text = String(ua || '');
  if (!text) return '未知设备';
  const browser = [
    [/Edg\//i, 'Edge'],
    [/Chrome\//i, 'Chrome'],
    [/Firefox\//i, 'Firefox'],
    [/Safari\//i, 'Safari'],
    [/curl\//i, 'curl（脚本）'],
  ].find(([re]) => (re as RegExp).test(text))?.[1] as string | undefined;
  const os = [
    [/Windows/i, 'Windows'],
    [/Macintosh|Mac OS X/i, 'macOS'],
    [/iPhone|iPad/i, 'iOS'],
    [/Android/i, 'Android'],
    [/Linux/i, 'Linux'],
  ].find(([re]) => (re as RegExp).test(text))?.[1] as string | undefined;
  if (!browser && !os) return '未知设备';
  return [os, browser].filter(Boolean).join(' · ');
}

const formatTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

/**
 * 登录设备（SSO 会话）。
 *
 * 数据来自 Redis 里的会话记录：一条 = 一个浏览器的 sid，该设备上的管理台与所有业务应用
 * 共用它，因此"撤销"就等于让那一台设备上的应用一起退出（Phase 1）。
 * Redis 不可用时后端返回 `store_available=false`，这里明确提示"查不到"而不是"没有"。
 */
const LoginDevices: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [storeAvailable, setStoreAvailable] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAuthSessions({ skipErrorHandler: true });
      const data = res?.data;
      setItems(Array.isArray(data?.items) ? data.items : []);
      setStoreAvailable(data?.store_available !== false);
    } catch (error) {
      console.error('获取登录设备失败:', error);
      message.error('获取登录设备失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revokeOne = async (sid?: string) => {
    if (!sid) return;
    setRevoking(sid);
    try {
      await deleteAuthSessionsId({ sid });
      message.success('已撤销该设备的登录态');
      await load();
    } catch (error) {
      console.error('撤销会话失败:', error);
      message.error('撤销失败，请稍后重试');
    } finally {
      setRevoking(null);
    }
  };

  const revokeAll = async () => {
    setRevoking('__all__');
    try {
      await deleteAuthSessions();
      message.success('已退出所有设备，请重新登录');
      clearAuth();
      clearSsoSid();
      history.replace('/auth/login?logged_out=1');
    } catch (error) {
      console.error('退出所有设备失败:', error);
      message.error('退出所有设备失败，请稍后重试');
      setRevoking(null);
    }
  };

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
        <Typography.Text type="secondary">
          一个浏览器算一台设备；撤销即让该设备上的管理台与所有业务应用一起退出。
        </Typography.Text>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
          <Popconfirm
            title="退出所有设备？"
            description="包括当前这台设备，需要重新登录。"
            okText="退出所有设备"
            cancelText="取消"
            onConfirm={() => void revokeAll()}
          >
            <Button danger loading={revoking === '__all__'}>
              退出所有设备
            </Button>
          </Popconfirm>
        </Space>
      </Space>

      {!storeAvailable ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="会话存储不可用，暂时查不到登录设备"
          description="后端未连上 Redis：此时「登出立即失效」会退化为等访问令牌过期。请联系管理员检查 Redis。"
        />
      ) : null}

      <Table<SessionItem>
        rowKey={(record) => String(record.sid || Math.random())}
        loading={loading}
        dataSource={items}
        pagination={false}
        locale={{
          emptyText: storeAvailable ? <Empty description="没有活跃会话" /> : <Empty description="查不到会话" />,
        }}
        columns={[
          {
            title: '设备',
            dataIndex: 'user_agent',
            render: (_: unknown, record) => (
              <Space direction="vertical" size={0}>
                <span>{describeUserAgent(record.user_agent)}</span>
                {record.current ? <Tag color="green">当前设备</Tag> : null}
              </Space>
            ),
          },
          { title: 'IP', dataIndex: 'ip', render: (value: string | null) => value || '-' },
          {
            title: '入口',
            dataIndex: 'application_id',
            render: (value: string | null) => (value ? value : '管理台'),
          },
          {
            title: '最近活跃',
            dataIndex: 'last_seen_at',
            render: (value: string | null) => formatTime(value),
          },
          {
            title: '登录时间',
            dataIndex: 'created_at',
            render: (value: string | null) => formatTime(value),
          },
          {
            title: '操作',
            key: 'action',
            render: (_: unknown, record) =>
              record.current ? (
                <Typography.Text type="secondary">当前会话请用"退出"</Typography.Text>
              ) : (
                <Popconfirm
                  title="撤销该设备的登录态？"
                  description="该设备上的业务应用会随即退出。"
                  okText="撤销"
                  cancelText="取消"
                  onConfirm={() => void revokeOne(record.sid)}
                >
                  <Button type="link" danger loading={revoking === record.sid}>
                    撤销
                  </Button>
                </Popconfirm>
              ),
          },
        ]}
      />
    </div>
  );
};

export default LoginDevices;
