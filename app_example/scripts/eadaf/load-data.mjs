#!/usr/bin/env node
/**
 * 把 app_example 的雨伞演示数据灌进 **EADAF 物化表**。
 *
 * 数据源：app_example/scripts/sales-demo-db.sql（先由 backend 的 init-sales-demo-db.js 载入 SQLite）
 * 目标：  物化连接上的 bizdata_mat.ys_*（默认本地 MySQL 13306）
 *
 * 主键由源表整数 id 派生「确定性 UUID」，所以关系稳定、脚本可重复执行（REPLACE INTO）。
 *
 * 用法：
 *   node scripts/eadaf/load-data.mjs                 # 生成 SQL 并灌库
 *   node scripts/eadaf/load-data.mjs --stdout        # 只打印 SQL
 *   EADAF_MYSQL_CMD='mysql -h... -u... -p... bizdata_mat' node scripts/eadaf/load-data.mjs
 *
 * 说明：这里直接写物化表是「一次性造数」的偷懒做法；生产应通过 API 服务的写操作
 * 或 EADAF 采集管道入库，才能享受实体校验与审计。
 */
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const SQLITE = process.env.SALES_DEMO_DB_PATH || path.join(REPO, 'backend/data/sales-demo.db');
const OUT = process.env.YS_SEED_SQL || '/tmp/ys-seed.sql';
const STDOUT_ONLY = process.argv.includes('--stdout');
const MYSQL_CMD = process.env.EADAF_MYSQL_CMD || '';

/** 由种子派生确定性 UUID（v5 形状） */
function detUuid(seed) {
  const h = crypto.createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const U = {
  member: (i) => detUuid(`ys:member:${i}`),
  product: (i) => detUuid(`ys:product:${i}`),
  order: (i) => detUuid(`ys:order:${i}`),
  item: (i) => detUuid(`ys:order_item:${i}`),
  complaint: (i) => detUuid(`ys:complaint:${i}`),
};

const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);
const n = (v) => (v === null || v === undefined ? 'NULL' : String(v));

if (!fs.existsSync(SQLITE)) {
  console.error(`找不到 SQLite 演示库：${SQLITE}`);
  console.error('先执行：pnpm --filter ./backend init-sales-demo-db');
  process.exit(1);
}

const db = new DatabaseSync(SQLITE);
const rows = (sql) => db.prepare(sql).all();

const L = ['SET NAMES utf8mb4;'];

const members = rows('SELECT * FROM users ORDER BY id');
L.push(`\n-- 会员 ${members.length}`);
for (const r of members) {
  L.push(`REPLACE INTO \`ys_member\` (id,name,phone,email,city,level,created_at) VALUES (${[q(U.member(r.id)), q(r.name), q(r.phone), q(r.email), q(r.city), q(r.level), q(r.created_at)].join(',')});`);
}

const products = rows('SELECT * FROM products ORDER BY id');
L.push(`\n-- 伞品 ${products.length}`);
for (const r of products) {
  L.push(`REPLACE INTO \`ys_product\` (id,sku,name,category,price,stock) VALUES (${[q(U.product(r.id)), q(r.sku), q(r.name), q(r.category), n(r.price), n(r.stock)].join(',')});`);
}

const orders = rows('SELECT * FROM orders ORDER BY id');
L.push(`\n-- 订单 ${orders.length}`);
for (const r of orders) {
  L.push(`REPLACE INTO \`ys_order\` (id,order_no,member_id,status,total_amount,created_at,shipped_at) VALUES (${[q(U.order(r.id)), q(r.order_no), q(U.member(r.user_id)), q(r.status), n(r.total_amount), q(r.created_at), q(r.shipped_at)].join(',')});`);
}

const items = rows('SELECT * FROM order_items ORDER BY id');
L.push(`\n-- 订单明细 ${items.length}`);
for (const r of items) {
  L.push(`REPLACE INTO \`ys_order_item\` (id,order_id,product_id,quantity,unit_price) VALUES (${[q(U.item(r.id)), q(U.order(r.order_id)), q(U.product(r.product_id)), n(r.quantity), n(r.unit_price)].join(',')});`);
}

const complaints = rows('SELECT * FROM order_complaints ORDER BY id');
L.push(`\n-- 售后工单 ${complaints.length}`);
for (const r of complaints) {
  L.push(`REPLACE INTO \`ys_complaint\` (id,order_id,member_id,type,content,status,created_at,resolved_at) VALUES (${[q(U.complaint(r.id)), q(U.order(r.order_id)), q(U.member(r.user_id)), q(r.type), q(r.content), q(r.status), q(r.created_at), q(r.resolved_at)].join(',')});`);
}

const sql = L.join('\n') + '\n';

console.log(`源：${SQLITE}`);
console.log(`行数：会员 ${members.length} / 伞品 ${products.length} / 订单 ${orders.length} / 明细 ${items.length} / 工单 ${complaints.length}`);

if (STDOUT_ONLY) { process.stdout.write(sql); process.exit(0); }

fs.writeFileSync(OUT, sql, 'utf8');
console.log(`SQL 已写入：${OUT}`);

if (!MYSQL_CMD) {
  console.log('\n未设置 EADAF_MYSQL_CMD，只生成 SQL。灌库示例：');
  console.log(`  docker exec -i mysql-local sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" bizdata_mat' < ${OUT}`);
  console.log('  或  EADAF_MYSQL_CMD=\'mysql -h127.0.0.1 -P13306 -uroot -p*** bizdata_mat\' node scripts/eadaf/load-data.mjs');
  process.exit(0);
}

execFileSync('bash', ['-c', `${MYSQL_CMD} < ${OUT}`], { stdio: 'inherit' });
console.log('✅ 已灌入物化表');
