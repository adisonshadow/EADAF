const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

const User = sequelize.define('User', {
  user_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
    comment: '用户ID'
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'username',
    comment: '用户名'
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'password_hash',
    comment: '密码哈希'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'name',
    comment: '用户姓名'
  },
  avatar: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'avatar',
    comment: '用户头像URL'
  },
  gender: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'gender',
    comment: '用户性别：MALE-男, FEMALE-女, OTHER-其他'
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'email',
    comment: '用户邮箱'
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'phone',
    comment: '用户电话'
  },
  department_id: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'department_id',
    comment: '部门ID'
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'ACTIVE',
    field: 'status',
    comment: '用户状态：ACTIVE-启用, DISABLED-停用, ARCHIVED-离职归档'
  },
  last_password_updated: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'last_password_updated',
    comment: '最后密码更新时间'
  },
  must_change_password: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'must_change_password',
    comment: '是否须修改默认密码'
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
  tableName: 'users',
  schema: SCHEMA,
  timestamps: true,
  underscored: true,
  paranoid: true,
  deletedAt: 'deleted_at',
  scopes: {
    active: {
      where: {
        deleted_at: null,
        status: 'ACTIVE'
      }
    }
  },
  indexes: [
    {
      unique: true,
      fields: ['username']
    },
    {
      fields: ['email']
    },
    {
      fields: ['department_id']
    },
    {
      fields: ['deleted_at']
    }
  ]
});

// 添加实例方法
User.prototype.verifyPassword = async function(password) {
  return bcrypt.compare(password, this.password_hash);
};

User.prototype.softDelete = async function() {
  await this.update({
    status: 'ARCHIVED'
  });
  await this.destroy();
  return this;
};

// 添加静态方法
User.restore = async function(instance) {
  if (!instance) {
    throw new Error('Instance is required');
  }
  await instance.restore();
  await instance.update({
    status: 'ACTIVE'
  });
  await instance.reload();
  return instance;
};

module.exports = User; 