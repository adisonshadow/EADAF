const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

class StorageUploadSession extends Model {}

StorageUploadSession.init({
  upload_id: {
    type: DataTypes.STRING(128),
    primaryKey: true,
  },
  bucket_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  filename: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  mime_type: {
    type: DataTypes.STRING(128),
    allowNull: true,
  },
  upload_length: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
  },
  offset_bytes: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
  },
  status: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'uploading',
    validate: {
      isIn: [[
        'uploading',
        'pending_finalize',
        'finalizing',
        'completed',
        'duplicate',
        'expired',
        'failed',
      ]],
    },
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  content_md5: {
    type: DataTypes.STRING(32),
    allowNull: true,
  },
  expected_md5: {
    type: DataTypes.STRING(32),
    allowNull: true,
  },
  object_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  relative_path: {
    type: DataTypes.STRING(512),
    allowNull: true,
  },
  uploaded_ranges: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  },
  error_message: {
    type: DataTypes.TEXT,
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
  owner_kind: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'user',
    validate: { isIn: [['user', 'application']] },
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
  modelName: 'StorageUploadSession',
  tableName: 'storage_upload_sessions',
  schema: SCHEMA,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = StorageUploadSession;
