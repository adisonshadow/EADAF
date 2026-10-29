/**
 * 系统管理员的高风险操作：三员开启时先入队，安全保密管理员批准后再执行。
 * 关闭三员、改三员身份、改三员性质不走这里。
 */
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');
const { User, ThreeMemberApproval } = require('../../models');
const { isThreeMemberEnabled, assertCallerRole } = require('./threeMember');
const { writeOperationLog } = require('../operationAudit/writeOperationLog');

const HOLD_DIR = path.join(os.tmpdir(), 'eadaf-approval-dumps');

function formatRow(row) {
  const data = row.toJSON ? row.toJSON() : row;
  return {
    id: data.id,
    actionType: data.action_type,
    summary: data.summary,
    status: data.status,
    comment: data.comment,
    requesterId: data.requester_id,
    requesterName: data.requester_name,
    reviewerId: data.reviewer_id,
    reviewerName: data.reviewer_name,
    reviewedAt: data.reviewed_at,
    createdAt: data.created_at,
  };
}

async function actorOf(userId) {
  if (!userId) return null;
  return User.findByPk(userId, {
    attributes: ['user_id', 'username', 'name', 'three_member_role', 'status'],
  });
}

/**
 * 系统管理员在三员开启时把动作入队。返回 true 表示已入队，调用方应停止执行。
 */
async function queueSystemAdminAction(ctx, { actionType, summary, payload }) {
  if (ctx.state?.approvalExecution) return false;
  if (!(await isThreeMemberEnabled())) return false;
  const userId = ctx.state?.user?.user_id;
  const actor = await actorOf(userId);
  if (!actor || actor.three_member_role !== 'system_admin') return false;

  const row = await ThreeMemberApproval.create({
    action_type: actionType,
    summary: String(summary || actionType).slice(0, 500),
    payload: payload || {},
    requester_id: actor.user_id,
    requester_name: actor.name || actor.username,
    status: 'pending',
  });

  ctx.state.auditContext = {
    resource_id: row.id,
    resource_name: row.summary,
    new_data: { actionType, status: 'pending' },
  };
  ctx.status = 200;
  ctx.body = {
    code: 202,
    message: '已提交审批',
    data: { approvalId: row.id, summary: row.summary },
  };
  return true;
}

async function listPending() {
  const rows = await ThreeMemberApproval.findAll({
    where: { status: 'pending' },
    order: [['created_at', 'ASC']],
  });
  return rows.map(formatRow);
}

async function review(ctx, id, decision, comment) {
  await assertCallerRole(ctx.state?.user?.user_id, 'security_admin');
  const row = await ThreeMemberApproval.findByPk(id);
  if (!row || row.status !== 'pending') {
    throw Object.assign(new Error('审批单不存在或已处理'), { status: 404 });
  }
  if (String(row.requester_id) === String(ctx.state.user.user_id)) {
    throw Object.assign(new Error('不能审批自己提交的申请'), { status: 403 });
  }
  const reviewer = await actorOf(ctx.state.user.user_id);
  if (decision === 'approved') {
    await execute(row);
  } else if (row.action_type === 'restore_backup' && row.payload?.filepath) {
    await fs.unlink(row.payload.filepath).catch(() => {});
  }
  await row.update({
    status: decision,
    comment: comment ? String(comment).slice(0, 2000) : null,
    reviewer_id: reviewer?.user_id || null,
    reviewer_name: reviewer?.name || reviewer?.username || null,
    reviewed_at: new Date(),
  });
  await writeOperationLog({
    operator_id: reviewer?.user_id || null,
    operator_name: reviewer?.name || reviewer?.username || null,
    operator_type: 'USER',
    domain: 'system',
    operation_type: decision === 'approved' ? 'ENABLE' : 'DISABLE',
    resource_type: 'three_member_approval',
    resource_id: row.id,
    resource_name: row.summary,
    status: 'SUCCESS',
    new_data: { decision, comment: comment || null, actionType: row.action_type },
    request_summary: { method: ctx.method, path: ctx.path },
  });
  return formatRow(row);
}

async function execute(row) {
  const payload = row.payload || {};
  if (row.action_type === 'user_status') {
    const user = await User.findByPk(payload.userId);
    if (!user) throw Object.assign(new Error('用户不存在'), { status: 404 });
    await user.update({ status: payload.status });
    return;
  }
  if (row.action_type === 'user_delete') {
    const user = await User.findByPk(payload.userId);
    if (!user) throw Object.assign(new Error('用户不存在'), { status: 404 });
    if (typeof user.softDelete === 'function') await user.softDelete();
    else await user.destroy();
    return;
  }
  if (row.action_type === 'reset_password') {
    const user = await User.findByPk(payload.userId);
    if (!user) throw Object.assign(new Error('用户不存在'), { status: 404 });
    await user.update({
      password_hash: payload.passwordHash,
      last_password_updated: new Date(),
      must_change_password: payload.mustChangePassword !== false,
    });
    return;
  }
  if (row.action_type === 'log_rotation') {
    const systemService = require('./systemService');
    await systemService.updateSystemFeatures(payload.features, { skipApproval: true });
    return;
  }
  if (row.action_type === 'restore_backup') {
    const systemService = require('./systemService');
    try {
      await systemService.restoreBackup(payload.filepath);
    } finally {
      await fs.unlink(payload.filepath).catch(() => {});
    }
  }
}

async function holdDumpFile(sourcePath) {
  await fs.mkdir(HOLD_DIR, { recursive: true });
  const dest = path.join(HOLD_DIR, `${Date.now()}-${path.basename(sourcePath)}`);
  await fs.copyFile(sourcePath, dest);
  return dest;
}

async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

module.exports = {
  queueSystemAdminAction,
  listPending,
  review,
  holdDumpFile,
  hashPassword,
};
