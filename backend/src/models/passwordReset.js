const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

const PasswordReset = sequelize.define('PasswordReset', {
  reset_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    comment: '重置记录ID'
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    },
    comment: '用户ID'
  },
  token: {
    type: DataTypes.STRING(8),
    allowNull: false,
    comment: '重置令牌（8位）'
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '过期时间'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'USED', 'EXPIRED'),
    defaultValue: 'PENDING',
    comment: '状态：PENDING-待使用, USED-已使用, EXPIRED-已过期'
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
  }
}, {
  tableName: 'password_resets',
  schema: SCHEMA,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['token']
    },
    {
      fields: ['status']
    },
    {
      fields: ['expires_at']
    }
  ]
});

module.exports = PasswordReset; 