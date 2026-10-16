const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

class StorageBucket extends Model {}

StorageBucket.init({
  bucket_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  code: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
  },
  name: {
    type: DataTypes.STRING(128),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  application_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'ACTIVE',
    validate: { isIn: [['ACTIVE', 'DISABLED']] },
  },
  access_mode: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'authenticated',
    validate: { isIn: [['public', 'authenticated']] },
  },
  access_restrictions: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  sequelize,
  modelName: 'StorageBucket',
  tableName: 'storage_buckets',
  schema: SCHEMA,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = StorageBucket;
