import { Card, Col, Row, Statistic, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import {
  COMPLAINT_TYPE_LABEL,
  ORDER_STATUS_COLOR,
  ORDER_STATUS_LABEL,
  fetchComplaintStats,
  fetchOrderStats,
  type ComplaintStats,
  type OrderStats,
} from './storeApi';

const yuan = (value: number | string | undefined) =>
  `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

/**
 * 经营概览：订单/销售额/待发货/售后待处理 + 订单状态分布 + 售后类型分布。
 * 数据来自 EADAF 生成的 API 服务 /api/v1/data/YS/order/Order 与 .../service/Complaint
 */
export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
  const [complaintStats, setComplaintStats] = useState<ComplaintStats | null>(null);

  useEffect(() => {
    Promise.all([fetchOrderStats(), fetchComplaintStats()])
      .then(([orders, complaints]) => {
        setOrderStats(orders);
        setComplaintStats(complaints);
      })
      .finally(() => setLoading(false));
  }, []);

  const dashboard = orderStats?.dashboard;
  const complaintDashboard = complaintStats?.dashboard;

  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 4 }}>
        经营概览
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        雨伞品牌独立站（示例）：数据来自 EADAF 后端内置的销售 Demo 库；右侧 AI
        助手可通过 Tool 查询同一份订单与售后数据。
      </Typography.Paragraph>

      <Row gutter={16}>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="订单总数" value={dashboard?.total_orders ?? 0} suffix="笔" />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="累计销售额"
              value={Number(dashboard?.total_amount ?? 0)}
              precision={2}
              prefix="¥"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="已发货"
              value={dashboard?.shipped_count ?? 0}
              suffix={`/ 待发货 ${dashboard?.pending_count ?? 0}`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="售后待处理"
              value={complaintDashboard?.open_count ?? 0}
              suffix={`/ 共 ${complaintDashboard?.total_complaints ?? 0}`}
              styles={{
                content:
                  (complaintDashboard?.open_count ?? 0) > 0 ? { color: '#cf1322' } : undefined,
              }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={14}>
          <Card title="订单状态分布" loading={loading}>
            <Table
              rowKey="status"
              size="small"
              pagination={false}
              dataSource={orderStats?.byStatus ?? []}
              columns={[
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (status: keyof typeof ORDER_STATUS_LABEL) => (
                    <Tag color={ORDER_STATUS_COLOR[status]}>{ORDER_STATUS_LABEL[status]}</Tag>
                  ),
                },
                { title: '订单数', dataIndex: 'order_count', align: 'right' as const },
                { title: '金额', dataIndex: 'total_amount', align: 'right' as const, render: yuan },
              ]}
            />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="售后类型分布" loading={loading}>
            <Table
              rowKey="type"
              size="small"
              pagination={false}
              dataSource={complaintStats?.byType ?? []}
              columns={[
                {
                  title: '类型',
                  dataIndex: 'type',
                  render: (type: keyof typeof COMPLAINT_TYPE_LABEL) =>
                    COMPLAINT_TYPE_LABEL[type] ?? type,
                },
                { title: '工单数', dataIndex: 'complaint_count', align: 'right' as const },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
