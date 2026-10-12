'use strict';

/**
 * backend/scripts/diagnose-storage-orphans.js
 *
 * 对照 storage_objects.relative_path 与 MinIO 里的实际对象，找出：
 *   1) DB 有记录但对象存储里没有二进制 —— 图片接口 404「原图文件不存在」的直接原因
 *   2) 对象存储里有文件但 DB 没有记录 —— 导入/卸载失败留下的孤儿
 *
 * 为什么要看这个：应用导入包在「未勾选携带存储文件」时仍会带上 storage_objects
 * 记录，但不带 files/ 二进制。导入端会把记录写进去，图片地址因此指向不存在的对象，
 * crop 接口就会返回 404。这个脚本就是你验证某个实例有没有这个问题的尺子。
 *
 * 用法（在 backend 目录或仓库根都能跑）：
 *   node backend/scripts/diagnose-storage-orphans.js           # 只统计
 *   node backend/scripts/diagnose-storage-orphans.js --list    # 列出明细
 *
 * 退出码：0 = 全部命中；2 = 存在缺二进制的记录；1 = 执行出错。
 */

const path = require('path');

process.chdir(path.join(__dirname, '..'));

const models = require('../src/models');
const objectStore = require('../src/services/storage/objectStore');

const LIST = process.argv.includes('--list');

async function main() {
  const keys = new Set(await objectStore.listByPrefix(''));

  const objects = await models.StorageObject.findAll({ raw: true });
  const buckets = await models.StorageBucket.findAll({ raw: true });
  const codeOf = new Map(buckets.map((b) => [b.bucket_id, b.code]));

  const missing = [];
  const perBucket = new Map();
  for (const o of objects) {
    const rel = String(o.relative_path || '').replace(/\\/g, '/');
    const code = codeOf.get(o.bucket_id) || '(未知桶)';
    const stat = perBucket.get(code) || { total: 0, have: 0, miss: 0 };
    stat.total += 1;
    if (rel && keys.has(rel)) {
      stat.have += 1;
    } else {
      stat.miss += 1;
      missing.push({ ...o, rel, bucketCode: code });
    }
    perBucket.set(code, stat);
  }

  const referenced = new Set(objects.map((o) => String(o.relative_path || '').replace(/\\/g, '/')));
  const orphans = [...keys].filter((k) => !referenced.has(k) && !k.startsWith('img-crop-cache/'));

  const rows = [...perBucket.entries()].sort((a, b) => b[1].miss - a[1].miss);
  console.log('');
  console.log('桶                  记录   有文件   缺文件');
  console.log('------------------------------------------------');
  for (const [code, s] of rows) {
    console.log(
      `${code.padEnd(18)}${String(s.total).padStart(6)}${String(s.have).padStart(8)}${String(s.miss).padStart(8)}`,
    );
  }
  console.log('------------------------------------------------');
  console.log(`DB 对象记录合计      : ${objects.length}`);
  console.log(`MinIO 实际对象       : ${keys.size}`);
  console.log(`缺二进制（会 404）   : ${missing.length}`);
  console.log(`MinIO 孤儿（无记录） : ${orphans.length}`);

  if (missing.length === 0 && orphans.length === 0) {
    console.log('\n✅ 数据库记录与对象存储一致。');
  }

  if (LIST) {
    if (missing.length) {
      console.log('\n--- 缺二进制（这些对象 ID 的图片会 404）---');
      for (const o of missing) {
        console.log(`  ${o.object_id}  [${o.bucketCode}]  rel=${o.rel || '<空>'}  name=${o.name || ''}`);
      }
    }
    if (orphans.length) {
      console.log('\n--- MinIO 孤儿（无 DB 记录）---');
      for (const k of orphans) console.log(`  ${k}`);
    }
  }

  if (missing.length) {
    console.log(
      '\n提示：这些记录是导入/迁移时"只带了元数据没带二进制"留下的。'
      + '\n      重新导入时请在导出侧勾选「携带存储文件」，或从源实例补齐对象存储。',
    );
  }

  process.exitCode = missing.length ? 2 : 0;
}

main().catch((err) => {
  console.error('诊断失败:', (err && err.message) || err);
  process.exitCode = 1;
});
