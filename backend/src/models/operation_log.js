const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

const OperationLog = sequelize.define('OperationLog', {
  log_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  operator_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  operator_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  operator_type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'USER'
  },
  application_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  operation_type: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  resource_type: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  resource_id: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  resource_name: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  domain: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  old_data: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  new_data: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'SUCCESS'
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  ip: {
    type: DataTypes.STRING(45),
    allowNull: true
  },
  user_agent: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  trace_id: {
    type: DataTypes.STRING(64),
    allowNull: true
  },
  duration_ms: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  request_summary: {
    type: DataTypes.JSONB,
    allowNull: true
  },
    operator_three_member_role: {
      type: DataTypes.STRING(32),
      allowNull: true,
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
  tableName: 'operation_logs',
  schema: SCHEMA,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = OperationLog;
