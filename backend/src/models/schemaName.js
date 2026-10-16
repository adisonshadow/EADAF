/**
 * 模型默认 schema 名（表都建在 `POSTGRES_SCHEMA` 指定的 schema 下，默认 `eadaf`）。
 *
 * 单独抽出来，避免在 21 个模型里各写一遍字面量 —— 也让 `POSTGRES_SCHEMA` 真正生效
 * （此前模型硬编码 `'uac'`，改环境变量并不会改模型的 schema）。
 */
const config = require('../config');

module.exports = config.postgresql.schema;
