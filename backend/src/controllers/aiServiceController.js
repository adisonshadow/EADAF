const { PassThrough } = require('stream');
const { AiModel, Provider, ModelCapability, ModelIoTag, ApiRequestLog } = require('../models');
const { resolveModel } = require('../services/ai/modelResolver');
const { validateRequest } = require('../services/ai/capabilityValidator');
const { forwardChat, buildUpstreamUrl } = require('../services/ai/llmGateway');
const { acquire: acquireModelSlot } = require('../services/ai/modelRateLimiter');
const { AIBaseError, sendAiError } = require('../utils/aiErrors');
const { extractErrorMessage } = require('../utils/upstreamErrorMessage');
const logger = require('../utils/logger');

function formatPublicModel(model) {
  const data = model.toJSON();
  return {
    slug: data.slug,
    displayName: data.display_name,
    capabilities: (data.capabilities || []).map((item) => item.capability),
    inputTags: (data.ioTags || [])
      .filter((item) => item.direction === 'input')
      .map((item) => item.modality),
    outputTags: (data.ioTags || [])
      .filter((item) => item.direction === 'output')
      .map((item) => item.modality),
    defaultParams: data.default_params || {},
    providerId: data.provider?.id || null,
    apiKeyStorage: data.provider?.api_key_storage === 'browser' ? 'browser' : 'database',
  };
}

async function writeRequestLog({
  traceId,
  slug,
  statusCode,
  durationMs,
  errorCode,
  turnId,
  toolFunctionName,
  toolExecutionType,
}) {
  try {
    await ApiRequestLog.create({
      trace_id: traceId,
      slug: slug || null,
      status_code: statusCode,
      duration_ms: durationMs,
      error_code: errorCode || null,
      turn_id: turnId || null,
      tool_function_name: toolFunctionName || null,
      tool_execution_type: toolExecutionType || null,
    });
  } catch (error) {
    logger.error('写入 AI 请求日志失败', { error: error.message, traceId });
  }
}

function isHtmlResponse(contentType, bodyText) {
  if ((contentType || '').includes('text/html')) {
    return true;
  }
  const trimmed = (bodyText || '').trimStart();
  return /^<!DOCTYPE/i.test(trimmed) || /^<html/i.test(trimmed);
}

function logUpstreamResponseError({
  traceId,
  resolved,
  status,
  contentType,
  errorText,
  reason
}) {
  const upstreamUrl = buildUpstreamUrl(resolved.baseUrl);
  const htmlResponse = isHtmlResponse(contentType, errorText);
  const detail = {
    traceId,
    reason,
    slug: resolved.slug,
    upstreamModelId: resolved.upstreamModelId,
    baseUrl: resolved.baseUrl,
    upstreamUrl,
    status,
    contentType: contentType || '(empty)',
    isHtmlResponse: htmlResponse,
    hint: htmlResponse
      ? '上游返回 HTML 页面，通常表示 Provider 的 API Key 或 base_url 配置错误'
      : undefined,
    bodyPreview: (errorText || '').slice(0, 1000)
  };

  logger.error('AI 上游响应异常', detail);
  console.error('[AI Upstream Error]', reason, detail);
}

class AiServiceController {
  static async listModels(ctx) {
    try {
      const models = await AiModel.findAll({
        where: { is_active: true },
        include: [
          {
            model: Provider,
            as: 'provider',
            where: { is_active: true },
            required: true,
            attributes: ['id', 'api_key_storage']
          },
          {
            model: ModelCapability,
            as: 'capabilities',
            attributes: ['capability']
          },
          {
            model: ModelIoTag,
            as: 'ioTags',
            attributes: ['direction', 'modality']
          }
        ],
        order: [['created_at', 'ASC']]
      });

      ctx.set('X-Trace-Id', ctx.state.traceId);
      ctx.body = {
        data: models.map(formatPublicModel)
      };
    } catch (error) {
      logger.error('获取 AI 模型列表失败', { error: error.message });
      sendAiError(ctx, 'UPSTREAM_ERROR', '获取模型列表失败', ctx.state.traceId);
    }
  }

  static async chatCompletions(ctx) {
    const traceId = ctx.state.traceId;
    const turnId = ctx.get('x-aibase-turnid') || null;
    const startedAt = Date.now();
    const body = ctx.request.body || {};
    const slug = body.slug;

    // Per-model 限流状态：提升到 try 外，使 catch 也能释放并发位。
    // 无配置时 acquire 返回 no-op；超限则抛 RATE_LIMITED。
    let releaseSlot = () => {};
    let slotReleased = false;
    const releaseSlotOnce = () => {
      if (!slotReleased) {
        slotReleased = true;
        releaseSlot();
      }
    };

    try {
      const clientApiKey = typeof body.providerApiKey === 'string'
        ? body.providerApiKey
        : ctx.get('x-eadaf-provider-api-key');
      delete body.providerApiKey;
      const resolved = await resolveModel({
        slug: body.slug,
        modelId: body.modelId,
        traceId,
        clientApiKey,
      });

      validateRequest(resolved, body, traceId);

      releaseSlot = await acquireModelSlot(resolved.slug, resolved.rateLimit, traceId);

      const { response, stream } = await forwardChat(resolved, body, traceId);
      const durationMs = Date.now() - startedAt;

      if (response.status === 429) {
        releaseSlotOnce();
        await writeRequestLog({
          traceId,
          turnId,
          slug: resolved.slug,
          statusCode: 429,
          durationMs,
          errorCode: 'RATE_LIMITED'
        });
        sendAiError(ctx, 'RATE_LIMITED', '触发限流', traceId);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        const contentType = response.headers.get('content-type') || '';
        logUpstreamResponseError({
          traceId,
          resolved,
          status: response.status,
          contentType,
          errorText,
          reason: '上游 HTTP 状态异常'
        });
        await writeRequestLog({
          traceId,
          turnId,
          slug: resolved.slug,
          statusCode: response.status,
          durationMs,
          errorCode: 'UPSTREAM_ERROR'
        });
        sendAiError(
          ctx,
          'UPSTREAM_ERROR',
          extractErrorMessage(errorText),
          traceId,
        );
        releaseSlotOnce();
        return;
      }

      ctx.set('X-Trace-Id', traceId);

      if (stream) {
        const upstreamContentType = response.headers.get('content-type') || '';
        if (!upstreamContentType.includes('text/event-stream')) {
          const errorText = await response.text();
          logUpstreamResponseError({
            traceId,
            resolved,
            status: response.status,
            contentType: upstreamContentType,
            errorText,
            reason: '上游未返回 SSE 流式响应'
          });
          await writeRequestLog({
            traceId,
            turnId,
            slug: resolved.slug,
            statusCode: response.status,
            durationMs,
            errorCode: 'UPSTREAM_ERROR'
          });
          sendAiError(
            ctx,
            'UPSTREAM_ERROR',
            extractErrorMessage(errorText),
            traceId,
          );
          releaseSlotOnce();
          return;
        }

        ctx.status = 200;
        ctx.set('Content-Type', 'text/event-stream; charset=utf-8');
        ctx.set('Cache-Control', 'no-cache, no-transform');
        ctx.set('Connection', 'keep-alive');
        ctx.set('X-Accel-Buffering', 'no');

        const passThrough = new PassThrough();
        ctx.body = passThrough;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              passThrough.write(decoder.decode(value, { stream: true }));
            }
            passThrough.end();
            await writeRequestLog({
              traceId,
              turnId,
              slug: resolved.slug,
              statusCode: 200,
              durationMs: Date.now() - startedAt,
              errorCode: null
            });
          } catch (error) {
            passThrough.destroy(error);
            await writeRequestLog({
              traceId,
              turnId,
              slug: resolved.slug,
              statusCode: 502,
              durationMs: Date.now() - startedAt,
              errorCode: 'UPSTREAM_ERROR'
            });
          } finally {
            releaseSlotOnce();
          }
        })();
        return;
      }

      const result = await response.json();
      await writeRequestLog({
        traceId,
        turnId,
        slug: resolved.slug,
        statusCode: 200,
        durationMs,
        errorCode: null
      });
      releaseSlotOnce();
      ctx.body = result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      // 无论何种失败，只要已 acquire 就必须释放并发位（RPM 令牌已在 acquire 时扣除）。
      releaseSlotOnce();

      if (error instanceof AIBaseError) {
        await writeRequestLog({
          traceId,
          turnId,
          slug,
          statusCode: error.httpStatus,
          durationMs,
          errorCode: error.code
        });
        // 本地 per-model 限流器抛出的 RATE_LIMITED 携带 Retry-After 提示，
        // 透传给前端供其退避重试使用。
        if (error.code === 'RATE_LIMITED' && error.retryAfter) {
          ctx.set('Retry-After', String(error.retryAfter));
        }
        sendAiError(ctx, error.code, error.message, traceId);
        return;
      }

      logger.error('AI 对话请求失败', { error: error.message, traceId });
      await writeRequestLog({
        traceId,
        turnId,
        slug,
        statusCode: 500,
        durationMs,
        errorCode: 'UPSTREAM_ERROR'
      });
      sendAiError(ctx, 'UPSTREAM_ERROR', error.message || 'AI 对话请求失败', traceId);
    }
  }
}

module.exports = AiServiceController;
