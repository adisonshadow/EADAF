const { DataTypes } = require('sequelize');
const _sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

const RefreshToken = (sequelize) => {
  const model = sequelize.define('RefreshToken', {
    token_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      comment: '令牌ID'
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
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'token',
      comment: '刷新令牌'
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
      comment: '令牌过期时间'
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'ACTIVE',
      field: 'status',
      comment: '令牌状态：ACTIVE-有效, REVOKED-已撤销, EXPIRED-已过期'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
      comment: '创建时间'
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
      comment: '更新时间'
    }
  }, {
    modelName: 'RefreshToken',
    tableName: 'refresh_tokens',
    schema: SCHEMA,
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['token']
      },
      {
        fields: ['status']
      }
    ]
  });

  return model;
};

module.exports = RefreshToken; 