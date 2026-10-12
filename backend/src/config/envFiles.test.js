const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { envFileCandidates } = require('./envFiles');

test('加载顺序：.env → .env.{NODE_ENV} → .env.{NODE_ENV}.local（后者覆盖前者）', () => {
  const files = envFileCandidates({ backendRoot: '/repo/backend', nodeEnv: 'development' });
  assert.deepEqual(files, [
    path.join('/repo/backend', '.env'),
    path.join('/repo/backend', '.env.development'),
    path.join('/repo/backend', '.env.development.local'),
  ]);
});

test('.local 一定排在最后（dotenv 不覆盖已存在变量，最后加载 = 优先级最高）', () => {
  const files = envFileCandidates({ backendRoot: '/repo/backend', nodeEnv: 'production' });
  assert.equal(files[files.length - 1], path.join('/repo/backend', '.env.production.local'));
  assert.ok(files.indexOf(path.join('/repo/backend', '.env.production')) < files.length - 1);
});

test('未设置 NODE_ENV 时按 development 处理', () => {
  for (const value of [undefined, null, '', '   ']) {
    const files = envFileCandidates({ backendRoot: '/b', nodeEnv: value });
    assert.equal(files[1], path.join('/b', '.env.development'));
    assert.equal(files[2], path.join('/b', '.env.development.local'));
  }
});

test('不返回重复路径', () => {
  const files = envFileCandidates({ backendRoot: '/b', nodeEnv: 'development' });
  assert.equal(new Set(files).size, files.length);
});
