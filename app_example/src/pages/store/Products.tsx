import { Card, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { PRODUCT_CATEGORIES, fetchProducts, type StoreProduct } from './storeApi';

/** 库存低于该值提示「库存告急」 */
const LOW_STOCK = 20;

const yuan = (value: number) => `¥${Number(value).toFixed(2)}`;

/**
 * 伞品管理：长柄伞 / 折叠伞 / 高尔夫伞 / 广告伞 / 儿童伞。
 * 数据来自 EADAF 生成的 API 服务 /api/v1/data/YS/product/Product（示例应用不自建商品库）。
 */
export default function ProductsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StoreProduct[]>([]);
  const [category, setCategory] = useState<string>('all');
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    fetchProducts()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const text = keyword.trim();
    return data.filter((item) => {
      const matchCategory = category === 'all' || item.category === category;
      const matchKeyword =
        !text || item.name.includes(text) || item.sku.toLowerCase().includes(text.toLowerCase());
      return matchCategory && matchKeyword;
    });
  }, [data, category, keyword]);

  const totalStock = rows.reduce((sum, item) => sum + item.stock, 0);

  return (
    <div>
      <Typography.Title level={3}>伞品管理</Typography.Title>
      <Typography.Paragraph type="secondary">
        共 {data.length} 款伞品（当前筛选 {rows.length} 款，库存合计 {totalStock} 把）。
      </Typography.Paragraph>
      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            value={category}
            style={{ width: 160 }}
            onChange={setCategory}
            options={[
              { value: 'all', label: '全部品类' },
              ...PRODUCT_CATEGORIES.map((item) => ({ value: item, label: item })),
            ]}
          />
          <Input.Search
            allowClear
            style={{ width: 260 }}
            placeholder="搜索伞品名称或 SKU"
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
            { title: 'SKU', dataIndex: 'sku', width: 130 },
            { title: '伞品名称', dataIndex: 'name' },
            {
              title: '品类',
              dataIndex: 'category',
              width: 110,
              render: (value?: string) => value || '-',
            },
            {
              title: '零售价',
              dataIndex: 'price',
              width: 120,
              align: 'right' as const,
              render: yuan,
            },
            {
              title: '库存',
              dataIndex: 'stock',
              width: 140,
              align: 'right' as const,
              render: (value: number) => (
                <Space size={6}>
                  <span>{value}</span>
                  {value < LOW_STOCK && <Tag color="error">库存告急</Tag>}
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
