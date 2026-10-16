#!/usr/bin/env node
/**
 * 把 app_example 的雨伞演示数据灌进 **EADAF 物化表**。
 *
 * 数据源：`app_example/scripts/sales-demo-db.sql`（**直接解析 SQL，不再经过 SQLite**）
 * 目标：  物化连接上的 `bizdata_mat.ys_*`（默认本地 MySQL 13306）
 *
 * 主键由源表整数 id 派生「确定性 UUID」，所以关系稳定、脚本可重复执行（REPLACE INTO）。
 *
 * 用法：
 *   node scripts/eadaf/load-data.mjs                 # 解析 SQL 并灌库
 *   node scripts/eadaf/load-data.mjs --stdout        # 只打印 SQL
 *   EADAF_MYSQL_CMD='mysql -h... -u... -p... bizdata_mat' node scripts/eadaf/load-data.mjs
 *
 * 说明：这里直接写物化表是「一次性造数」的偷懒做法；生产应通过 API 服务的写操作
 * 或 EADAF 采集管道入库，才能享受实体校验与审计。
 * 日常初始化更推荐直接导入应用数据包（见 README §3.1）。
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const SOURCE = process.env.YS_SEED_SQL_FILE || path.join(REPO, 'app_example/scripts/sales-demo-db.sql');
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

/* ------------------------- 解析种子 SQL ------------------------- */

/** 去掉字符串字面量后扫描语句边界：单引号内的 ; 与 ) 不算结构字符 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    current += ch;
    if (inString) {
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          current += sql[i + 1];
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === "'") inString = true;
    else if (ch === ';') {
      statements.push(current);
      current = '';
    }
  }
  if (current.trim()) statements.push(current);
  return statements;
}

/** 拆分 `(a, b), (c, d)` 这样的多行元组 */
function splitTuples(body) {
  const tuples = [];
  let current = '';
  let depth = 0;
  let inString = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (inString) {
      current += ch;
      if (ch === "'") {
        if (body[i + 1] === "'") {
          current += body[i + 1];
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      if (depth === 1) continue; // 不把最外层括号记进来
    }
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        tuples.push(current);
        current = '';
        continue;
      }
    }
    if (depth >= 1) current += ch;
  }
  return tuples;
}

/** 把一个元组拆成字段值（字符串 / 数字 / null） */
function parseTuple(tuple, columns) {
  const values = [];
  let current = '';
  let inString = false;
  for (let i = 0; i < tuple.length; i += 1) {
    const ch = tuple[i];
    if (inString) {
      if (ch === "'") {
        if (tuple[i + 1] === "'") {
          current += "'";
          i += 1;
        } else {
          inString = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      continue;
    }
    if (ch === ',') {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  values.push(current.trim());

  const row = {};
  columns.forEach((col, index) => {
    const raw = values[index];
    if (raw === undefined || raw.toUpperCase() === 'NULL') row[col] = null;
    else if (/^-?\d+(\.\d+)?$/.test(raw)) row[col] = Number(raw);
    else row[col] = raw;
  });
  return row;
}

/** 种子 SQL 里允许出现的表（DDL/注释里的同名词不会误伤） */
const SEED_TABLES = new Set(['users', 'products', 'orders', 'order_items', 'order_complaints']);

function parseSeedSql(sql) {
  const tables = {};
  for (const statement of splitStatements(sql)) {
    // 语句前可能带 `-- 注释` 行，所以不锚定行首；用表名白名单兜底
    const match = /INSERT\s+INTO\s+`?(\w+)`?\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*)$/i.exec(statement);
    if (!match || !SEED_TABLES.has(match[1])) continue;
    const [, table, columnList, body] = match;
    const columns = columnList.split(',').map((c) => c.trim().replace(/`/g, ''));
    tables[table] = splitTuples(body).map((tuple) => parseTuple(tuple, columns));
  }
  return tables;
}

/* ------------------------- 读源数据 ------------------------- */

if (!fs.existsSync(SOURCE)) {
  console.error(`找不到种子 SQL：${SOURCE}`);
  process.exit(1);
}
console.log(`源：${SOURCE}`);
const tables = parseSeedSql(fs.readFileSync(SOURCE, 'utf8'));

const members = tables.users || [];
const products = tables.products || [];
const orders = tables.orders || [];
const items = tables.order_items || [];
const complaints = tables.order_complaints || [];

if (!members.length || !products.length || !orders.length) {
  console.error('种子 SQL 解析结果为空，请检查文件格式（需要 INSERT INTO users/products/orders ...）');
  process.exit(1);
}

// 关系自检：外键必须有落点，否则宁可不灌（避免写入悬挂引用）
const memberIds = new Set(members.map((r) => r.id));
const productIds = new Set(products.map((r) => r.id));
const orderIds = new Set(orders.map((r) => r.id));
const dangling = [
  ...orders.filter((r) => !memberIds.has(r.user_id)).map((r) => `orders#${r.id}.user_id=${r.user_id}`),
  ...items.filter((r) => !orderIds.has(r.order_id)).map((r) => `order_items#${r.id}.order_id=${r.order_id}`),
  ...items.filter((r) => !productIds.has(r.product_id)).map((r) => `order_items#${r.id}.product_id=${r.product_id}`),
  ...complaints.filter((r) => !orderIds.has(r.order_id)).map((r) => `order_complaints#${r.id}.order_id=${r.order_id}`),
  ...complaints.filter((r) => !memberIds.has(r.user_id)).map((r) => `order_complaints#${r.id}.user_id=${r.user_id}`),
];
if (dangling.length) {
  console.error(`种子数据存在 ${dangling.length} 处悬空引用：${dangling.slice(0, 5).join(', ')}`);
  process.exit(1);
}

/* ------------------------- 生成物化表 SQL ------------------------- */

const L = ['SET NAMES utf8mb4;'];

L.push(`\n-- 会员 ${members.length}`);
for (const r of members) {
  L.push(`REPLACE INTO \`ys_member\` (id,name,phone,email,city,level,created_at) VALUES (${[q(U.member(r.id)), q(r.name), q(r.phone), q(r.email), q(r.city), q(r.level), q(r.created_at)].join(',')});`);
}

L.push(`\n-- 伞品 ${products.length}`);
for (const r of products) {
  L.push(`REPLACE INTO \`ys_product\` (id,sku,name,category,price,stock) VALUES (${[q(U.product(r.id)), q(r.sku), q(r.name), q(r.category), n(r.price), n(r.stock)].join(',')});`);
}

L.push(`\n-- 订单 ${orders.length}`);
for (const r of orders) {
  L.push(`REPLACE INTO \`ys_order\` (id,order_no,member_id,status,total_amount,created_at,shipped_at) VALUES (${[q(U.order(r.id)), q(r.order_no), q(U.member(r.user_id)), q(r.status), n(r.total_amount), q(r.created_at), q(r.shipped_at)].join(',')});`);
}

L.push(`\n-- 订单明细 ${items.length}`);
for (const r of items) {
  L.push(`REPLACE INTO \`ys_order_item\` (id,order_id,product_id,quantity,unit_price) VALUES (${[q(U.item(r.id)), q(U.order(r.order_id)), q(U.product(r.product_id)), n(r.quantity), n(r.unit_price)].join(',')});`);
}

L.push(`\n-- 售后工单 ${complaints.length}`);
for (const r of complaints) {
  L.push(`REPLACE INTO \`ys_complaint\` (id,order_id,member_id,type,content,status,created_at,resolved_at) VALUES (${[q(U.complaint(r.id)), q(U.order(r.order_id)), q(U.member(r.user_id)), q(r.type), q(r.content), q(r.status), q(r.created_at), q(r.resolved_at)].join(',')});`);
}

const sql = L.join('\n') + '\n';

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
