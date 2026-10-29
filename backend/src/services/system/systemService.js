const path = require('path');
const fs = require('fs/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');
const config = require('../../config');
const { BizdataSetting } = require('../../models');
const { resolveBash, toBashPath, readPackageVersion, REPO_ROOT } = require('../appDeployment/packRuntime');
const {
  readStoredLogRotation,
  resolveLogRotation,
  normalizeLogRotation,
  toWinstonRotation,
} = require('./logRotationSettings');

const execFileAsync = promisify(execFile);

const SYSTEM_FEATURES_KEY = 'system_features';
const projectRoot = path.resolve(__dirname, '../../..');
const DEFAULT_BACKUP_DIR_NAME = 'db-backup';

/** 自动备份默认周期：每天凌晨 3 点 */
const DEFAULT_AUTO_BACKUP_CRON = '0 3 * * *';

/** env 里的默认备份目录（DB_BACKUP_DIR，可相对 backend 根；未配置时 <backend>/db-backup） */
function defaultBackupDir() {
  const envDir = process.env.DB_BACKUP_DIR;
  if (!envDir) return path.join(projectRoot, DEFAULT_BACKUP_DIR_NAME);
  return path.isAbsolute(envDir) ? path.normalize(envDir) : path.resolve(projectRoot, envDir);
}

/** 备份目录值 → 绝对路径（设置页存的是绝对路径，兼容手改成相对的旧值）；空返回 null */
function normalizeBackupDirPath(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(projectRoot, raw);
}

/** system_features 原始 JSON（功能开关 + 备份目录等配置都存这一条） */
async function readStoredFeatures() {
  const setting = await BizdataSetting.findOne({ where: { key: SYSTEM_FEATURES_KEY } });
  return setting?.value && typeof setting.value === 'object' ? setting.value : {};
}

/** 归一化已知字段，避免把历史/导入数据里的未知键透出去 */
function formatStoredFeatures(value = {}) {
  return {
    metadataEnabled: Boolean(value.metadataEnabled),
    apiServiceAllowWriteOperations: Boolean(value.apiServiceAllowWriteOperations),
    apiServiceTestAutoRollback: value.apiServiceTestAutoRollback !== false,
    autoBackupEnabled: Boolean(value.autoBackupEnabled),
    autoBackupCron:
      typeof value.autoBackupCron === 'string' && value.autoBackupCron.trim()
        ? value.autoBackupCron.trim()
        : DEFAULT_AUTO_BACKUP_CRON,
    backupDir: normalizeBackupDirPath(value.backupDir),
    logRotation: readStoredLogRotation(value.logRotation),
    threeMemberEnabled: Boolean(value.threeMemberEnabled),
  };
}

/**
 * 当前生效的备份目录：设置页自定义（绝对路径）优先，否则退回 env / 默认目录。
 * 备份脚本、备份列表、「立即备份」都必须走这一个解析，
 * 否则会出现「改了目录但备份还写老地方 / 列表还是老目录」。
 */
async function resolveBackupDir() {
  const stored = formatStoredFeatures(await readStoredFeatures());
  return stored.backupDir || defaultBackupDir();
}

/**
 * 校验并准备自定义备份目录：目录不存在会自动创建，并写探针文件验证可写。
 * 目的是把「路径写错 / 盘符无权限 / 只读目录」在保存时直接报出来，
 * 而不是等凌晨自动备份静默失败。
 */
async function prepareBackupDir(input) {
  if (input !== null && input !== undefined && typeof input !== 'string') {
    throw Object.assign(new Error('备份目录必须是字符串路径'), { status: 400 });
  }
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return null; // 清空 → 恢复默认目录

  const dir = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(projectRoot, raw);
  try {
    const stat = await fs.stat(dir).catch(() => null);
    if (stat && !stat.isDirectory()) {
      throw new Error('该路径已存在且不是目录');
    }
    await fs.mkdir(dir, { recursive: true });
    const probe = path.join(dir, `.eadaf-write-test-${process.pid}-${Date.now()}`);
    await fs.writeFile(probe, 'ok');
    await fs.unlink(probe);
  } catch (error) {
    throw Object.assign(new Error(`备份目录不可写：${dir}（${error.message}）`), { status: 400 });
  }
  return dir;
}

function formatStandard(row) {
  if (!row) return null;
  const d = row.toJSON ? row.toJSON() : row;
  return {
    id: d.id,
    name: d.name,
    code: d.code,
    version: d.version,
    description: d.description,
    status: d.status,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

/** 当前平台版本：仓库根 package.json 的 version，只读，不写入 system_features */
function readPlatformVersion() {
  return readPackageVersion(REPO_ROOT) || '';
}

async function getSystemFeatures() {
  const stored = formatStoredFeatures(await readStoredFeatures());
  return {
    version: readPlatformVersion(),
    metadataEnabled: stored.metadataEnabled,
    apiServiceAllowWriteOperations: stored.apiServiceAllowWriteOperations,
    apiServiceTestAutoRollback: stored.apiServiceTestAutoRollback,
    autoBackupEnabled: stored.autoBackupEnabled,
    autoBackupCron: stored.autoBackupCron,
    /** 当前生效的备份目录（绝对路径，设置页展示用） */
    backupDir: stored.backupDir || defaultBackupDir(),
    /** 是否被设置页改过（false 表示用 env DB_BACKUP_DIR / 默认目录） */
    backupDirIsCustom: Boolean(stored.backupDir),
    /** 默认目录，供设置页在清空自定义时提示 */
    defaultBackupDir: defaultBackupDir(),
    ...publicLogRotation(stored.logRotation),
    threeMemberEnabled: stored.threeMemberEnabled,
  };
}

function publicLogRotation(stored) {
  const effective = resolveLogRotation(stored);
  return {
    logMaxSize: effective.maxSize,
    logRetentionDays: effective.retentionDays,
    logErrorRetentionDays: effective.errorRetentionDays,
    logZippedArchive: effective.zippedArchive,
    /** false 表示还在用 env / 默认值，设置页没保存过 */
    logRotationIsCustom: Boolean(stored),
  };
}

function applyEffectiveLogRotation(stored) {
  const winstonRotation = toWinstonRotation(resolveLogRotation(stored));
  const logger = require('../../utils/logger');
  logger.applyLogRotation(winstonRotation);
  const { applyAiToolInvokeLogRotation } = require('../ai/aiToolInvokeLogService');
  applyAiToolInvokeLogRotation(winstonRotation);
}

/** 启动后把设置页保存的日志滚动套到当前进程；库不可用时保持 env 默认。 */
async function applyStoredLogRotation() {
  const stored = formatStoredFeatures(await readStoredFeatures());
  applyEffectiveLogRotation(stored.logRotation);
}

async function updateSystemFeatures(payload, options = {}) {
  const stored = formatStoredFeatures(await readStoredFeatures());
  const next = { ...stored };

  if (payload.metadataEnabled !== undefined) next.metadataEnabled = Boolean(payload.metadataEnabled);
  if (payload.apiServiceAllowWriteOperations !== undefined) {
    next.apiServiceAllowWriteOperations = Boolean(payload.apiServiceAllowWriteOperations);
  }
  if (payload.apiServiceTestAutoRollback !== undefined) {
    next.apiServiceTestAutoRollback = Boolean(payload.apiServiceTestAutoRollback);
  }
  if (payload.autoBackupEnabled !== undefined) {
    next.autoBackupEnabled = Boolean(payload.autoBackupEnabled);
  }
  if (payload.autoBackupCron !== undefined) {
    next.autoBackupCron =
      typeof payload.autoBackupCron === 'string' && payload.autoBackupCron.trim()
        ? payload.autoBackupCron.trim()
        : DEFAULT_AUTO_BACKUP_CRON;
  }
  if (payload.backupDir !== undefined) {
    // 目录先验证可写再落库，避免存进一个备份时必然失败/需要手工修库的路径
    next.backupDir = await prepareBackupDir(payload.backupDir);
  }
  const logRotationTouched = payload.logRotationReset === true
    || payload.logMaxSize !== undefined
    || payload.logRetentionDays !== undefined
    || payload.logErrorRetentionDays !== undefined
    || payload.logZippedArchive !== undefined;
  if (payload.threeMemberEnabled !== undefined) {
    const enabling = Boolean(payload.threeMemberEnabled);
    if (enabling && !stored.threeMemberEnabled) {
      const { assignThreeMembers, assertThreeMembersPresent, applyDefaultDuties } = require('./threeMember');
      if (payload.threeMemberAssignments) {
        await assignThreeMembers(payload.threeMemberAssignments);
      }
      await assertThreeMembersPresent();
      await applyDefaultDuties();
    }
    next.threeMemberEnabled = enabling;
  }
  if (payload.logRotationReset === true) {
    next.logRotation = null;
  } else if (
    payload.logMaxSize !== undefined
    || payload.logRetentionDays !== undefined
    || payload.logErrorRetentionDays !== undefined
    || payload.logZippedArchive !== undefined
  ) {
    const current = resolveLogRotation(stored.logRotation);
    next.logRotation = normalizeLogRotation({
      maxSize: payload.logMaxSize !== undefined ? payload.logMaxSize : current.maxSize,
      retentionDays: payload.logRetentionDays !== undefined ? payload.logRetentionDays : current.retentionDays,
      errorRetentionDays: payload.logErrorRetentionDays !== undefined
        ? payload.logErrorRetentionDays
        : current.errorRetentionDays,
      zippedArchive: payload.logZippedArchive !== undefined
        ? payload.logZippedArchive
        : current.zippedArchive,
    });
  }

  const value = { ...next };
  if (!value.backupDir) delete value.backupDir; // 保持 JSON 干净，恢复默认时不留空键
  if (!value.logRotation) delete value.logRotation;

  const [setting] = await BizdataSetting.findOrCreate({
    where: { key: SYSTEM_FEATURES_KEY },
    defaults: { value },
  });

  if (!setting.isNewRecord) {
    await setting.update({ value });
  }

  // 配置变更后重排自动备份定时任务（惰性 require 避免循环依赖）
  const { applyAutoBackupSchedule } = require('./autoBackupScheduler');
  applyAutoBackupSchedule(next);
  if (logRotationTouched) applyEffectiveLogRotation(next.logRotation);

  return getSystemFeatures();
}

async function listBackups() {
  const backupDir = await resolveBackupDir();
  try {
    const entries = await fs.readdir(backupDir);
    const dumps = entries.filter((name) => name.endsWith('.dump'));
    const items = [];

    for (const name of dumps) {
      const filePath = path.join(backupDir, name);
      const stat = await fs.stat(filePath);
      items.push({
        name,
        path: filePath,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
      });
    }

    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return { backupDir, items };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { backupDir, items: [] };
    }
    throw error;
  }
}

/**
 * 组装执行 backend/scripts 下 bash 脚本的调用参数。
 *
 * 不能在 Windows 上直接 `execFile('bash', ...)`：PATH 里的 bash 往往是
 * System32 的 WSL 转发器，它会把 `D:\DEV\...` 中的反斜杠当转义吃掉
 * （变成 `D:DEVEADAF...`），于是必然 "No such file or directory"；
 * 且 WSL 里没有本机的 docker / node 环境，备份/恢复本就跑不起来。
 * 统一走 packRuntime.resolveBash()：POSIX 用系统 bash，Windows 优先 Git Bash。
 */
function buildScriptInvocation(scriptName, scriptArgs = []) {
  const bash = resolveBash();
  if (!bash.available || !bash.path) {
    const error = new Error(bash.hint || '未检测到可用的 bash，无法执行数据库备份脚本');
    error.status = 400;
    throw error;
  }

  const scriptPath = path.join(projectRoot, 'scripts', scriptName);
  const toScriptArg = (value) => (path.isAbsolute(value) ? toBashPath(value, bash.kind) : value);

  if (bash.kind === 'wsl') {
    return {
      command: bash.path,
      args: [
        '--cd',
        toBashPath(projectRoot, 'wsl'),
        'bash',
        `scripts/${scriptName}`,
        ...scriptArgs.map(toScriptArg),
      ],
    };
  }

  return {
    command: bash.path,
    args: [toBashPath(scriptPath, bash.kind), ...scriptArgs.map(toScriptArg)],
  };
}

/** 本地绝对路径 → 交给 bash 脚本当 env 用的形态（Git Bash: /d/...；WSL: /mnt/d/...） */
function toScriptPath(localPath) {
  const bash = resolveBash();
  return toBashPath(localPath, bash.kind);
}

/** 脚本失败时把 stderr（脚本自己的中文日志）而不是 "Command failed: ..." 抛给前端。 */
function toScriptError(error, scriptName) {
  const detail = String(error?.stderr || '').trim() || String(error?.stdout || '').trim();
  const message = detail
    ? `${scriptName} 执行失败：\n${detail.length > 4000 ? detail.slice(-4000) : detail}`
    : `${scriptName} 执行失败：${error?.message || '未知错误'}`;
  return Object.assign(new Error(message), { status: error?.status || 500 });
}

async function execScript(scriptName, scriptArgs = [], options = {}) {
  const { env: extraEnv, ...execOptions } = options;
  const { command, args } = buildScriptInvocation(scriptName, scriptArgs);
  try {
    return await execFileAsync(command, args, {
      cwd: projectRoot,
      env: { ...process.env, NODE_ENV: config.env, ...(extraEnv || {}) },
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
      ...execOptions,
    });
  } catch (error) {
    throw toScriptError(error, scriptName);
  }
}

async function runBackup() {
  // 备份目录可能在设置页被改过：必须把「当前生效目录」显式传给脚本，
  // 否则脚本会退回 env(DB_BACKUP_DIR)/默认目录，用户改了地址却写不进去。
  const backupDir = await resolveBackupDir();
  const { stdout, stderr } = await execScript('backup-db-now.sh', [], {
    timeout: 600000,
    env: { DB_BACKUP_DIR: toScriptPath(backupDir) },
  });

  const backups = await listBackups();
  return {
    stdout: stdout || '',
    stderr: stderr || '',
    latestBackup: backups.items[0] || null,
    backupDir,
  };
}

/**
 * 用 .dump 备份文件恢复当前数据库（覆盖现有数据，高危操作）。
 * 实际执行在 restore-db-now.sh：容器内 pg_restore（与服务器版本一致）。
 * @param {string} dumpFilePath 上传的 dump 文件绝对路径
 */
async function restoreBackup(dumpFilePath) {
  if (!dumpFilePath || !path.isAbsolute(dumpFilePath)) {
    throw new Error('恢复失败：备份文件路径无效');
  }

  const { stdout, stderr } = await execScript('restore-db-now.sh', [dumpFilePath], {
    timeout: 1800000,
  });

  return {
    stdout: stdout || '',
    stderr: stderr || '',
  };
}

module.exports = {
  SYSTEM_FEATURES_KEY,
  DEFAULT_AUTO_BACKUP_CRON,
  formatStandard,
  getSystemFeatures,
  applyStoredLogRotation,
  updateSystemFeatures,
  listBackups,
  runBackup,
  restoreBackup,
  resolveBackupDir,
};
