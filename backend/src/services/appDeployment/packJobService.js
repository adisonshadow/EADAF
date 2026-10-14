'use strict';

/**
 * 发布（打包）任务：把 scripts/deploy/pack-eadaf.sh / pack-app.sh 作为子进程跑起来，
 * 维护日志缓冲与状态，供控制台实时订阅（SSE）与回放。
 *
 * 设计要点：
 * - 内存里保留最近 MAX_JOBS 个任务，日志同时落盘到系统临时目录，便于事后排查；
 * - 同一时刻只允许一个打包任务（平台包与应用包共用 Docker 与 staging 目录）；
 * - 日志按 seq 递增，SSE 客户端可带 fromSeq 续传（刷新页面不丢日志）；
 * - 产物：优先读脚本输出的「压缩包: <路径>」行，失败则退化为扫描输出目录里最新的 .tar.gz。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { randomUUID } = require('crypto');
const logger = require('../../utils/logger');
const {
  REPO_ROOT,
  IS_WINDOWS,
  resolveBash,
  buildSpawnEnv,
  toBashPath,
  fromBashPath,
} = require('./packRuntime');

const MAX_JOBS = 20;
const MAX_LOG_LINES = 5000;
const MAX_LOG_CHARS = 4 * 1024 * 1024;
const ARTIFACT_RE = /^压缩包:\s*(.+?)\s*$/;

/** jobId → job（新→旧顺序另存 order 数组以便裁剪） */
const jobs = new Map();
const order = [];

function logDir() {
  const dir = path.join(os.tmpdir(), 'eadaf-pack-logs');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* 落盘失败不影响内存日志 */
  }
  return dir;
}

function runningJob() {
  for (const id of order) {
    const job = jobs.get(id);
    if (job && job.status === 'running') return job;
  }
  return null;
}

function trimHistory() {
  while (order.length > MAX_JOBS) {
    const id = order.pop();
    const job = jobs.get(id);
    if (job && job.status === 'running') {
      order.unshift(id);
      break;
    }
    jobs.delete(id);
  }
}

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    kind: job.kind,
    label: job.label,
    command: job.command,
    spawnCommand: job.spawnCommand,
    status: job.status,
    exitCode: job.exitCode,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    version: job.version,
    outDir: job.outDir,
    requestedOutDir: job.requestedOutDir,
    artifact: job.artifact,
    error: job.error,
    droppedBefore: job.droppedBefore,
    nextSeq: job.nextSeq,
    logFile: job.logFile,
    meta: job.meta || null,
  };
}

function appendLog(job, stream, text) {
  if (!text) return;
  const at = new Date().toISOString();
  for (const rawLine of String(text).split(/\r?\n/)) {
    if (rawLine === '' && job.log.length && job.log[job.log.length - 1].text === '') continue;
    const line = { seq: job.nextSeq, stream, text: rawLine, at };
    job.nextSeq += 1;
    job.log.push(line);
    job.logChars += rawLine.length + 1;
    // 脚本最后会打印「压缩包: <路径>」，据此确定产物
    const matched = ARTIFACT_RE.exec(rawLine.trim());
    if (matched) job.artifactPathFromLog = fromBashPath(matched[1]);
    trimLog(job);
    broadcast(job, { type: 'log', line });
  }
  if (job.logStream) {
    try {
      job.logStream.write(text.endsWith('\n') ? text : `${text}\n`);
    } catch {
      /* 落盘失败忽略 */
    }
  }
}

/** 日志上限：只保留尾部，超出部分由 droppedBefore 告知客户端。 */
function trimLog(job) {
  while (job.log.length > MAX_LOG_LINES || job.logChars > MAX_LOG_CHARS) {
    const removed = job.log.shift();
    if (!removed) break;
    job.logChars -= removed.text.length + 1;
    job.droppedBefore = removed.seq;
  }
}

function broadcast(job, payload) {
  for (const send of job.subscribers) {
    try {
      send(payload);
    } catch (error) {
      logger.debug('打包日志推送失败', { jobId: job.id, message: error.message });
    }
  }
}

function emitJob(job) {
  broadcast(job, { type: 'job', job: publicJob(job) });
}

/** 订阅任务事件；返回取消订阅函数。 */
function subscribe(jobId, send) {
  const job = jobs.get(jobId);
  if (!job) return null;
  job.subscribers.add(send);
  return () => job.subscribers.delete(send);
}

function getJob(jobId) {
  return publicJob(jobs.get(jobId));
}

function listJobs() {
  return order.map((id) => publicJob(jobs.get(id))).filter(Boolean);
}

function readLog(jobId, fromSeq = 0) {
  const job = jobs.get(jobId);
  if (!job) return null;
  return {
    job: publicJob(job),
    lines: job.log.filter((line) => line.seq > fromSeq),
  };
}

/** 产物识别：脚本打印的路径优先，否则扫描输出目录里最新的 tar.gz。 */
function detectArtifact(job) {
  const candidates = [];
  if (job.artifactPathFromLog) candidates.push(job.artifactPathFromLog);
  if (job.outDir && fs.existsSync(job.outDir)) {
    try {
      const startedMs = new Date(job.startedAt).getTime() - 5 * 1000;
      const entries = fs
        .readdirSync(job.outDir)
        .filter((name) => name.endsWith('.tar.gz'))
        .map((name) => {
          const full = path.join(job.outDir, name);
          const stat = fs.statSync(full);
          return { full, name, mtime: stat.mtimeMs, size: stat.size };
        })
        .filter((entry) => entry.mtime >= startedMs)
        .sort((a, b) => b.mtime - a.mtime);
      for (const entry of entries) candidates.push(entry.full);
    } catch (error) {
      logger.debug('扫描打包产物失败', { jobId: job.id, message: error.message });
    }
  }
  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate);
      if (!stat.isFile()) continue;
      return {
        path: candidate,
        file: path.basename(candidate),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        dir: path.dirname(candidate),
      };
    } catch {
      /* 继续找下一个 */
    }
  }
  return null;
}

function finishJob(job, { status, exitCode, error }) {
  job.status = status;
  job.exitCode = exitCode === undefined ? null : exitCode;
  job.finishedAt = new Date().toISOString();
  job.error = error || null;
  if (status === 'succeeded') {
    job.artifact = detectArtifact(job);
  }
  if (job.logStream) {
    try {
      job.logStream.end();
    } catch {
      /* 忽略 */
    }
    job.logStream = null;
  }
  emitJob(job);
  broadcast(job, { type: 'end', job: publicJob(job) });
}

function killTree(job) {
  const pid = job.child && job.child.pid;
  if (!pid) return;
  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* 已退出 */
    }
  }
}

/**
 * 启动打包任务。
 * @param {object} spec
 * @param {'platform'|'app'} spec.kind
 * @param {string} spec.label 控制台标题
 * @param {string} spec.scriptRel 相对仓库根的脚本路径
 * @param {string[]} spec.scriptArgs 传给脚本的参数（本地形态，会自动转 bash 形态）
 * @param {string[]} [spec.bashPathArgs] 需要按 bash 路径形态转换的参数（绝对路径）
 * @param {string} spec.version
 * @param {string} spec.outDir 本地绝对输出目录
 * @param {string} [spec.pnpmCommand] 供展示的 pnpm 等价命令
 * @param {object} [spec.meta]
 * @param {number[]} spec.bashPathArgIndexes
 */
function startJob(spec) {
  const active = runningJob();
  if (active) {
    throw Object.assign(
      new Error(`已有打包任务在运行（${active.label}，${active.id}），请等待完成或先取消`),
      { status: 409, data: { jobId: active.id } },
    );
  }

  const bash = resolveBash();
  if (!bash.available) {
    throw Object.assign(new Error(bash.hint || '未检测到可用的 bash'), { status: 400 });
  }

  const id = randomUUID();
  const job = {
    id,
    kind: spec.kind,
    label: spec.label,
    command: spec.pnpmCommand || '',
    spawnCommand: '',
    status: 'running',
    exitCode: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    version: spec.version,
    outDir: spec.outDir,
    requestedOutDir: spec.outDir,
    artifact: null,
    artifactPathFromLog: null,
    error: null,
    log: [],
    logChars: 0,
    nextSeq: 1,
    droppedBefore: 0,
    subscribers: new Set(),
    child: null,
    logStream: null,
    meta: spec.meta || null,
  };
  jobs.set(id, job);
  order.unshift(id);
  trimHistory();

  const convertIndexes = new Set(spec.bashPathArgIndexes || []);
  const scriptArgs = spec.scriptArgs.map((arg, index) =>
    convertIndexes.has(index) ? toBashPath(arg, bash.kind) : arg,
  );
  const scriptAbs = path.join(REPO_ROOT, spec.scriptRel);

  let command;
  let args;
  if (bash.kind === 'wsl') {
    command = bash.path;
    const wslRoot = toBashPath(REPO_ROOT, 'wsl');
    args = ['--cd', wslRoot, 'bash', spec.scriptRel, ...scriptArgs];
  } else {
    command = bash.path;
    args = [scriptAbs, ...scriptArgs];
  }

  job.spawnCommand = [command, ...args].map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(' ');
  job.logFile = path.join(logDir(), `${job.kind}-${id}.log`);
  try {
    job.logStream = fs.createWriteStream(job.logFile, { flags: 'a' });
  } catch {
    job.logFile = null;
  }

  try {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: buildSpawnEnv(spec.env || {}),
      windowsHide: true,
      detached: !IS_WINDOWS,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    job.child = child;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => appendLog(job, 'stdout', chunk));
    child.stderr.on('data', (chunk) => appendLog(job, 'stderr', chunk));

    child.on('error', (error) => {
      appendLog(job, 'stderr', `[ERR] 启动打包进程失败: ${error.message}`);
      finishJob(job, { status: 'failed', exitCode: null, error: error.message });
    });

    child.on('close', (code, signal) => {
      if (job.status !== 'running') return;
      if (job.cancelRequested) {
        appendLog(job, 'stderr', '[WARN] 打包任务已取消');
        finishJob(job, { status: 'cancelled', exitCode: code, error: '任务已取消' });
        return;
      }
      const ok = code === 0;
      finishJob(job, {
        status: ok ? 'succeeded' : 'failed',
        exitCode: code,
        error: ok ? null : `打包进程退出码 ${code}${signal ? `（信号 ${signal}）` : ''}`,
      });
    });
  } catch (error) {
    finishJob(job, { status: 'failed', exitCode: null, error: error.message });
  }

  emitJob(job);
  return publicJob(job);
}

function cancelJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) throw Object.assign(new Error('打包任务不存在'), { status: 404 });
  if (job.status !== 'running') return publicJob(job);
  job.cancelRequested = true;
  appendLog(job, 'stderr', '[WARN] 收到取消请求，正在结束打包进程…');
  killTree(job);
  return publicJob(job);
}

/** 后端进程退出时收尾，避免留下孤儿构建进程。 */
function shutdown() {
  for (const id of order) {
    const job = jobs.get(id);
    if (job && job.status === 'running') {
      job.cancelRequested = true;
      killTree(job);
    }
  }
}

module.exports = {
  startJob,
  cancelJob,
  getJob,
  listJobs,
  readLog,
  subscribe,
  runningJob,
  shutdown,
  MAX_JOBS,
};
