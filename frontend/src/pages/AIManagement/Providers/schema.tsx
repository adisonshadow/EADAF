import type { ProColumns } from '@ant-design/pro-components';
import { Tag } from 'antd';
import { readBrowserProviderApiKey } from '@eadaf/ai-base';

export const providerTableColumns: ProColumns<API.AdminProvider>[] = [
  {
    title: '名称',
    dataIndex: 'name',
    width: 140,
  },
  {
    title: 'Slug',
    dataIndex: 'slug',
    copyable: true,
    width: 140,
  },
  {
    title: 'Base URL',
    dataIndex: 'baseUrl',
    ellipsis: true,
    width: 220,
  },
  {
    title: '适配器',
    dataIndex: 'adapterType',
    width: 160,
  },
  {
    title: 'API Key',
    dataIndex: 'apiKeySet',
    width: 100,
    render: (_, record) => {
      if (record.apiKeyStorage === 'browser') {
        const saved = Boolean(readBrowserProviderApiKey(record.id));
        return <Tag color={saved ? 'processing' : 'warning'}>{saved ? '仅浏览器' : '浏览器未保存'}</Tag>;
      }
      return (
        <Tag color={record.apiKeySet ? 'success' : 'default'}>
          {record.apiKeySet ? '已配置' : '未配置'}
        </Tag>
      );
    },
  },
  {
    title: '状态',
    dataIndex: 'isActive',
    width: 90,
    valueType: 'select',
    valueEnum: {
      true: { text: '启用', status: 'Success' },
      false: { text: '停用', status: 'Default' },
    },
  },
  {
    title: '更新时间',
    dataIndex: 'updatedAt',
    valueType: 'dateTime',
    width: 180,
  },
];
