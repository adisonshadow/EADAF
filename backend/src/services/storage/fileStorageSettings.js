/**
 * 文件存储上传限制（图片 / 文档 / 视频三档）。
 *
 * 背景：
 * - 文件二进制统一落在 MinIO（单 bucket，对象键 {@code {bucketCode}/{objectId}{ext}}），
 *   multipart 与 tus 两条通道原先都没有业务层大小/格式校验，只有 env 的 tus 硬顶；
 * - 设置页保存后必须立即作用于两条通道，不能要求重启进程。
 *
 * 分类规则（服务端为权威，前端只是提前提示）：
 * - image：图片 MIME / 图片扩展名 → 图片上限 + 图片格式白名单；
 * - document：PDF、Office、纯文本等 → 文档上限；
 * - video：视频、音频、压缩包、安装包及其他未知大文件 → 视频上限（大文件档）。
 * 图片/文档之外的统一落到“视频”档，是为了只暴露三个数字，同时不把 .zip/.dwg 之类挡死。
 */
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const config = require('../../config');
const logger = require('../../utils/logger');

const MB = 1024 * 1024;

/** 图片格式白名单的取值顺序也是设置页展示顺序 */
const IMAGE_FORMATS = ['jpg', 'png', 'gif', 'webp', 'svg', 'bmp'];
const IMAGE_FORMAT_LABELS = {
  jpg: 'JPG',
  png: 'PNG',
  gif: 'GIF',
  webp: 'WebP',
  svg: 'SVG',
  bmp: 'BMP',
};

const DEFAULT_SETTINGS = Object.freeze({
  imageMaxMb: 5,
  documentMaxMb: 50,
  videoMaxMb: 500,
  imageFormats: Object.freeze([...IMAGE_FORMATS]),
  imageCompress: true,
});

const CATEGORY_LABELS = {
  image: '图片',
  document: '文档',
  video: '视频/大文件',
};

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'dib']);
const DOCUMENT_EXTS = new Set([
  'pdf',
  'doc', 'docx',
  'xls', 'xlsx',
  'ppt', 'pptx',
  'txt', 'md', 'csv', 'tsv',
  'json', 'xml', 'yaml', 'yml',
  'html', 'htm', 'rtf',
  'odt', 'ods', 'odp',
  'log',
]);
// 音频、压缩包、安装包等“大文件”与视频共用视频档上限
const VIDEO_EXTS = new Set([
  'mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'm4v', 'mpeg', 'mpg',
  'mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a',
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',
  'iso', 'dmg', 'exe', 'msi', 'apk', 'ipa',
]);

const IMAGE_MIME_FORMATS = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
  'image/x-bmp': 'bmp',
};

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

/** env 里的 tus 硬顶（字节）换算成 MB，设置页的三档都不允许超过它 */
function hardMaxMb() {
  const bytes = Number(config.storage.tus.maxSize) || 0;
  return Math.max(1, Math.floor(bytes / MB));
}

function normalizeImageFormat(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'jpeg' ? 'jpg' : raw;
}

function normalizeMb(value, label) {
  const num = Number(value);
  const max = hardMaxMb();
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1 || num > max) {
    throw httpError(400, `${label}需为 1–${max} MB 的整数`);
  }
  return num;
}

function normalizeImageFormats(value) {
  const list = Array.isArray(value) ? value : [];
  const formats = [];
  for (const item of list) {
    const format = normalizeImageFormat(item);
    if (!IMAGE_FORMATS.includes(format)) {
      throw httpError(400, `不支持的图片格式：${item}`);
    }
    if (!formats.includes(format)) formats.push(format);
  }
  if (!formats.length) throw httpError(400, '至少保留一种图片格式');
  return formats.sort((a, b) => IMAGE_FORMATS.indexOf(a) - IMAGE_FORMATS.indexOf(b));
}

/** 补齐缺省字段并校验；设置页保存、读取存档都走这里 */
function normalizeSettings(input = {}) {
  return {
    imageMaxMb: normalizeMb(
      input.imageMaxMb === undefined ? DEFAULT_SETTINGS.imageMaxMb : input.imageMaxMb,
      '图片上限',
    ),
    documentMaxMb: normalizeMb(
      input.documentMaxMb === undefined ? DEFAULT_SETTINGS.documentMaxMb : input.documentMaxMb,
      '文档上限',
    ),
    videoMaxMb: normalizeMb(
      input.videoMaxMb === undefined ? DEFAULT_SETTINGS.videoMaxMb : input.videoMaxMb,
      '视频上限',
    ),
    imageFormats: normalizeImageFormats(
      input.imageFormats === undefined ? [...DEFAULT_SETTINGS.imageFormats] : input.imageFormats,
    ),
    imageCompress: input.imageCompress === undefined
      ? DEFAULT_SETTINGS.imageCompress
      : Boolean(input.imageCompress),
  };
}

/** system_features.fileStorage 存档 → 归一化配置；坏数据按“没配过”处理，回退默认值 */
function readStoredFileStorage(value) {
  if (!value || typeof value !== 'object') return null;
  try {
    return normalizeSettings(value);
  } catch (error) {
    logger.warn('文件存储设置无效，回退默认值', { message: error.message });
    return null;
  }
}

function publicSettings(stored) {
  return normalizeSettings(stored || {});
}

/**
 * 未显式传入存档（undefined）时取运行时生效值（设置页保存过的那份）；
 * 显式传 null 表示“按默认值”。测试与启动初始化依赖这个区分。
 */
function resolveStored(stored) {
  return stored === undefined ? effectiveStored : stored;
}

function extOf(filename) {
  const name = String(filename || '').trim().toLowerCase();
  const index = name.lastIndexOf('.');
  return index > -1 ? name.slice(index + 1) : '';
}

function imageFormatOf({ mimeType, filename } = {}) {
  const ext = normalizeImageFormat(extOf(filename));
  if (ext === 'dib') return 'bmp';
  if (IMAGE_FORMATS.includes(ext)) return ext;
  return IMAGE_MIME_FORMATS[String(mimeType || '').toLowerCase()] || '';
}

/** 只按 MIME + 扩展名归类，不看文件内容（tus 建会话时还没有内容） */
function classifyFile({ mimeType, filename } = {}) {
  const mime = String(mimeType || '').toLowerCase();
  const ext = extOf(filename);
  if (mime.startsWith('image/') || IMAGE_EXTS.has(ext)) return 'image';
  if (mime.startsWith('text/') || DOCUMENT_EXTS.has(ext)) return 'document';
  if (
    mime.startsWith('video/')
    || mime.startsWith('audio/')
    || VIDEO_EXTS.has(ext)
  ) {
    return 'video';
  }
  return 'video';
}

function categoryLimitMb(settings, category) {
  if (category === 'image') return settings.imageMaxMb;
  if (category === 'document') return settings.documentMaxMb;
  return settings.videoMaxMb;
}

function formatMb(bytes) {
  const mb = Number(bytes || 0) / MB;
  if (Number.isInteger(mb)) return String(mb);
  return mb.toFixed(1);
}

function formatList(settings) {
  return settings.imageFormats.map((format) => IMAGE_FORMAT_LABELS[format] || format).join('、');
}

/**
 * 同步校验（tus 建会话、multipart 入口都能用）：格式 + 声明大小。
 * @returns {{category: string, limitBytes: number, settings: object}}
 */
function assertUploadAllowed({ mimeType, filename, size, stored } = {}) {
  const settings = publicSettings(resolveStored(stored));
  const category = classifyFile({ mimeType, filename });

  if (category === 'image') {
    const format = imageFormatOf({ mimeType, filename });
    if (!format || !settings.imageFormats.includes(format)) {
      throw httpError(415, `图片格式不支持，仅允许 ${formatList(settings)}`);
    }
  }

  const limitMb = categoryLimitMb(settings, category);
  const limitBytes = limitMb * MB;
  const actual = Number(size || 0);
  if (actual > limitBytes) {
    throw httpError(
      413,
      `${CATEGORY_LABELS[category]}大小不能超过 ${limitMb} MB（当前 ${formatMb(actual)} MB）`,
    );
  }
  return { category, limitBytes, settings };
}

/** 读文件头，用于确认图片真实格式（不依赖客户端上报的 Content-Type） */
async function readHead(filePath, length = 1024) {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function sniffImageFormat(buffer) {
  if (!buffer || !buffer.length) return '';
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) return 'bmp';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(pngSignature)) return 'png';

  const ascii = buffer.toString('latin1');
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return 'gif';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'webp';

  const text = buffer.toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (text.startsWith('<svg') || (text.startsWith('<?xml') && /<svg[\s>]/i.test(text))) {
    return 'svg';
  }
  return '';
}

async function detectImageFormat(filePath) {
  try {
    return sniffImageFormat(await readHead(filePath));
  } catch (error) {
    logger.warn('读取文件头失败，按扩展名判断图片格式', { message: error.message });
    return '';
  }
}

/**
 * 异步校验（写 MinIO 前）：在同步校验基础上，图片再按真实内容确认格式。
 */
async function assertStoredFile({ filePath, size, mimeType, filename, stored } = {}) {
  const settings = publicSettings(resolveStored(stored));
  const category = classifyFile({ mimeType, filename });

  let format = '';
  if (category === 'image') {
    // 只认文件头；扩展名/MIME 都可以伪造，不能作为放行依据
    format = await detectImageFormat(filePath);
    if (!format || !settings.imageFormats.includes(format)) {
      throw httpError(415, `图片格式不支持，仅允许 ${formatList(settings)}`);
    }
  }

  const limitMb = categoryLimitMb(settings, category);
  const limitBytes = limitMb * MB;
  const actual = Number(size || 0);
  if (actual > limitBytes) {
    throw httpError(
      413,
      `${CATEGORY_LABELS[category]}大小不能超过 ${limitMb} MB（当前 ${formatMb(actual)} MB）`,
    );
  }
  return { category, format, limitBytes, settings };
}

/**
 * multipart 上传落 MinIO 前调用：校验 + 可选的图片转 WebP。
 *
 * 只转 JPEG/PNG（GIF 转 WebP 会丢动画，SVG 转栅格会丢可缩放），
 * 转换失败按原图存储，绝不因为“压缩”把上传拦下来。
 *
 * @returns {{path: string, mimeType: string, filename: string, size: number, tempPaths: string[]}}
 */
async function buildStoredUpload({ filePath, size, mimeType, filename, stored } = {}) {
  const { category, format } = await assertStoredFile({
    filePath,
    size,
    mimeType,
    filename,
    stored,
  });
  const settings = publicSettings(resolveStored(stored));

  const compressible = category === 'image'
    && settings.imageCompress
    && (format === 'jpg' || format === 'png');
  if (!compressible) {
    return { path: filePath, mimeType, filename, size, tempPaths: [] };
  }

  const outPath = `${filePath}.webp`;
  try {
    // 延迟 require：sharp 是原生模块，只在真正需要转换时加载
    const sharp = require('sharp');
    await sharp(filePath).webp({ quality: 80 }).toFile(outPath);
    const stat = await fs.stat(outPath);
    const base = String(filename || 'image').replace(/\.[^.]+$/, '') || 'image';
    return {
      path: outPath,
      mimeType: 'image/webp',
      filename: `${base}.webp`,
      size: stat.size,
      tempPaths: [outPath],
    };
  } catch (error) {
    logger.warn('图片转 WebP 失败，按原图存储', { message: error.message });
    await fs.unlink(outPath).catch(() => {});
    return { path: filePath, mimeType, filename, size, tempPaths: [] };
  }
}

// ---------------------------------------------------------------------------
// 运行时生效：设置页保存后不重启就能作用于 multipart 与 tus
// ---------------------------------------------------------------------------

/** 当前生效配置；null = 从未保存过，用默认值 */
let effectiveStored = null;
/** koa-body 的 formidable 选项对象（每次请求都会读 maxFileSize，所以改属性即可生效） */
let multipartFormidable = null;

function effectiveSettings() {
  return publicSettings(effectiveStored);
}

function effectiveLimits() {
  const settings = effectiveSettings();
  return {
    image: settings.imageMaxMb * MB,
    document: settings.documentMaxMb * MB,
    video: settings.videoMaxMb * MB,
    hard: Number(config.storage.tus.maxSize) || 0,
  };
}

function syncMultipartLimit() {
  if (!multipartFormidable) return;
  const limits = effectiveLimits();
  // formidable 只认一个全局上限，取三档里最大的；按类别的上限在 storageService 里校验
  multipartFormidable.maxFileSize = Math.max(limits.image, limits.document, limits.video);
}

/** 路由创建 koaBody 时把 formidable 选项登记进来，之后改设置会同步刷新上限 */
function bindMultipartOptions(formidableOptions) {
  multipartFormidable = formidableOptions;
  syncMultipartLimit();
}

/** 应用一份存档配置（null → 默认值），并刷新 multipart 上限 */
function applyFileStorageSettings(stored) {
  effectiveStored = readStoredFileStorage(stored);
  syncMultipartLimit();
}

/**
 * 只读的存储后端信息，给设置页展示用。
 * 这些值来自环境变量 / 部署拓扑，界面上不给改。
 */
function storageInfo() {
  return {
    backend: 'minio',
    bucket: config.storage.minio.bucket,
    objectKeyPattern: '{bucketCode}/{objectId}{ext}',
    cropCachePrefix: 'img-crop-cache/',
    tusTempDir: path.join(os.tmpdir(), config.storage.tus.dirName || 'eadaf-tus'),
    hardMaxMb: hardMaxMb(),
  };
}

module.exports = {
  MB,
  IMAGE_FORMATS,
  DEFAULT_SETTINGS,
  hardMaxMb,
  normalizeSettings,
  readStoredFileStorage,
  publicSettings,
  classifyFile,
  imageFormatOf,
  formatMb,
  assertUploadAllowed,
  assertStoredFile,
  buildStoredUpload,
  bindMultipartOptions,
  applyFileStorageSettings,
  effectiveSettings,
  effectiveLimits,
  storageInfo,
  sniffImageFormat,
};
