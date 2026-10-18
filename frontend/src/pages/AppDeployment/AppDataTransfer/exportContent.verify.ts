/**
 * 应用数据导出「内容清单」回归验证
 * （node --import tsx src/pages/AppDeployment/AppDataTransfer/exportContent.verify.ts）
 *
 * 覆盖：默认选项下哪些项被判为「不包含」、两个开关逐项恢复、
 * 「仅数据」不改包含关系只加指纹说明，以及清单键唯一/文案非空。
 */
import assert from 'node:assert/strict';
import {
  EXPORT_CONTENT_GROUPS,
  describeSafeMode,
  resolveExportContent,
  type ExportSelectionState,
} from './exportContent';

const base: ExportSelectionState = {
  dataMode: 'structure_and_data',
  includeEadaf: false,
  includeFiles: false,
};

function itemsOf(state: ExportSelectionState) {
  return new Map(
    resolveExportContent(state)
      .groups.flatMap((group) => group.items)
      .map((item) => [item.key, item] as const),
  );
}

// 1. 默认选项：存储对象文件、用户 / 部门 / 授权数据不包含，其余全部包含
const defaults = resolveExportContent(base);
const defaultsByKey = itemsOf(base);
assert.equal(
  defaults.total,
  EXPORT_CONTENT_GROUPS.reduce((sum, group) => sum + group.items.length, 0),
);
assert.equal(defaults.excludedCount, 2);
assert.equal(defaults.includedCount, defaults.total - 2);
assert.equal(defaultsByKey.get('storageObjects')?.included, false);
assert.equal(
  defaultsByKey.get('storageObjects')?.excludedHint,
  '未勾选「携带存储文件」',
);
assert.equal(defaultsByKey.get('eadafUsers')?.included, false);
assert.equal(
  defaultsByKey.get('eadafUsers')?.excludedHint,
  '未勾选「携带 EADAF 数据」',
);
assert.equal(defaultsByKey.get('eadafReferences')?.included, true);
assert.equal(defaultsByKey.get('application')?.included, true);
assert.equal(defaultsByKey.get('entities')?.note, null);

// 2. 勾选「携带 EADAF 数据」：用户数据恢复，角色 / 权限从「被引用」扩为全量
const withEadaf = itemsOf({ ...base, includeEadaf: true });
assert.equal(withEadaf.get('eadafUsers')?.included, true);
assert.equal(withEadaf.get('eadafUsers')?.excludedHint, null);
assert.equal(withEadaf.get('eadafReferences')?.included, true);
assert.match(String(withEadaf.get('eadafReferences')?.note), /全量/);
assert.equal(withEadaf.get('storageObjects')?.included, false);

// 2.1 未勾选时「被引用的角色与权限」不带全量提示
assert.equal(itemsOf(base).get('eadafReferences')?.note, null);

// 3. 勾选「携带存储文件」：只有对象文件恢复
const withFiles = itemsOf({ ...base, includeFiles: true });
assert.equal(withFiles.get('storageObjects')?.included, true);
assert.equal(withFiles.get('storageObjects')?.excludedHint, null);
assert.equal(withFiles.get('eadafUsers')?.included, false);

// 4. 两项都勾选：清单里没有任何删除线
const all = resolveExportContent({
  ...base,
  includeEadaf: true,
  includeFiles: true,
});
assert.equal(all.excludedCount, 0);
assert.equal(all.includedCount, all.total);

// 5. 「仅数据」不改变包含项：结构仍随包（只作版本指纹），用 note 说明
const dataOnly = resolveExportContent({ ...base, dataMode: 'data_only' });
const dataOnlyEntities = dataOnly.groups
  .flatMap((group) => group.items)
  .find((item) => item.key === 'entities');
assert.ok(dataOnlyEntities);
assert.equal(dataOnlyEntities?.included, true);
assert.match(String(dataOnlyEntities?.note), /指纹/);
assert.equal(dataOnly.excludedCount, defaults.excludedCount);

// 6. 键唯一、分组与文案非空、选项键名稳定
const keys = EXPORT_CONTENT_GROUPS.flatMap((group) =>
  group.items.map((item) => item.key),
);
assert.equal(new Set(keys).size, keys.length);
for (const group of EXPORT_CONTENT_GROUPS) {
  assert.ok(group.title.trim().length > 0, group.key);
  assert.ok(group.items.length > 0, group.key);
  for (const item of group.items) {
    assert.ok(item.label.trim().length > 0, item.key);
    assert.ok(item.desc.trim().length > 0, item.key);
  }
}

// 7. 安全模式只写提示文案，随开关变化，且不计入清单
assert.match(describeSafeMode(true), /包内标记为开启/);
assert.match(describeSafeMode(false), /包内标记为关闭/);
assert.ok(!keys.includes('safeMode'));

console.log('exportContent.verify: ok');
