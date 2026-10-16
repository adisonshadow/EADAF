/**
 * 导出/导入包格式字段的**命名兼容**。
 *
 * 历史包里这些字段叫 `uac` / `uacUsers` / `uacPermissions` / `includeUac`，
 * 现统一为 `eadaf` / `eadafUsers` / `eadafPermissions` / `includeEadaf`。
 *
 * 约定：**写只用新名**（新导出的包不再出现旧字段），**读同时接受旧名**（老包照样能导入）。
 * 迁移期建议同版本导/入；跨版本共享包时以新版本为准。
 */

/** 依次取第一个存在且非 undefined 的键 */
function pick(source, ...keys) {
  if (!source || typeof source !== 'object') return undefined;
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
}

/** 由新字段名推出旧字段名：eadaf → uac、eadafUsers → uacUsers */
function legacyKeyOf(key) {
  return key.startsWith('eadaf') ? `uac${key.slice('eadaf'.length)}` : `uac${key}`;
}

/** 读取布尔选项：includeEadaf（新）→ includeUac（旧） */
function readIncludeEadaf(options) {
  return pick(options, 'includeEadaf', 'includeUac') === true;
}

/** 读取包内分节：eadaf* → uac*（旧包） */
function readSection(file, key) {
  return pick(file, key, legacyKeyOf(key));
}

/** 分节名的新旧对应（供结果/预览里的字段名统一） */
const SECTION_ALIASES = {
  eadaf: ['eadaf', 'uac'],
  eadafUsers: ['eadafUsers', 'uacUsers'],
  eadafPermissions: ['eadafPermissions', 'uacPermissions'],
};

module.exports = {
  pick,
  legacyKeyOf,
  readIncludeEadaf,
  readSection,
  SECTION_ALIASES,
};
