/**
 * cron 中文描述自检（node --import tsx frontend/src/utils/cron.verify.ts）
 *
 * 锁住两件事：
 *   1. 设置页显示的备份周期要能看懂，且语义与后端 node-cron@3 一致
 *      （日 + 周同时限定时是 AND，不是 OR）；
 *   2. 识别不了的表达式必须原样返回，绝不瞎猜。
 */
import assert from 'node:assert/strict';
import { formatCronDescription, formatCronSummary } from './cron';

const cases: Array<[string, string]> = [
  // 默认自动备份
  ['0 3 * * *', '每天 03:00'],
  // 一分钟一次（用户测试常用）
  ['* * * * *', '每分钟'],
  ['*/5 * * * *', '每 5 分钟'],
  // 按小时
  ['0 * * * *', '每小时整点'],
  ['15 * * * *', '每小时第 15 分钟'],
  ['0 */6 * * *', '每 6 小时'],
  ['30 */2 * * *', '每 2 小时（第 30 分）'],
  // 按天/周
  ['0 0 * * 0', '每周日 00:00'],
  ['0 3 * * 7', '每周日 03:00'],
  ['0 3 * * 1-5', '工作日 03:00'],
  ['0 3 * * 0,6', '周末 03:00'],
  ['0 3 * * 1,3,5', '每周一、周三、周五 03:00'],
  ['0 3 * * 0-6', '每天 03:00'],
  // 按月/年
  ['30 2 1 * *', '每月 1 日 02:30'],
  ['0 3 1,15 * *', '每月 1、15 日 03:00'],
  ['0 3 1-7 * *', '每月 1–7 日 03:00'],
  ['0 3 */2 * *', '每 2 天 03:00'],
  ['0 3 1 6 *', '每年 6 月 1 日 03:00'],
  ['0 3 * 3 *', '每年 3 月每天 03:00'],
  // 日 + 周同时限定：node-cron 是 AND 语义
  ['16 1 1 * 1', '每月 1 日且当天是周一 01:16'],
  ['0 3 1 * 1,3', '每月 1 日且当天是周一、周三 03:00'],
  // 识别不了的一律原样返回（不猜）
  ['0,30 3 * * *', '0,30 3 * * *'],
  ['*/30 * * * * *', '*/30 * * * * *'],
  ['0 3 * * MON', '0 3 * * MON'],
  ['', ''],
  ['  0   3  *  *  * ', '每天 03:00'],
];

for (const [expression, expected] of cases) {
  assert.equal(formatCronDescription(expression), expected, `cron「${expression}」描述不符`);
}

// 页面展示：可读描述 + 原始表达式；识别不了时不重复
const summaryCases: Array<[string, string]> = [
  ['* * * * *', '每分钟（* * * * *）'],
  ['0 3 * * *', '每天 03:00（0 3 * * *）'],
  ['16 1 1 * 1', '每月 1 日且当天是周一 01:16（16 1 1 * 1）'],
  ['*/30 * * * * *', '*/30 * * * * *'],
  ['', ''],
];

for (const [expression, expected] of summaryCases) {
  assert.equal(formatCronSummary(expression), expected, `cron「${expression}」展示文案不符`);
}

console.log(`cron 中文描述自检通过：描述 ${cases.length} 条、展示 ${summaryCases.length} 条`);
