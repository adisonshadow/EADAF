const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

const Department = sequelize.define('Department', {
  department_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
    comment: '部门ID'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'name',
    comment: '部门名称'
  },
  parent_id: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_id',
    comment: '父部门ID'
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'ACTIVE',
    field: 'status',
    comment: '部门状态'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'description',
    comment: '部门描述'
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
  tableName: 'departments',
  schema: SCHEMA,
  timestamps: true,
  underscored: true,
  paranoid: true,
  deletedAt: 'deleted_at',
  indexes: [
    {
      fields: ['deleted_at']
    }
  ]
});

// 添加实例方法
Department.prototype.softDelete = async function() {
  this.deleted_at = new Date();
  return this.save();
};

Department.prototype.restore = async function() {
  this.deleted_at = null;
  return this.save();
};

// 自引用关系
Department.hasMany(Department, {
  as: 'children',
  foreignKey: 'parent_id'
});

Department.belongsTo(Department, {
  as: 'parent',
  foreignKey: 'parent_id'
});

module.exports = Department; 