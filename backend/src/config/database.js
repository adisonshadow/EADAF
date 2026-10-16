const { Sequelize } = require('sequelize');
const config = require('./index');
const { noteDependencyDown, noteDependencyUp } = require('../utils/dependencyDiagnostics');

const sequelize = new Sequelize(
  config.postgresql.database,
  config.postgresql.user,
  config.postgresql.password,
  {
    host: config.postgresql.host,
    port: config.postgresql.port,
    dialect: 'postgres',
    logging: false,
    define: {
      timestamps: true,
      underscored: true,
      schema: config.postgresql.schema
    },
    pool: {
      max: config.postgresql.max_connections,
      min: 0,
      acquire: config.postgresql.connection_timeout,
      idle: config.postgresql.idle_timeout
    }
  }
);

// 连接失败只报一条结论：完整堆栈交给 dependencyDiagnostics 写文件，
// 否则每次启动都会用一段 Sequelize 全栈盖住真正的原因（多半是 Docker 没启动）。
sequelize.authenticate()
  .then(() => {
    noteDependencyUp('postgres');
    console.log(`✅ Successfully connected to database (${config.postgresql.host}:${config.postgresql.port}/${config.postgresql.database})`);
  })
  .catch(err => {
    noteDependencyDown('postgres', err, { context: '数据库连接失败' });
  });

module.exports = sequelize;
