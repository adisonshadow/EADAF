const { listPending, review } = require('../services/system/threeMemberApprovalService');

class ThreeMemberApprovalController {
  static async list(ctx) {
    try {
      const { assertCallerRole } = require('../services/system/threeMember');
      await assertCallerRole(ctx.state?.user?.user_id, 'security_admin');
      const items = await listPending();
      ctx.body = { code: 200, message: 'success', data: { items } };
    } catch (error) {
      ctx.status = error.status || 500;
      ctx.body = { code: ctx.status, message: error.message || '获取审批列表失败', data: null };
    }
  }

  static async decide(ctx) {
    try {
      const decision = ctx.params.decision === 'approve' ? 'approved' : 'rejected';
      if (ctx.params.decision !== 'approve' && ctx.params.decision !== 'reject') {
        ctx.status = 400;
        ctx.body = { code: 400, message: '无效的审批动作', data: null };
        return;
      }
      const data = await review(ctx, ctx.params.id, decision, ctx.request.body?.comment);
      ctx.body = {
        code: 200,
        message: decision === 'approved' ? '已批准并执行' : '已驳回',
        data,
      };
    } catch (error) {
      ctx.status = error.status || 500;
      ctx.body = { code: ctx.status, message: error.message || '审批失败', data: null };
    }
  }
}

module.exports = ThreeMemberApprovalController;
