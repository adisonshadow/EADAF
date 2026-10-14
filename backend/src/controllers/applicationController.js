const { Application } = require('../models');
const { Op } = require('sequelize');
const { validate: isUuid } = require('uuid');
const logger = require('../utils/logger');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { hasSsoSigningSecret, resolveSsoSigningSecret } = require('../utils/ssoSecret');
const { mergeSsoLoginPage, normalizeSsoLoginPage } = require('../utils/ssoLoginPage');
const { resolveLoginVerifyEnabled } = require('../utils/ssoLoginVerify');
const {
  validateSsoRedirectUriConfig,
  resolveSsoRedirectUri,
  requestHostInfo,
} = require('../utils/ssoRedirectUri');
const { getPublicApiCatalog } = require('../services/applicationApiCatalogService');
const { getPublicApiOpenApi } = require('../services/applicationApiOpenApiService');
const { existsBuiltinApiCode } = require('../services/builtinApi/catalog');
const { redactFields } = require('../utils/redactFields');

const SYSTEM_APPLICATION_CODE = 'EADAF';
const APP_SECRET_REDACT_PATHS = ['sso_config.client_secret', 'api_connect_config.app_secret'];

function redactApplicationSnapshot(appLike) {
  if (!appLike) return appLike;
  const raw = typeof appLike.toJSON === 'function' ? appLike.toJSON() : { ...appLike };
  return redactFields(raw, ['app_secret', 'client_secret'], APP_SECRET_REDACT_PATHS);
}
function normalizeBizdataScopeCodes(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    const err = new Error('bizdata_scope_codes 必须为字符串数组');
    err.status = 400;
    throw err;
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

/** 规范化应用可访问内置 API 授权：{ permissionCodes: [存在于清单的 code...] } */
function normalizeBuiltinApiScope(value) {
  if (value === undefined || value === null) return { permissionCodes: [] };
  const input = typeof value === 'object' ? value : {};
  const rawCodes = Array.isArray(input.permissionCodes) ? input.permissionCodes : [];
  const permissionCodes = [];
  const invalid = [];
  rawCodes.forEach((c) => {
    const code = String(c || '').trim();
    if (!code) return;
    if (existsBuiltinApiCode(code)) {
      permissionCodes.push(code);
    } else {
      invalid.push(code);
    }
  });
  if (invalid.length) {
    const err = new Error(`内置 API code 不存在: ${invalid.join(', ')}`);
    err.status = 400;
    throw err;
  }
  return { permissionCodes };
}

/** 规范化关联提交外部 API：{ domainCodes, webhookCodes }，webhookCodes 须为已发布配置 */
async function normalizeOutboundWebhookScope(value) {
  if (value === undefined || value === null) {
    return { domainCodes: [], webhookCodes: [] };
  }
  if (typeof value !== 'object') {
    const err = new Error('outbound_webhook_scope 必须为对象');
    err.status = 400;
    throw err;
  }
  const domainCodes = Array.isArray(value.domainCodes)
    ? value.domainCodes.map((c) => String(c || '').trim()).filter(Boolean)
    : [];
  const webhookCodes = Array.isArray(value.webhookCodes)
    ? value.webhookCodes.map((c) => String(c || '').trim()).filter(Boolean)
    : [];

  if (webhookCodes.length) {
    const { OutboundWebhook } = require('../models');
    const rows = await OutboundWebhook.findAll({
      where: { code: webhookCodes, status: { [Op.ne]: 'deleted' } },
      attributes: ['code'],
    });
    const found = new Set(rows.map((r) => r.code));
    const invalid = webhookCodes.filter((c) => !found.has(c));
    if (invalid.length) {
      const err = new Error(`提交外部 API code 不存在: ${invalid.join(', ')}`);
      err.status = 400;
      throw err;
    }
  }

  return { domainCodes, webhookCodes };
}

class ApplicationController {
  // 创建应用端
  static async create(ctx) {
    try {
      const {
        name,
        code,
        logo_url,
        status = 'ACTIVE',
        sso_enabled = false,
        sso_config,
        description,
        application_id: requestedApplicationIdRaw,
      } = ctx.request.body;

      const requestedApplicationId = requestedApplicationIdRaw
        ? String(requestedApplicationIdRaw).trim()
        : '';

      if (requestedApplicationId && !isUuid(requestedApplicationId)) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '应用ID格式无效，须为标准 UUID',
          data: null
        };
        return;
      }

      if (requestedApplicationId) {
        const existingApplication = await Application.findByPk(requestedApplicationId);
        if (existingApplication) {
          ctx.status = 400;
          ctx.body = {
            code: 400,
            message: '应用ID已存在',
            data: null
          };
          return;
        }
      }

      // 验证必填字段
      if (!name || !code) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '应用端名称和编码不能为空',
          data: null
        };
        return;
      }

      // 验证字段长度
      if (name.length > 100) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '应用端名称不能超过100个字符',
          data: null
        };
        return;
      }

      if (code.length > 50) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '应用端编码不能超过50个字符',
          data: null
        };
        return;
      }

      // 验证状态值
      if (status && !['ACTIVE', 'DISABLED', 'ARCHIVED'].includes(status)) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '无效的状态值',
          data: null
        };
        return;
      }

      // 验证SSO配置
      if (sso_enabled && sso_config) {
        // 验证协议
        if (!sso_config.protocol || sso_config.protocol !== 'OIDC') {
          ctx.status = 400;
          ctx.body = {
            code: 400,
            message: 'SSO协议必须为OIDC',
            data: null
          };
          return;
        }

        // 验证回调地址
        const redirectCheck = validateSsoRedirectUriConfig(sso_config);
        if (!redirectCheck.ok) {
          ctx.status = 400;
          ctx.body = {
            code: 400,
            message: redirectCheck.message,
            data: null
          };
          return;
        }

        // SSO 使用应用统一密钥（client_secret / app_secret），不再强制 salt
        if (sso_config.redirect_mode !== undefined && !['POST_REDIRECT', 'HEADER_REDIRECT'].includes(sso_config.redirect_mode)) {
          ctx.status = 400;
          ctx.body = {
            code: 400,
            message: 'SSO跳转模式必须为POST_REDIRECT（POST跳转）或HEADER_REDIRECT（302重定向）',
            data: null
          };
          return;
        }

        // 验证base_url格式（如果提供）
        if (sso_config.base_url) {
          try {
            new URL(sso_config.base_url);
          } catch {
            ctx.status = 400;
            ctx.body = {
              code: 400,
              message: 'SSO系统URL格式不正确',
              data: null
            };
            return;
          }
        }

        // 验证issuer格式（如果提供）
        if (sso_config.issuer) {
          try {
            new URL(sso_config.issuer);
          } catch {
            ctx.status = 400;
            ctx.body = {
              code: 400,
              message: 'OIDC发行者URL格式不正确',
              data: null
            };
            return;
          }
        }

        // 验证frontend_url格式（如果提供）
        if (sso_config.frontend_url) {
          try {
            new URL(sso_config.frontend_url);
          } catch {
            ctx.status = 400;
            ctx.body = {
              code: 400,
              message: '前端应用URL格式不正确',
              data: null
            };
            return;
          }
        }
      }

      const loginPage = sso_config
        ? mergeSsoLoginPage(undefined, sso_config.login_page)
        : undefined;
      const normalizedSsoConfig = sso_config
        ? {
            ...sso_config,
            ...(loginPage ? { login_page: loginPage } : {}),
          }
        : sso_config;

      const createPayload = {
        name,
        code,
        logo_url: logo_url || null,
        status,
        sso_enabled,
        sso_config: normalizedSsoConfig,
        description
      };
      if (requestedApplicationId) {
        createPayload.application_id = requestedApplicationId;
      }

      const application = await Application.create(createPayload);

      ctx.state.auditContext = {
        resource_id: application.application_id,
        resource_name: application.name,
        new_data: redactApplicationSnapshot(application),
      };

      ctx.status = 201;
      ctx.body = {
        code: 201,
        message: '应用端创建成功',
        data: application
      };
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        const duplicateApplicationId = ctx.request.body?.application_id;
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: duplicateApplicationId && error.fields?.application_id
            ? '应用ID已存在'
            : '应用端编码已存在',
          data: null
        };
      } else {
        logger.error('创建应用端失败', { 
          error: error.message,
          body: ctx.request.body 
        });
        ctx.status = 500;
        ctx.body = {
          code: 500,
          message: '创建应用端失败',
          error: error.message
        };
      }
    }
  }

  // 获取应用端列表
  static async list(ctx) {
    try {
      const { page = 1, size = 10, status, search } = ctx.query;
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const sizeNum = parseInt(size, 10) || 10;
      const where = {};
      
      if (status) {
        where.status = status;
      }
      
      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { code: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const queryOptions = {
        where,
        order: [['created_at', 'DESC']],
      };

      if (sizeNum === -1) {
        const rows = await Application.findAll(queryOptions);
        ctx.body = {
          code: 200,
          message: 'success',
          data: {
            total: rows.length,
            items: rows,
            current: 1,
            size: rows.length,
          },
        };
        return;
      }

      const { count, rows } = await Application.findAndCountAll({
        ...queryOptions,
        limit: sizeNum,
        offset: (pageNum - 1) * sizeNum,
      });

      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          total: count,
          items: rows,
          current: pageNum,
          size: sizeNum,
        },
      };
    } catch (error) {
      logger.error('获取应用端列表失败', { error: error.message });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '获取应用端列表失败',
        error: error.message
      };
    }
  }

  // 获取应用端详情
  static async getById(ctx) {
    try {
      const { id } = ctx.params;

      // UUID 校验
      if (!isUuid(id)) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '应用端不存在',
          data: null
        };
        return;
      }

      const application = await Application.findByPk(id);
      if (!application) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '应用端不存在',
          data: null
        };
        return;
      }

      ctx.body = {
        code: 200,
        message: 'success',
        data: application
      };
    } catch (error) {
      logger.error('获取应用端详情失败', { error: error.message });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '获取应用端详情失败',
        error: error.message
      };
    }
  }

  // 更新应用端
  static async update(ctx) {
    try {
      const { id } = ctx.params;
      const {
        name,
        code,
        logo_url,
        status,
        sso_enabled,
        sso_config,
        api_enabled,
        api_connect_config,
        api_data_scope,
        builtin_api_scope,
        outbound_webhook_scope,
        bizdata_scope_codes,
        description
      } = ctx.request.body;

      // UUID 校验
      if (!isUuid(id)) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '应用端不存在',
          data: null
        };
        return;
      }

      // 验证字段长度
      if (name && name.length > 100) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '应用端名称不能超过100个字符',
          data: null
        };
        return;
      }

      if (code && code.length > 50) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '应用端编码不能超过50个字符',
          data: null
        };
        return;
      }

      // 验证状态值
      if (status && !['ACTIVE', 'DISABLED', 'ARCHIVED'].includes(status)) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '无效的状态值',
          data: null
        };
        return;
      }

      const application = await Application.findByPk(id);
      if (!application) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '应用端不存在',
          data: null
        };
        return;
      }

      const oldSnapshot = redactApplicationSnapshot(application);

      if (application.code === SYSTEM_APPLICATION_CODE && code && code !== SYSTEM_APPLICATION_CODE) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '系统内置应用的缩写简称不可修改',
          data: null
        };
        return;
      }

      const mergedSsoConfig = sso_config !== undefined
        ? {
            ...(application.sso_config || {}),
            ...sso_config,
            login_page: mergeSsoLoginPage(
              application.sso_config?.login_page,
              sso_config.login_page,
            ),
          }
        : application.sso_config;

      if (sso_enabled && mergedSsoConfig) {
        if (!mergedSsoConfig.protocol || mergedSsoConfig.protocol !== 'OIDC') {
          ctx.status = 400;
          ctx.body = {
            code: 400,
            message: 'SSO协议必须为OIDC',
            data: null
          };
          return;
        }

        if (!mergedSsoConfig.redirect_uri) {
          ctx.status = 400;
          ctx.body = {
            code: 400,
            message: 'SSO回调地址不能为空',
            data: null
          };
          return;
        }

        const redirectCheck = validateSsoRedirectUriConfig(mergedSsoConfig);
        if (!redirectCheck.ok) {
          ctx.status = 400;
          ctx.body = {
            code: 400,
            message: redirectCheck.message,
            data: null
          };
          return;
        }

        if (mergedSsoConfig.redirect_mode !== undefined
          && !['POST_REDIRECT', 'HEADER_REDIRECT'].includes(mergedSsoConfig.redirect_mode)) {
          ctx.status = 400;
          ctx.body = {
            code: 400,
            message: 'SSO跳转模式必须为POST_REDIRECT（POST跳转）或HEADER_REDIRECT（302重定向）',
            data: null
          };
          return;
        }

        for (const [field, message] of [
          ['base_url', 'SSO系统URL格式不正确'],
          ['issuer', 'OIDC发行者URL格式不正确'],
          ['frontend_url', '前端应用URL格式不正确']
        ]) {
          if (mergedSsoConfig[field]) {
            try {
              new URL(mergedSsoConfig[field]);
            } catch {
              ctx.status = 400;
              ctx.body = { code: 400, message, data: null };
              return;
            }
          }
        }
      }

      let scopeCodesUpdate = application.bizdata_scope_codes;
      if (bizdata_scope_codes !== undefined) {
        try {
          scopeCodesUpdate = normalizeBizdataScopeCodes(bizdata_scope_codes);
        } catch (scopeErr) {
          ctx.status = scopeErr.status || 400;
          ctx.body = { code: ctx.status, message: scopeErr.message, data: null };
          return;
        }
      }

      let builtinApiScopeUpdate = application.builtin_api_scope;
      if (builtin_api_scope !== undefined) {
        try {
          builtinApiScopeUpdate = normalizeBuiltinApiScope(builtin_api_scope);
        } catch (scopeErr) {
          ctx.status = scopeErr.status || 400;
          ctx.body = { code: ctx.status, message: scopeErr.message, data: null };
          return;
        }
      }

      let outboundWebhookScopeUpdate = application.outbound_webhook_scope;
      if (outbound_webhook_scope !== undefined) {
        try {
          outboundWebhookScopeUpdate = await normalizeOutboundWebhookScope(outbound_webhook_scope);
        } catch (scopeErr) {
          ctx.status = scopeErr.status || 400;
          ctx.body = { code: ctx.status, message: scopeErr.message, data: null };
          return;
        }
      }

      await application.update({
        name,
        code: application.code === SYSTEM_APPLICATION_CODE ? application.code : code,
        logo_url: logo_url !== undefined ? (logo_url || null) : application.logo_url,
        status,
        sso_enabled,
        sso_config: mergedSsoConfig,
        api_enabled,
        api_connect_config,
        api_data_scope,
        builtin_api_scope: builtinApiScopeUpdate,
        outbound_webhook_scope: outboundWebhookScopeUpdate,
        bizdata_scope_codes: scopeCodesUpdate,
        description
      });

      ctx.state.auditContext = {
        resource_id: id,
        resource_name: application.name,
        old_data: oldSnapshot,
        new_data: redactApplicationSnapshot(application),
      };

      ctx.body = {
        code: 200,
        message: 'success',
        data: application
      };
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '应用端编码已存在',
          data: null
        };
      } else {
        logger.error('更新应用端失败', { error: error.message });
        ctx.status = 500;
        ctx.body = {
          code: 500,
          message: '更新应用端失败',
          error: error.message
        };
      }
    }
  }

  // 删除应用端预览：应用信息 + scope 业务数据计数 + 归属 Bucket 清单
  static async deletePreview(ctx) {
    try {
      const { id } = ctx.params;
      if (!isUuid(id)) {
        ctx.status = 404;
        ctx.body = { code: 404, message: '应用端不存在', data: null };
        return;
      }
      const application = await Application.findByPk(id);
      if (!application) {
        ctx.status = 404;
        ctx.body = { code: 404, message: '应用端不存在', data: null };
        return;
      }
      if (application.code === SYSTEM_APPLICATION_CODE) {
        ctx.status = 403;
        ctx.body = { code: 403, message: '系统内置应用不可删除', data: null };
        return;
      }
      const storageService = require('../services/storage/storageService');
      const cascadeService = require('../services/applicationCascadeDeleteService');
      const buckets = await storageService.listBucketsByApplicationId(id);
      const cascade = await cascadeService.previewCascade(application);
      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          application: redactApplicationSnapshot(application),
          buckets,
          bucketCount: buckets.length,
          objectCount: buckets.reduce((sum, b) => sum + (b.objectCount || 0), 0),
          cascade,
        },
      };
    } catch (error) {
      logger.error('获取应用删除预览失败', { error: error.message });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '获取应用删除预览失败',
        error: error.message,
      };
    }
  }

  // 删除应用端
  static async delete(ctx) {
    try {
      const { id } = ctx.params;
      const body = ctx.request.body || {};
      const deleteBuckets = Boolean(body.deleteBuckets);
      // 默认级联删除 scope 业务数据（与导出命中规则一致）；显式传 false 可仅删应用行
      const deleteBizdata = body.deleteBizdata !== false && body.deleteBizdata !== 'false';
      const dropPhysicalTables = Boolean(body.dropPhysicalTables);

      // UUID 校验
      if (!isUuid(id)) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '应用端不存在',
          data: null
        };
        return;
      }

      const application = await Application.findByPk(id);
      if (!application) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '应用端不存在',
          data: null
        };
        return;
      }

      if (application.code === SYSTEM_APPLICATION_CODE) {
        ctx.status = 403;
        ctx.body = {
          code: 403,
          message: '系统内置应用不可删除',
          data: null
        };
        return;
      }

      ctx.state.auditContext = {
        resource_id: id,
        resource_name: application.name,
        old_data: {
          ...redactApplicationSnapshot(application),
          deleteBuckets,
          deleteBizdata,
          dropPhysicalTables,
        },
      };

      const cascadeService = require('../services/applicationCascadeDeleteService');
      let cascadeResult = null;
      if (deleteBizdata) {
        cascadeResult = await cascadeService.executeCascade(application, {
          dropPhysicalTables,
        });
      }

      let storageResult = null;
      if (deleteBuckets) {
        const storageService = require('../services/storage/storageService');
        storageResult = await storageService.deleteBucketsForApplication(id);
      }

      const releasedReferences = await cascadeService.releaseApplicationReferences(id);

      // 物理删除：paranoid 软删会留下同 code tombstone，阻断后续同 code 导入
      await application.destroy({ force: true });
      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          cascade: cascadeResult,
          deletedBuckets: storageResult ? storageResult.bucketsDeleted : undefined,
          deletedObjects: storageResult ? storageResult.objectsDeleted : undefined,
          skippedSystemBuckets: storageResult ? storageResult.skippedSystem : undefined,
          releasedReferences,
        },
      };
    } catch (error) {
      logger.error('删除应用端失败', { error: error.message });
      ctx.status = error.status || 500;
      ctx.body = {
        code: error.status || 500,
        message: error.message || '删除应用端失败',
        error: error.message
      };
    }
  }

  // 生成应用密钥
  static async generateSecret(ctx) {
    try {
      const { id } = ctx.params;

      // UUID 校验
      if (!isUuid(id)) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '应用不存在',
          data: null
        };
        return;
      }

      const application = await Application.findByPk(id);
      if (!application) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '应用不存在',
          data: null
        };
        return;
      }

      // 生成应用统一密钥（不再依赖 salt）
      const app_secret = crypto.randomBytes(32).toString('hex');
      const oldSnapshot = redactApplicationSnapshot(application);

      await application.update({
        api_connect_config: {
          ...(application.api_connect_config || {}),
          app_secret
        },
        sso_config: {
          ...(application.sso_config || {}),
          client_secret: app_secret
        }
      });

      ctx.state.auditContext = {
        resource_id: id,
        resource_name: application.name,
        old_data: oldSnapshot,
        new_data: redactApplicationSnapshot(application),
      };

      ctx.body = {
        code: 200,
        message: '生成成功',
        data: {
          app_secret
        }
      };
    } catch (error) {
      logger.error('生成应用密钥失败', { error: error.message });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '生成应用密钥失败',
        error: error.message
      };
    }
  }

  // 获取应用Token
  static async getToken(ctx) {
    try {
      const { application_id, app_secret } = ctx.request.body;

      // 验证参数
      if (!application_id || !app_secret) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: 'application_id和app_secret不能为空',
          data: null
        };
        return;
      }

      // UUID 校验
      if (!isUuid(application_id)) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '无效的application_id',
          data: null
        };
        return;
      }

      const application = await Application.findByPk(application_id);
      if (!application) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '应用不存在',
          data: null
        };
        return;
      }

      // 验证app_secret
      const stored_config = application.api_connect_config;
      if (!stored_config || stored_config.app_secret !== app_secret) {
        ctx.status = 401;
        ctx.body = {
          code: 401,
          message: '无效的app_secret',
          data: null
        };
        return;
      }

      // 生成JWT token
      const token = jwt.sign(
        {
          application_id,
          type: 'application'
        },
        config.api.security.jwtSecret,
        {
          expiresIn: config.api.security.jwtExpiresIn
        }
      );

      ctx.body = {
        code: 200,
        message: '获取成功',
        data: {
          token
        }
      };
    } catch (error) {
      logger.error('获取应用Token失败', { error: error.message });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '获取应用Token失败',
        error: error.message
      };
    }
  }

  // 获取SSO应用信息
  static async getSsoInfo(ctx) {
    try {
      const { id } = ctx.params;

      // UUID 校验
      if (!isUuid(id)) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: "应用端不存在",
          data: null
        };
        return;
      }

      const application = await Application.findByPk(id);
      if (!application) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: "应用端不存在",
          data: null
        };
        return;
      }

      // 检查SSO是否启用
      if (!application.sso_enabled) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: "该应用未启用SSO",
          data: null
        };
        return;
      }

      // 检查SSO配置是否存在（统一密钥 client_secret / app_secret，兼容旧版 salt）
      if (!hasSsoSigningSecret(application)) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: 'SSO配置不完整，请先生成应用统一密钥',
          data: null
        };
        return;
      }

      const signingSecret = resolveSsoSigningSecret(application);

      // 生成当前时间戳
      const currentTimestamp = Date.now().toString();
      
      // 使用bcrypt加密时间戳
      const bcrypt = require("bcryptjs");

      // 使用应用统一密钥和当前时间戳生成 SSO 回调校验 secret
      const secret = await bcrypt.hash(currentTimestamp + signingSecret, 10);

        // 获取跳转模式，默认为POST_REDIRECT（POST跳转）
        const redirectMode = application.sso_config.redirect_mode !== undefined
          ? application.sso_config.redirect_mode
          : config.api.sso.redirectMode.default;

      // 构建SSO配置信息（不含密钥；login_page 供登录页换肤）
      const loginPage = normalizeSsoLoginPage(application.sso_config?.login_page);
      const ssoConfig = {
        currentTimestamp,
        secret,
        protocol: application.sso_config.protocol || "OIDC",
        redirect_uri: resolveSsoRedirectUri(application.sso_config, requestHostInfo(ctx)),
        redirect_uri_use_system_host: !!application.sso_config.redirect_uri_use_system_host,
        redirect_mode: redirectMode,
        // 该应用的登录页是否要求人类验证（滑块）；未配置时跟随平台全局开关
        login_verify_enabled: resolveLoginVerifyEnabled({
          appFlag: application.sso_config?.login_verify_enabled,
          globalFlag: config.api?.loginVerify?.enabled !== false,
        }),
        ...(loginPage ? { login_page: loginPage } : {}),
      };

      // 构建返回数据
      const ssoInfo = {
        application_id: application.application_id,
        name: application.name,
        code: application.code,
        logo_url: application.logo_url,
        status: application.status,
        sso_enabled: application.sso_enabled,
        sso_config: ssoConfig,
        description: application.description,
        created_at: application.created_at,
        updated_at: application.updated_at
      };

      ctx.body = {
        code: 200,
        message: "success",
        data: ssoInfo
      };
    } catch (error) {
      logger.error("获取SSO应用信息失败", { error: error.message });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: "获取SSO应用信息失败",
        error: error.message
      };
    }
  }

  /** 获取系统内置应用（EADAF）公开品牌信息，无需登录 */
  static async getSystemBranding(ctx) {
    try {
      const application = await Application.findOne({
        where: {
          [Op.or]: [
            { application_id: config.systemApplication.applicationId },
            { code: SYSTEM_APPLICATION_CODE },
          ],
        },
      });

      if (!application) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '系统应用不存在',
          data: null,
        };
        return;
      }

      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          application_id: application.application_id,
          name: application.name,
          code: application.code,
          logo_url: application.logo_url,
          description: application.description,
        },
      };
    } catch (error) {
      logger.error('获取系统应用品牌信息失败', { error: error.message });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '获取系统应用品牌信息失败',
        error: error.message,
      };
    }
  }

  /** 获取应用顶层 Skill 说明 */
  static async getTopLevelSkill(ctx) {
    try {
      const { id } = ctx.params;

      if (!isUuid(id)) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '应用端不存在',
          data: null,
        };
        return;
      }

      const application = await Application.findByPk(id, {
        attributes: ['application_id', 'name', 'top_level_skill_markdown', 'updated_at'],
      });

      if (!application) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '应用端不存在',
          data: null,
        };
        return;
      }

      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          applicationId: application.application_id,
          applicationName: application.name,
          contentMarkdown: application.top_level_skill_markdown || '',
          updatedAt: application.updated_at,
        },
      };
    } catch (error) {
      logger.error('获取应用顶层 Skill 失败', { error: error.message });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '获取应用顶层 Skill 失败',
        data: null,
      };
    }
  }

  /** 更新应用顶层 Skill 说明 */
  static async updateTopLevelSkill(ctx) {
    try {
      const { id } = ctx.params;
      const { contentMarkdown } = ctx.request.body || {};

      if (!isUuid(id)) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '应用端不存在',
          data: null,
        };
        return;
      }

      if (contentMarkdown !== undefined && typeof contentMarkdown !== 'string') {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: 'contentMarkdown 必须为字符串',
          data: null,
        };
        return;
      }

      const application = await Application.findByPk(id);
      if (!application) {
        ctx.status = 404;
        ctx.body = {
          code: 404,
          message: '应用端不存在',
          data: null,
        };
        return;
      }

      const oldMarkdown = application.top_level_skill_markdown || '';

      await application.update({
        top_level_skill_markdown: contentMarkdown ?? '',
      });

      ctx.state.auditContext = {
        resource_id: id,
        resource_name: application.name,
        old_data: { top_level_skill_markdown: oldMarkdown },
        new_data: { top_level_skill_markdown: application.top_level_skill_markdown || '' },
      };

      ctx.body = {
        code: 200,
        message: '保存成功',
        data: {
          applicationId: application.application_id,
          applicationName: application.name,
          contentMarkdown: application.top_level_skill_markdown || '',
          updatedAt: application.updated_at,
        },
      };
    } catch (error) {
      logger.error('更新应用顶层 Skill 失败', { error: error.message });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '更新应用顶层 Skill 失败',
        data: null,
      };
    }
  }

  /** 公开 API 目录：供第三方开发人员查看应用可访问的 API，无需登录 */
  static async getPublicApiCatalog(ctx) {
    try {
      const data = await getPublicApiCatalog(ctx.params.key);
      ctx.body = {
        code: 200,
        message: 'success',
        data,
      };
    } catch (error) {
      const status = error.status || 500;
      ctx.status = status;
      ctx.body = {
        code: status,
        message: error.message || '获取 API 目录失败',
        data: null,
      };
    }
  }

  /**
   * 返回 OpenAPI 3.0 JSON（纯 JSON，供 AI / 工具直接读取）。
   * 不套 { code, message, data } 外壳，直接输出 OpenAPI 规范对象。
   */
  static async getPublicApiOpenApi(ctx) {
    try {
      const openapi = await getPublicApiOpenApi(ctx.params.key);
      ctx.set('Content-Type', 'application/json; charset=utf-8');
      ctx.body = openapi;
    } catch (error) {
      const status = error.status || 500;
      ctx.status = status;
      ctx.set('Content-Type', 'application/json; charset=utf-8');
      ctx.body = {
        openapi: '3.0.3',
        error: error.message || '生成 OpenAPI 失败',
        status,
      };
    }
  }

  /**
   * 返回 EADAF API 调用 Skill（纯 Markdown，供 AI / 工具直接读取）。
   * 不套 { code, message, data } 外壳。
   */
  static async getPublicApiSkill(ctx) {
    try {
      const { getPublicApiSkillMarkdown } = require('../services/eadafApiSkillService');
      const { markdown, version, contentType } = await getPublicApiSkillMarkdown(ctx.params.key);
      ctx.set('Content-Type', contentType);
      if (version) {
        ctx.set('X-EADAF-Api-Skill-Version', version);
      }
      ctx.body = markdown;
    } catch (error) {
      const status = error.status || 500;
      ctx.status = status;
      ctx.set('Content-Type', 'text/plain; charset=utf-8');
      ctx.body = error.message || '获取 API Skill 失败';
    }
  }
}

module.exports = ApplicationController; 