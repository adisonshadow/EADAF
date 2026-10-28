import type { ProColumns } from '@ant-design/pro-components';
import { Tag, Space } from 'antd';

export const modelTableColumns: ProColumns<API.AdminAiModel>[] = [
  {
    title: 'Slug',
    dataIndex: 'slug',
    copyable: true,
    width: 140,
    // 列表不展示；字段保留，搜索和列设置里也不出现
    hideInTable: true,
    hideInSearch: true,
    search: false,
  },
  {
    title: '显示名称',
    dataIndex: 'displayName',
    width: 160,
  },
  {
    title: '模型 ID',
    dataIndex: 'modelId',
    width: 160,
  },
  {
    title: '服务商',
    dataIndex: 'providerId',
    width: 140,
    render: (_, record) => (record as API.AdminAiModel & { provider?: { name?: string } }).provider?.name || record.providerId,
  },
  {
    title: '能力标签',
    dataIndex: 'capabilities',
    width: 220,
    render: (_, record) => (
      <Space wrap size={[4, 4]}>
        {(record.capabilities || []).map((item) => (
          <Tag key={item}>{item}</Tag>
        ))}
      </Space>
    ),
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
    title: '限流',
    dataIndex: 'rateLimit',
    width: 140,
    render: (_, record) => {
      const { maxConcurrent, requestsPerMinute } = record.rateLimit || {};
      if (!maxConcurrent && !requestsPerMinute) return <Tag>不限</Tag>;
      const parts: string[] = [];
      if (maxConcurrent) parts.push(`并发 ${maxConcurrent}`);
      if (requestsPerMinute) parts.push(`${requestsPerMinute}/分`);
      return <Tag color="blue">{parts.join(' · ')}</Tag>;
    },
  },
  {
    title: '更新时间',
    dataIndex: 'updatedAt',
    valueType: 'dateTime',
    width: 180,
  },
];
