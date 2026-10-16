const salesDemoDb = require('../services/demo/salesDemoDb');
const logger = require('../utils/logger');

class DemoSalesController {
  static async listOrders(ctx) {
    try {
      const data = salesDemoDb.listOrders(ctx.query);
      ctx.body = { data };
    } catch (error) {
      logger.error('获取订单列表失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: error.message, data: null };
    }
  }

  static async getOrder(ctx) {
    try {
      const order = salesDemoDb.getOrderByOrderNo(ctx.params.orderNo);
      if (!order) {
        ctx.status = 404;
        ctx.body = { code: 404, message: '订单不存在', data: null };
        return;
      }
      ctx.body = { data: order };
    } catch (error) {
      logger.error('获取订单详情失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: error.message, data: null };
    }
  }

  static async listUsers(ctx) {
    try {
      ctx.body = { data: salesDemoDb.listUsers() };
    } catch (error) {
      logger.error('获取用户列表失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: error.message, data: null };
    }
  }

  static async listProducts(ctx) {
    try {
      ctx.body = { data: salesDemoDb.listProducts() };
    } catch (error) {
      logger.error('获取产品列表失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: error.message, data: null };
    }
  }

  static async listComplaints(ctx) {
    try {
      ctx.body = { data: salesDemoDb.listComplaints(ctx.query) };
    } catch (error) {
      logger.error('获取投诉列表失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: error.message, data: null };
    }
  }

  static async orderStats(ctx) {
    try {
      ctx.body = {
        data: {
          // 取 .byStatus：service 返回的是 { summary, byStatus }，接口约定 byStatus 本身是数组
          byStatus: salesDemoDb.orderStatsByStatus().byStatus,
          dashboard: salesDemoDb.getDashboardStats().orders
        }
      };
    } catch (error) {
      logger.error('获取订单统计失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: error.message, data: null };
    }
  }

  static async complaintStats(ctx) {
    try {
      ctx.body = {
        data: {
          // 同上：complaintStatsByType() → { byType: [...] }
          byType: salesDemoDb.complaintStatsByType().byType,
          byStatus: salesDemoDb.complaintStatsByStatus().byStatus,
          dashboard: salesDemoDb.getDashboardStats().complaints
        }
      };
    } catch (error) {
      logger.error('获取投诉统计失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: error.message, data: null };
    }
  }
}

module.exports = DemoSalesController;
