const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Readable } = require('node:stream');

const sharp = require('sharp');

const objectStorePath = require.resolve('./objectStore');

/** 用假的 objectStore 替换真模块，然后加载 imgCropService（见 #20 的降级逻辑） */
function loadCropService(store) {
  const stub = {
    assertObjectKey: (k) => String(k || '').replace(/\\/g, '/').replace(/^\/+/, ''),
    stat: async () => null,
    getStream: async () => null,
    getBuffer: async () => Buffer.alloc(0),
    putBuffer: async () => ({ key: '', size: 0 }),
    removeByPrefix: async () => 0,
    ...store,
  };
  const prev = require.cache[objectStorePath];
  require.cache[objectStorePath] = {
    id: objectStorePath,
    filename: objectStorePath,
    loaded: true,
    exports: stub,
  };
  delete require.cache[require.resolve('./imgCropService')];
  const svc = require('./imgCropService');
  return {
    svc,
    restore() {
      if (prev) require.cache[objectStorePath] = prev;
      else delete require.cache[objectStorePath];
      delete require.cache[require.resolve('./imgCropService')];
    },
  };
}

async function readAll(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

const streamOf = (buf) => Readable.from(buf);

test('源缺失 + 可原样回传类型：返回占位 PNG，不再 404', async () => {
  const { svc, restore } = loadCropService({
    stat: async () => null,
    getStream: async () => {
      throw Object.assign(new Error('对象不存在'), { status: 404 });
    },
  });
  try {
    const out = await svc.cropImage({
      objectId: 'obj-1',
      sourceKey: 'fpcu/obj-1.png',
      query: { w: '80', h: '80', fit: 'contain' },
      mimeType: 'image/png',
    });
    assert.equal(out.fallback, 'placeholder');
    assert.equal(out.contentType, 'image/png');
    const buf = await readAll(out.stream);
    const meta = await sharp(buf).metadata();
    assert.equal(meta.format, 'png');
    assert.equal(meta.width, 80);
    assert.equal(meta.height, 80);
  } finally {
    restore();
  }
});

test('源缺失 + 不可显示类型：仍然给占位图（不让接口 500/404）', async () => {
  const { svc, restore } = loadCropService({ stat: async () => null });
  try {
    const out = await svc.cropImage({
      objectId: 'obj-2',
      sourceKey: 'fpcu/obj-2.zip',
      query: { w: '64', h: '64' },
      mimeType: 'application/zip',
    });
    assert.equal(out.fallback, 'placeholder');
    assert.equal(out.contentType, 'image/png');
  } finally {
    restore();
  }
});

test('sourceKey 为空：同样走占位图而不是 404', async () => {
  const { svc, restore } = loadCropService({});
  try {
    const out = await svc.cropImage({ objectId: 'obj-3', sourceKey: null, query: { w: '32' }, mimeType: 'image/png' });
    assert.equal(out.fallback, 'placeholder');
    assert.equal(out.contentType, 'image/png');
  } finally {
    restore();
  }
});

test('缓存命中：直接返回缓存 webp，不读原图', async () => {
  let sourceStatCalls = 0;
  const cached = Buffer.from('fake-webp');
  const { svc, restore } = loadCropService({
    stat: async (key) => {
      if (key.startsWith('img-crop-cache/')) return { size: cached.length };
      sourceStatCalls += 1;
      return null;
    },
    getStream: async () => streamOf(cached),
  });
  try {
    const out = await svc.cropImage({
      objectId: 'obj-4',
      sourceKey: 'fpcu/obj-4.png',
      query: { w: '80', h: '80', fit: 'contain' },
      mimeType: 'image/png',
    });
    assert.equal(out.contentType, 'image/webp');
    assert.equal(out.fallback, undefined);
    assert.equal(sourceStatCalls, 0, '缓存命中后不应再 stat 原图');
    assert.equal((await readAll(out.stream)).toString(), 'fake-webp');
  } finally {
    restore();
  }
});

test('源存在：正常裁剪为 webp 并写缓存', async () => {
  const source = await sharp({
    create: { width: 200, height: 100, channels: 3, background: { r: 10, g: 120, b: 200 } },
  }).png().toBuffer();
  const written = [];
  const { svc, restore } = loadCropService({
    stat: async (key) => (key.startsWith('img-crop-cache/') ? null : { size: source.length }),
    getBuffer: async () => source,
    putBuffer: async (key, buf, meta) => {
      written.push({ key, size: buf.length, meta });
      return { key, size: buf.length };
    },
    getStream: async (key) => {
      const w = written.find((x) => x.key === key);
      assert.ok(w, `getStream 只应读取已写入的缓存键，实际: ${key}`);
      return streamOf(Buffer.alloc(w.size, 1));
    },
  });
  try {
    const out = await svc.cropImage({
      objectId: 'obj-5',
      sourceKey: 'fpcu/obj-5.png',
      query: { w: '50', h: '50', fit: 'contain' },
      mimeType: 'image/png',
    });
    assert.equal(out.contentType, 'image/webp');
    assert.equal(out.fallback, undefined);
    assert.equal(written.length, 1);
    assert.equal(written[0].key, 'img-crop-cache/obj-5_50x50_contain.webp');
    assert.equal(written[0].meta['Content-Type'], 'image/webp');
  } finally {
    restore();
  }
});

test('源存在但解不动 + 可原样回传类型：回退原图而不是报错', async () => {
  const corrupt = Buffer.from('not-a-real-image');
  const { svc, restore } = loadCropService({
    stat: async (key) => (key.startsWith('img-crop-cache/') ? null : { size: corrupt.length }),
    getBuffer: async () => corrupt,
    putBuffer: async () => ({ key: '', size: 0 }),
    getStream: async () => streamOf(corrupt),
  });
  try {
    const out = await svc.cropImage({
      objectId: 'obj-6',
      sourceKey: 'fpcu/obj-6.png',
      query: { w: '50', h: '50' },
      mimeType: 'image/png',
    });
    assert.equal(out.fallback, 'original');
    assert.equal(out.contentType, 'image/png');
    assert.equal((await readAll(out.stream)).toString(), 'not-a-real-image');
  } finally {
    restore();
  }
});
