/**
 * 销售 Demo 的 AI 工具数据源：**EADAF 物化表**（`bizdata_mat.ys_*`）。
 *
 * 与页面 / API 服务读的是**同一份数据**：页面走 `/api/v1/data/YS/...`（API 服务 → 物化表），
 * 这里直连同一批物化表。**不再使用任何本地 SQLite 演示库**（旧的 `backend/data/sales-demo.db`）。
 *
 * 表名/连接由平台自己的物化元数据解析（`resolveBrowseContext`），因此
 * 「实体未物化」「连接被删」这类情况会给出明确报错，而不是悄悄查到一份过期副本。
 *
 * 返回字段沿用旧工具的输出形状（`user_id` / `user_name` / `items` ...），
 * 以免影响既有 Skill 指令与 AI 的回答习惯。
 */
const databaseConnectionService = require('../businessData/databaseConnectionService');
const { resolveBrowseContext } = require('../businessData/materializedTableBrowseService');
const { withMysqlClient, quoteMysqlIdentifier } = require('../businessData/materialization/connectionRunner');

/** YS 示例用到的 5 个实体 */
const ENTITIES = {
  member: 'YS:member:Member',
  product: 'YS:product:Product',
  order: 'YS:order:Order',
  orderItem: 'YS:order:OrderItem',
  complaint: 'YS:service:Complaint',
};

/** 元数据解析结果缓存（表名/连接很少变，避免每个工具调用都查一遍） */
const CONTEXT_TTL_MS = 30 * 1000;
let contextCache = null;

async function resolveSalesContext() {
  if (contextCache && Date.now() - contextCache.at < CONTEXT_TTL_MS) {
    return contextCache;
  }

  const connRow = await databaseConnectionService.resolveConnectionRecord(); // 默认物化连接
  const runtime = databaseConnectionService.buildRuntimeConfig(connRow);
  if (runtime.dbType !== 'mysql') {
    throw new Error(`销售 Demo 的 AI 工具当前只支持 MySQL 物化连接，当前为 ${runtime.dbType}`);
  }

  const tables = {};
  for (const [key, entityCode] of Object.entries(ENTITIES)) {
    const ctx = await resolveBrowseContext({ entityCode, connectionId: connRow.id });
    tables[key] = `${quoteMysqlIdentifier(ctx.targetSchema)}.${quoteMysqlIdentifier(ctx.tableName)}`;
  }

  contextCache = { at: Date.now(), runtime, tables, connectionName: connRow.name };
  return contextCache;
}

/** 测试/换连接用：丢掉缓存的元数据 */
function resetContextCache() {
  contextCache = null;
}

/** 在物化连接上执行（多查询复用同一个连接） */
async function withSalesConn(fn) {
  const ctx = await resolveSalesContext();
  return withMysqlClient(ctx.runtime, (conn) => fn(conn, ctx.tables));
}

const asInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** 分页参数：与旧实现一致（page ≥ 1，pageSize 1..50） */
function normalizePaging(args = {}, defaultPageSize = 10) {
  const page = Math.max(asInt(args.page, 1), 1);
  const pageSize = Math.min(Math.max(asInt(args.pageSize || args.page_size, defaultPageSize), 1), 50);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** 会员筛选：既支持会员 ID（UUID），也支持姓名模糊匹配（AI 常直接给名字） */
function buildMemberCondition(args, params) {
  const raw = args.userId || args.user_id || args.memberId || args.member_id;
  if (!raw) return null;
  const value = String(raw).trim();
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  if (uuidLike) {
    params.push(value);
    return 'o.member_id = ?';
  }
  params.push(`%${value}%`);
  return 'u.name LIKE ?';
}

async function getOrderByOrderNo(orderNo) {
  const normalized = String(orderNo || '').trim().toUpperCase();
  if (!normalized) return null;

  return withSalesConn(async (conn, t) => {
    const [orders] = await conn.query(
      `SELECT o.id, o.order_no, o.member_id AS user_id, o.status, o.total_amount, o.created_at, o.shipped_at,
              u.name AS user_name, u.phone AS user_phone, u.email AS user_email, u.city AS user_city, u.level AS user_level
         FROM ${t.order} o
         JOIN ${t.member} u ON u.id = o.member_id
        WHERE o.order_no = ?
        LIMIT 1`,
      [normalized],
    );
    const order = orders[0];
    if (!order) return null;

    const [items] = await conn.query(
      `SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.unit_price,
              p.sku, p.name AS product_name, p.category
         FROM ${t.orderItem} oi
         JOIN ${t.product} p ON p.id = oi.product_id
        WHERE oi.order_id = ?`,
      [order.id],
    );
    return { ...order, items };
  });
}

async function searchOrders(args = {}) {
  const { page, pageSize, offset } = normalizePaging(args, 10);

  return withSalesConn(async (conn, t) => {
    const conditions = ['1=1'];
    const params = [];

    if (args.status) {
      conditions.push('o.status = ?');
      params.push(String(args.status));
    }
    const memberCondition = buildMemberCondition(args, params);
    if (memberCondition) conditions.push(memberCondition);
    if (args.dateFrom || args.date_from) {
      conditions.push('o.created_at >= ?');
      params.push(String(args.dateFrom || args.date_from));
    }
    if (args.dateTo || args.date_to) {
      conditions.push('o.created_at <= ?');
      params.push(String(args.dateTo || args.date_to));
    }
    if (args.keyword) {
      conditions.push('(o.order_no LIKE ? OR u.name LIKE ?)');
      const kw = `%${String(args.keyword).trim()}%`;
      params.push(kw, kw);
    }

    const where = conditions.join(' AND ');
    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS count FROM ${t.order} o JOIN ${t.member} u ON u.id = o.member_id WHERE ${where}`,
      params,
    );
    const [items] = await conn.query(
      `SELECT o.id, o.order_no, o.member_id AS user_id, u.name AS user_name, o.status, o.total_amount,
              o.created_at, o.shipped_at
         FROM ${t.order} o
         JOIN ${t.member} u ON u.id = o.member_id
        WHERE ${where}
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    return { page, pageSize, total: Number(countRows[0]?.count || 0), items };
  });
}

async function orderStatsByStatus() {
  return withSalesConn(async (conn, t) => {
    const [rows] = await conn.query(
      `SELECT status, COUNT(*) AS order_count, ROUND(SUM(total_amount), 2) AS total_amount
         FROM ${t.order}
        GROUP BY status
        ORDER BY status`,
    );
    const [summaryRows] = await conn.query(
      `SELECT COUNT(*) AS total_orders, ROUND(SUM(total_amount), 2) AS grand_total FROM ${t.order}`,
    );
    return { summary: summaryRows[0] || {}, byStatus: rows };
  });
}

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function orderStatsByPeriod(args = {}) {
  // 上限给到 10 年：示例种子数据的日期是固定的，窗口太窄会永远查不到（AI 会显得"没数据"）
  const days = Math.min(Math.max(asInt(args.days, 30), 1), 3660);
  const groupBy = ['day', 'week', 'month'].includes(args.groupBy || args.group_by)
    ? (args.groupBy || args.group_by)
    : 'day';

  const periodExpr = {
    day: "DATE_FORMAT(created_at, '%Y-%m-%d')",
    week: "DATE_FORMAT(created_at, '%x-W%v')",
    month: "DATE_FORMAT(created_at, '%Y-%m')",
  }[groupBy];

  // 起点在 JS 里算好再传字符串：MySQL 的 INTERVAL ? DAY 在部分版本/驱动下不可靠
  const since = formatDate(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));

  return withSalesConn(async (conn, t) => {
    const [rows] = await conn.query(
      `SELECT ${periodExpr} AS period,
              COUNT(*) AS order_count,
              ROUND(SUM(total_amount), 2) AS total_amount
         FROM ${t.order}
        WHERE DATE(created_at) >= ?
        GROUP BY period
        ORDER BY period ASC`,
      [since],
    );
    // 窗口内没有数据时，把数据的实际时间范围一并返回：AI 可以据此换窗口或如实说明
    if (!rows.length) {
      const [rangeRows] = await conn.query(
        `SELECT DATE_FORMAT(MIN(created_at), '%Y-%m-%d') AS from_date,
                DATE_FORMAT(MAX(created_at), '%Y-%m-%d') AS to_date
           FROM ${t.order}`,
      );
      return { days, groupBy, since, items: rows, dataRange: rangeRows[0] || null };
    }
    return { days, groupBy, since, items: rows };
  });
}

async function listComplaints(args = {}) {
  const { page, pageSize, offset } = normalizePaging(args, 10);

  return withSalesConn(async (conn, t) => {
    const conditions = ['1=1'];
    const params = [];

    if (args.type) {
      conditions.push('c.type = ?');
      params.push(String(args.type));
    }
    if (args.status) {
      conditions.push('c.status = ?');
      params.push(String(args.status));
    }
    if (args.orderNo || args.order_no) {
      conditions.push('o.order_no = ?');
      params.push(String(args.orderNo || args.order_no).trim().toUpperCase());
    }

    const where = conditions.join(' AND ');
    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS count
         FROM ${t.complaint} c
         JOIN ${t.order} o ON o.id = c.order_id
        WHERE ${where}`,
      params,
    );
    const [items] = await conn.query(
      `SELECT c.id, c.order_id, c.member_id AS user_id, c.type, c.content, c.status, c.created_at, c.resolved_at,
              o.order_no, o.status AS order_status, u.name AS user_name
         FROM ${t.complaint} c
         JOIN ${t.order} o ON o.id = c.order_id
         JOIN ${t.member} u ON u.id = c.member_id
        WHERE ${where}
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    return { page, pageSize, total: Number(countRows[0]?.count || 0), items };
  });
}

/** 投诉详情：支持投诉 ID（UUID），也容忍传订单号（按订单取该单的投诉） */
async function getComplaintById(id) {
  const value = String(id || '').trim();
  if (!value) return null;
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

  return withSalesConn(async (conn, t) => {
    const [rows] = await conn.query(
      `SELECT c.id, c.order_id, c.member_id AS user_id, c.type, c.content, c.status, c.created_at, c.resolved_at,
              o.order_no, o.status AS order_status, o.total_amount,
              u.name AS user_name, u.phone AS user_phone, u.email AS user_email
         FROM ${t.complaint} c
         JOIN ${t.order} o ON o.id = c.order_id
         JOIN ${t.member} u ON u.id = c.member_id
        WHERE ${uuidLike ? 'c.id = ?' : 'o.order_no = ?'}
        ORDER BY c.created_at DESC
        LIMIT 1`,
      [uuidLike ? value : value.toUpperCase()],
    );
    return rows[0] || null;
  });
}

async function complaintStatsByType() {
  return withSalesConn(async (conn, t) => {
    const [rows] = await conn.query(
      `SELECT type, COUNT(*) AS complaint_count
         FROM ${t.complaint}
        GROUP BY type
        ORDER BY complaint_count DESC`,
    );
    return { byType: rows };
  });
}

async function complaintStatsByStatus() {
  return withSalesConn(async (conn, t) => {
    const [rows] = await conn.query(
      `SELECT status, COUNT(*) AS complaint_count
         FROM ${t.complaint}
        GROUP BY status
        ORDER BY status`,
    );
    return { byStatus: rows };
  });
}

module.exports = {
  ENTITIES,
  resolveSalesContext,
  resetContextCache,
  getOrderByOrderNo,
  searchOrders,
  orderStatsByStatus,
  orderStatsByPeriod,
  listComplaints,
  getComplaintById,
  complaintStatsByType,
  complaintStatsByStatus,
};
