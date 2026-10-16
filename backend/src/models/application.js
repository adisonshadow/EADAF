const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

class Application extends Model {}

Application.init({
  application_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    comment: '应用ID'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '应用全称'
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: '缩写简称'
  },
  logo_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '应用 Logo URL'
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'ACTIVE',
    validate: {
      isIn: [['ACTIVE', 'DISABLED']]
    },
    comment: '应用状态'
  },
  sso_enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '是否启用SSO'
  },
  sso_config: {
    type: DataTypes.JSONB,
    comment: 'SSO配置信息'
  },
  api_enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '是否启用API服务'
  },
  api_connect_config: {
    type: DataTypes.JSONB,
    comment: 'API连接配置'
  },
  api_data_scope: {
    type: DataTypes.JSONB,
    comment: 'API数据权限范围'
  },
  builtin_api_scope: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: { permissionCodes: [] },
    comment: '可访问内置API：{permissionCodes:["user:account:list",...]}'
  },
  outbound_webhook_scope: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: { domainCodes: [], webhookCodes: [] },
    comment: '可关联的提交外部API：{domainCodes:[], webhookCodes:[]}'
  },
  bizdata_scope_codes: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
    comment: '业务数据 Scope 编码列表'
  },
  description: {
    type: DataTypes.TEXT,
    comment: '应用描述'
  },
  top_level_skill_markdown: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '应用顶层 Skill 说明（可选，描述本应用 Skill/Tool 用法）'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: '创建时间'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: '更新时间'
  },
  deleted_at: {
    type: DataTypes.DATE,
    comment: '删除时间'
  }
}, {
  sequelize,
  modelName: 'Application',
  tableName: 'applications',
  schema: SCHEMA,
  timestamps: true,
  paranoid: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at'
});

module.exports = Application; 