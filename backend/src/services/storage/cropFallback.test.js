const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeMime,
  canServeOriginal,
  canServePassthrough,
  buildPlaceholderSvg,
} = require('./cropFallback');

test('mime 归一化去掉 charset 与大小写', () => {
  assert.equal(normalizeMime('image/PNG; charset=utf-8'), 'image/png');
  assert.equal(normalizeMime('  image/jpeg  '), 'image/jpeg');
  assert.equal(normalizeMime(undefined), '');
});

test('可用原图回退的类型：sharp 能解码的图片', () => {
  for (const mime of ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif', 'image/tiff']) {
    assert.equal(canServeOriginal(mime), true, `${mime} 应可回退原图`);
  }
  for (const mime of ['image/svg+xml', 'application/pdf', 'text/plain', '']) {
    assert.equal(canServeOriginal(mime), false, `${mime} 不应走 sharp 回退`);
  }
});

test('可原样回传的类型：含 svg 等浏览器能直接显示但不交给 sharp 的', () => {
  for (const mime of ['image/svg+xml', 'image/bmp', 'image/png']) {
    assert.equal(canServePassthrough(mime), true, `${mime} 应可原样回传`);
  }
  for (const mime of ['application/pdf', 'video/mp4', '']) {
    assert.equal(canServePassthrough(mime), false, `${mime} 不应原样回传`);
  }
});

test('占位图 SVG：尺寸跟随裁剪参数且被限制在 1–4096', () => {
  const svg = buildPlaceholderSvg({ w: 80, h: 120 });
  assert.match(svg, /width="80"/);
  assert.match(svg, /height="120"/);
  assert.match(svg, /viewBox="0 0 80 120"/);

  const huge = buildPlaceholderSvg({ w: 99999, h: 99999 });
  assert.match(huge, /width="4096"/);
  assert.match(huge, /height="4096"/);

  const zero = buildPlaceholderSvg({ w: 0, h: 0 });
  assert.match(zero, /width="480"/);
});

test('占位图 SVG 不含脚本或外链（防注入）', () => {
  const svg = buildPlaceholderSvg({ w: 64, h: 64 });
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /xlink:href|href="http/i);
});

test('占位图能被 sharp 光栅化为 PNG（cropImage 兜底路径依赖）', async () => {
  const sharp = require('sharp');
  const png = await sharp(Buffer.from(buildPlaceholderSvg({ w: 48, h: 48 }))).png().toBuffer();
  const meta = await sharp(png).metadata();
  assert.equal(meta.format, 'png');
  assert.equal(meta.width, 48);
  assert.equal(meta.height, 48);
});
