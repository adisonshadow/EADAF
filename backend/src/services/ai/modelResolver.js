const { AiModel, Provider, ModelCapability, ModelIoTag } = require('../../models');
const { decryptApiKey } = require('../../utils/encryption');
const { AIBaseError } = require('../../utils/aiErrors');

async function resolveModel({ slug, modelId, traceId, clientApiKey }) {
  const hasSlug = Boolean(slug);
  const hasModelId = Boolean(modelId);

  if ((hasSlug && hasModelId) || (!hasSlug && !hasModelId)) {
    throw new AIBaseError(
      'INVALID_REQUEST',
      'slug 与 modelId 必须二选一',
      traceId
    );
  }

  const where = hasSlug ? { slug, is_active: true } : { id: modelId, is_active: true };

  const model = await AiModel.findOne({
    where,
    include: [
      {
        model: Provider,
        as: 'provider',
        where: { is_active: true },
        required: true
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
    ]
  });

  if (!model) {
    throw new AIBaseError(
      'MODEL_NOT_FOUND',
      hasSlug
        ? `Model with slug '${slug}' not found or inactive`
        : `Model with modelId '${modelId}' not found or inactive`,
      traceId
    );
  }

  const provider = model.provider;
  const apiKeyStorage = provider.api_key_storage === 'browser' ? 'browser' : 'database';
  let apiKey = null;
  if (apiKeyStorage === 'browser') {
    const fromClient = typeof clientApiKey === 'string' ? clientApiKey.trim() : '';
    apiKey = fromClient || null;
  } else if (provider.api_key_encrypted) {
    apiKey = decryptApiKey(provider.api_key_encrypted);
  }

  const capabilities = model.capabilities.map((item) => item.capability);
  const inputTags = model.ioTags
    .filter((item) => item.direction === 'input')
    .map((item) => item.modality);
  const outputTags = model.ioTags
    .filter((item) => item.direction === 'output')
    .map((item) => item.modality);

  return {
    slug: model.slug,
    upstreamModelId: model.model_id,
    baseUrl: provider.base_url.replace(/\/$/, ''),
    apiKey,
    apiKeyStorage,
    providerId: provider.id,
    adapterType: provider.adapter_type,
    defaultParams: model.default_params || {},
    rateLimit: model.rate_limit || null,
    capabilities,
    inputTags,
    outputTags
  };
}

module.exports = {
  resolveModel
};
