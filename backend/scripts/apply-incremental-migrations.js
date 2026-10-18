#!/usr/bin/env node
'use strict';

/**
 * 已有库的结构升级：只跑幂等增量迁移，不清库、不动业务数据。
 *
 * 用法：pnpm db:migrate（= node scripts/apply-incremental-migrations.js），可重复执行。
 *
 * 为什么是 Node 而不是 shell 脚本：
 *   - `init-db` 用 psql + bash，对全新库没问题；但升级一台已装好、只是代码变新的机器时，
 *     用户机器上不一定有 psql / bash（Windows 特别典型），要人先装工具链就已经输了；
 *   - 后端本身就依赖 pg，这里直接复用同一份 env 与连接，不需要使用者准备任何额外工具。
 *
 * 与 `scripts/initdb.sh` 共用同一份清单（scripts/incremental-migrations.txt），
 * 保证「全新库」和「升级已有库」跑的是同一组迁移，不会各漂各的。
 *
 * 缺列这一层另有启动自愈兜底（src/utils/schemaAlignment.js）；本脚本负责范围更大的
 * 缺表 / 缺索引 / 幂等种子（权限、Skill/Tool upsert）。
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const config = require('../src/config');

const SCRIPT_DIR = __dirname;
const LIST_FILE = path.join(SCRIPT_DIR, 'incremental-migrations.txt');

function readMigrationList() {
  return fs
    .readFileSync(LIST_FILE, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

async function main() {
  const migrations = readMigrationList();
  const { host, port, database, user, password, schema } = config.postgresql;

  const client = new Client({ host, port, database, user, password });
  await client.connect();

  const failures = [];
  try {
    const { rows } = await client.query(
      'select 1 as ok from pg_namespace where nspname = $1',
      [schema],
    );
    if (!rows.length) {
      console.error(`schema ${schema} 不存在：这是全新库，请先执行 pnpm init-db`);
      process.exitCode = 1;
      return;
    }

    console.log(`连接 ${host}:${port}/${database}，应用 ${migrations.length} 个增量迁移（不清库、可重复执行）`);

    for (const file of migrations) {
      const filePath = path.join(SCRIPT_DIR, file);
      if (!fs.existsSync(filePath)) {
        failures.push({ file, error: '找不到文件' });
        console.log(`  ✗ ${file}（找不到文件）`);
        continue;
      }
      // 单个文件整体提交一次：这些迁移自身就是幂等的，失败不牵连其它文件
      try {
        await client.query(fs.readFileSync(filePath, 'utf8'));
        console.log(`  ✓ ${file}`);
      } catch (error) {
        failures.push({ file, error: error.message });
        console.log(`  ✗ ${file}（${error.message}）`);
      }
    }

    if (failures.length) {
      console.error(`\n有 ${failures.length}/${migrations.length} 个迁移失败（其它已应用，可修好后重跑）：`);
      failures.forEach((item) => console.error(`  - ${item.file}: ${item.error}`));
      process.exitCode = 1;
      return;
    }

    console.log('增量迁移完成：数据未重建；重启后端会自动补齐模型新增的列');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`迁移执行失败：${error.message}`);
  process.exitCode = 1;
});
