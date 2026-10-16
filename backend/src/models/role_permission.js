const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

const RolePermission = sequelize.define('RolePermission', {
  role_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    allowNull: false
  },
  permission_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    allowNull: false
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'role_permissions',
  schema: SCHEMA,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = RolePermission; 