const sharp = require('sharp');
const objectStore = require('./objectStore');
const {
  normalizeMime,
  canServePassthrough,
  buildPlaceholderSvg,
} = require('./cropFallback');

/** 对外仅暴露 cover / contain；contain 内部映射为 sharp inside（按比例适配，不留白） */
const FIT_VALUES = new Set(['cover', 'contain']);
const MIN_DIM = 1;
const MAX_DIM = 4096;

function parseCropQuery(query = {}) {
  const rawW = query.w;
  const rawH = query.h;
  let w = rawW !== undefined && rawW !== '' ? Number.parseInt(String(rawW), 10) : undefined;
  let h = rawH !== undefined && rawH !== '' ? Number.parseInt(String(rawH), 10) : undefined;
  const fit = query.fit ? String(query.fit).trim().toLowerCase() : undefined;

  if (w !== undefined && (Number.isNaN(w) || w < MIN_DIM || w > MAX_DIM)) {
    const err = new Error(`w 须在 ${MIN_DIM}–${MAX_DIM} 之间`);
    err.status = 400;
    throw err;
  }
  if (h !== undefined && (Number.isNaN(h) || h < MIN_DIM || h > MAX_DIM)) {
    const err = new Error(`h 须在 ${MIN_DIM}–${MAX_DIM} 之间`);
    err.status = 400;
    throw err;
  }
  if (fit && !FIT_VALUES.has(fit)) {
    const err = new Error(`fit 须为 cover 或 contain`);
    err.status = 400;
    throw err;
  }

  if (!w && !h) {
    w = 480;
  }

  return { w, h, fit };
}

function buildCacheFileName(objectId, { w, h, fit }) {
  const wPart = w ?? '';
  const hPart = h ?? '';
  const fitPart = fit ?? '';
  return `${objectId}_${wPart}x${hPart}_${fitPart}.webp`;
}

function cacheObjectKey(objectId, params) {
  return `img-crop-cache/${buildCacheFileName(objectId, params)}`;
}

/**
 * 构建 sharp.resize 选项：
 * 1) 同时指定 w、h：fit=cover 覆盖裁剪到精确尺寸；fit=contain（默认）按比例缩放到框内（不留白，输出未必等于 w×h）
 * 2) 只指定 w 或 h：按原图比例自动计算另一边，忽略 fit
 */
function buildResizeOptions({ w, h, fit }) {
  const options = { withoutEnlargement: true };
  if (w) options.width = w;
  if (h) options.height = h;

  if (w && h) {
    // contain → inside：完整装入框内，保留比例，无 letterbox
    options.fit = fit === 'cover' ? 'cover' : 'inside';
  }
  // 仅一侧尺寸时不设 fit，sharp 按原图比例计算另一边

  return options;
}

/**
 * 生成裁剪图。
 *
 * 返回结构（调用方按 contentType 设置响应头）：
 *   { stream, contentType, fallback?: 'original' | 'placeholder' }
 *
 * 降级策略（见 #20）：源对象缺失或 sharp 解不动时不再直接 404，
 * 而是回退「原图」或占位图，避免前端因为一条悬空记录整块空白。
 * 只有连兜底内容都没有（类型不可显示）时才抛错。
 */
async function cropImage({ objectId, sourceKey, query, mimeType }) {
  if (!objectId) {
    const err = new Error('objectId 为必填项');
    err.status = 400;
    throw err;
  }
  const mime = normalizeMime(mimeType);

  // 源缺失时的兜底：优先直接把可显示的原类型回传，否则给占位图
  const missingSource = async () => {
    if (sourceKey && canServePassthrough(mime)) {
      // 这里必须容错：源本来就可能不存在。先用 stat 判断，避免 getStream 抛 404
      // 冒到接口（修复前 d66b60c1 这类悬空记录就是这样 404 的）
      try {
        if (await objectStore.stat(sourceKey)) {
          const stream = await objectStore.getStream(sourceKey);
          if (stream) {
            return { stream, contentType: mime || 'application/octet-stream', fallback: 'original' };
          }
        }
      } catch {
        /* 源确实拿不到，继续走占位图 */
      }
    }
    const params = query ? parseCropQuery(query) : {};
    const svg = buildPlaceholderSvg({ w: params.w, h: params.h });
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return { stream: bufferToStream(png), contentType: 'image/png', fallback: 'placeholder' };
  };

  if (!sourceKey) return missingSource();

  const params = parseCropQuery(query);
  const cacheKey = cacheObjectKey(objectId, params);
  if (await objectStore.stat(cacheKey)) {
    return { stream: await objectStore.getStream(cacheKey), contentType: 'image/webp' };
  }

  const sourceStat = await objectStore.stat(sourceKey);
  if (!sourceStat) return missingSource();

  const source = await objectStore.getBuffer(sourceKey);
  let cropped;
  try {
    cropped = await sharp(source)
      .resize(buildResizeOptions(params))
      .webp({ quality: 80 })
      .toBuffer();
  } catch (error) {
    // sharp 解不动（损坏文件 / SVG 等）：文件在就回退原图，别让前端空白
    if (canServePassthrough(mime)) {
      return { stream: bufferToStream(source), contentType: mime, fallback: 'original' };
    }
    const err = new Error('图片无法解码，且该类型不支持原样回退');
    err.status = 415;
    err.cause = error;
    throw err;
  }
  await objectStore.putBuffer(cacheKey, cropped, { 'Content-Type': 'image/webp' });
  return { stream: await objectStore.getStream(cacheKey), contentType: 'image/webp' };
}

/** Buffer → 可读流（避免为此引入 stream 依赖时的重复实现） */
function bufferToStream(buffer) {
  const { Readable } = require('stream');
  return Readable.from(buffer);
}

async function purgeCropCache(objectId) {
  if (!objectId) return;
  await objectStore.removeByPrefix(`img-crop-cache/${objectId}_`);
}

module.exports = {
  FIT_VALUES,
  parseCropQuery,
  buildResizeOptions,
  cropImage,
  purgeCropCache,
};
