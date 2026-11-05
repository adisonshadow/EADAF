const config = require('../../config');
const { AIBaseError } = require('../../utils/aiErrors');

function buildUpstreamUrl(baseUrl) {
  const normalized = baseUrl.replace(/\/$/, '');
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }
  if (normalized.endsWith('/v1') || normalized.endsWith('/v3') || normalized.endsWith('/v4')) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
}

function buildUpstreamBody(resolvedModel, body) {
  const {
    slug: _slug,
    modelId: _modelId,
    providerApiKey: _providerApiKey,
    messages,
    stream = false,
    enable_thinking: enableThinking,
    ...rest
  } = body;

  const upstreamBody = {
    ...resolvedModel.defaultParams,
    ...rest,
    model: resolvedModel.upstreamModelId,
    messages,
    stream
  };

  // 兼容 DeepSeek / 通义等 OpenAI 兼容接口：未开启时显式关闭，避免模型默认输出 reasoning
  if (resolvedModel.adapterType === 'openai_compatible') {
    upstreamBody.enable_thinking = enableThinking === true;
  }

  return upstreamBody;
}

function buildHeaders(resolvedModel) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (resolvedModel.apiKey) {
    headers.Authorization = `Bearer ${resolvedModel.apiKey}`;
  }
  return headers;
}

async function forwardChat(resolvedModel, body, traceId) {
  if (!resolvedModel.apiKey) {
    throw new AIBaseError(
      'UPSTREAM_ERROR',
      resolvedModel.apiKeyStorage === 'browser'
        ? '该服务商的 API Key 只保存在浏览器，当前请求没有带上本机保存的密钥'
        : 'Provider API Key 未配置',
      traceId
    );
  }

  const upstreamBody = buildUpstreamBody(resolvedModel, body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ai.upstreamTimeoutMs);

  try {
    const response = await fetch(buildUpstreamUrl(resolvedModel.baseUrl), {
      method: 'POST',
      headers: buildHeaders(resolvedModel),
      body: JSON.stringify(upstreamBody),
      signal: controller.signal
    });

    return {
      response,
      stream: Boolean(upstreamBody.stream)
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AIBaseError('TIMEOUT', '上游大模型请求超时', traceId);
    }
    throw new AIBaseError(
      'UPSTREAM_ERROR',
      error.message || '上游大模型请求失败',
      traceId
    );
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  forwardChat,
  buildUpstreamBody,
  buildUpstreamUrl
};
