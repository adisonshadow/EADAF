#!/usr/bin/env node
/**
 * 生成销售 Demo（SQLite）种子 SQL：**雨伞品牌厂商的电商独立站销售管理系统**
 *
 * 该 SQL 由 backend/scripts/init-sales-demo-db.js 载入，落到 backend/data/sales-demo.db，
 * 供 EADAF 仍读 SQLite 的 **AI Tool** 使用（app_example 页面已改为调 EADAF 物化表上的
 * API 服务 /api/v1/data/YS/*，数据由本 SQL 灌入 bizdata_mat.ys_*，见 /tmp/ys-load.mjs 一路的做法）。
 *
 * 用法：
 *   node scripts/gen-sales-demo-sql.cjs            # 写入 scripts/sales-demo-db.sql
 *   node scripts/gen-sales-demo-sql.cjs --stdout   # 只打印，不落盘
 *
 * 数据规模：20 会员 / 20 伞品 / 60 订单 / 订单明细 / 10 售后工单，金额自洽
 * （订单 total_amount = 该单明细 unit_price × quantity 之和）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

/* ------------------------------- 伪随机（可复现） ------------------------------- */
let seed = 20250101;
function rand() {
  // xorshift32，固定种子保证每次生成同样的数据
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed >>>= 0;
  return seed / 0xffffffff;
}
function pick(list) {
  return list[Math.floor(rand() * list.length)];
}
function intBetween(min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}
function money(value) {
  return Number(value).toFixed(2);
}

/* ---------------------------------- 会员 ---------------------------------- */
const MEMBERS = [
  ['张伟', '13800010001', 'zhangwei@example.com', '上海', 'vip', '2024-06-01 10:00:00'],
  ['李娜', '13800010002', 'lina@example.com', '北京', 'normal', '2024-06-05 11:00:00'],
  ['王芳', '13800010003', 'wangfang@example.com', '广州', 'vip', '2024-06-10 09:30:00'],
  ['刘强', '13800010004', 'liuqiang@example.com', '深圳', 'normal', '2024-07-01 14:20:00'],
  ['陈静', '13800010005', 'chenjing@example.com', '杭州', 'vip', '2024-07-15 16:00:00'],
  ['杨洋', '13800010006', 'yangyang@example.com', '成都', 'normal', '2024-08-01 08:45:00'],
  ['赵敏', '13800010007', 'zhaomin@example.com', '武汉', 'normal', '2024-08-20 13:10:00'],
  ['黄磊', '13800010008', 'huanglei@example.com', '南京', 'vip', '2024-09-01 10:30:00'],
  ['周婷', '13800010009', 'zhouting@example.com', '苏州', 'normal', '2024-09-10 15:00:00'],
  ['吴刚', '13800010010', 'wugang@example.com', '重庆', 'normal', '2024-09-25 11:20:00'],
  ['徐丽', '13800010011', 'xuli@example.com', '西安', 'vip', '2024-10-01 09:00:00'],
  ['孙浩', '13800010012', 'sunhao@example.com', '天津', 'normal', '2024-10-12 17:30:00'],
  ['马超', '13800010013', 'machao@example.com', '青岛', 'normal', '2024-10-20 12:00:00'],
  ['朱琳', '13800010014', 'zhulin@example.com', '厦门', 'vip', '2024-11-01 10:15:00'],
  ['胡军', '13800010015', 'hujun@example.com', '长沙', 'normal', '2024-11-08 14:40:00'],
  ['郭燕', '13800010016', 'guoyan@example.com', '郑州', 'normal', '2024-11-15 16:20:00'],
  ['何明', '13800010017', 'heming@example.com', '合肥', 'vip', '2024-11-20 08:50:00'],
  ['高雪', '13800010018', 'gaoxue@example.com', '宁波', 'normal', '2024-12-01 11:00:00'],
  ['林峰', '13800010019', 'linfeng@example.com', '东莞', 'normal', '2024-12-10 13:30:00'],
  ['罗敏', '13800010020', 'luomin@example.com', '佛山', 'vip', '2024-12-15 15:45:00'],
];

/* ---------------------------------- 伞品 ----------------------------------
 * 五个品类：长柄伞 / 折叠伞 / 高尔夫伞 / 广告伞 / 儿童伞
 * 分类名同时被前端「伞品管理」的品类筛选使用（保持中文一致）。
 */
const PRODUCTS = [
  ['UMB-L001', '24骨长柄商务伞（黑）', '长柄伞', 189.0, 120],
  ['UMB-L002', '全自动长柄晴雨伞', '长柄伞', 159.0, 86],
  ['UMB-L003', '竹节手柄长柄伞', '长柄伞', 229.0, 42],
  ['UMB-L004', '双层防风长柄伞', '长柄伞', 199.0, 8],
  ['UMB-F001', '三折全自动晴雨伞', '折叠伞', 129.0, 260],
  ['UMB-F002', '五折迷你胶囊伞', '折叠伞', 89.0, 340],
  ['UMB-F003', '反向折叠伞（不湿车座）', '折叠伞', 109.0, 150],
  ['UMB-F004', '碳纤维超轻三折伞', '折叠伞', 239.0, 36],
  ['UMB-G001', '双层高尔夫伞', '高尔夫伞', 299.0, 64],
  ['UMB-G002', '玻璃纤维高尔夫伞', '高尔夫伞', 349.0, 28],
  ['UMB-G003', '加大号高尔夫伞 140cm', '高尔夫伞', 399.0, 12],
  ['UMB-G004', '定制 LOGO 高尔夫伞', '高尔夫伞', 329.0, 45],
  ['UMB-A001', '广告直杆伞（印企业 LOGO）', '广告伞', 69.0, 500],
  ['UMB-A002', '印 LOGO 折叠广告伞', '广告伞', 79.0, 420],
  ['UMB-A003', '定制企业礼品伞', '广告伞', 99.0, 300],
  ['UMB-A004', '展会促销礼品伞', '广告伞', 59.0, 600],
  ['UMB-K001', '儿童卡通伞', '儿童伞', 49.0, 220],
  ['UMB-K002', '学生安全反光伞', '儿童伞', 59.0, 180],
  ['UMB-K003', '儿童全自动伞', '儿童伞', 69.0, 95],
  ['UMB-K004', '亲子长柄伞（一大一小）', '儿童伞', 119.0, 70],
];

/* ---------------------------------- 订单 ---------------------------------- */
const STATUS_PLAN = [
  ...Array(24).fill('completed'),
  ...Array(12).fill('shipped'),
  ...Array(10).fill('paid'),
  ...Array(8).fill('pending'),
  ...Array(6).fill('cancelled'),
];

function padOrderNo(index) {
  return `SO2025010${String(index).padStart(2, '0')}`;
}

function buildOrders() {
  const statuses = STATUS_PLAN.slice();
  // 打散状态，避免同一状态连续出现
  for (let i = statuses.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [statuses[i], statuses[j]] = [statuses[j], statuses[i]];
  }

  const orders = [];
  const items = [];
  let itemId = 1;
  const start = Date.UTC(2025, 0, 2, 9, 15, 0);

  for (let i = 0; i < 60; i += 1) {
    const orderId = i + 1;
    const status = statuses[i];
    const memberIndex = i % MEMBERS.length;
    const createdMs = start + i * 22 * 60 * 60 * 1000 + intBetween(0, 6) * 3600 * 1000;
    const createdAt = new Date(createdMs);
    const shippedAt = status === 'shipped' || status === 'completed'
      ? new Date(createdMs + intBetween(1, 3) * 24 * 3600 * 1000)
      : null;

    const lineCount = intBetween(1, 3);
    const used = new Set();
    let total = 0;
    for (let line = 0; line < lineCount; line += 1) {
      let productIndex = intBetween(0, PRODUCTS.length - 1);
      while (used.has(productIndex)) productIndex = intBetween(0, PRODUCTS.length - 1);
      used.add(productIndex);
      const quantity = intBetween(1, 3);
      const unitPrice = PRODUCTS[productIndex][3];
      total += unitPrice * quantity;
      items.push({
        id: itemId,
        orderId,
        productId: productIndex + 1,
        quantity,
        unitPrice,
      });
      itemId += 1;
    }

    orders.push({
      id: orderId,
      orderNo: padOrderNo(orderId),
      userId: memberIndex + 1,
      status,
      total,
      createdAt,
      shippedAt,
    });
  }
  return { orders, items };
}

/* -------------------------------- 售后工单 -------------------------------- */
const COMPLAINT_PLAN = [
  ['quality', '伞骨一撑就变形，撑不开', 'resolved'],
  ['quality', '伞面有破损，下雨天漏水', 'processing'],
  ['logistics', '下单三天还没发货，联系不上客服', 'open'],
  ['logistics', '快递把伞柄压变形了', 'closed'],
  ['service', '客服答应的赠品没有给', 'open'],
  ['service', '定制 LOGO 印错位置，要求重做', 'processing'],
  ['refund', '不想要了，申请退款', 'closed'],
  ['refund', '收到货与页面描述不一致，要求退款', 'resolved'],
  ['quality', '自动开合按钮卡住，按不下去', 'open'],
  ['logistics', '发错颜色，我要的是黑色长柄伞', 'resolved'],
];

function buildComplaints(orders) {
  const candidates = orders.filter(
    (order) => order.status === 'completed' || order.status === 'shipped',
  );
  return COMPLAINT_PLAN.map((plan, index) => {
    const order = candidates[(index * 5) % candidates.length];
    const [type, content, status] = plan;
    const createdAt = new Date(order.createdAt.getTime() + (index + 2) * 24 * 3600 * 1000);
    const resolvedAt = status === 'resolved' || status === 'closed'
      ? new Date(createdAt.getTime() + (index + 1) * 12 * 3600 * 1000)
      : null;
    return {
      id: index + 1,
      orderId: order.id,
      userId: order.userId,
      type,
      content,
      status,
      createdAt,
      resolvedAt,
    };
  });
}

/* --------------------------------- 输出 --------------------------------- */
function fmt(date) {
  if (!date) return 'NULL';
  const pad = (n) => String(n).padStart(2, '0');
  return `'${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}'`;
}

function buildSql() {
  const { orders, items } = buildOrders();
  const complaints = buildComplaints(orders);

  const lines = [];
  lines.push('-- 雨伞品牌厂商 · 电商独立站销售管理系统 —— 销售 Demo（SQLite）种子数据');
  lines.push('-- 会员 20 | 伞品 20 | 订单 60 | 订单明细 | 售后工单 10');
  lines.push('-- 由 app_example/scripts/gen-sales-demo-sql.cjs 生成；订单金额 = 明细单价 × 数量之和');
  lines.push('');
  lines.push('PRAGMA foreign_keys = ON;');
  lines.push('');
  for (const table of ['order_complaints', 'order_items', 'orders', 'products', 'users']) {
    lines.push(`DROP TABLE IF EXISTS ${table};`);
  }
  lines.push('');
  lines.push(`CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    city TEXT,
    level TEXT NOT NULL DEFAULT 'normal' CHECK (level IN ('vip', 'normal')),
    created_at TEXT NOT NULL
);`);
  lines.push('');
  lines.push(`CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT,
    price REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0
);`);
  lines.push('');
  lines.push(`CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    order_no TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'completed', 'cancelled')),
    total_amount REAL NOT NULL,
    created_at TEXT NOT NULL,
    shipped_at TEXT
);`);
  lines.push('');
  lines.push(`CREATE TABLE order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL
);`);
  lines.push('');
  lines.push(`CREATE TABLE order_complaints (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK (type IN ('quality', 'logistics', 'service', 'refund')),
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'processing', 'resolved', 'closed')),
    created_at TEXT NOT NULL,
    resolved_at TEXT
);`);
  lines.push('');
  for (const index of [
    'CREATE INDEX idx_orders_user_id ON orders(user_id);',
    'CREATE INDEX idx_orders_status ON orders(status);',
    'CREATE INDEX idx_orders_created_at ON orders(created_at);',
    'CREATE INDEX idx_order_items_order_id ON order_items(order_id);',
    'CREATE INDEX idx_order_complaints_order_id ON order_complaints(order_id);',
    'CREATE INDEX idx_order_complaints_type ON order_complaints(type);',
    'CREATE INDEX idx_order_complaints_status ON order_complaints(status);',
  ]) {
    lines.push(index);
  }

  lines.push('');
  lines.push(`-- 20 位独立站会员（vip / normal）`);
  lines.push('INSERT INTO users (id, name, phone, email, city, level, created_at) VALUES');
  MEMBERS.forEach((member, index) => {
    const [name, phone, email, city, level, createdAt] = member;
    const tail = index === MEMBERS.length - 1 ? ';' : ',';
    lines.push(`(${index + 1}, '${name}', '${phone}', '${email}', '${city}', '${level}', '${createdAt}')${tail}`);
  });

  lines.push('');
  lines.push('-- 20 款伞品：长柄伞 / 折叠伞 / 高尔夫伞 / 广告伞 / 儿童伞');
  lines.push('INSERT INTO products (id, sku, name, category, price, stock) VALUES');
  PRODUCTS.forEach((product, index) => {
    const [sku, name, category, price, stock] = product;
    const tail = index === PRODUCTS.length - 1 ? ';' : ',';
    lines.push(`(${index + 1}, '${sku}', '${name}', '${category}', ${money(price)}, ${stock})${tail}`);
  });

  lines.push('');
  lines.push(`-- 60 笔独立站订单（SO202501001 - SO202501060）`);
  lines.push('INSERT INTO orders (id, order_no, user_id, status, total_amount, created_at, shipped_at) VALUES');
  orders.forEach((order, index) => {
    const tail = index === orders.length - 1 ? ';' : ',';
    lines.push(
      `(${order.id}, '${order.orderNo}', ${order.userId}, '${order.status}', ${money(
        order.total,
      )}, ${fmt(order.createdAt)}, ${fmt(order.shippedAt)})${tail}`,
    );
  });

  lines.push('');
  lines.push('-- 订单明细（每个订单 1~3 个伞品）');
  lines.push('INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES');
  items.forEach((item, index) => {
    const tail = index === items.length - 1 ? ';' : ',';
    lines.push(
      `(${item.id}, ${item.orderId}, ${item.productId}, ${item.quantity}, ${money(item.unitPrice)})${tail}`,
    );
  });

  lines.push('');
  lines.push('-- 10 条售后工单（质量 / 物流 / 服务 / 退款）');
  lines.push(
    'INSERT INTO order_complaints (id, order_id, user_id, type, content, status, created_at, resolved_at) VALUES',
  );
  complaints.forEach((complaint, index) => {
    const tail = index === complaints.length - 1 ? ';' : ',';
    lines.push(
      `(${complaint.id}, ${complaint.orderId}, ${complaint.userId}, '${complaint.type}', '${complaint.content}', '${complaint.status}', ${fmt(
        complaint.createdAt,
      )}, ${fmt(complaint.resolvedAt)})${tail}`,
    );
  });
  lines.push('');
  return lines.join('\n');
}

function main() {
  const sql = buildSql();
  if (process.argv.includes('--stdout')) {
    process.stdout.write(sql);
    return;
  }
  const target = path.join(__dirname, 'sales-demo-db.sql');
  fs.writeFileSync(target, sql, 'utf8');
  const lines = sql.split('\n').length;
  process.stdout.write(`已生成 ${target}（${lines} 行）\n`);
}

main();
