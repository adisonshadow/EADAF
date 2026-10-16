const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

const DepartmentRole = sequelize.define('DepartmentRole', {
  department_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    allowNull: false
  },
  role_id: {
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
  tableName: 'department_roles',
  schema: SCHEMA,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = DepartmentRole;
