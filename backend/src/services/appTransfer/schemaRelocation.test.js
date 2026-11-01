const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertForceTargetSchema,
  summarizeFileSchemas,
  relocationNeeded,
  mergeSchemaOptions,
  isSelectableSchema,
} = require('./schemaRelocation');

test('包内 schema 与本地一致时不需要改写', () => {
  const fileSchemas = summarizeFileSchemas([
    { targetSchema: 'bizdata_mat', dbType: 'postgresql', rowCount: 3 },
    { targetSchema: 'bizdata_mat', dbType: 'postgresql', rowCount: 1, rowsOmitted: false },
    { entityCode: 'IPS:service:CallType', rowsOmitted: true },
  ]);
  assert.equal(fileSchemas.length, 1);
  assert.equal(fileSchemas[0].entityCount, 2);
  assert.equal(fileSchemas[0].rowCount, 4);
  assert.equal(relocationNeeded(fileSchemas, 'bizdata_mat'), false);
});

test('包内同时落在 public 与 bizdata_mat 时需要改写', () => {
  const fileSchemas = summarizeFileSchemas([
    { targetSchema: 'public', dbType: 'postgresql', rowCount: 789 },
    { targetSchema: 'public', dbType: 'postgresql', rowCount: 0 },
    { targetSchema: 'bizdata_mat', dbType: 'postgresql', rowCount: 0 },
  ]);
  assert.deepEqual(fileSchemas.map((item) => item.schema), ['public', 'bizdata_mat']);
  assert.equal(fileSchemas[0].rowCount, 789);
  assert.equal(fileSchemas[0].entityCount, 2);
  assert.equal(relocationNeeded(fileSchemas, 'bizdata_mat'), true);
});

test('包内只有 public、本地连接是 bizdata_mat 时需要改写', () => {
  const fileSchemas = summarizeFileSchemas([
    { targetSchema: 'public', dbType: 'postgresql', rowCount: 8 },
  ]);
  assert.equal(relocationNeeded(fileSchemas, 'bizdata_mat'), true);
});

test('本地 schema 列表包含库中已有项,并把连接配置排在前面', () => {
  const options = mergeSchemaOptions(['public', 'audit', 'pg_catalog', 'information_schema'], 'bizdata_mat');
  assert.deepEqual(options, [
    { name: 'bizdata_mat', configured: true, exists: false },
    { name: 'audit', configured: false, exists: true },
    { name: 'public', configured: false, exists: true },
  ]);
  const present = mergeSchemaOptions(['bizdata_mat', 'public'], 'bizdata_mat');
  assert.equal(present[0].exists, true);
  assert.equal(present[0].configured, true);
});

test('forceTargetSchema 只接受普通 schema 名', () => {
  assert.equal(assertForceTargetSchema(' bizdata_mat '), 'bizdata_mat');
  assert.equal(assertForceTargetSchema(''), null);
  assert.equal(assertForceTargetSchema(null), null);
  assert.equal(isSelectableSchema('public'), true);
  assert.throws(() => assertForceTargetSchema('public.ips_product'), /forceTargetSchema/);
  assert.throws(() => assertForceTargetSchema('pg_catalog'), /forceTargetSchema/);
  assert.throws(() => assertForceTargetSchema('bizdata_mat"; DROP SCHEMA public'), /forceTargetSchema/);
});
