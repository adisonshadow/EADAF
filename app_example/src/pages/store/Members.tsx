import { Card, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import {
  MEMBER_LEVEL_LABEL,
  fetchMembers,
  fetchOrders,
  type MemberLevel,
  type StoreMember,
  type StoreOrder,
} from './storeApi';

interface MemberRow extends StoreMember {
  orderCount: number;
  totalAmount: number;
}

const yuan = (value: number) => `¥${Number(value).toFixed(2)}`;

/** 会员（独立站客户）：等级/城市/消费统计。消费统计由订单列表在前端汇总。 */
export default function MembersPage() {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [level, setLevel] = useState<string>('all');
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    Promise.all([fetchMembers(), fetchOrders({ pageSize: 60 })])
      .then(([memberList, orderList]) => {
        setMembers(memberList);
        setOrders(orderList.items || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo<MemberRow[]>(() => {
    const text = keyword.trim();
    return members
      .filter((member) => level === 'all' || member.level === level)
      .filter(
        (member) =>
          !text || member.name.includes(text) || (member.phone || '').includes(text),
      )
      .map((member) => {
        const owned = orders.filter((order) => order.user_id === member.id);
        return {
          ...member,
          orderCount: owned.length,
          totalAmount: owned.reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
        };
      });
  }, [members, orders, level, keyword]);

  return (
    <div>
      <Typography.Title level={3}>会员</Typography.Title>
      <Typography.Paragraph type="secondary">
        独立站会员（金牌/普通），订单数与累计消费由订单明细在前端汇总；会员账号本身由 EADAF
        的 UAC 统一管理。
      </Typography.Paragraph>
      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            value={level}
            style={{ width: 160 }}
            onChange={setLevel}
            options={[
              { value: 'all', label: '全部等级' },
              ...Object.entries(MEMBER_LEVEL_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Input.Search
            allowClear
            style={{ width: 260 }}
            placeholder="搜索姓名或手机号"
            onSearch={setKeyword}
            onChange={(event) => {
              if (!event.target.value) setKeyword('');
            }}
          />
        </Space>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '会员', dataIndex: 'name', width: 120 },
            { title: '手机号', dataIndex: 'phone', width: 150 },
            { title: '城市', dataIndex: 'city', width: 100 },
            {
              title: '等级',
              dataIndex: 'level',
              width: 120,
              render: (value: MemberLevel) => (
                <Tag color={value === 'vip' ? 'gold' : 'default'}>{MEMBER_LEVEL_LABEL[value]}</Tag>
              ),
            },
            {
              title: '订单数',
              dataIndex: 'orderCount',
              width: 100,
              align: 'right' as const,
            },
            {
              title: '累计消费',
              dataIndex: 'totalAmount',
              width: 140,
              align: 'right' as const,
              render: yuan,
            },
            { title: '注册时间', dataIndex: 'created_at', width: 180 },
          ]}
        />
      </Card>
    </div>
  );
}
