/**
 * app_example —— 雨伞品牌厂商 · 电商独立站销售管理系统（示例应用）
 *
 * 数据来自 **EADAF 生成并物化的 API 服务**（不再是演示用的硬编码接口）：
 *   GET /api/v1/data/YS/member/Member        会员
 *   GET /api/v1/data/YS/product/Product      伞品
 *   GET /api/v1/data/YS/order/Order          订单（?status= 过滤，skip/limit 分页）
 *   GET /api/v1/data/YS/order/Order/one      订单详情（?order_no=）
 *   GET /api/v1/data/YS/order/OrderItem      订单明细（?order_id=）
 *   GET /api/v1/data/YS/service/Complaint    售后工单
 *
 * 这些服务背后是 EADAF「数据模型 → 物化 → API 服务」链路产物：
 *   实体 code 形如 YS:order:Order，物化物理表是 bizdata_mat.ys_order。
 * 响应信封统一为 { items, pagination:{total,page,pageSize} }。
 *
 * 说明：本示例不建后端，跨实体的关联（订单→会员、明细→伞品）在前端做，
 * 用下面极简的 memo 缓存避免重复请求。真实项目应在 API 服务里做 join / 聚合。
 */

import { withApp, handleUnauthorized } from '@/auth/auth';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const SVC = `${API_BASE}/v1/data/YS`;

interface Envelope<T> {
  items: T[];
  pagination?: { total: number; page: number; pageSize: number; totalPages: number; hasNext: boolean };
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 调 EADAF 生成的 API 服务；?app= 由 withApp 补上（SSO JWT 是应用密钥签的） */
async function callSvc<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<Envelope<T>> {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  const url = withApp(`${SVC}${path}${qs ? `?${qs}` : ''}`);
  const res = await fetch(url, { headers: authHeaders() });
  const json = await res.json();
  // 401：交给 auth 层先复核会话（可能只是这个接口的问题），确认无效才清登录态回 /auth/login
  if (res.status === 401 || json.code === 401) {
    const state = await handleUnauthorized();
    throw new Error(
      state === 'invalid'
        ? '登录已失效，正在跳转登录页…'
        : '该请求未被授权（可能缺少应用参数或权限），请稍后重试或重新登录',
    );
  }
  if (!res.ok || (json.code && json.code !== 200)) {
    throw new Error(json.message || json.error?.message || '请求失败');
  }
  const data = json.data || {};
  // find 返回 { items, pagination }，findOne 返回 { item }
  const items: T[] = data.items ?? (data.item !== undefined && data.item !== null ? [data.item] : []);
  return { items, pagination: data.pagination };
}

const toPage = <T,>(env: Envelope<T>, fallbackPageSize: number) => ({
  items: env.items,
  total: env.pagination?.total ?? env.items.length,
  page: env.pagination?.page ?? 1,
  pageSize: env.pagination?.pageSize ?? fallbackPageSize,
});

/* ---------------------------------- 类型 ---------------------------------- */

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled';
export type ComplaintType = 'quality' | 'logistics' | 'service' | 'refund';
export type ComplaintStatus = 'open' | 'processing' | 'resolved' | 'closed';
export type MemberLevel = 'vip' | 'normal';

export interface StoreProduct {
  id: string;
  sku: string;
  name: string;
  category?: string;
  price: number;
  stock: number;
}

export interface StoreMember {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  level: MemberLevel;
  created_at: string;
}

export interface StoreOrder {
  id: string;
  order_no: string;
  /** EADAF 实体里叫 member_id；这里保留 user_id 以兼容页面既有写法 */
  user_id: string;
  user_name?: string;
  member_id: string;
  status: OrderStatus;
  total_amount: number;
  created_at: string;
  shipped_at?: string | null;
}

export interface StoreOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  sku: string;
  product_name: string;
  category?: string;
}

export interface StoreOrderDetail extends StoreOrder {
  user_phone?: string;
  user_email?: string;
  user_city?: string;
  user_level?: MemberLevel;
  items: StoreOrderItem[];
}

export interface StoreComplaint {
  id: string;
  order_id: string;
  order_no?: string;
  member_id: string;
  user_id: string;
  user_name?: string;
  type: ComplaintType;
  content: string;
  status: ComplaintStatus;
  created_at: string;
  resolved_at?: string | null;
}

export interface OrderStats {
  dashboard: {
    total_orders: number;
    pending_count: number;
    shipped_count: number;
    completed_count: number;
    total_amount: number;
  };
  byStatus: Array<{ status: OrderStatus; order_count: number; total_amount: number }>;
}

export interface ComplaintStats {
  dashboard: { total_complaints: number; open_count: number };
  byType: Array<{ type: ComplaintType; complaint_count: number }>;
  byStatus: Array<{ status: ComplaintStatus; complaint_count: number }>;
}

/* -------------------------------- 关联缓存 -------------------------------- */

/** 会员 / 伞品 是全量小表，取一次缓存起来，供订单、明细、工单做关联 */
let memberCache: StoreMember[] | null = null;
let productCache: StoreProduct[] | null = null;

async function getMembers(): Promise<StoreMember[]> {
  if (!memberCache) {
    const env = await callSvc<StoreMember>('/member/Member', { limit: 100 });
    memberCache = env.items;
  }
  return memberCache;
}

async function getProducts(): Promise<StoreProduct[]> {
  if (!productCache) {
    const env = await callSvc<StoreProduct>('/product/Product', { limit: 100 });
    productCache = env.items.map((p) => ({ ...p, price: Number(p.price), stock: Number(p.stock) }));
  }
  return productCache;
}

/** 把 EADAF 返回的订单行补上页面需要的会员名 */
async function decorateOrders(rows: StoreOrder[]): Promise<StoreOrder[]> {
  const members = await getMembers();
  const byId = new Map(members.map((m) => [m.id, m]));
  return rows.map((o) => ({
    ...o,
    member_id: o.member_id,
    user_id: o.member_id,
    total_amount: Number(o.total_amount),
    user_name: byId.get(o.member_id)?.name,
  }));
}

/* -------------------------------- 中文映射 -------------------------------- */

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: '待付款',
  paid: '待发货',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
};

export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  pending: 'default',
  paid: 'processing',
  shipped: 'blue',
  completed: 'success',
  cancelled: 'error',
};

export const COMPLAINT_TYPE_LABEL: Record<ComplaintType, string> = {
  quality: '质量问题',
  logistics: '物流问题',
  service: '服务问题',
  refund: '退款',
};

export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatus, string> = {
  open: '待处理',
  processing: '处理中',
  resolved: '已解决',
  closed: '已关闭',
};

export const COMPLAINT_STATUS_COLOR: Record<ComplaintStatus, string> = {
  open: 'error',
  processing: 'processing',
  resolved: 'success',
  closed: 'default',
};

export const MEMBER_LEVEL_LABEL: Record<MemberLevel, string> = {
  vip: '金牌会员',
  normal: '普通会员',
};

/** 伞品品类（与种子数据里的 category 一致） */
export const PRODUCT_CATEGORIES = ['长柄伞', '折叠伞', '高尔夫伞', '广告伞', '儿童伞'];

/* --------------------------------- 接口封装 -------------------------------- */

export async function fetchProducts(): Promise<StoreProduct[]> {
  return getProducts();
}

export async function fetchMembers(): Promise<StoreMember[]> {
  return getMembers();
}

export async function fetchOrders(
  params: { status?: string; page?: number; pageSize?: number } = {},
): Promise<{ items: StoreOrder[]; total: number; page: number; pageSize: number }> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const env = await callSvc<StoreOrder>('/order/Order', {
    skip: (page - 1) * pageSize,
    limit: pageSize,
    status: params.status && params.status !== 'all' ? params.status : undefined,
  });
  return toPage({ ...env, items: await decorateOrders(env.items) }, pageSize);
}

export async function fetchOrderDetail(orderNo: string): Promise<StoreOrderDetail> {
  const one = await callSvc<StoreOrder>('/order/Order/one', { order_no: orderNo });
  const order = (await decorateOrders(one.items))[0];
  if (!order) throw new Error('订单不存在');

  const [itemEnv, members, products] = await Promise.all([
    callSvc<StoreOrderItem>('/order/OrderItem', { order_id: order.id, limit: 100 }),
    getMembers(),
    getProducts(),
  ]);
  const member = members.find((m) => m.id === order.member_id);
  const productById = new Map(products.map((p) => [p.id, p]));
  const items = itemEnv.items.map((it) => {
    const p = productById.get(it.product_id);
    return {
      ...it,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      sku: p?.sku ?? '',
      product_name: p?.name ?? '',
      category: p?.category,
    };
  });

  return {
    ...order,
    user_phone: member?.phone,
    user_email: member?.email,
    user_city: member?.city,
    user_level: member?.level,
    items,
  };
}

export async function fetchComplaints(
  params: { type?: string; status?: string; page?: number; pageSize?: number } = {},
): Promise<{ items: StoreComplaint[]; total: number; page: number; pageSize: number }> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const env = await callSvc<StoreComplaint>('/service/Complaint', {
    skip: (page - 1) * pageSize,
    limit: pageSize,
    type: params.type && params.type !== 'all' ? params.type : undefined,
    status: params.status && params.status !== 'all' ? params.status : undefined,
  });
  const [members, orders] = await Promise.all([
    getMembers(),
    callSvc<StoreOrder>('/order/Order', { limit: 100 }),
  ]);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const orderById = new Map(orders.items.map((o) => [o.id, o]));
  return toPage(
    {
      ...env,
      items: env.items.map((c) => ({
        ...c,
        user_id: c.member_id ?? (c as unknown as { user_id: string }).user_id,
        user_name: memberById.get(c.member_id)?.name,
        order_no: orderById.get(c.order_id)?.order_no,
      })),
    },
    pageSize,
  );
}

/**
 * 经营概览统计。
 * 示例数据量很小，直接拉全量在前端汇总；真实项目应在 API 服务里用 aggregate/SQL 聚合。
 */
export async function fetchOrderStats(): Promise<OrderStats> {
  const env = await callSvc<StoreOrder>('/order/Order', { limit: 100 });
  const rows = env.items.map((o) => ({ ...o, total_amount: Number(o.total_amount) }));

  const byStatusMap = new Map<OrderStatus, { order_count: number; total_amount: number }>();
  for (const o of rows) {
    const cur = byStatusMap.get(o.status) || { order_count: 0, total_amount: 0 };
    cur.order_count += 1;
    cur.total_amount += o.total_amount;
    byStatusMap.set(o.status, cur);
  }

  return {
    dashboard: {
      total_orders: rows.length,
      pending_count: rows.filter((o) => o.status === 'pending').length,
      shipped_count: rows.filter((o) => o.status === 'shipped').length,
      completed_count: rows.filter((o) => o.status === 'completed').length,
      total_amount: rows.reduce((s, o) => s + o.total_amount, 0),
    },
    byStatus: [...byStatusMap.entries()].map(([status, v]) => ({
      status,
      order_count: v.order_count,
      total_amount: v.total_amount,
    })),
  };
}

export async function fetchComplaintStats(): Promise<ComplaintStats> {
  const env = await callSvc<StoreComplaint>('/service/Complaint', { limit: 100 });
  const rows = env.items;

  const byTypeMap = new Map<ComplaintType, number>();
  const byStatusMap = new Map<ComplaintStatus, number>();
  for (const c of rows) {
    byTypeMap.set(c.type, (byTypeMap.get(c.type) || 0) + 1);
    byStatusMap.set(c.status, (byStatusMap.get(c.status) || 0) + 1);
  }

  return {
    dashboard: {
      total_complaints: rows.length,
      open_count: byStatusMap.get('open') || 0,
    },
    byType: [...byTypeMap.entries()].map(([type, complaint_count]) => ({ type, complaint_count })),
    byStatus: [...byStatusMap.entries()].map(([status, complaint_count]) => ({ status, complaint_count })),
  };
}
