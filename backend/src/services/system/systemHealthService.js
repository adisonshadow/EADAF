/**
 * 管理端系统健康报告。
 *
 * 只读：不 ensure 系统桶，不连接业务库做实时探测。
 * 结果缓存约 15 秒，避免头像轮询把探端口和查表打满。
 */
const config = require('../../config');
const { AiModel, BizdataDatabaseConnection, StorageBucket } = require('../../models');
const { probeDependencies } = require('../../utils/dependencyDiagnostics');
const { checkRuntime, checkEnvConfig, checkDbStructure } = require('../../utils/startupSelfCheck');
const { evaluateSystemHealth, skippedDbFacts } = require('./systemHealthEvaluate');

const CACHE_MS = 15_000;
const POSTGRES_DOWN_SUMMARY = '平台数据库不可达，跳过';
const STRUCTURE_DOWN_SUMMARY = '库结构未就绪，跳过';

let cached = null;

function firstLine(message) {
  const text = String(message || '未知错误').split('\n')[0].trim();
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function resetSystemHealthCache() {
  cached = null;
}

async function readSystemBucket() {
  const code = config.storage.systemBucket.code;
  try {
    const bucket = await StorageBucket.findOne({
      where: { code },
      attributes: ['bucket_id', 'code'],
    });
    if (!bucket) {
      return {
        status: 'fail',
        text: `${code} 不存在`,
        hint: '它是平台库里的一行记录。库结构就绪后重启服务会自动补建',
      };
    }
    return { status: 'ok', text: `${code} 已就绪`, hint: null };
  } catch (error) {
    return {
      status: 'fail',
      text: `读取失败：${firstLine(error.message)}`,
      hint: null,
    };
  }
}

async function readConnections() {
  try {
    const rows = await BizdataDatabaseConnection.findAll({
      attributes: ['name', 'is_default', 'last_test_status'],
      raw: true,
    });
    return {
      state: 'rows',
      rows: rows.map((row) => ({
        name: row.name,
        isDefault: Boolean(row.is_default),
        lastTestStatus: row.last_test_status || null,
      })),
    };
  } catch (error) {
    return { state: 'error', summary: `无法读取业务数据库连接：${firstLine(error.message)}` };
  }
}

async function readActiveAiModels() {
  try {
    const count = await AiModel.count({ where: { is_active: true } });
    return { state: 'count', count };
  } catch (error) {
    return { state: 'error', summary: `无法读取 AI 模型：${firstLine(error.message)}` };
  }
}

async function collectSystemHealth() {
  const dependencies = await probeDependencies();
  const postgres = dependencies.find((dep) => dep.key === 'postgres');
  const postgresUp = Boolean(postgres && postgres.reachable);

  let dbFacts;
  if (!postgresUp) {
    dbFacts = skippedDbFacts(POSTGRES_DOWN_SUMMARY);
  } else {
    const structure = await checkDbStructure();
    if (structure.status === 'fail') {
      dbFacts = {
        ...skippedDbFacts(STRUCTURE_DOWN_SUMMARY),
        structure,
      };
    } else {
      const [systemBucket, connections, aiModels] = await Promise.all([
        readSystemBucket(),
        readConnections(),
        readActiveAiModels(),
      ]);
      dbFacts = { structure, systemBucket, connections, aiModels };
    }
  }

  const report = evaluateSystemHealth({
    dependencies,
    runtime: checkRuntime(),
    env: checkEnvConfig(),
    ...dbFacts,
  });
  return { ...report, checkedAt: new Date().toISOString() };
}

async function getSystemHealthReport({ bypassCache = false, now = Date.now() } = {}) {
  if (!bypassCache && cached && now - cached.at < CACHE_MS) {
    return cached.report;
  }
  const report = await collectSystemHealth();
  cached = { at: now, report };
  return report;
}

module.exports = {
  CACHE_MS,
  getSystemHealthReport,
  resetSystemHealthCache,
};
