const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Provider = sequelize.define('Provider', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  slug: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  base_url: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  api_key_encrypted: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  /** database=密钥加密进库；browser=不入库，由浏览器在调用时附带 */
  api_key_storage: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'database'
  },
  adapter_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'openai_compatible'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
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
  tableName: 'providers',
  schema: 'aibase',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true
});

module.exports = Provider;
