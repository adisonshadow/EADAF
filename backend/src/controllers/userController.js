const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validate: isUuid } = require('uuid');
const { UniqueConstraintError, Op } = require('sequelize');
const config = require('../config');
const logger = require('../utils/logger');
const { User, LoginAttempt, RefreshToken, Department: _Department, Role: _Role, Captcha, PasswordReset } = require('../models');
const { sequelize: _sequelize } = require('../models');
const { _ValidationError, _NotFoundError } = require('../utils/errors');
const { redactFields } = require('../utils/redactFields');
const {
  formatRole,
  mergeRolesById,
  loadDepartmentRoles,
  assignRolesToEntity
} = require('../services/roleBindingService');

// 自定义错误类
class CustomValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
    this.status = 401;
  }
}

async function revokeUserRefreshTokens(userId) {
  await RefreshToken.update(
    { status: 'REVOKED' },
    { where: { user_id: userId, status: 'ACTIVE' } },
  );
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class UserController {
  // 创建用户
  static async create(ctx) {
    try {
      logger.debug('Creating user', { body: ctx.request.body });

      const requestedUserId = ctx.request.body.user_id
        ? String(ctx.request.body.user_id).trim()
        : '';

      if (requestedUserId && !UUID_PATTERN.test(requestedUserId)) {
        ctx.status = 200;
        ctx.body = {
          code: 400,
          message: '用户ID格式无效，须为标准 UUID',
          data: null
        };
        return;
      }

      if (requestedUserId) {
        const existingUser = await User.findOne({ where: { user_id: requestedUserId } });
        if (existingUser) {
          ctx.status = 200;
          ctx.body = {
            code: 400,
            message: '用户ID已存在',
            data: null
          };
          return;
        }
      }

      // 参数验证
      if (!ctx.request.body.username) {
        ctx.status = 200;
        ctx.body = {
          code: 400,
          message: '用户名不能为空',
          data: null
        };
        return;
      }
      if (!ctx.request.body.password) {
        ctx.status = 200;
        ctx.body = {
          code: 400,
          message: '密码不能为空',
          data: null
        };
        return;
      }
      if (!ctx.request.body.department_id) {
        ctx.status = 200;
        ctx.body = {
          code: 400,
          message: '部门不能为空',
          data: null
        };
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(ctx.request.body.password, salt);
      const roleIds = Array.isArray(ctx.request.body.role_ids) ? ctx.request.body.role_ids : [];

      const user = await _sequelize.transaction(async (t) => {
        const createPayload = {
          username: ctx.request.body.username,
          password_hash: hashedPassword,
          name: ctx.request.body.name,
          avatar: ctx.request.body.avatar,
          gender: ctx.request.body.gender,
          email: ctx.request.body.email || null,
          phone: ctx.request.body.phone,
          department_id: ctx.request.body.department_id,
          status: 'ACTIVE',
          must_change_password: true,
        };
        if (ctx.request.body.three_member_role !== undefined) {
          const { normalizeRole } = require('../services/system/threeMemberRules');
          const { assertCallerRole, isThreeMemberEnabled } = require('../services/system/threeMember');
          if (await isThreeMemberEnabled()) {
            await assertCallerRole(ctx.state.user.user_id, 'security_admin');
            createPayload.three_member_role = normalizeRole(ctx.request.body.three_member_role);
          }
        }
        if (requestedUserId) {
          createPayload.user_id = requestedUserId;
        }

        const created = await User.create(createPayload, { transaction: t });

        if (roleIds.length) {
          await assignRolesToEntity(created, roleIds, { transaction: t });
        }
        return created;
      });

      logger.debug('User created successfully', { user_id: user.user_id });

      ctx.state.auditContext = {
        resource_id: user.user_id,
        resource_name: user.username,
        target_user_id: user.user_id,
        new_data: redactFields({
          user_id: user.user_id,
          username: user.username,
          name: user.name,
          email: user.email,
          phone: user.phone,
          status: user.status,
          department_id: user.department_id,
          role_ids: roleIds,
        }),
      };

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          user_id: user.user_id,
          username: user.username,
          name: user.name,
          avatar: user.avatar,
          gender: user.gender,
          email: user.email,
          phone: user.phone,
          status: user.status,
          department_id: user.department_id,
          created_at: user.createdAt
        }
      };
    } catch (error) {
      logger.error('Error creating user', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      if (error instanceof UniqueConstraintError) {
        ctx.status = 200;
        ctx.body = {
          code: 400,
          message: '用户名已存在',
          data: null
        };
        return;
      }

      ctx.status = 200;
      ctx.body = {
        code: 500,
        message: error.message,
        data: null
      };
    }
  }

  // 更新用户信息
  static async update(ctx) {
    const { user_id } = ctx.params;
    const updateData = { ...ctx.request.body };

    try {
      logger.debug('Updating user', { user_id, updateData });
      
      // 检查用户是否存在
      const user = await User.findOne({ where: { user_id: user_id } });
      if (!user) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '用户不存在',
          data: null
        };
        return;
      }

      const passwordWasReset = Boolean(updateData.password);
      if (passwordWasReset) {
        const { queueSystemAdminAction, hashPassword } = require('../services/system/threeMemberApprovalService');
        const passwordHash = await hashPassword(updateData.password);
        const queued = await queueSystemAdminAction(ctx, {
          actionType: 'reset_password',
          summary: `重置用户 ${user.username} 的密码`,
          payload: { userId: user_id, passwordHash, mustChangePassword: true },
        });
        if (queued) return;
        const salt = await bcrypt.genSalt(10);
        updateData.password_hash = await bcrypt.hash(updateData.password, salt);
        delete updateData.password;
        updateData.last_password_updated = new Date();
        updateData.must_change_password = true;
      }

      if (updateData.status === 'DISABLED' || updateData.status === 'ARCHIVED') {
        const { queueSystemAdminAction } = require('../services/system/threeMemberApprovalService');
        const queued = await queueSystemAdminAction(ctx, {
          actionType: 'user_status',
          summary: `${updateData.status === 'DISABLED' ? '停用' : '归档'}用户 ${user.username}`,
          payload: { userId: user_id, status: updateData.status },
        });
        if (queued) return;
      }

      if (updateData.email === '') {
        updateData.email = null;
      }

      if (Object.prototype.hasOwnProperty.call(updateData, 'three_member_role')) {
        const { normalizeRole } = require('../services/system/threeMemberRules');
        const { assertCallerRole, isThreeMemberEnabled } = require('../services/system/threeMember');
        if (!(await isThreeMemberEnabled())) {
          delete updateData.three_member_role;
        } else {
          await assertCallerRole(ctx.state.user.user_id, 'security_admin');
          updateData.three_member_role = normalizeRole(updateData.three_member_role);
        }
      }

      delete updateData.user_id;
      delete updateData.username;

      // 记录旧数据用于日志
      const oldData = {
        name: user.name,
        avatar: user.avatar,
        gender: user.gender,
        email: user.email,
        phone: user.phone,
        status: user.status,
        three_member_role: user.three_member_role,
      };

      await user.update(updateData);
      if (passwordWasReset) {
        await revokeUserRefreshTokens(user_id);
      }
      logger.debug('User updated successfully', { user_id });

      // 重新获取更新后的用户数据
      const updatedUser = await User.findOne({ where: { user_id: user_id } });

      ctx.state.auditContext = {
        resource_id: user_id,
        resource_name: updatedUser.username,
        target_user_id: user_id,
        old_data: redactFields(oldData),
        new_data: redactFields({
          name: updatedUser.name,
          avatar: updatedUser.avatar,
          gender: updatedUser.gender,
          email: updatedUser.email,
          phone: updatedUser.phone,
          status: updatedUser.status,
          three_member_role: updatedUser.three_member_role,
        }),
      };

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          user_id: updatedUser.user_id,
          username: updatedUser.username,
          name: updatedUser.name,
          avatar: updatedUser.avatar,
          gender: updatedUser.gender,
          email: updatedUser.email,
          phone: updatedUser.phone,
          status: updatedUser.status,
          department_id: updatedUser.department_id,
          updated_at: updatedUser.updatedAt
        }
      };
    } catch (error) {
      if (error.status === 400 || error.status === 403) {
        ctx.status = error.status;
        ctx.body = { code: error.status, message: error.message, data: null };
        return;
      }
      logger.error('Error updating user', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      if (error instanceof UniqueConstraintError) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '用户名已存在',
          data: null
        };
        return;
      }

      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        data: null
      };
    }
  }

  // 获取用户列表
  static async list(ctx) {
    try {
      const { 
        page = 1, 
        size = 30, 
        username, 
        name, 
        email, 
        phone, 
        status, 
        gender, 
        department_id, 
        user_id 
      } = ctx.query;

      // size=-1 等非法值会令 Sequelize limit 报错 → HTTP 500；统一钳制到 1..500
      //（与角色列表不同：用户列表不做“无 limit 全量”，避免关联角色加载过重）
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      let sizeNum = parseInt(size, 10);
      if (!Number.isFinite(sizeNum) || sizeNum <= 0) sizeNum = 500;
      sizeNum = Math.min(Math.max(sizeNum, 1), 500);
      const offset = (pageNum - 1) * sizeNum;

      // 构建查询条件
      const where = {};
      if (user_id) {
        const userIdText = String(user_id).trim();
        if (isUuid(userIdText)) {
          where.user_id = userIdText;
        } else {
          const escaped = userIdText.replace(/[%_\\]/g, '\\$&');
          where[Op.and] = [
            ...(where[Op.and] || []),
            _sequelize.where(
              _sequelize.cast(_sequelize.col('User.user_id'), 'TEXT'),
              { [Op.iLike]: `%${escaped}%` },
            ),
          ];
        }
      }
      if (username) where.username = { [Op.like]: `%${username}%` };
      if (name) where.name = { [Op.like]: `%${name}%` };
      if (email) where.email = { [Op.like]: `%${email}%` };
      if (phone) where.phone = { [Op.like]: `%${phone}%` };
      if (status) where.status = status;
      if (gender) where.gender = gender;
      if (department_id) {
        const departmentIdText = String(department_id).trim();
        if (isUuid(departmentIdText)) {
          where.department_id = departmentIdText;
        } else {
          const escaped = departmentIdText.replace(/[%_\\]/g, '\\$&');
          where[Op.and] = [
            ...(where[Op.and] || []),
            _sequelize.where(
              _sequelize.cast(_sequelize.col('User.department_id'), 'TEXT'),
              { [Op.iLike]: `%${escaped}%` },
            ),
          ];
        }
      }

      // 查询用户列表，使用 unscope 移除所有默认的 scope
      const { count, rows } = await User.unscoped().findAndCountAll({
        where,
        attributes: [
          'user_id',
          'username',
          'name',
          'avatar',
          'gender',
          'email',
          'phone',
          'status',
          'department_id',
          'three_member_role',
          'created_at',
          'updated_at'
        ],
        include: [{
          model: _Role,
          attributes: ['role_id', 'role_name', 'code', 'status'],
          through: { attributes: [] },
          required: false
        }],
        order: [['updated_at', 'DESC']],
        offset,
        limit: sizeNum,
        distinct: true
      });

      const items = await Promise.all(rows.map(async (user) => {
        const json = user.toJSON();
        const roles = (json.Roles || []).map(formatRole);
        const departmentRoles = await loadDepartmentRoles(json.department_id);
        return {
          ...json,
          roles,
          department_roles: departmentRoles,
          effective_roles: mergeRolesById(roles, departmentRoles)
        };
      }));

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          total: count,
          items,
          page: pageNum,
          size: sizeNum
        }
      };
    } catch (error) {
      logger.error('Error listing users', { 
        name: error.name, 
        message: error.message, 
        stack: error.stack 
      });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        data: null
      };
    }
  }

  // 用户登录
  static async login(ctx) {
    const { username, password, captcha_data } = ctx.request.body;
    const captcha_id = captcha_data?.captcha_id;

    try {
      logger.debug('User login attempt', { username });
      
      if (!username || !password) {
        const error = new CustomValidationError('用户名和密码不能为空');
        error.status = 400;
        throw error;
      }

      // 检查是否需要验证码
      if (config.api.loginVerify.enabled) {
        // 如果没有提供验证码ID，返回需要验证码的响应
        if (!captcha_id) {
          ctx.status = 202;
          ctx.body = {
            code: 202,
            message: '需要验证码',
            data: {
              need_captcha: true
            }
          };
          return;
        }

        // 验证验证码
        const captcha = await Captcha.findOne({
          where: {
            captcha_id,
            status: 'USED',
            verified_at: {
              [Op.not]: null
            }
          }
        });

        if (!captcha) {
          ctx.status = 400;
          ctx.body = {
            code: 400,
            message: '验证码无效或未验证',
            data: null
          };
          return;
        }

        // 验证通过后删除验证码记录
        await captcha.destroy();
        logger.debug('Captcha record deleted after successful verification', { captcha_id });
      }

      // 检查登录限制
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      // 先查找用户
      const user = await User.findOne({
        where: { username },
        attributes: ['user_id', 'username', 'password_hash', 'status', 'deleted_at'],
        paranoid: false  // 包括已删除的记录
      });

      // 如果用户存在，检查登录限制
      if (user) {
        const recentAttempts = await LoginAttempt.count({
          where: {
            user_id: user.user_id,
            attempt_time: {
              [Op.gte]: oneHourAgo
            },
            success: false
          }
        });

        if (recentAttempts >= 5) {
          const nextAttemptTime = new Date(Date.now() + 60 * 60 * 1000);
          ctx.status = 429;
          ctx.body = {
            code: 429,
            message: '登录失败次数过多，请一小时后重试',
            data: {
              next_attempt_time: nextAttemptTime.toISOString()
            }
          };
          return;
        }
      }

      // 仅在用户存在时记录登录尝试（user_id 非空约束；未知用户名不落库）
      if (user) {
        await LoginAttempt.create({
          user_id: user.user_id,
          ip_address: ctx.ip,
          user_agent: ctx.headers['user-agent'],
          success: false
        });
      }

      if (!user) {
        const error = new UnauthorizedError('用户名或密码错误');
        error.status = 400;
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: error.message,
          data: null
        };
        return;
      }

      // 检查用户是否被软删除
      if (user.deleted_at) {
        const error = new UnauthorizedError('用户已经被删除');
        error.status = 400;
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: error.message,
          data: null
        };
        return;
      }

      if (user.status !== 'ACTIVE') {
        const error = new UnauthorizedError('用户已被禁用');
        error.status = 403;
        ctx.status = 403;
        ctx.body = {
          code: 403,
          message: error.message,
          data: null
        };
        return;
      }

      // 验证密码
      const isValid = await user.verifyPassword(password);
      logger.debug('Password validation', { isValid });

      // 更新登录尝试的成功状态
      if (isValid) {
        await LoginAttempt.update(
          { success: true },
          {
            where: {
              user_id: user.user_id,
              ip_address: ctx.ip,
              success: false
            },
            order: [['created_at', 'DESC']],
            limit: 1
          }
        );
      }

      if (!isValid) {
        const error = new UnauthorizedError('用户名或密码错误');
        error.status = 401;
        ctx.status = 401;
        ctx.body = {
          code: 401,
          message: error.message,
          data: null
        };
        return;
      }

      logger.debug('User logged in successfully', { username });

      // 生成访问令牌
      const token = jwt.sign(
        { user_id: user.user_id, username: user.username },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );
      
      // 生成刷新令牌
      const refreshToken = jwt.sign(
        { user_id: user.user_id },
        config.jwt.refreshSecret || config.jwt.secret,
        { expiresIn: config.jwt.refreshExpiresIn || '7d' }
      );

      // 保存刷新令牌到数据库
      await RefreshToken.create({
        user_id: user.user_id,
        token: refreshToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天后过期
        status: 'ACTIVE'
      });

      // 登录成功
      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          token: token,
          refresh_token: refreshToken,
          expires_in: config.jwt.expiresIn,
          user_id: user.user_id
        }
      };
    } catch (error) {
      logger.error('Error during login', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      // 确保错误对象有正确的属性
      if (!error.status) {
        error.status = 500;
      }
      
      throw error;
    }
  }

  // 刷新令牌
  static async refreshToken(ctx) {
    const { refresh_token } = ctx.request.body;

    try {
      logger.debug('Refreshing token', { refresh_token });

      if (!refresh_token) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '刷新令牌不能为空',
          data: null
        };
        return;
      }

      // 查找刷新令牌
      const tokenRecord = await RefreshToken.findOne({
        where: {
          token: refresh_token,
          status: 'ACTIVE',
          expires_at: {
            [Op.gt]: new Date()
          }
        }
      });

      if (!tokenRecord) {
        ctx.status = 401;
        ctx.body = {
          code: 401,
          message: '刷新令牌无效或已过期',
          data: null
        };
        return;
      }

      // 获取用户信息
      const user = await User.findOne({
        where: { user_id: tokenRecord.user_id },
        attributes: ['user_id', 'username', 'status']
      });

      if (!user || user.status !== 'ACTIVE') {
        ctx.status = 401;
        ctx.body = {
          code: 401,
          message: '用户不存在或已被禁用',
          data: null
        };
        return;
      }

      // 生成新的访问令牌
      const token = jwt.sign(
        { user_id: user.user_id, username: user.username },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      // 生成新的刷新令牌
      const newRefreshToken = jwt.sign(
        { user_id: user.user_id },
        config.jwt.refreshSecret || config.jwt.secret,
        { expiresIn: config.jwt.refreshExpiresIn || '7d' }
      );

      // 更新刷新令牌记录
      await tokenRecord.update({
        token: newRefreshToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天后过期
        status: 'ACTIVE'
      });

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          token,
          refresh_token: newRefreshToken,
          expires_in: config.jwt.expiresIn
        }
      };
    } catch (error) {
      logger.error('Error refreshing token', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        data: null
      };
    }
  }

  // 删除用户
  static async delete(ctx) {
    const { user_id } = ctx.params;

    try {
      logger.debug('Deleting user', { user_id });
      
      // 检查用户是否存在
      const user = await User.findOne({ 
        where: { user_id: user_id }
      });
      
      if (!user) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '用户不存在',
          data: null
        };
        return;
      }

      const { queueSystemAdminAction } = require('../services/system/threeMemberApprovalService');
      const queued = await queueSystemAdminAction(ctx, {
        actionType: 'user_delete',
        summary: `删除用户 ${user.username}`,
        payload: { userId: user_id },
      });
      if (queued) return;

      // 执行软删除
      await user.softDelete();
      logger.debug('User deleted successfully', { user_id });

      ctx.state.auditContext = {
        resource_id: user_id,
        resource_name: user.username,
        target_user_id: user_id,
        old_data: redactFields({
          username: user.username,
          email: user.email,
          phone: user.phone,
          status: user.status,
          deleted_at: null,
        }),
        new_data: {
          status: 'ARCHIVED',
          deleted_at: new Date(),
        },
      };

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: 'success',
        data: null
      };
    } catch (error) {
      logger.error('Error deleting user', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        data: null
      };
    }
  }

  // 恢复用户
  static async restore(ctx) {
    const { user_id } = ctx.params;

    try {
      logger.debug('Restoring user', { user_id });
      
      // 检查用户是否存在（包括已删除的）
      const user = await User.findOne({ 
        where: { user_id: user_id },
        paranoid: false  // 包括已删除的记录
      });
      
      if (!user) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '用户不存在',
          data: null
        };
        return;
      }

      // 如果用户未被删除，返回错误
      if (!user.deleted_at) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '用户未被删除',
          data: null
        };
        return;
      }

      // 恢复用户
      const oldDeletedAt = user.deleted_at;
      const oldStatus = user.status;
      await User.restore(user);
      logger.debug('User restored successfully', { user_id });

      ctx.state.auditContext = {
        resource_id: user_id,
        resource_name: user.username,
        target_user_id: user_id,
        old_data: {
          deleted_at: oldDeletedAt,
          status: oldStatus,
        },
        new_data: {
          deleted_at: null,
          status: 'ACTIVE',
        },
      };

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: 'success',
        data: null
      };
    } catch (error) {
      logger.error('Error restoring user', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        data: null
      };
    }
  }

  // 获取用户详情
  static async getById(ctx) {
    const { user_id } = ctx.params;

    try {
      logger.debug('Getting user details', { user_id });
      
      // 查询用户信息
      const user = await User.findOne({
        where: { user_id: user_id },
        attributes: [
          'user_id',
          'username',
          'name',
          'avatar',
          'gender',
          'email',
          'phone',
          'status',
          'department_id',
          'three_member_role',
          'created_at',
          'updated_at'
        ],
        include: [{
          model: _Role,
          attributes: ['role_id', 'role_name', 'code', 'status'],
          through: { attributes: [] },
          required: false
        }]
      });

      if (!user) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '用户不存在',
          data: null
        };
        return;
      }

      const json = user.toJSON();
      const roles = (json.Roles || []).map(formatRole);
      const departmentRoles = await loadDepartmentRoles(json.department_id);

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          ...json,
          roles,
          role_ids: roles.map((r) => r.role_id),
          department_roles: departmentRoles,
          effective_roles: mergeRolesById(roles, departmentRoles)
        }
      };
    } catch (error) {
      logger.error('Error getting user details', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        data: null
      };
    }
  }

  // 检查用户登录状态
  static async checkAuth(ctx) {
    try {
      // 从 ctx.state.user 中获取用户信息（由 auth 中间件注入）
      const user = await User.findOne({
        where: { 
          user_id: ctx.state.user.user_id,
          status: 'ACTIVE'
        },
        attributes: [
          'user_id',
          'username',
          'name',
          'avatar',
          'gender',
          'email',
          'phone',
          'status',
          'department_id'
        ]
      });

      if (!user) {
        ctx.status = 401;
        ctx.body = {
          code: 401,
          message: '用户不存在或已被禁用',
          data: null
        };
        return;
      }

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: 'success',
        data: user
      };
    } catch (error) {
      logger.error('Error checking auth status', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        data: null
      };
    }
  }

  // 重置用户密码
  static async resetPassword(ctx) {
    const { user_id } = ctx.params;
    const { new_password } = ctx.request.body;

    try {
      logger.debug('Resetting user password', { user_id });
      
      // 参数验证
      if (!new_password) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '新密码不能为空',
          data: null
        };
        return;
      }

      // 检查用户是否存在
      const user = await User.findOne({ where: { user_id: user_id } });
      if (!user) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '用户不存在',
          data: null
        };
        return;
      }

      const { queueSystemAdminAction, hashPassword } = require('../services/system/threeMemberApprovalService');
      const passwordHash = await hashPassword(new_password);
      const queued = await queueSystemAdminAction(ctx, {
        actionType: 'reset_password',
        summary: `重置用户 ${user.username} 的密码`,
        payload: { userId: user_id, passwordHash, mustChangePassword: false },
      });
      if (queued) return;

      // 生成新的密码哈希
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(new_password, salt);

      // 更新密码
      await user.update({
        password_hash: hashedPassword,
        last_password_updated: new Date(),
        must_change_password: false,
      });
      await revokeUserRefreshTokens(user_id);

      logger.debug('User password reset successfully', { user_id });

      ctx.state.auditContext = {
        resource_id: user_id,
        resource_name: user.username,
        target_user_id: user_id,
      };

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: '密码重置成功',
        data: null
      };
    } catch (error) {
      logger.error('Error resetting password', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        data: null
      };
    }
  }

  // 为用户分配角色
  static async assignRoles(ctx) {
    const { user_id } = ctx.params;
    const { role_ids } = ctx.request.body;

    if (!Array.isArray(role_ids)) {
      ctx.status = 400;
      ctx.body = {
        code: 400,
        message: 'role_ids 必须为数组',
        data: null
      };
      return;
    }

    try {
      const { assertCallerRole } = require('../services/system/threeMember');
      await assertCallerRole(ctx.state.user.user_id, 'security_admin');
      const user = await User.findByPk(user_id);
      if (!user) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '用户不存在',
          data: null
        };
        return;
      }

      const roles = await _sequelize.transaction((t) => assignRolesToEntity(user, role_ids, { transaction: t }));

      ctx.state.auditContext = {
        resource_id: user_id,
        resource_name: user.username,
        target_user_id: user_id,
        new_data: { role_ids },
      };

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: '分配成功',
        data: {
          user_id,
          roles
        }
      };
    } catch (error) {
      if (error.status === 400 || error.status === 403) {
        ctx.status = error.status;
        ctx.body = { code: error.status, message: error.message, data: null };
        return;
      }
      logger.error('Error assigning roles to user', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        data: null
      };
    }
  }

  // 修改用户密码
  static async changePassword(ctx) {
    const { user_id } = ctx.params;
    const { old_password, new_password } = ctx.request.body;

    if (!old_password || !new_password) {
      ctx.status = 400;
      ctx.body = {
        code: 400,
        message: '原密码和新密码不能为空',
        data: null
      };
      return;
    }

    try {
      // 检查用户是否存在
      const user = await User.findByPk(user_id);
      if (!user) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '用户不存在',
          data: null
        };
        return;
      }

      // 验证原密码
      const isValid = await user.verifyPassword(old_password);
      if (!isValid) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '原密码错误',
          data: null
        };
        return;
      }

      // 更新新密码
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(new_password, salt);
      await user.update({ password_hash: hashedPassword, last_password_updated: new Date(), must_change_password: false });
      await revokeUserRefreshTokens(user_id);

      ctx.state.auditContext = {
        resource_id: user_id,
        resource_name: user.username,
        target_user_id: user_id,
      };

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: '密码修改成功',
        data: null
      };
    } catch (error) {
      logger.error('Error changing user password', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        data: null
      };
    }
  }

  // 修改用户状态
  static async updateStatus(ctx) {
    const { user_id } = ctx.params;
    const { status } = ctx.request.body;

    if (!status) {
      ctx.status = 400;
      ctx.body = {
        code: 400,
        message: '状态不能为空',
        data: null
      };
      return;
    }

    const validStatus = ['ACTIVE', 'DISABLED', 'ARCHIVED'];
    if (!validStatus.includes(status)) {
      ctx.status = 400;
      ctx.body = {
        code: 400,
        message: '无效的状态值',
        data: null
      };
      return;
    }

    try {
      // 检查用户是否存在
      const user = await User.findByPk(user_id);
      if (!user) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '用户不存在',
          data: null
        };
        return;
      }

      if (status === 'DISABLED' || status === 'ARCHIVED') {
        const { queueSystemAdminAction } = require('../services/system/threeMemberApprovalService');
        const queued = await queueSystemAdminAction(ctx, {
          actionType: 'user_status',
          summary: `${status === 'DISABLED' ? '停用' : '归档'}用户 ${user.username}`,
          payload: { userId: user_id, status },
        });
        if (queued) return;
      }

      const oldStatus = user.status;
      await user.update({ status });

      ctx.state.auditContext = {
        resource_id: user_id,
        resource_name: user.username,
        target_user_id: user_id,
        old_data: { status: oldStatus },
        new_data: { status },
      };

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: '状态更新成功',
        data: null
      };
    } catch (error) {
      logger.error('Error updating user status', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        data: null
      };
    }
  }

  /**
   * 请求重置密码
   * @param {Object} ctx - Koa上下文
   */
  static async requestPasswordResetToken(ctx) {
    const { username, email } = ctx.request.body;

    if (!username?.trim() || !email?.trim()) {
      ctx.status = 400;
      ctx.body = {
        code: 400,
        message: '用户名和邮箱不能为空',
        data: null,
      };
      return;
    }

    try {
      const user = await User.findOne({
        where: {
          username: username.trim(),
          status: 'ACTIVE',
        },
      });

      if (!user) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '用户名或邮箱不正确',
          data: null,
        };
        return;
      }

      if (!user.email?.trim()) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '未设置邮箱的用户无法重置密码，请联系管理员手工修改',
          data: null,
        };
        return;
      }

      if (user.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '用户名或邮箱不正确',
          data: null,
        };
        return;
      }

      // 生成8位随机令牌
      const token = Math.random().toString(36).substring(2, 10).toUpperCase();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30分钟后过期

      // 创建重置记录
      await PasswordReset.create({
        user_id: user.user_id,
        token,
        expires_at: expiresAt,
        status: 'PENDING'
      });

      // TODO: 发送邮件
      // 这里需要实现邮件发送功能，将token发送到用户邮箱
      console.log(`重置密码令牌: ${token}`);

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: '重置密码邮件已发送',
        data: null
      };
    } catch (error) {
      console.error('请求重置密码失败:', error);
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        data: null
      };
    }
  }

  /**
   * 使用令牌重置密码
   * @param {Object} ctx - Koa上下文
   */
  static async resetPasswordWithToken(ctx) {
    const { username, token, new_password } = ctx.request.body;

    try {
      // 查找用户
      const user = await User.findOne({
        where: {
          username,
          status: 'ACTIVE'
        }
      });

      if (!user) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '用户不存在',
          data: null
        };
        return;
      }

      // 查找有效的重置记录
      const resetRecord = await PasswordReset.findOne({
        where: {
          user_id: user.user_id,
          token,
          status: 'PENDING',
          expires_at: {
            [Op.gt]: new Date()
          }
        }
      });

      if (!resetRecord) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '重置令牌无效或已过期',
          data: null
        };
        return;
      }

      // 更新密码
      const hashedPassword = await bcrypt.hash(new_password, 10);
      await user.update({
        password_hash: hashedPassword,
        last_password_updated: new Date(),
        must_change_password: false,
      });

      // 标记重置记录为已使用
      await resetRecord.update({ status: 'USED' });

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: '密码重置成功',
        data: null
      };
    } catch (error) {
      console.error('重置密码失败:', error);
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        data: null
      };
    }
  }
}

module.exports = UserController;