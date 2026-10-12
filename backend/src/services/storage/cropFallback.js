'use strict';

/**
 * backend/src/services/storage/cropFallback.js
 *
 * crop 的降级策略：源对象在对象存储里缺失时，不要让图片接口直接 404。
 *
 * 背景（见 #20）：应用/平台导入在「未勾选携带存储文件」时会写入 storage_objects
 * 记录但不带二进制，于是记录指向不存在的对象。前端请求 crop 时，
 * 只要没有缩略图缓存兜底就整块空白。
 *
 * 这里只放纯逻辑（可单测），实际读对象存储由 imgCropService 负责。
 */

/** sharp 能直接解码并转码为 webp 的类型 */
const DIRECT_DECODABLE_MIME = /^image\/(jpeg|jpg|png|webp|gif|avif|tiff)$/i;

/** 能直接原样回传的类型（含 svg：不能交给 sharp 光栅化，但浏览器能显示） */
const PASSTHROUGH_MIME = /^image\/(jpeg|jpg|png|webp|gif|avif|tiff|svg\+xml|bmp|x-icon|vnd\.microsoft\.icon)$/i;

function normalizeMime(mime) {
  return String(mime || '').split(';')[0].trim().toLowerCase();
}

/**
 * 源文件存在时，crop 失败是否允许回退成「原图」。
 * 只看类型，不碰存储。
 */
function canServeOriginal(mime) {
  return DIRECT_DECODABLE_MIME.test(normalizeMime(mime));
}

/**
 * 源文件不存在时，能否原样回传一个可显示的占位/兜底内容。
 * svg 这类不能交给 sharp 的类型只有在这一档才能用。
 */
function canServePassthrough(mime) {
  return PASSTHROUGH_MIME.test(normalizeMime(mime));
}

/** 源缺失时的占位图：浅灰底 + 居中「缺图」图形，PNG。 */
function buildPlaceholderSvg({ w = 480, h = 480 } = {}) {
  const width = Math.max(1, Math.min(4096, Number(w) || 480));
  const height = Math.max(1, Math.min(4096, Number(h) || width));
  const unit = Math.max(12, Math.round(Math.min(width, height) * 0.28));
  const stroke = Math.max(2, Math.round(unit * 0.09));
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);
  const left = cx - Math.round(unit / 2);
  const top = cy - Math.round(unit * 0.62);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#f0f0f0"/>',
    `<rect x="${left}" y="${top}" width="${unit}" height="${Math.round(unit * 0.76)}" rx="${Math.round(unit * 0.1)}"`,
    ` fill="none" stroke="#bfbfbf" stroke-width="${stroke}"/>`,
    `<circle cx="${left + Math.round(unit * 0.3)}" cy="${top + Math.round(unit * 0.28)}" r="${Math.round(unit * 0.08)}" fill="#bfbfbf"/>`,
    `<path d="M${left + stroke} ${top + Math.round(unit * 0.76) - stroke} L${left + Math.round(unit * 0.36)} ${top + Math.round(unit * 0.42)}`,
    ` L${left + Math.round(unit * 0.58)} ${top + Math.round(unit * 0.6)} L${left + Math.round(unit * 0.76)} ${top + Math.round(unit * 0.44)}`,
    ` L${left + unit - stroke} ${top + Math.round(unit * 0.76) - stroke} Z" fill="#bfbfbf"/>`,
    `<line x1="${left - Math.round(unit * 0.08)}" y1="${top - Math.round(unit * 0.08)}"`,
    ` x2="${left + unit + Math.round(unit * 0.08)}" y2="${top + Math.round(unit * 0.76) + Math.round(unit * 0.08)}"`,
    ` stroke="#d9d9d9" stroke-width="${stroke}" stroke-linecap="round"/>`,
    '</svg>',
  ].join('');
}

module.exports = {
  normalizeMime,
  canServeOriginal,
  canServePassthrough,
  buildPlaceholderSvg,
};
