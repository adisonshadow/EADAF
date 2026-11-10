const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs/promises');

const {
  MB,
  DEFAULT_SETTINGS,
  hardMaxMb,
  normalizeSettings,
  readStoredFileStorage,
  classifyFile,
  assertUploadAllowed,
  assertStoredFile,
  buildStoredUpload,
  bindMultipartOptions,
  applyFileStorageSettings,
  effectiveSettings,
  sniffImageFormat,
  storageInfo,
} = require('./fileStorageSettings');

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('默认值：图片 5MB / 文档 50MB / 视频 500MB', () => {
  const settings = normalizeSettings();
  assert.equal(settings.imageMaxMb, 5);
  assert.equal(settings.documentMaxMb, 50);
  assert.equal(settings.videoMaxMb, 500);
  assert.deepEqual(settings.imageFormats, ['jpg', 'png', 'gif', 'webp', 'svg', 'bmp']);
  assert.equal(settings.imageCompress, true);
  assert.equal(effectiveSettings().imageMaxMb, DEFAULT_SETTINGS.imageMaxMb);
});

test('合法值归一化，jpeg 归到 jpg，格式去重排序', () => {
  const settings = normalizeSettings({
    imageMaxMb: 2,
    documentMaxMb: 20,
    videoMaxMb: 200,
    imageFormats: ['png', 'jpg', 'jpeg', 'png'],
    imageCompress: false,
  });
  assert.deepEqual(settings.imageFormats, ['jpg', 'png']);
  assert.equal(settings.imageCompress, false);
});

test('越界/非整数/空格式会被拒绝', () => {
  const max = hardMaxMb();
  assert.throws(() => normalizeSettings({ imageMaxMb: 0 }), /图片上限/);
  assert.throws(() => normalizeSettings({ documentMaxMb: 1.5 }), /文档上限/);
  assert.throws(() => normalizeSettings({ videoMaxMb: max + 1 }), /视频上限/);
  assert.throws(() => normalizeSettings({ imageFormats: [] }), /至少保留一种/);
  assert.throws(() => normalizeSettings({ imageFormats: ['tiff'] }), /不支持的图片格式/);
});

test('坏存档按没配过处理', () => {
  assert.equal(readStoredFileStorage(null), null);
  assert.equal(readStoredFileStorage('oops'), null);
  assert.equal(readStoredFileStorage({ imageMaxMb: -1 }), null);
  assert.equal(readStoredFileStorage({ imageMaxMb: 10 }).imageMaxMb, 10);
});

test('按 MIME + 扩展名归类：图片 / 文档 / 视频（含压缩包等大文件）', () => {
  assert.equal(classifyFile({ mimeType: 'image/png', filename: 'a.png' }), 'image');
  assert.equal(classifyFile({ filename: 'photo.JPG' }), 'image');
  assert.equal(classifyFile({ mimeType: 'application/pdf', filename: 'a.pdf' }), 'document');
  assert.equal(classifyFile({ filename: '报告.docx' }), 'document');
  assert.equal(classifyFile({ mimeType: 'text/markdown', filename: 'readme' }), 'document');
  assert.equal(classifyFile({ mimeType: 'video/mp4', filename: 'a.mp4' }), 'video');
  assert.equal(classifyFile({ filename: 'pkg.zip' }), 'video');
  assert.equal(classifyFile({ filename: 'no-ext' }), 'video');
});

test('超限报错信息带上类别和当前大小', () => {
  assert.throws(
    () => assertUploadAllowed({ mimeType: 'image/png', filename: 'a.png', size: 6 * MB }),
    /图片大小不能超过 5 MB/,
  );
  assert.throws(
    () => assertUploadAllowed({ mimeType: 'application/pdf', filename: 'a.pdf', size: 51 * MB }),
    /文档大小不能超过 50 MB/,
  );
  assert.throws(
    () => assertUploadAllowed({ filename: 'a.zip', size: 501 * MB }),
    /视频\/大文件大小不能超过 500 MB/,
  );
  assert.doesNotThrow(() => assertUploadAllowed({ filename: 'a.zip', size: 500 * MB }));
});

test('图片格式白名单生效，扩展名与 MIME 都能识别', () => {
  assert.throws(
    () => assertUploadAllowed({
      mimeType: 'image/svg+xml',
      filename: 'logo.svg',
      size: 1024,
      stored: { imageFormats: ['jpg', 'png'] },
    }),
    /图片格式不支持/,
  );
  assert.doesNotThrow(() => assertUploadAllowed({
    mimeType: 'image/svg+xml',
    filename: 'logo.svg',
    size: 1024,
  }));
});

test('文件头嗅探：不信任客户端上报的类型', () => {
  assert.equal(sniffImageFormat(PNG_1PX), 'png');
  assert.equal(sniffImageFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpg');
  assert.equal(sniffImageFormat(Buffer.from('GIF89a....')), 'gif');
  assert.equal(sniffImageFormat(Buffer.from('RIFF0000WEBPVP8 ')), 'webp');
  assert.equal(sniffImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')), 'svg');
  assert.equal(sniffImageFormat(Buffer.from([0x42, 0x4d, 0, 0])), 'bmp');
  assert.equal(sniffImageFormat(Buffer.from('not an image')), '');
});

test('bmp 在默认白名单内，Windows 的 image/x-ms-bmp 也认', () => {
  assert.doesNotThrow(() => assertUploadAllowed({
    mimeType: 'image/bmp',
    filename: 'finger.bmp',
    size: 1024,
  }));
  assert.doesNotThrow(() => assertUploadAllowed({
    mimeType: 'image/x-ms-bmp',
    filename: 'finger.bmp',
    size: 1024,
  }));
  assert.equal(classifyFile({ mimeType: 'image/x-ms-bmp', filename: 'finger.bmp' }), 'image');
});

test('写 MinIO 前按真实文件头校验，伪装成 png 的文本会被拒', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'eadaf-fs-test-'));
  const fake = path.join(dir, 'fake.png');
  await fs.writeFile(fake, 'this is not a png');
  try {
    await assert.rejects(
      () => assertStoredFile({ filePath: fake, size: 16, mimeType: 'image/png', filename: 'fake.png' }),
      /图片格式不支持/,
    );

    const real = path.join(dir, 'real.png');
    await fs.writeFile(real, PNG_1PX);
    const result = await assertStoredFile({
      filePath: real,
      size: PNG_1PX.length,
      mimeType: 'image/png',
      filename: 'real.png',
    });
    assert.equal(result.format, 'png');
    assert.equal(result.category, 'image');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('开启压缩时 JPEG/PNG 转 WebP，SVG 不动', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'eadaf-fs-webp-'));
  applyFileStorageSettings({ imageCompress: true });
  try {
    const png = path.join(dir, 'a.png');
    await fs.writeFile(png, PNG_1PX);
    const stored = await buildStoredUpload({
      filePath: png,
      size: PNG_1PX.length,
      mimeType: 'image/png',
      filename: 'a.png',
    });
    assert.equal(stored.mimeType, 'image/webp');
    assert.equal(stored.filename, 'a.webp');
    assert.match(stored.path, /\.webp$/);
    assert.ok((await fs.stat(stored.path)).size > 0);

    const svg = path.join(dir, 'b.svg');
    await fs.writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const kept = await buildStoredUpload({
      filePath: svg,
      size: 40,
      mimeType: 'image/svg+xml',
      filename: 'b.svg',
    });
    assert.equal(kept.mimeType, 'image/svg+xml');
    assert.equal(kept.path, svg);
  } finally {
    applyFileStorageSettings(null);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('保存设置后 multipart 全局上限立即跟着变大（无需重启）', () => {
  const formidable = { maxFileSize: 100 * MB };
  bindMultipartOptions(formidable);
  applyFileStorageSettings({ imageMaxMb: 5, documentMaxMb: 50, videoMaxMb: 500 });
  assert.equal(formidable.maxFileSize, 500 * MB);

  applyFileStorageSettings({ imageMaxMb: 5, documentMaxMb: 50, videoMaxMb: 1024 });
  assert.equal(formidable.maxFileSize, 1024 * MB);

  applyFileStorageSettings(null);
  assert.equal(formidable.maxFileSize, 500 * MB);
});

test('只读存储信息反映 MinIO 单桶与缓存前缀', () => {
  const info = storageInfo();
  assert.equal(info.backend, 'minio');
  assert.equal(info.objectKeyPattern, '{bucketCode}/{objectId}{ext}');
  assert.equal(info.cropCachePrefix, 'img-crop-cache/');
  assert.ok(info.bucket);
  assert.ok(info.tusTempDir);
  assert.ok(info.hardMaxMb >= 1);
});
