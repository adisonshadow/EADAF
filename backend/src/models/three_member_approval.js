const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

class ThreeMemberApproval extends Model {}

ThreeMemberApproval.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  action_type: {
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  summary: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  payload: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
  requester_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  requester_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'pending',
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  reviewer_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  reviewer_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  reviewed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  sequelize,
  modelName: 'ThreeMemberApproval',
  tableName: 'three_member_approvals',
  schema: SCHEMA,
  timestamps: true,
  underscored: true,
});

module.exports = ThreeMemberApproval;
