const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

const DataPermissionRule = sequelize.define('DataPermissionRule', {
  rule_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  role_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  resource_type: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  conditions: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'ACTIVE'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'data_permission_rules',
  schema: SCHEMA,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  paranoid: true,
  deletedAt: 'deleted_at'
});

module.exports = DataPermissionRule; 