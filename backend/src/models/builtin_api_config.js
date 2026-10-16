const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

/**
 * 内置 API 限制配置
 *
 * code 对应 builtinApi/catalog.js 中的清单 code（业务域:资源[:动作]）。
 * access_restriction 形如 { mode: 'role'|'department', roleIds: [], departmentIds: [] }，
 * 与 ApiService 的访问限制一致；内置 API 无 "none"（必须配置角色或组织限制）。
 */
const BuiltinApiConfig = sequelize.define('BuiltinApiConfig', {
  code: {
    type: DataTypes.STRING(100),
    primaryKey: true,
    allowNull: false,
    comment: '内置 API 清单 code（业务域:资源[:动作]）',
  },
  access_restriction: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: '访问限制 {mode, roleIds, departmentIds}',
  },
}, {
  tableName: 'builtin_api_configs',
  schema: SCHEMA,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
});

module.exports = BuiltinApiConfig;
