import { Card, Descriptions, Drawer, Select, Space, Table, Tag, Typography } from 'antd';
import { useChatReference } from '@eadaf/ai-base';
import { useCallback, useEffect, useState } from 'react';
import ChatReferenceTarget from '@/components/ChatReferenceTarget';
import {
  ORDER_STATUS_COLOR,
  ORDER_STATUS_LABEL,
  fetchOrderDetail,
  fetchOrders,
  type OrderStatus,
  type StoreOrder,
  type StoreOrderDetail,
} from './storeApi';

const yuan = (value: number | undefined) => `¥${Number(value || 0).toFixed(2)}`;

/**
 * 独立站订单：列表 + 明细抽屉。
 * 点订单号/会员名可把该对象加进右侧 AI 助手的引用，直接问「这单为什么还没发货」。
 */
export default function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StoreOrder[]>([]);
  const [status, setStatus] = useState<string>('all');
  const [detail, setDetail] = useState<StoreOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { addReference } = useChatReference();

  const load = useCallback(() => {
    setLoading(true);
    fetchOrders({ status: status === 'all' ? undefined : status, pageSize: 60 })
      .then((res) => setData(res.items || []))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = (orderNo: string) => {
    setDetailLoading(true);
    fetchOrderDetail(orderNo)
      .then(setDetail)
      .finally(() => setDetailLoading(false));
  };

  const referenceOrder = (row: StoreOrder) =>
    addReference({
      type: 'order',
      label: row.order_no,
      content: {
        order_no: row.order_no,
        status: row.status,
        total_amount: row.total_amount,
        created_at: row.created_at,
        user_name: row.user_name,
      },
      unique: true,
    });

  return (
    <div>
      <Typography.Title level={3}>独立站订单</Typography.Title>
      <Typography.Paragraph type="secondary">
        共 {data.length} 笔订单。点订单号可查看明细；点订单号旁的 @ 或会员名可加入 AI
        助手引用，再让助手分析发货/售后情况。
      </Typography.Paragraph>
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Select
            value={status}
            style={{ width: 160 }}
            onChange={setStatus}
            options={[
              { value: 'all', label: '全部状态' },
              ...Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
        </Space>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={{ pageSize: 10 }}
          onRow={(row) => ({ onClick: () => openDetail(row.order_no), style: { cursor: 'pointer' } })}
          columns={[
            {
              title: '订单号',
              dataIndex: 'order_no',
              render: (orderNo: string, row: StoreOrder) => (
                <>
                  {orderNo}
                  <ChatReferenceTarget
                    onClick={(event) => {
                      event.stopPropagation();
                      referenceOrder(row);
                    }}
                  />
                </>
              ),
            },
            {
              title: '会员',
              dataIndex: 'user_name',
              render: (userName: string | undefined, row: StoreOrder) => (
                <>
                  {userName || '-'}
                  <ChatReferenceTarget
                    onClick={(event) => {
                      event.stopPropagation();
                      addReference({
                        type: 'customer',
                        label: userName || '未知会员',
                        content: { user_id: row.user_id, user_name: userName },
                        unique: true,
                      });
                    }}
                  />
                </>
              ),
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 110,
              render: (value: OrderStatus) => (
                <Tag color={ORDER_STATUS_COLOR[value]}>{ORDER_STATUS_LABEL[value]}</Tag>
              ),
            },
            {
              title: '金额',
              dataIndex: 'total_amount',
              width: 120,
              align: 'right' as const,
              render: yuan,
            },
            { title: '下单时间', dataIndex: 'created_at', width: 180 },
            {
              title: '发货时间',
              dataIndex: 'shipped_at',
              width: 180,
              render: (value?: string | null) => value || '-',
            },
          ]}
        />
      </Card>

      <Drawer
        size={560}
        open={Boolean(detail)}
        loading={detailLoading}
        title={detail ? `订单 ${detail.order_no}` : '订单详情'}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <>
            <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="状态">
                <Tag color={ORDER_STATUS_COLOR[detail.status]}>
                  {ORDER_STATUS_LABEL[detail.status]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="订单金额">{yuan(detail.total_amount)}</Descriptions.Item>
              <Descriptions.Item label="会员">
                {detail.user_name}
                {detail.user_level === 'vip' ? '（金牌会员）' : '（普通会员）'}
              </Descriptions.Item>
              <Descriptions.Item label="手机号">{detail.user_phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="收货城市">{detail.user_city || '-'}</Descriptions.Item>
              <Descriptions.Item label="下单时间">{detail.created_at}</Descriptions.Item>
            </Descriptions>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={detail.items || []}
              columns={[
                { title: 'SKU', dataIndex: 'sku', width: 110 },
                { title: '伞品', dataIndex: 'product_name' },
                { title: '数量', dataIndex: 'quantity', width: 70, align: 'right' as const },
                {
                  title: '单价',
                  dataIndex: 'unit_price',
                  width: 100,
                  align: 'right' as const,
                  render: yuan,
                },
              ]}
            />
          </>
        )}
      </Drawer>
    </div>
  );
}
