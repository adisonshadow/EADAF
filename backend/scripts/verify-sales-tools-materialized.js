#!/usr/bin/env node
/**
 * 自检：销售 Demo 的 AI 工具与**页面用的数据 API** 读的是同一份数据（EADAF 物化表）。
 *
 * 背景：这些 Tool 原先查本地 SQLite（backend/data/sales-demo.db），与页面是两份数据。
 * 现在两者都走物化表 —— 本脚本用真实 HTTP 路径逐项对齐：
 *   AI 侧：POST /api/v1/ai/tools/invoke      （AI 实际调用入口）
 *   页面侧：GET  /api/v1/data/YS/...         （示例页面实际调用入口）
 *
 * 另含两条"不该再出现"的守卫：本地 SQLite 文件、backend 源码里对旧实现的引用。
 *
 * 用法：
 *   node scripts/verify-sales-tools-materialized.js
 *   EADAF_BASE=http://localhost:29526/api/v1 EADAF_ADMIN_USER=admin EADAF_ADMIN_PASSWORD=123456 \
 *     node scripts/verify-sales-tools-materialized.js
 */
const fs = require('fs');
const path = require('path');

const BASE = (process.env.EADAF_BASE || 'http://localhost:29526/api/v1').replace(/\/+$/, '');
const ORIGIN = BASE.replace(/\/api\/v1$/, '');
const ADMIN_USER = process.env.EADAF_ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.EADAF_ADMIN_PASSWORD || '123456';
const APP = process.env.EADAF_APP_ID || '1e71c653-630f-4006-b6df-081172b15752';

let pass = 0;
let fail = 0;

const ok = (label, detail = '') => {
  pass += 1;
  console.log(`  ✅ ${label}${detail ? `  ${detail}` : ''}`);
};
const bad = (label, detail = '') => {
  fail += 1;
  console.log(`  ❌ ${label}${detail ? `  ${detail}` : ''}`);
};
const assertEqual = (label, actual, expected) => {
  if (String(actual) === String(expected)) ok(label, `${actual}`);
  else bad(label, `工具=${actual} 页面=${expected}`);
};

async function callTool(token, functionName, args = {}) {
  const res = await fetch(`${BASE}/ai/tools/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ functionName, arguments: args }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.data?.ok === false) {
    throw new Error(`${functionName} 调用失败：HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.data?.data ?? json.data;
}

async function callDataApi(token, tablePath, query = '') {
  const res = await fetch(`${BASE}/data/YS/${tablePath}${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code !== 200) {
    throw new Error(`数据 API ${tablePath}${query} 失败：HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.data;
}

(async () => {
  console.log(`== 销售 Demo AI 工具 ↔ 页面数据 API 对齐自检（${BASE}）==\n`);

  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASSWORD, dev: true }),
  });
  const loginJson = await loginRes.json().catch(() => ({}));
  const token = loginJson?.data?.token;
  if (!token) {
    console.error(`登录失败：HTTP ${loginRes.status} ${JSON.stringify(loginJson).slice(0, 200)}`);
    process.exit(1);
  }

  console.log('【1】订单：统计与搜索');
  const ordersPage = await callDataApi(token, 'order/Order', '?limit=1');
  const stats = await callTool(token, 'sales_order_stats_by_status');
  assertEqual('订单总数（工具统计 vs 页面分页总数）', stats.summary.total_orders, ordersPage.pagination.total);

  const detailPageEarly = await callDataApi(token, 'order/Order/one', '?order_no=SO202501001');
  const pageOrderMemberId = detailPageEarly.item?.member_id || detailPageEarly.items?.[0]?.member_id;

  const shippedPage = await callDataApi(token, 'order/Order', '?limit=1&status=shipped');
  const shippedTool = await callTool(token, 'sales_search_orders', { status: 'shipped', pageSize: 1 });
  assertEqual('shipped 订单数（工具搜索 vs 页面筛选）', shippedTool.total, shippedPage.pagination.total);

  // 会员筛选：工具侧按"会员 UUID"（旧的整数 userId 已改）与页面 member_id 对齐
  const memberId = pageOrderMemberId;
  const memberPage = await callDataApi(token, 'order/Order', `?limit=1&member_id=${memberId}`);
  const memberTool = await callTool(token, 'sales_search_orders', { userId: memberId, pageSize: 1 });
  assertEqual('按会员 UUID 搜索（工具 vs 页面）', memberTool.total, memberPage.pagination.total);

  // 关键词搜索是工具侧能力（页面 API 无 keyword 参数）：只做自洽校验
  const keywordTool = await callTool(token, 'sales_search_orders', { keyword: '张伟', pageSize: 50 });
  const keywordRowsOk = (keywordTool.items || []).every(
    (row) => String(row.order_no).includes('张伟') || String(row.user_name || '').includes('张伟'),
  );
  if (keywordTool.total > 0 && keywordRowsOk) ok('关键词搜索（工具侧自洽）', `${keywordTool.total} 笔`);
  else bad('关键词搜索（工具侧自洽）', JSON.stringify(keywordTool).slice(0, 160));

  console.log('\n【2】订单详情：明细与会员');
  const detailPage = detailPageEarly;
  const detailTool = await callTool(token, 'sales_get_order', { orderNo: 'SO202501001' });
  const pageOrder = detailPage.item || detailPage.items?.[0] || detailPage;
  assertEqual('订单 SO202501001 金额', detailTool.order?.total_amount, pageOrder.total_amount);
  assertEqual('订单 SO202501001 会员', detailTool.order?.user_id, pageOrder.member_id);
  if (Array.isArray(detailTool.order?.items) && detailTool.order.items.length > 0) {
    ok('订单 SO202501001 明细返回', `${detailTool.order.items.length} 行`);
  } else {
    bad('订单 SO202501001 明细返回', '工具未返回 items');
  }

  console.log('\n【3】订单趋势（按日）');
  // 种子数据日期固定在 2025 年，窗口要足够宽才覆盖得到（上限 10 年）
  const period = await callTool(token, 'sales_order_stats_by_period', { days: 1000, groupBy: 'month' });
  const periodSum = (period.items || []).reduce((acc, row) => acc + Number(row.order_count), 0);
  assertEqual('趋势各期订单数之和 vs 页面总数', periodSum, ordersPage.pagination.total);

  const emptyPeriod = await callTool(token, 'sales_order_stats_by_period', { days: 1, groupBy: 'day' });
  if (Array.isArray(emptyPeriod.items) && emptyPeriod.items.length === 0 && emptyPeriod.dataRange?.from_date) {
    ok('窗口内无数据时给出数据实际区间', `${emptyPeriod.dataRange.from_date} ~ ${emptyPeriod.dataRange.to_date}`);
  } else {
    bad('窗口内无数据时给出数据实际区间', JSON.stringify(emptyPeriod).slice(0, 160));
  }

  console.log('\n【4】售后工单：列表、详情与统计');
  const complaintsPage = await callDataApi(token, 'service/Complaint', '?limit=1');
  const complaintsTool = await callTool(token, 'sales_list_complaints', { pageSize: 1 });
  assertEqual('工单总数（工具 vs 页面）', complaintsTool.total, complaintsPage.pagination.total);

  const qualityPage = await callDataApi(token, 'service/Complaint', '?limit=1&type=quality');
  const qualityTool = await callTool(token, 'sales_list_complaints', { type: 'quality', pageSize: 1 });
  assertEqual('type=quality 工单数（工具 vs 页面）', qualityTool.total, qualityPage.pagination.total);

  const byType = await callTool(token, 'sales_complaint_stats_by_type');
  const typeSum = (byType.byType || []).reduce((acc, row) => acc + Number(row.complaint_count), 0);
  assertEqual('按类型统计之和 vs 页面总数', typeSum, complaintsPage.pagination.total);

  const byStatus = await callTool(token, 'sales_complaint_stats_by_status');
  const statusSum = (byStatus.byStatus || []).reduce((acc, row) => acc + Number(row.complaint_count), 0);
  assertEqual('按状态统计之和 vs 页面总数', statusSum, complaintsPage.pagination.total);

  const firstComplaintId = complaintsTool.items?.[0]?.id;
  if (firstComplaintId) {
    const detail = await callTool(token, 'sales_get_complaint', { id: firstComplaintId });
    if (detail.found && detail.complaint?.id === firstComplaintId) ok('按投诉 UUID 查详情', firstComplaintId.slice(0, 8) + '…');
    else bad('按投诉 UUID 查详情', JSON.stringify(detail).slice(0, 160));

    const byOrderNo = await callTool(token, 'sales_get_complaint', { id: complaintsTool.items[0].order_no });
    if (byOrderNo.found) ok('按订单号查投诉（容错）', complaintsTool.items[0].order_no);
    else bad('按订单号查投诉（容错）', JSON.stringify(byOrderNo).slice(0, 160));
  } else {
    bad('投诉列表返回可用 id', 'items 为空');
  }

  console.log('\n【5】守卫：不应再有本地 SQLite 演示库');
  const repoRoot = path.resolve(__dirname, '../..');
  const sqlitePath = path.join(repoRoot, 'backend/data/sales-demo.db');
  if (fs.existsSync(sqlitePath)) bad('本地 SQLite 已删除', sqlitePath);
  else ok('本地 SQLite 不存在', sqlitePath.replace(repoRoot + '/', ''));

  const legacyRefs = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|cjs)$/.test(entry.name)) {
        if (full.endsWith('verify-sales-tools-materialized.js')) continue; // 本脚本自身含关键词
        const text = fs.readFileSync(full, 'utf8');
        if (/salesDemoDb|init-sales-demo-db/.test(text)) legacyRefs.push(full.replace(repoRoot + '/', ''));
      }
    }
  };
  walk(path.join(repoRoot, 'backend/src'));
  walk(path.join(repoRoot, 'backend/scripts'));
  if (legacyRefs.length) bad('backend 源码无旧 SQLite 引用', legacyRefs.join(', '));
  else ok('backend 源码无旧 SQLite 引用');

  console.log(`\n结果：通过 ${pass} / 失败 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
  console.error('自检异常：', error.message);
  process.exit(1);
});
