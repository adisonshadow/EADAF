const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertForceTargetSchema,
  summarizeFileSchemas,
  relocationNeeded,
  mergeSchemaOptions,
  isSelectableSchema,
  rewriteSchemaQualifiers,
  relocateImportedRecord,
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

test('覆盖 schema 时只改写已知表的限定名', () => {
  const sql = [
    'SELECT * FROM public.ips_workstation WHERE 1 = 1',
    'SELECT * FROM "public"."IPS_service_CallType"',
    'SELECT public.uuid_generate_v4()',
  ].join('\n');
  const next = rewriteSchemaQualifiers(sql, {
    fromSchemas: ['public', 'bizdata_mat'],
    toSchema: 'bizdata_mat',
    tableNames: ['ips_workstation', 'IPS_service_CallType'],
  });
  assert.match(next, /FROM "bizdata_mat"\."ips_workstation"/);
  assert.match(next, /FROM "bizdata_mat"\."IPS_service_CallType"/);
  assert.match(next, /public\.uuid_generate_v4\(\)/);
  assert.doesNotMatch(next, /public\.ips_workstation/);
});

test('API 记录的 target_schema 与脚本副本一起改写', () => {
  const overrides = relocateImportedRecord({
    target_schema: 'public',
    definition_script: 'SELECT * FROM public.ips_workstation',
    script_overrides: { __definition__: 'SELECT * FROM public.ips_workstation' },
  }, {
    toSchema: 'bizdata_mat',
    fromSchemas: ['public', 'bizdata_mat'],
    tableNames: ['ips_workstation'],
  });
  assert.equal(overrides.target_schema, 'bizdata_mat');
  assert.match(overrides.definition_script, /"bizdata_mat"\."ips_workstation"/);
  assert.match(overrides.script_overrides.__definition__, /"bizdata_mat"\."ips_workstation"/);
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
