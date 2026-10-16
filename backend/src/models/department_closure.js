const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

const DepartmentClosure = sequelize.define('DepartmentClosure', {
  ancestor_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    allowNull: false
  },
  descendant_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    allowNull: false
  },
  depth: {
    type: DataTypes.INTEGER,
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
  tableName: 'department_closure',
  schema: SCHEMA,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = DepartmentClosure; 