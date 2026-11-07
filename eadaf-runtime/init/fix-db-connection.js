/**
 * 修正物化连接指向 Docker 内 Postgres，并写入加密密码。
 * 在 eadaf-api 容器内执行（WORKDIR=/app/backend）。
 */
const path = require('path');
const { Client } = require('pg');

const backendRoot = '/app/backend';
process.chdir(backendRoot);
require('dotenv').config({ path: path.join(backendRoot, '.env.production') });

const { encryptApiKey } = require(path.join(backendRoot, 'src/utils/encryption'));

async function main() {
  // 打包时从「本地 PostgreSQL（应用库）」写入。没有这组变量时才退回平台库自己的地址。
  const host = process.env.BIZDATA_CONN_HOST || process.env.POSTGRES_HOST || 'postgres';
  const port = Number(process.env.BIZDATA_CONN_PORT || process.env.POSTGRES_PORT || 5432);
  const database = process.env.BIZDATA_CONN_DATABASE || process.env.POSTGRES_DATABASE || 'eadaf_db';
  const user = process.env.BIZDATA_CONN_USER || process.env.POSTGRES_USER || 'my_name';
  const password = process.env.BIZDATA_CONN_PASSWORD || process.env.POSTGRES_PASSWORD || '123456';
  const targetSchema = process.env.BIZDATA_CONN_SCHEMA || 'bizdata_mat';
  const connectionId = process.env.FPCU2_DB_CONNECTION_ID || 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const client = new Client({ host, port, database, user, password });
  await client.connect();

  const passwordEnc = password ? encryptApiKey(password) : null;

  await client.query(
    `UPDATE bizdata.database_connections
     SET host = $1,
         port = $2,
         username = $3,
         password_enc = $4,
         database_name = $5,
         target_schema = $6,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $7`,
    [host, port, user, passwordEnc, database, targetSchema, connectionId],
  );

  await client.end();
  console.log('[init] 默认业务库连接已指向', `${host}:${port}/${database} schema=${targetSchema}`);
}

main().catch((err) => {
  console.error('[init] fix-db-connection 失败:', err);
  process.exit(1);
});
