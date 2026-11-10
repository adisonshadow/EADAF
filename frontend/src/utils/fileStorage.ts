/**
 * 文件存储上传限制的前端副本。
 *
 * 服务端是权威（`backend/src/services/storage/fileStorageSettings.js`），
 * 这里只负责在选文件时提前拦一下、并把上限数字写进提示语；
 * 两边的默认值和归类规则必须保持一致，改一处请同步另一处。
 */

export type FileStorageCategory = 'image' | 'document' | 'video';

export type FileStorageSettings = {
  /** 图片上限（MB） */
  imageMaxMb: number;
  /** 文档上限（MB） */
  documentMaxMb: number;
  /** 视频 / 大文件上限（MB） */
  videoMaxMb: number;
  /** 允许的图片格式。保存后以服务端这份名单为准，可含自定义后缀 */
  imageFormats: string[];
  /** 是否把 JPEG/PNG 转 WebP 存储 */
  imageCompress: boolean;
};

export const DEFAULT_FILE_STORAGE_SETTINGS: FileStorageSettings = {
  imageMaxMb: 5,
  documentMaxMb: 50,
  videoMaxMb: 500,
  imageFormats: ['jpg', 'png', 'gif', 'webp', 'svg', 'bmp'],
  imageCompress: true,
};

export const IMAGE_FORMAT_OPTIONS = [
  { value: 'jpg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
  { value: 'gif', label: 'GIF' },
  { value: 'webp', label: 'WebP' },
  { value: 'svg', label: 'SVG' },
  { value: 'bmp', label: 'BMP' },
];

export const FILE_CATEGORY_LABELS: Record<FileStorageCategory, string> = {
  image: '图片',
  document: '文档',
  video: '视频/大文件',
};

const MB = 1024 * 1024;

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

const IMAGE_MIME_FORMATS: Record<string, string> = {
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

function extOf(name?: string) {
  const value = String(name || '').trim().toLowerCase();
  const index = value.lastIndexOf('.');
  return index > -1 ? value.slice(index + 1) : '';
}

function normalizeFormatToken(value: string) {
  const raw = value.trim().toLowerCase().replace(/^\.+/, '');
  if (raw === 'jpeg') return 'jpg';
  if (raw === 'dib') return 'bmp';
  return raw;
}

function isFormatToken(value: string) {
  return /^[a-z0-9]{2,16}$/.test(value) && !DOCUMENT_EXTS.has(value) && !VIDEO_EXTS.has(value);
}

export function imageFormatOfFile(file: { type?: string; name?: string }): string {
  const normalized = normalizeFormatToken(extOf(file?.name));
  if (isFormatToken(normalized)) return normalized;
  return IMAGE_MIME_FORMATS[String(file?.type || '').toLowerCase()] || '';
}

/** 与服务端 classifyFile 保持一致：未知类型归到“视频/大文件”档 */
export function classifyFileCategory(
  file: { type?: string; name?: string },
  settings?: FileStorageSettings,
): FileStorageCategory {
  const mime = String(file?.type || '').toLowerCase();
  const ext = extOf(file?.name);
  const format = imageFormatOfFile(file);
  if (settings && format && settings.imageFormats.includes(format)) return 'image';
  if (mime.startsWith('image/') || IMAGE_EXTS.has(ext)) return 'image';
  if (mime.startsWith('text/') || DOCUMENT_EXTS.has(ext)) return 'document';
  if (mime.startsWith('video/') || mime.startsWith('audio/') || VIDEO_EXTS.has(ext)) return 'video';
  return 'video';
}

export function categoryLimitMb(
  settings: FileStorageSettings,
  category: FileStorageCategory,
): number {
  if (category === 'image') return settings.imageMaxMb;
  if (category === 'document') return settings.documentMaxMb;
  return settings.videoMaxMb;
}

function formatMb(bytes: number) {
  const mb = Number(bytes || 0) / MB;
  return Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
}

export function formatImageFormatList(settings: FileStorageSettings) {
  return settings.imageFormats
    .map((format) => IMAGE_FORMAT_OPTIONS.find((item) => item.value === format)?.label || format)
    .join('、');
}

/** 后端返回的设置可能缺字段/格式不对，这里补齐并回退默认值（不信任任意输入） */
export function resolveFileStorageSettings(
  raw?: Partial<FileStorageSettings> | null,
): FileStorageSettings {
  const pickMb = (value: unknown, fallback: number) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= 1 ? Math.round(num) : fallback;
  };
  const formats = Array.isArray(raw?.imageFormats)
    ? raw.imageFormats.filter((item): item is string => typeof item === 'string')
    : [];
  const validFormats: string[] = [];
  for (const item of formats) {
    const format = normalizeFormatToken(item);
    if (isFormatToken(format) && !validFormats.includes(format)) validFormats.push(format);
  }
  return {
    imageMaxMb: pickMb(raw?.imageMaxMb, DEFAULT_FILE_STORAGE_SETTINGS.imageMaxMb),
    documentMaxMb: pickMb(raw?.documentMaxMb, DEFAULT_FILE_STORAGE_SETTINGS.documentMaxMb),
    videoMaxMb: pickMb(raw?.videoMaxMb, DEFAULT_FILE_STORAGE_SETTINGS.videoMaxMb),
    imageFormats: validFormats.length ? validFormats : [...DEFAULT_FILE_STORAGE_SETTINGS.imageFormats],
    imageCompress: raw?.imageCompress === undefined
      ? DEFAULT_FILE_STORAGE_SETTINGS.imageCompress
      : Boolean(raw.imageCompress),
  };
}

/**
 * 选完文件先校验一次，返回错误文案；通过返回 null。
 * 服务端会再校验一次，这里只是减少“传完才失败”的等待。
 */
export function validateFileUpload(
  file: { type?: string; name?: string; size?: number },
  settings: FileStorageSettings,
): string | null {
  const category = classifyFileCategory(file, settings);
  if (category === 'image') {
    const format = imageFormatOfFile(file);
    if (!format || !settings.imageFormats.includes(format)) {
      return `图片格式不支持，仅允许 ${formatImageFormatList(settings)}`;
    }
  }
  const limitMb = categoryLimitMb(settings, category);
  if (Number(file.size || 0) > limitMb * MB) {
    return `${FILE_CATEGORY_LABELS[category]}大小不能超过 ${limitMb} MB（当前 ${formatMb(Number(file.size || 0))} MB）`;
  }
  return null;
}
