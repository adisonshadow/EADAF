/**
 * app_example —— 雨伞品牌厂商 · 电商独立站销售管理系统（示例应用）
 *
 * 数据全部来自 **EADAF 平台后端**，示例应用不自建后端、不建库：
 *   GET /api/v1/demo/sales/products           伞品列表
 *   GET /api/v1/demo/sales/orders             订单列表（支持 status / page / pageSize）
 *   GET /api/v1/demo/sales/orders/:orderNo    订单详情（含明细与会员信息）
 *   GET /api/v1/demo/sales/users              会员列表
 *   GET /api/v1/demo/sales/complaints         售后工单（支持 type / status / 分页）
 *   GET /api/v1/demo/sales/stats/orders       订单统计
 *   GET /api/v1/demo/sales/stats/complaints   售后统计
 *
 * 数据源是 EADAF 后端内置的销售 Demo SQLite（app_example/scripts/sales-demo-db.sql），
 * 由 `pnpm --filter ./backend init-sales-demo-db` 生成，AI Tool 与前端共用同一份数据。
 */

const base = import.meta.env.VITE_API_BASE || '/api';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`, { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || json.error?.message || '请求失败');
  }
  return json.data as T;
}

function toQuery(params: Record<string, string | number | undefined> = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === null) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/* ---------------------------------- 类型 ---------------------------------- */

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled';
export type ComplaintType = 'quality' | 'logistics' | 'service' | 'refund';
export type ComplaintStatus = 'open' | 'processing' | 'resolved' | 'closed';
export type MemberLevel = 'vip' | 'normal';

export interface StoreProduct {
  id: number;
  sku: string;
  name: string;
  category?: string;
  price: number;
  stock: number;
}

export interface StoreMember {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  level: MemberLevel;
  created_at: string;
}

export interface StoreOrder {
  id: number;
  order_no: string;
  user_id: number;
  user_name?: string;
  status: OrderStatus;
  total_amount: number;
  created_at: string;
  shipped_at?: string | null;
}

export interface StoreOrderItem {
  id: number;
  order_id: number;
  product_id: number;
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
  id: number;
  order_id: number;
  order_no?: string;
  user_id: number;
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

export function fetchProducts() {
  return request<StoreProduct[]>('/v1/demo/sales/products');
}

export function fetchMembers() {
  return request<StoreMember[]>('/v1/demo/sales/users');
}

export function fetchOrders(params: { status?: string; page?: number; pageSize?: number } = {}) {
  return request<{ items: StoreOrder[]; total: number; page: number; pageSize: number }>(
    `/v1/demo/sales/orders${toQuery(params)}`,
  );
}

export function fetchOrderDetail(orderNo: string) {
  return request<StoreOrderDetail>(`/v1/demo/sales/orders/${encodeURIComponent(orderNo)}`);
}

export function fetchComplaints(
  params: { type?: string; status?: string; page?: number; pageSize?: number } = {},
) {
  return request<{ items: StoreComplaint[]; total: number; page: number; pageSize: number }>(
    `/v1/demo/sales/complaints${toQuery(params)}`,
  );
}

export function fetchOrderStats() {
  return request<OrderStats>('/v1/demo/sales/stats/orders');
}

export function fetchComplaintStats() {
  return request<ComplaintStats>('/v1/demo/sales/stats/complaints');
}
