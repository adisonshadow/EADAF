const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

const Role = sequelize.define('Role', {
  role_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    comment: '角色ID'
  },
  role_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'role_name',
    comment: '角色名称'
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'code',
    comment: '角色编码'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'description',
    comment: '角色描述'
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'ACTIVE',
    field: 'status',
    comment: '角色状态：ACTIVE-启用, DISABLED-停用, ARCHIVED-归档'
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
  },
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'deleted_at',
    comment: '删除时间'
  }
}, {
  tableName: 'roles',
  schema: SCHEMA,
  timestamps: true,
  underscored: true,
  paranoid: true,
  deletedAt: 'deleted_at',
  indexes: [
    {
      fields: ['deleted_at']
    },
    {
      fields: ['status']
    },
    {
      unique: true,
      fields: ['code']
    }
  ]
});

// 添加实例方法
Role.prototype.softDelete = async function() {
  return this.destroy();
};

Role.prototype.restore = async function() {
  return this.restore();
};

module.exports = Role; 