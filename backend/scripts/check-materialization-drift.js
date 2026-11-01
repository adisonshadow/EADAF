#!/usr/bin/env node
/**
 * 物化漂移巡检：实体模型字段（bizdata.entity_fields）vs 物化表实际列（information_schema）。
 *
 * 用法：
 *   node scripts/check-materialization-drift.js            # 全部实体
 *   node scripts/check-materialization-drift.js fmms:      # 只查某个前缀
 *
 * 退出码：0 无漂移 / 1 有漂移 / 2 执行失败（可直接挂到 CI 或发布前检查）。
 *
 * 为什么需要：模型里加了字段但没重新物化，接口就会报
 * `column "xxx" of relation "yyy" does not exist`，而预览 SQL 用的是
 * `ADD COLUMN IF NOT EXISTS`，看不出缺哪列。
 */
const sequelize = require('../src/config/database');

const META_SCHEMA = process.env.EADAF_META_SCHEMA || 'bizdata';
const MAT_SCHEMA = process.env.EADAF_MAT_SCHEMA || 'bizdata_mat';
const prefix = process.argv[2] || '';

async function main() {
  const [rows] = await sequelize.query(
    `SELECT e.code AS entity_code,
            e.table_name,
            f.field_key,
            (c.column_name IS NOT NULL) AS column_exists
       FROM "${META_SCHEMA}".entities e
       JOIN "${META_SCHEMA}".entity_fields f ON f.entity_id = e.id
       LEFT JOIN information_schema.columns c
              ON c.table_schema = :matSchema
             AND c.table_name = e.table_name
             AND c.column_name = f.field_key
      WHERE e.code LIKE :pattern
      ORDER BY e.code, f.sort_order`,
    { replacements: { matSchema: MAT_SCHEMA, pattern: `${prefix}%` } },
  );

  if (rows.length === 0) {
    console.log(`没有匹配 "${prefix}*" 的实体（检查 META_SCHEMA / 前缀）`);
    return 0;
  }

  const byEntity = new Map();
  for (const r of rows) {
    if (!byEntity.has(r.entity_code)) {
      byEntity.set(r.entity_code, { table: r.table_name, missing: [] });
    }
    if (!r.column_exists) byEntity.get(r.entity_code).missing.push(r.field_key);
  }

  let drift = 0;
  for (const [code, info] of [...byEntity.entries()].sort()) {
    if (info.missing.length === 0) continue;
    drift += 1;
    console.log(`⚠️  ${code}  (${info.table})  缺列: ${info.missing.join(', ')}`);
  }

  if (drift === 0) {
    console.log(`✅ 无漂移，检查了 ${byEntity.size} 个实体`);
  } else {
    console.log(`\n❌ ${drift}/${byEntity.size} 个实体存在模型与表不一致，需重新物化`);
  }
  return drift > 0 ? 1 : 0;
}

main()
  .then(async (code) => {
    await sequelize.close();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error('巡检失败:', e.message);
    try {
      await sequelize.close();
    } catch {
      /* ignore */
    }
    process.exit(2);
  });
