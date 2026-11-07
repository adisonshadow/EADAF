'use strict';

const fs = require('fs');
const path = require('path');

const GUIDES_DIR = path.resolve(__dirname, '../../../../docs/pack-guides');
const CATALOG_FILE = path.join(GUIDES_DIR, 'catalog.json');
const FILE_NAME = /^[A-Za-z0-9._-]+\.md$/;

function notFound(message) {
  return Object.assign(new Error(message), { status: 404 });
}

function readCatalog() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
  return catalog && typeof catalog === 'object' ? catalog : {};
}

/**
 * 按 target + kind 读取使用说明正文。只接受 catalog.json 里登记的文件名，不接受路径。
 * @param {string} target platform | app
 * @param {string} kind install | upgrade | patch
 */
function readGuide(target, kind) {
  const group = readCatalog()[target];
  const file = group && group[kind];
  if (typeof file !== 'string' || !FILE_NAME.test(file)) {
    throw notFound('没有对应的使用说明');
  }
  const full = path.resolve(GUIDES_DIR, file);
  if (full !== path.join(GUIDES_DIR, file)) throw notFound('没有对应的使用说明');
  if (!fs.existsSync(full)) throw notFound('使用说明文件不存在');
  return {
    target,
    kind,
    markdown: fs.readFileSync(full, 'utf8'),
  };
}

module.exports = { readGuide };
