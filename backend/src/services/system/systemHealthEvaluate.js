/**
 * 系统健康项判定（纯函数）。
 *
 * 采集（探端口、查库）在 systemHealthService。这里只根据已经拿到的事实
 * 决定每一项是错误、警告、正常还是跳过，方便单测不连数据库。
 *
 * 严重错误会挡住主流程；警告是降级，平台其余功能仍可用。
 * 平台库不可达时，依赖平台库的项必须是 skip，不能误报成「没配业务连接」。
 */

const BIZDATA_CONNECTIONS_HREF = '/business_data/database-connections';
const AI_MODELS_HREF = '/ai_management/models';

const STATUS_RANK = { error: 0, warning: 1, ok: 2, skip: 3 };

const ITEM_ORDER = [
  'runtime',
  'env',
  'postgres',
  'minio',
  'redis',
  'dbStructure',
  'systemBucket',
  'bizdataConnections',
  'aiModels',
];

function hintText(hint) {
  if (hint == null || hint === '') return null;
  if (Array.isArray(hint)) {
    const parts = hint.map((item) => String(item || '').trim()).filter(Boolean);
    return parts.length ? parts.join('；') : null;
  }
  const text = String(hint).trim();
  return text || null;
}

function mapStartupStatus(status) {
  if (status === 'fail') return 'error';
  if (status === 'warn') return 'warning';
  if (status === 'ok') return 'ok';
  return 'skip';
}

function item({ key, label, status, summary, hint = null, href = null }) {
  return {
    key,
    label,
    status,
    summary,
    hint: hintText(hint),
    href: href || null,
  };
}

function fromStartupCheck(key, label, check, href = null) {
  if (!check) {
    return item({
      key,
      label,
      status: 'skip',
      summary: '平台数据库不可达，跳过',
    });
  }
  return item({
    key,
    label,
    status: mapStartupStatus(check.status),
    summary: check.text || check.summary || '',
    hint: check.hint,
    href,
  });
}

function addressOf(dep) {
  if (!dep || !dep.host || !dep.port) return '未配置';
  return `${dep.host}:${dep.port}`;
}

function dependencyDownSummary(dep) {
  const where = addressOf(dep);
  if (dep.configured === false || dep.code === 'NOT_CONFIGURED') {
    return `${where} · 未配置`;
  }
  return `${where} · ${dep.code || '不可达'}`;
}

function dependencyItem(dep, statusWhenDown) {
  if (!dep) {
    return item({
      key: 'unknown',
      label: '依赖',
      status: 'skip',
      summary: '未采集',
    });
  }
  if (dep.reachable) {
    return item({
      key: dep.key,
      label: dep.label,
      status: 'ok',
      summary: `${addressOf(dep)} 可用`,
    });
  }
  return item({
    key: dep.key,
    label: dep.label,
    status: statusWhenDown,
    summary: dependencyDownSummary(dep),
    hint: dep.impact || null,
  });
}

function evaluateConnections(input) {
  const label = '业务数据库连接';
  if (input == null || input.state === 'skip') {
    return item({
      key: 'bizdataConnections',
      label,
      status: 'skip',
      summary: input?.summary || '平台数据库不可达，跳过',
    });
  }
  if (input.state === 'error') {
    return item({
      key: 'bizdataConnections',
      label,
      status: 'error',
      summary: input.summary || '无法读取业务数据库连接',
      hint: '确认平台库里的 bizdata.database_connections 已建好',
      href: BIZDATA_CONNECTIONS_HREF,
    });
  }

  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!rows.length) {
    return item({
      key: 'bizdataConnections',
      label,
      status: 'error',
      summary: '未配置任何数据库连接',
      hint: '物化、数据 API、采集和指标都依赖它。到业务数据 → 数据库连接新建一条，并设为默认',
      href: BIZDATA_CONNECTIONS_HREF,
    });
  }

  const defaults = rows.filter((row) => row.isDefault);
  if (!defaults.length) {
    return item({
      key: 'bizdataConnections',
      label,
      status: 'error',
      summary: `已有 ${rows.length} 条连接，但没有默认连接`,
      hint: '未指定连接时会走默认连接，没有默认连接则业务数据无法继续。请指定一条默认连接',
      href: BIZDATA_CONNECTIONS_HREF,
    });
  }

  const failed = defaults.filter((row) => row.lastTestStatus === 'failed');
  const passed = defaults.filter((row) => row.lastTestStatus === 'success');
  if (failed.length && !passed.length) {
    const name = failed[0].name || '默认连接';
    return item({
      key: 'bizdataConnections',
      label,
      status: 'error',
      summary: `默认连接「${name}」上次测试失败`,
      hint: '目标库当前不可用。请到数据库连接重新测试，并修正地址、账号或库名',
      href: BIZDATA_CONNECTIONS_HREF,
    });
  }
  if (!passed.length) {
    const name = defaults[0].name || '默认连接';
    return item({
      key: 'bizdataConnections',
      label,
      status: 'warning',
      summary: `默认连接「${name}」尚未测试`,
      hint: '配置已保存，但还没确认目标库能连通。请到数据库连接执行一次测试',
      href: BIZDATA_CONNECTIONS_HREF,
    });
  }

  const name = passed[0].name || '默认连接';
  return item({
    key: 'bizdataConnections',
    label,
    status: 'ok',
    summary: `默认连接「${name}」上次测试通过（共 ${rows.length} 条）`,
    href: BIZDATA_CONNECTIONS_HREF,
  });
}

function evaluateAiModels(input) {
  const label = 'AI 模型';
  if (input == null || input.state === 'skip') {
    return item({
      key: 'aiModels',
      label,
      status: 'skip',
      summary: input?.summary || '平台数据库不可达，跳过',
    });
  }
  if (input.state === 'error') {
    return item({
      key: 'aiModels',
      label,
      status: 'error',
      summary: input.summary || '无法读取 AI 模型',
      href: AI_MODELS_HREF,
    });
  }
  const count = Number(input.count) || 0;
  if (count <= 0) {
    return item({
      key: 'aiModels',
      label,
      status: 'warning',
      summary: '没有启用中的 AI 模型',
      hint: 'AI 对话不可用，其余功能不受影响',
      href: AI_MODELS_HREF,
    });
  }
  return item({
    key: 'aiModels',
    label,
    status: 'ok',
    summary: `已启用 ${count} 个模型`,
    href: AI_MODELS_HREF,
  });
}

function findDep(dependencies, key) {
  return (dependencies || []).find((dep) => dep.key === key) || null;
}

/**
 * @returns {{ status: 'ok'|'warning'|'error', errorCount: number, warningCount: number, items: object[] }}
 */
function evaluateSystemHealth(facts = {}) {
  const dependencies = facts.dependencies || [];
  const items = [
    fromStartupCheck('runtime', '运行环境', facts.runtime),
    fromStartupCheck('env', '关键配置', facts.env),
    dependencyItem(findDep(dependencies, 'postgres'), 'error'),
    dependencyItem(findDep(dependencies, 'minio'), 'error'),
    dependencyItem(findDep(dependencies, 'redis'), 'warning'),
    fromStartupCheck('dbStructure', '库结构', facts.structure),
    fromStartupCheck('systemBucket', '系统存储桶', facts.systemBucket),
    evaluateConnections(facts.connections),
    evaluateAiModels(facts.aiModels),
  ];

  items.sort((a, b) => {
    const rank = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    if (rank !== 0) return rank;
    return ITEM_ORDER.indexOf(a.key) - ITEM_ORDER.indexOf(b.key);
  });

  const errorCount = items.filter((row) => row.status === 'error').length;
  const warningCount = items.filter((row) => row.status === 'warning').length;
  let status = 'ok';
  if (errorCount) status = 'error';
  else if (warningCount) status = 'warning';

  return { status, errorCount, warningCount, items };
}

/** 平台库不可达（或库结构未就绪）时，依赖平台库的项统一跳过。 */
function skippedDbFacts(summary) {
  const check = { status: 'skip', text: summary, hint: null };
  return {
    structure: check,
    systemBucket: { ...check },
    connections: { state: 'skip', summary },
    aiModels: { state: 'skip', summary },
  };
}

module.exports = {
  BIZDATA_CONNECTIONS_HREF,
  AI_MODELS_HREF,
  evaluateSystemHealth,
  evaluateConnections,
  evaluateAiModels,
  skippedDbFacts,
};
