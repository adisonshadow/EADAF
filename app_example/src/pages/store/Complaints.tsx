import { Card, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import {
  COMPLAINT_STATUS_COLOR,
  COMPLAINT_STATUS_LABEL,
  COMPLAINT_TYPE_LABEL,
  fetchComplaints,
  type ComplaintStatus,
  type ComplaintType,
  type StoreComplaint,
} from './storeApi';

/** 售后工单：质量 / 物流 / 服务 / 退款，按类型与状态筛选。 */
export default function ComplaintsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StoreComplaint[]>([]);
  const [type, setType] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');

  useEffect(() => {
    setLoading(true);
    fetchComplaints({
      type: type === 'all' ? undefined : type,
      status: status === 'all' ? undefined : status,
      pageSize: 50,
    })
      .then((res) => setData(res.items || []))
      .finally(() => setLoading(false));
  }, [type, status]);

  return (
    <div>
      <Typography.Title level={3}>售后工单</Typography.Title>
      <Typography.Paragraph type="secondary">
        伞品质保、物流破损、客服与退款诉求都在这里跟进；右侧 AI 助手可直接统计待处理工单。
      </Typography.Paragraph>
      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            value={type}
            style={{ width: 160 }}
            onChange={setType}
            options={[
              { value: 'all', label: '全部类型' },
              ...Object.entries(COMPLAINT_TYPE_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Select
            value={status}
            style={{ width: 160 }}
            onChange={setStatus}
            options={[
              { value: 'all', label: '全部状态' },
              ...Object.entries(COMPLAINT_STATUS_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
        </Space>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '工单', dataIndex: 'id', width: 70, render: (id: number) => `#${id}` },
            { title: '关联订单', dataIndex: 'order_no', width: 140 },
            { title: '会员', dataIndex: 'user_name', width: 110 },
            {
              title: '类型',
              dataIndex: 'type',
              width: 110,
              render: (value: ComplaintType) => COMPLAINT_TYPE_LABEL[value] ?? value,
            },
            { title: '问题描述', dataIndex: 'content' },
            {
              title: '状态',
              dataIndex: 'status',
              width: 110,
              render: (value: ComplaintStatus) => (
                <Tag color={COMPLAINT_STATUS_COLOR[value]}>
                  {COMPLAINT_STATUS_LABEL[value] ?? value}
                </Tag>
              ),
            },
            { title: '创建时间', dataIndex: 'created_at', width: 180 },
            {
              title: '处理时间',
              dataIndex: 'resolved_at',
              width: 180,
              render: (value?: string | null) => value || '-',
            },
          ]}
        />
      </Card>
    </div>
  );
}
