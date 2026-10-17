const { Scope, Tool, Skill, Application, ApiRequestLog } = require('../models');
const SkillController = require('./skillController');
const { invokeTool, formatOpenAITool } = require('../services/ai/toolInvokeService');
const { executeHttpRequest } = require('../services/ai/httpRequestToolService');
const { CAPABILITIES } = require('../constants/aiCapabilities');
const logger = require('../utils/logger');

function extractBearerToken(ctx) {
  const auth = ctx.headers.authorization || ctx.headers.Authorization || '';
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim() || null;
  }
  return null;
}

class AiCapabilityController {
  static async getCapabilities(ctx) {
    try {
      const scopeSlug = ctx.query.scopeSlug || ctx.query.scope;
      const applicationId = ctx.query.applicationId || ctx.query.application_id;

      const [scopes, skills, tools] = await Promise.all([
        Scope.findAll({ where: { is_active: true }, order: [['name', 'ASC']] }),
        Skill.findAll({
          where: { is_active: true },
          include: [
            { model: Scope, as: 'scope', attributes: ['id', 'name', 'slug'], required: false },
            {
              model: Application,
              as: 'applications',
              attributes: ['application_id', 'name', 'code'],
              through: { attributes: [] },
              required: false,
            },
          ],
          order: [['name', 'ASC']],
        }),
        Tool.findAll({
          where: { is_active: true },
          include: [{ model: Scope, as: 'scope', attributes: ['id', 'name', 'slug'] }],
          order: [['name', 'ASC']],
        }),
      ]);

      const visibleSkills = SkillController.filterSkillsForContext(skills, {
        scopeSlug,
        applicationId,
      });

      let topLevelSkill = null;
      if (applicationId) {
        const application = await Application.findByPk(applicationId, {
          attributes: ['application_id', 'name', 'top_level_skill_markdown'],
        });
        const contentMarkdown = application?.top_level_skill_markdown?.trim();
        if (contentMarkdown) {
          topLevelSkill = {
            name: `${application.name} 顶层 Skill`,
            contentMarkdown,
          };
        }
      }

      ctx.body = {
        data: {
          modelCapabilities: CAPABILITIES,
          scopes: scopes.map((item) => ({
            id: item.id,
            name: item.name,
            slug: item.slug,
            description: item.description,
          })),
          skills: visibleSkills.map((item) => ({
            id: item.id,
            name: item.name,
            slug: item.slug,
            description: item.description,
            scopeId: item.scope_id,
            scopeSlug: item.scope?.slug || null,
            isGlobal: item.is_global === true,
            isDedicated: item.is_dedicated === true,
            completionStrategy: item.completion_strategy || undefined,
            applicationIds: (item.applications || []).map((app) => app.application_id),
          })),
          tools: tools.map((item) => ({
            id: item.id,
            name: item.name,
            slug: item.slug,
            functionName: item.function_name,
            executionType: item.execution_type,
            scopeSlug: item.scope?.slug,
          })),
          topLevelSkill,
        },
      };
    } catch (error) {
      logger.error('获取 capabilities 失败', { error: error.message });
      ctx.status = 500;
      ctx.body = {
        error: { code: 'INTERNAL_ERROR', message: '获取 capabilities 失败', traceId: ctx.state.traceId },
      };
    }
  }

  static async getScopeTools(ctx) {
    try {
      const scope = await Scope.findOne({
        where: { slug: ctx.params.slug, is_active: true },
      });

      if (!scope) {
        ctx.status = 404;
        ctx.body = {
          error: { code: 'SCOPE_NOT_FOUND', message: 'Scope 不存在', traceId: ctx.state.traceId },
        };
        return;
      }

      const tools = await Tool.findAll({
        where: { scope_id: scope.id, is_active: true },
        order: [['name', 'ASC']],
      });

      ctx.body = {
        data: {
          scope: { id: scope.id, name: scope.name, slug: scope.slug },
          tools: tools.map((tool) => ({
            id: tool.id,
            name: tool.name,
            slug: tool.slug,
            functionName: tool.function_name,
            description: tool.description,
            executionType: tool.execution_type,
            parametersSchema: tool.parameters_schema || {},
            reviewMarkdown: tool.review_markdown,
            openaiTool: formatOpenAITool(tool),
          })),
        },
      };
    } catch (error) {
      logger.error('获取 Scope Tools 失败', { error: error.message });
      ctx.status = 500;
      ctx.body = {
        error: { code: 'INTERNAL_ERROR', message: '获取 Scope Tools 失败', traceId: ctx.state.traceId },
      };
    }
  }

  static async invokeTool(ctx) {
    const { functionName, arguments: toolArgs } = ctx.request.body;
    const turnId = ctx.get('x-aibase-turnid') || null;
    const startedAt = Date.now();

    if (!functionName) {
      ctx.status = 400;
      ctx.body = {
        error: { code: 'INVALID_REQUEST', message: 'functionName 为必填项', traceId: ctx.state.traceId },
      };
      return;
    }

    try {
      const tool = await Tool.findOne({
        where: { function_name: functionName, is_active: true },
      });

      if (!tool) {
        ctx.status = 404;
        ctx.body = {
          error: { code: 'TOOL_NOT_FOUND', message: 'Tool 不存在', traceId: ctx.state.traceId },
        };
        return;
      }

      if (tool.execution_type === 'client') {
        ctx.status = 400;
        ctx.body = {
          error: {
            code: 'CLIENT_TOOL',
            message: 'Client tool 需在前端 functionRegistry 执行',
            traceId: ctx.state.traceId,
          },
        };
        return;
      }

      const logContext = {
        userId: ctx.state.user?.id || ctx.state.user?.userId,
        traceId: ctx.state.traceId,
        userToken: extractBearerToken(ctx),
        // 当前请求声明的应用：`?app=`（ai-base 对 SSO 应用会带）或令牌自述
        requestedApp:
          ctx.query?.app
          || ctx.state.user?.application_id
          || ctx.state.application?.application_id
          || ctx.state.ssoApplicationId
          || null,
      };

      const result = await invokeTool(tool, toolArgs || {}, logContext);
      try {
        await ApiRequestLog.create({
          trace_id: ctx.state.traceId,
          slug: null,
          status_code: 200,
          duration_ms: Date.now() - startedAt,
          error_code: null,
          turn_id: turnId,
          tool_function_name: functionName,
          tool_execution_type: tool.execution_type || null,
        });
      } catch (logError) {
        logger.error('写入 Tool 调用日志失败', { error: logError.message, functionName });
      }
      ctx.body = { data: result };
    } catch (error) {
      logger.error('Tool 调用失败', { error: error.message, functionName });
      try {
        await ApiRequestLog.create({
          trace_id: ctx.state.traceId,
          slug: null,
          status_code: 500,
          duration_ms: Date.now() - startedAt,
          error_code: 'TOOL_INVOKE_FAILED',
          turn_id: turnId,
          tool_function_name: functionName,
          tool_execution_type: null,
        });
      } catch (logError) {
        logger.error('写入 Tool 调用日志失败', { error: logError.message, functionName });
      }
      ctx.status = 500;
      ctx.body = {
        error: { code: 'TOOL_INVOKE_FAILED', message: error.message, traceId: ctx.state.traceId },
      };
    }
  }

  /**
   * 直接执行公共 HTTP 请求（与 http_request Tool 同一实现，便于联调）
   * POST /api/v1/ai/http-request
   */
  static async httpRequest(ctx) {
    try {
      const result = await executeHttpRequest(ctx.request.body || {}, {
        userToken: extractBearerToken(ctx),
        userId: ctx.state.user?.id || ctx.state.user?.userId,
        traceId: ctx.state.traceId,
      });
      ctx.body = { data: result };
    } catch (error) {
      const code = error.code || 'HTTP_REQUEST_FAILED';
      const status =
        code === 'missing_user_token' || code === 'invalid_url' || code === 'invalid_method'
          || code === 'invalid_protocol' || code === 'host_blocked'
          ? 400
          : 500;
      logger.error('http-request 失败', { error: error.message, code });
      ctx.status = status;
      ctx.body = {
        error: { code, message: error.message, traceId: ctx.state.traceId },
      };
    }
  }

  static async logClientToolInvoke(ctx) {
    try {
      const enabled = String(process.env.AI_TOOL_INVOKE_LOG_ENABLED || 'false').toLowerCase() === 'true';
      if (!enabled) {
        ctx.status = 200;
        ctx.body = { data: { logged: false } };
        return;
      }

      const body = ctx.request.body || {};
      const { logAiToolInvokeFailure } = require('../services/ai/aiToolInvokeLogService');

      const MAX_PREVIEW = 2000;
      const truncate = (value) => {
        if (value == null) return value;
        try {
          const text = typeof value === 'string' ? value : JSON.stringify(value);
          if (text.length <= MAX_PREVIEW) return value;
          return { _truncated: true, preview: `${text.slice(0, MAX_PREVIEW)}…` };
        } catch {
          return String(value).slice(0, MAX_PREVIEW);
        }
      };

      logAiToolInvokeFailure({
        userId: ctx.state.user?.id || ctx.state.user?.userId,
        tool: body.name || body.tool,
        args: truncate(body.args),
        envelope: body.envelope,
        error: body.error,
        executionType: body.executionType || 'client',
        durationMs: body.durationMs,
        conversationKey: body.conversationKey,
        turnId: body.turnId,
        round: body.round,
        rawResult: truncate(body.result),
      });

      ctx.status = 200;
      ctx.body = { data: { logged: true } };
    } catch (error) {
      logger.error('记录 Client Tool 日志失败', { error: error.message });
      ctx.status = 500;
      ctx.body = {
        error: { code: 'INTERNAL_ERROR', message: '记录 Tool 日志失败', traceId: ctx.state.traceId },
      };
    }
  }
}

module.exports = AiCapabilityController;
