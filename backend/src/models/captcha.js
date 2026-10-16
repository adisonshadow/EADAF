const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SCHEMA = require('./schemaName');

const Captcha = sequelize.define('Captcha', {
  captcha_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  bg_url: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  puzzle_url: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  target_x: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  target_y: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'USED', 'EXPIRED'),
    defaultValue: 'ACTIVE'
  },
  verified_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'captchas',
  schema: SCHEMA,
  timestamps: false
});

module.exports = Captcha; 