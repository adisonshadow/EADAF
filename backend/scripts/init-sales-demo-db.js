const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const projectRoot = path.resolve(__dirname, '..');
const defaultSqlPath = path.resolve(projectRoot, '../app_example/scripts/sales-demo-db.sql');
const defaultDbPath = path.resolve(projectRoot, 'data/sales-demo.db');

function resolveSqlPath() {
  if (process.env.SALES_DEMO_SQL_PATH) {
    return path.resolve(process.env.SALES_DEMO_SQL_PATH);
  }
  return defaultSqlPath;
}

function resolveDbPath() {
  if (process.env.SALES_DEMO_DB_PATH) {
    return path.isAbsolute(process.env.SALES_DEMO_DB_PATH)
      ? process.env.SALES_DEMO_DB_PATH
      : path.resolve(projectRoot, process.env.SALES_DEMO_DB_PATH);
  }
  return defaultDbPath;
}

function initSalesDemoDb() {
  const sqlPath = resolveSqlPath();
  const dbPath = resolveDbPath();

  if (!fs.existsSync(sqlPath)) {
    throw new Error(`找不到 SQL 文件: ${sqlPath}`);
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');
  const db = new DatabaseSync(dbPath);
  db.exec(sql);
  db.close();

  console.log(`销售 Demo SQLite 已生成: ${dbPath}`);
  console.log(`SQL 来源: ${sqlPath}`);
}

if (require.main === module) {
  initSalesDemoDb();
}

module.exports = { initSalesDemoDb, resolveSqlPath, resolveDbPath };
