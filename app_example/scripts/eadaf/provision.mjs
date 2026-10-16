#!/usr/bin/env node
/**
 * app_example 在 EADAF 上的**自举脚本**：一条链路把示例变成「EADAF 原生」应用。
 *
 *   ① 专用存储桶
 *   ② 数据模型（实体 + 字段 + 枚举 + 关系，域前缀 YS）
 *   ③ 物化到默认连接 → 物理表
 *   ④ API 服务（每实体 find/findOne/findById/count）+ 发布
 *
 * 全程只调 EADAF 内置 API（应用 Token 认证），幂等，可重复执行。
 *
 * 用法：
 *   node scripts/eadaf/provision.mjs            # 全流程
 *   node scripts/eadaf/provision.mjs --dry-run  # 只预览物化 SQL，不执行
 *   node scripts/eadaf/provision.mjs --skip-materialize
 */
import { req, APP_ID, BASE } from './_client.mjs';

const DRY = process.argv.includes('--dry-run');
const SKIP_MAT = process.argv.includes('--skip-materialize');
const SCOPE = 'YS';

const BUCKET = {
  code: 'ys',
  name: 'YS 雨伞独立站示例资源',
  description: 'app_example（雨伞品牌电商独立站）示例专用桶：伞品图片、售后凭证等',
  applicationId: APP_ID,
  accessMode: 'authenticated',
};

const ENUMS = [
  { code: `${SCOPE}:member:MemberLevel`, label: '会员等级',
    values: { VIP: 'vip', NORMAL: 'normal' },
    items: { VIP: { label: '金牌会员', sort: 1 }, NORMAL: { label: '普通会员', sort: 2 } } },
  { code: `${SCOPE}:order:OrderStatus`, label: '订单状态',
    values: { PENDING: 'pending', PAID: 'paid', SHIPPED: 'shipped', COMPLETED: 'completed', CANCELLED: 'cancelled' },
    items: { PENDING: { label: '待付款', sort: 1 }, PAID: { label: '待发货', sort: 2 }, SHIPPED: { label: '已发货', sort: 3 }, COMPLETED: { label: '已完成', sort: 4 }, CANCELLED: { label: '已取消', sort: 5 } } },
  { code: `${SCOPE}:service:ComplaintType`, label: '售后工单类型',
    values: { QUALITY: 'quality', LOGISTICS: 'logistics', SERVICE: 'service', REFUND: 'refund' },
    items: { QUALITY: { label: '质量问题', sort: 1 }, LOGISTICS: { label: '物流问题', sort: 2 }, SERVICE: { label: '服务问题', sort: 3 }, REFUND: { label: '退款', sort: 4 } } },
  { code: `${SCOPE}:service:ComplaintStatus`, label: '售后工单状态',
    values: { OPEN: 'open', PROCESSING: 'processing', RESOLVED: 'resolved', CLOSED: 'closed' },
    items: { OPEN: { label: '待处理', sort: 1 }, PROCESSING: { label: '处理中', sort: 2 }, RESOLVED: { label: '已解决', sort: 3 }, CLOSED: { label: '已关闭', sort: 4 } } },
];

/* -------- 字段构造器：columnInfo 给设计器看，typeormConfig 给物化生成 DDL -------- */
const pk  = (label) => ({ columnInfo: { id: 'pk', label, extendType: 'adb-guid-id' }, typeormConfig: { type: 'uuid', primary: true, nullable: false } });
const str = (label, length, o = {}) => ({ columnInfo: { id: label, label }, typeormConfig: { type: 'varchar', length, nullable: o.nullable !== false, ...(o.unique ? { unique: true } : {}) } });
const int = (label, o = {}) => ({ columnInfo: { id: label, label }, typeormConfig: { type: 'int', nullable: o.nullable !== false } });
const dec = (label, o = {}) => ({ columnInfo: { id: label, label }, typeormConfig: { type: 'decimal', precision: 12, scale: 2, nullable: o.nullable !== false } });
const ts  = (label, nullable = true) => ({ columnInfo: { id: label, label }, typeormConfig: { type: 'timestamp', nullable } });
const txt = (label) => ({ columnInfo: { id: label, label }, typeormConfig: { type: 'text', nullable: false } });
const en  = (label, enumCode) => ({ columnInfo: { id: label, label, extendType: 'adb-enum', enumConfig: { enumCode } }, typeormConfig: { type: 'varchar', length: 32, nullable: false } });

const ENTITIES = [
  { code: `${SCOPE}:member:Member`, label: '会员', tableName: 'ys_member',
    description: '独立站注册会员（金牌 / 普通）',
    fields: { id: pk('主键'), name: str('会员姓名', 100, { nullable: false }), phone: str('手机号', 32), email: str('邮箱', 128), city: str('城市', 64), level: en('会员等级', `${SCOPE}:member:MemberLevel`), created_at: ts('注册时间', false) } },
  { code: `${SCOPE}:product:Product`, label: '伞品', tableName: 'ys_product',
    description: '伞品主数据（长柄/折叠/高尔夫/广告/儿童伞）',
    fields: { id: pk('主键'), sku: str('SKU', 64, { nullable: false, unique: true }), name: str('伞品名称', 200, { nullable: false }), category: str('品类', 64), price: dec('单价', { nullable: false }), stock: int('库存', { nullable: false }) } },
  { code: `${SCOPE}:order:Order`, label: '订单', tableName: 'ys_order',
    description: '独立站销售订单',
    fields: { id: pk('主键'), order_no: str('订单号', 64, { nullable: false, unique: true }), member_id: ({ columnInfo: { id: '会员ID', label: '会员ID' }, typeormConfig: { type: 'uuid', nullable: false } }), status: en('订单状态', `${SCOPE}:order:OrderStatus`), total_amount: dec('订单金额', { nullable: false }), created_at: ts('下单时间', false), shipped_at: ts('发货时间', true) } },
  { code: `${SCOPE}:order:OrderItem`, label: '订单明细', tableName: 'ys_order_item',
    description: '订单行项目',
    fields: { id: pk('主键'), order_id: ({ columnInfo: { id: '订单ID', label: '订单ID' }, typeormConfig: { type: 'uuid', nullable: false } }), product_id: ({ columnInfo: { id: '伞品ID', label: '伞品ID' }, typeormConfig: { type: 'uuid', nullable: false } }), quantity: int('数量', { nullable: false }), unit_price: dec('单价', { nullable: false }) } },
  { code: `${SCOPE}:service:Complaint`, label: '售后工单', tableName: 'ys_complaint',
    description: '质量/物流/服务/退款工单',
    fields: { id: pk('主键'), order_id: ({ columnInfo: { id: '订单ID', label: '订单ID' }, typeormConfig: { type: 'uuid', nullable: false } }), member_id: ({ columnInfo: { id: '会员ID', label: '会员ID' }, typeormConfig: { type: 'uuid', nullable: false } }), type: en('工单类型', `${SCOPE}:service:ComplaintType`), content: txt('问题描述'), status: en('工单状态', `${SCOPE}:service:ComplaintStatus`), created_at: ts('创建时间', false), resolved_at: ts('解决时间', true) } },
];

const RELATIONS = [
  { from: `${SCOPE}:order:Order`, type: 'manyToOne', name: 'member', to: `${SCOPE}:member:Member`, config: { nullable: false } },
  { from: `${SCOPE}:order:Order`, type: 'oneToMany', name: 'items', to: `${SCOPE}:order:OrderItem`, config: {} },
  { from: `${SCOPE}:order:OrderItem`, type: 'manyToOne', name: 'product', to: `${SCOPE}:product:Product`, config: { nullable: false } },
  { from: `${SCOPE}:service:Complaint`, type: 'manyToOne', name: 'order', to: `${SCOPE}:order:Order`, config: { nullable: false } },
  { from: `${SCOPE}:service:Complaint`, type: 'manyToOne', name: 'member', to: `${SCOPE}:member:Member`, config: { nullable: false } },
];

const OPERATIONS = ['find', 'findOne', 'findById', 'count'];

const log = (...a) => console.log(...a);
const entityIds = new Map();

log(`EADAF: ${BASE}\n`);

/* ------------------------------- ① 存储桶 ------------------------------- */
log('① 存储桶');
{
  const list = await req('GET', '/api/v1/storage/buckets');
  const hit = (list.data.items || []).find((b) => b.code === BUCKET.code);
  if (hit) log(`   已存在 ${hit.code}（${hit.bucketId}）`);
  else {
    const r = await req('POST', '/api/v1/storage/buckets', BUCKET);
    const b = r.data.item || r.data;
    log(`   ✅ 已创建 ${BUCKET.code}（${b.bucketId || b.id}）mode=${BUCKET.accessMode}`);
  }
}

/* ------------------------------- ② 数据模型 ------------------------------ */
log('\n② 数据模型');
for (const e of ENUMS) {
  const ex = await req('GET', `/api/v1/business-data/enums/exists?code=${encodeURIComponent(e.code)}`);
  if (ex.data.exists) log(`   枚举已存在 ${e.code}`);
  else {
    await req('POST', '/api/v1/business-data/enums', { code: e.code, enumInfo: { code: e.code, label: e.label }, values: e.values, items: e.items });
    log(`   ✅ 枚举 ${e.code}`);
  }
}
for (const ent of ENTITIES) {
  const ex = await req('GET', `/api/v1/business-data/entities/exists?code=${encodeURIComponent(ent.code)}`);
  let id, created = false;
  if (ex.data.exists) id = ex.data.item.id;
  else {
    const r = await req('POST', '/api/v1/business-data/entities', {
      code: ent.code, label: ent.label, entityKind: 'er_table', tableName: ent.tableName,
      entityInfo: { label: ent.label, description: ent.description, tags: [SCOPE.toLowerCase(), 'example'] },
    });
    id = (r.data.item && r.data.item.id) || r.data.id;
    created = true;
  }
  entityIds.set(ent.code, id);

  const fields = Object.entries(ent.fields).map(([fieldKey, f], i) => ({ fieldKey, columnInfo: f.columnInfo, typeormConfig: f.typeormConfig, sortOrder: i }));
  await req('PUT', `/api/v1/business-data/entities/${id}/fields`, { fields });
  log(`   ${created ? '✅ 实体' : '↻ 已存在'} ${ent.code.padEnd(26)} → ${ent.tableName.padEnd(16)} ${fields.length} 字段`);
}
for (const rel of RELATIONS) {
  const fromId = entityIds.get(rel.from);
  const list = await req('GET', `/api/v1/business-data/relations?entityId=${fromId}`);
  const items = Array.isArray(list.data) ? list.data : (list.data.items || []);
  if (items.some((r) => r.name === rel.name)) { log(`   关系已存在 ${rel.from}.${rel.name}`); continue; }
  await req('POST', '/api/v1/business-data/relations', { type: rel.type, name: rel.name, fromEntityId: fromId, toEntityId: entityIds.get(rel.to), config: rel.config });
  log(`   ✅ 关系 ${rel.from}.${rel.name} (${rel.type}) → ${rel.to}`);
}

/* -------------------------------- ③ 物化 -------------------------------- */
const ids = [...entityIds.values()];
if (DRY || !SKIP_MAT) {
  log(`\n③ 物化${DRY ? '（预览，--dry-run 不执行）' : ''}`);
  const preview = await req('POST', '/api/v1/business-data/materialization/preview', { entityIds: ids });
  const d = preview.data;
  log(`   连接 ${d.connectionName}（${d.dbType}）→ schema ${d.targetSchema}`);
  log('   --- 生成的 SQL（前 12 行）---');
  String(d.sql).split('\n').slice(0, 12).forEach((l) => log('   ' + l));

  if (!DRY) {
    const exec = await req('POST', '/api/v1/business-data/materialization/execute', { entityIds: ids });
    log(`   ✅ 物化执行：run=${exec.data.run.id} status=${exec.data.run.status}`);
  }
}

/* ------------------------------ ④ API 服务 ------------------------------ */
log('\n④ API 服务');
const services = {};
for (const ent of ENTITIES) {
  // by-code 查已存在（不存在时接口可能 404 → 捕获后走创建）
  let svc = null;
  try {
    const ex = await req('GET', `/api/v1/admin/api-services/by-code/${encodeURIComponent(ent.code)}`);
    svc = ex?.data ? (ex.data.item || ex.data) : null;
  } catch { svc = null; }

  if (svc) log(`   已存在 ${ent.code}（${svc.status}）`);
  else {
    const c = await req('POST', '/api/v1/admin/api-services', {
      code: ent.code, name: ent.label, description: `${ent.description}（EADAF 物化表 ${ent.tableName}）`,
      entityId: entityIds.get(ent.code), scriptMode: 'sql', enabledOperations: OPERATIONS,
      tags: [SCOPE.toLowerCase(), 'example'],
    });
    svc = c.data;
    log(`   ✅ 服务 ${ent.code}  routePath=${svc.routePath}`);
  }
  if (svc.status !== 'published') {
    await req('POST', `/api/v1/admin/api-services/${svc.id}/publish`);
    log('      🚀 已发布');
  }
  services[ent.code] = { id: svc.id, routePath: svc.routePath, basePath: `/api/v1/data/${svc.routePath}` };
}

log('\n══ 完成 ══');
log('实体 id：');
for (const [code, id] of entityIds) log(`  ${code.padEnd(28)} ${id}`);
log('\nAPI 服务：');
for (const [code, s] of Object.entries(services)) log(`  ${code.padEnd(28)} ${s.basePath}`);
log('\n下一步：node scripts/eadaf/load-data.mjs  （把演示数据灌进物化表）');
