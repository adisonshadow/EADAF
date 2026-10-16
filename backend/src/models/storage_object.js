const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

class StorageObject extends Model {}

StorageObject.init({
  object_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  bucket_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  mime_type: {
    type: DataTypes.STRING(128),
    allowNull: true,
  },
  size: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
  },
  relative_path: {
    type: DataTypes.STRING(512),
    allowNull: false,
  },
  content_md5: {
    type: DataTypes.STRING(32),
    allowNull: true,
  },
  application_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true,
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
  modelName: 'StorageObject',
  tableName: 'storage_objects',
  schema: SCHEMA,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = StorageObject;
