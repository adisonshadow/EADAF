const { Op } = require('sequelize');
const { OperationLog } = require('../models');
const logger = require('../utils/logger');

function formatLogListItem(data) {
  return {
    logId: data.log_id,
    operatorId: data.operator_id,
    operatorName: data.operator_name,
    operatorType: data.operator_type,
    applicationId: data.application_id,
    domain: data.domain,
    operatorThreeMemberRole: data.operator_three_member_role || null,
    operationType: data.operation_type,
    resourceType: data.resource_type,
    resourceId: data.resource_id,
    resourceName: data.resource_name,
    userId: data.user_id,
    status: data.status,
    errorMessage: data.error_message,
    ip: data.ip,
    traceId: data.trace_id,
    durationMs: data.duration_ms,
    createdAt: data.created_at,
  };
}

function formatLogDetail(log) {
  const data = log.toJSON ? log.toJSON() : log;
  return {
    ...formatLogListItem(data),
    userAgent: data.user_agent,
    oldData: data.old_data,
    newData: data.new_data,
    requestSummary: data.request_summary,
  };
}

class OperationLogController {
  static async list(ctx) {
    try {
      const page = Math.max(parseInt(ctx.query.page, 10) || 1, 1);
      const size = Math.min(Math.max(parseInt(ctx.query.size, 10) || 20, 1), 100);
      const where = {};

      if (ctx.query.operatorThreeMemberRoles) {
        const roles = String(ctx.query.operatorThreeMemberRoles)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
        if (roles.length) where.operator_three_member_role = { [Op.in]: roles };
      }
      if (ctx.query.domain) where.domain = ctx.query.domain;
      if (ctx.query.operationType) where.operation_type = ctx.query.operationType;
      if (ctx.query.resourceType) where.resource_type = ctx.query.resourceType;
      if (ctx.query.resourceId) where.resource_id = ctx.query.resourceId;
      if (ctx.query.operatorId) where.operator_id = ctx.query.operatorId;
      if (ctx.query.status) where.status = ctx.query.status;
      if (ctx.query.traceId) where.trace_id = ctx.query.traceId;

      if (ctx.query.operatorName) {
        where.operator_name = { [Op.iLike]: `%${ctx.query.operatorName}%` };
      }
      if (ctx.query.keyword) {
        where.resource_name = { [Op.iLike]: `%${ctx.query.keyword}%` };
      }

      if (ctx.query.startTime || ctx.query.endTime) {
        where.created_at = {};
        if (ctx.query.startTime) {
          where.created_at[Op.gte] = new Date(ctx.query.startTime);
        }
        if (ctx.query.endTime) {
          where.created_at[Op.lte] = new Date(ctx.query.endTime);
        }
      }

      const { count, rows } = await OperationLog.findAndCountAll({
        where,
        attributes: {
          exclude: ['old_data', 'new_data', 'request_summary', 'user_agent'],
        },
        limit: size,
        offset: (page - 1) * size,
        order: [['created_at', 'DESC']],
      });

      ctx.body = {
        code: 200,
        message: '获取操作日志成功',
        data: {
          total: count,
          page,
          size,
          items: rows.map((row) => formatLogListItem(row.toJSON())),
        },
      };
    } catch (error) {
      logger.error('获取操作日志失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: '获取操作日志失败', data: null };
    }
  }

  static async getById(ctx) {
    try {
      const log = await OperationLog.findByPk(ctx.params.log_id);
      if (!log) {
        ctx.status = 404;
        ctx.body = { code: 404, message: '日志不存在', data: null };
        return;
      }
      ctx.body = {
        code: 200,
        message: '获取操作日志详情成功',
        data: formatLogDetail(log),
      };
    } catch (error) {
      logger.error('获取操作日志详情失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: '获取操作日志详情失败', data: null };
    }
  }
}

module.exports = OperationLogController;
