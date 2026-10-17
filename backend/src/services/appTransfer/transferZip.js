/**
 * 应用/平台迁移包:zip 打包与解包。
 * 新包:manifest.json + payload.json + 可选 files/{relative_path}
 * 仍接受旧的单 JSON(formatVersion 1)。
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { pipeline } = require('stream/promises');
const { PassThrough } = require('stream');
const archiver = require('archiver');
const yauzl = require('yauzl');

const PACKAGE_FORMAT_VERSION = 2;
const PAYLOAD_NAME = 'payload.json';
const MANIFEST_NAME = 'manifest.json';
const FILES_DIR_NAME = 'files';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZIP_MAGIC = Buffer.from([0x50, 0x4b]); // PK

function assertSafeRelativePath(rel) {
  const normalized = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) {
    throw Object.assign(new Error('文件路径为空'), { status: 400 });
  }
  const yauzlErr = yauzl.validateFileName(normalized);
  if (yauzlErr) {
    throw Object.assign(new Error(`非法文件路径: ${normalized} (${yauzlErr})`), { status: 400 });
  }
  if (normalized.includes('..') || path.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) {
    throw Object.assign(new Error(`非法文件路径: ${normalized}`), { status: 400 });
  }
  return normalized;
}

function extractStorageObjectId(ref) {
  if (!ref) return null;
  const s = String(ref).trim();
  if (!s) return null;
  if (UUID_RE.test(s)) return s.toLowerCase();
  const fromPath = s.match(/\/api\/v1\/storage\/objects\/([0-9a-f-]{36})/i);
  if (fromPath) return fromPath[1].toLowerCase();
  const any = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return any ? any[0].toLowerCase() : null;
}

async function looksLikeZip(filePath) {
  const lower = String(filePath || '').toLowerCase();
  if (lower.endsWith('.zip')) return true;
  const fh = await fsp.open(filePath, 'r').catch(() => null);
  if (!fh) return false;
  try {
    const buf = Buffer.alloc(4);
    const { bytesRead } = await fh.read(buf, 0, 4, 0);
    return bytesRead >= 2 && buf[0] === ZIP_MAGIC[0] && buf[1] === ZIP_MAGIC[1];
  } finally {
    await fh.close().catch(() => {});
  }
}

function extractedDirFor(zipPath) {
  return `${zipPath}.extracted`;
}

async function extractZip(zipPath, dest) {
  await fsp.mkdir(dest, { recursive: true });
  const zipfile = await yauzl.openPromise(zipPath, { lazyEntries: true, autoClose: false, decodeStrings: true });
  const destRoot = path.resolve(dest);
  try {
    for await (const entry of zipfile.eachEntry()) {
      const name = String(entry.fileName || '').replace(/\\/g, '/');
      if (!name || name.endsWith('/')) continue;
      const safe = assertSafeRelativePath(name);
      const abs = path.resolve(destRoot, safe);
      if (abs !== destRoot && !abs.startsWith(destRoot + path.sep)) {
        throw Object.assign(new Error(`zip 路径越界: ${name}`), { status: 400 });
      }
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      const readStream = await zipfile.openReadStreamPromise(entry);
      await pipeline(readStream, fs.createWriteStream(abs));
    }
  } finally {
    zipfile.close();
  }
}

/** 解包目录里的指纹文件：记录解包时 zip 的大小 + mtime，用来判断包有没有被原地替换过。 */
const EXTRACT_MARKER_NAME = '.package-cache.json';

/** zip 指纹。只比 mtime 不够：Windows 的复制会保留源文件时间戳，得连大小一起比。 */
function extractionSignature(zipStat) {
  return `${zipStat.size}:${Math.round(zipStat.mtimeMs)}`;
}

/**
 * 解包缓存是否已过期。
 * 只按「解包目录存在」就复用，会让「同路径替换 zip」读到的还是旧包内容；
 * 缺指纹（老缓存 / 手删）也按过期处理，重解一次即可。
 * 说明：大小与 mtime 都相同的情况视为未变（同一秒内替换同大小包属极端情形）。
 */
function isExtractionStale(zipPath, extractedDir) {
  try {
    const marker = JSON.parse(fs.readFileSync(path.join(extractedDir, EXTRACT_MARKER_NAME), 'utf8'));
    const zipStat = fs.statSync(zipPath);
    return marker.signature !== extractionSignature(zipStat);
  } catch {
    return true;
  }
}

async function ensureExtracted(zipPath) {
  const dest = extractedDirFor(zipPath);
  const payloadPath = path.join(dest, PAYLOAD_NAME);
  if (fs.existsSync(payloadPath) && !isExtractionStale(zipPath, dest)) return dest;
  await fsp.rm(dest, { recursive: true, force: true }).catch(() => {});
  await extractZip(zipPath, dest);
  try {
    const zipStat = fs.statSync(zipPath);
    await fsp.writeFile(
      path.join(dest, EXTRACT_MARKER_NAME),
      JSON.stringify({ signature: extractionSignature(zipStat), extractedAt: new Date().toISOString() }),
      'utf8',
    );
  } catch {
    // 指纹写不进去就退化成「下次重新解包」，不影响正确性
  }
  return dest;
}

function attachPackageMeta(payload, pkg) {
  Object.defineProperty(payload, '__package', {
    value: pkg,
    enumerable: false,
    configurable: true,
  });
  return payload;
}

function getPackageFilesDir(file) {
  return file && file.__package ? file.__package.filesDir : null;
}

/**
 * 打开迁移包:zip 解出 payload.json,旧 JSON 直接解析。
 * @returns {Promise<object>} payload,并挂非枚举 __package
 */
async function openTransferPackage(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw Object.assign(new Error('上传文件不存在'), { status: 400 });
  }
  const isZip = await looksLikeZip(filePath);
  if (isZip) {
    const extractedDir = await ensureExtracted(filePath);
    const payloadPath = path.join(extractedDir, PAYLOAD_NAME);
    if (!fs.existsSync(payloadPath)) {
      throw Object.assign(new Error('zip 包缺少 payload.json'), { status: 400 });
    }
    let payload;
    try {
      payload = JSON.parse(await fsp.readFile(payloadPath, 'utf8'));
    } catch (e) {
      throw Object.assign(new Error(`payload.json 不是合法 JSON: ${e.message}`), { status: 400 });
    }
    const filesDirCandidate = path.join(extractedDir, FILES_DIR_NAME);
    const filesDir = fs.existsSync(filesDirCandidate) ? filesDirCandidate : null;
    return attachPackageMeta(payload, {
      kind: 'zip',
      extractedDir,
      filesDir,
    });
  }
  let payload;
  try {
    payload = JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch (e) {
    throw Object.assign(new Error(`文件不是合法 JSON: ${e.message}`), { status: 400 });
  }
  return attachPackageMeta(payload, { kind: 'json', extractedDir: null, filesDir: null });
}

function cleanupUpload(filePath) {
  if (!filePath) return Promise.resolve();
  const tasks = [];
  if (fs.existsSync(filePath)) tasks.push(fsp.unlink(filePath).catch(() => {}));
  const extracted = extractedDirFor(filePath);
  if (fs.existsSync(extracted)) {
    tasks.push(fsp.rm(extracted, { recursive: true, force: true }).catch(() => {}));
  }
  return Promise.all(tasks);
}

async function collectFileEntries(objects) {
  const objectStore = require('../storage/objectStore');
  const missing = [];
  const entries = [];
  for (const obj of objects || []) {
    const rel = String(obj.relative_path || '').replace(/\\/g, '/');
    if (!rel) {
      missing.push(obj.object_id || obj.name || '(无路径)');
      continue;
    }
    let safe;
    try {
      safe = assertSafeRelativePath(rel);
    } catch {
      missing.push(rel);
      continue;
    }
    const stored = await objectStore.stat(safe);
    if (stored) {
      entries.push({ relativePath: safe, zipName: `${FILES_DIR_NAME}/${safe}` });
    } else {
      missing.push(safe);
    }
  }
  return { entries, missing };
}

function resolvePackageFile(filesDir, relativePath) {
  if (!filesDir || !relativePath) return null;
  let safe;
  try {
    safe = assertSafeRelativePath(relativePath);
  } catch {
    return null;
  }
  const root = path.resolve(filesDir);
  const abs = path.resolve(root, safe);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return fs.existsSync(abs) && fs.statSync(abs).isFile() ? abs : null;
}

function buildManifest({ format, options, summary, includeFiles }) {
  return {
    format,
    formatVersion: PACKAGE_FORMAT_VERSION,
    packageKind: 'zip',
    options: options || {},
    exportSummary: summary || {},
    files: {
      payload: PAYLOAD_NAME,
      objects: includeFiles ? `${FILES_DIR_NAME}/` : null,
    },
  };
}

/**
 * 流式 zip。调用方把返回的 archive 设为响应体。
 */
async function createTransferZipArchive({ manifest, payloadStream, fileEntries = [] }) {
  const objectStore = require('../storage/objectStore');
  const archive = archiver('zip', { zlib: { level: 1 } });
  const output = new PassThrough();
  archive.on('error', (err) => {
    if (!output.destroyed) output.destroy(err);
  });
  archive.pipe(output);
  archive.append(Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), { name: MANIFEST_NAME });
  archive.append(payloadStream, { name: PAYLOAD_NAME });
  for (const entry of fileEntries) {
    if (entry.absPath) {
      archive.file(entry.absPath, { name: entry.zipName });
    } else {
      archive.append(await objectStore.getStream(entry.relativePath), { name: entry.zipName });
    }
  }
  archive.finalize();
  return output;
}

function isTransferUploadName(originalFilename) {
  const name = String(originalFilename || '').toLowerCase();
  return name.endsWith('.zip') || name.endsWith('.json');
}

module.exports = {
  PACKAGE_FORMAT_VERSION,
  PAYLOAD_NAME,
  FILES_DIR_NAME,
  UUID_RE,
  assertSafeRelativePath,
  extractStorageObjectId,
  looksLikeZip,
  openTransferPackage,
  getPackageFilesDir,
  cleanupUpload,
  collectFileEntries,
  resolvePackageFile,
  buildManifest,
  createTransferZipArchive,
  isTransferUploadName,
};
