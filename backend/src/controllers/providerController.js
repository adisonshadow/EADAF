const { v4: uuidv4 } = require('uuid');
const { Provider } = require('../models');
const { encryptApiKey } = require('../utils/encryption');
const { isValidSlug, resolveUniqueSlug } = require('../constants/aiCapabilities');
const logger = require('../utils/logger');

function storageOf(value) {
  return value === 'browser' ? 'browser' : 'database';
}

function formatProvider(provider) {
  const data = provider.toJSON ? provider.toJSON() : provider;
  const apiKeyStorage = storageOf(data.api_key_storage);
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    baseUrl: data.base_url,
    apiKeySet: apiKeyStorage === 'browser' ? false : Boolean(data.api_key_encrypted),
    apiKeyStorage,
    adapterType: data.adapter_type,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

function parseApiKeyStorage(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'browser' || value === 'database') return value;
  return null;
}

async function assertBrowserStorageAllowed() {
  const { getSystemFeatures } = require('../services/system/systemService');
  const features = await getSystemFeatures();
  if (!features.allowBrowserApiKey) {
    const error = new Error('未允许把 API Key 只保存在浏览器');
    error.status = 400;
    throw error;
  }
}

class ProviderController {
  static async list(ctx) {
    try {
      const page = Math.max(parseInt(ctx.query.page, 10) || 1, 1);
      const size = Math.min(Math.max(parseInt(ctx.query.size, 10) || 10, 1), 100);
      const where = {};

      if (ctx.query.isActive !== undefined) {
        where.is_active = ctx.query.isActive === 'true';
      }

      const { count, rows } = await Provider.findAndCountAll({
        where,
        limit: size,
        offset: (page - 1) * size,
        order: [['created_at', 'DESC']]
      });

      ctx.body = {
        code: 200,
        message: '获取服务商列表成功',
        data: {
          total: count,
          items: rows.map(formatProvider),
          page,
          size
        }
      };
    } catch (error) {
      logger.error('获取服务商列表失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: '获取服务商列表失败', data: null };
    }
  }

  static async create(ctx) {
    const { name, slug, baseUrl, apiKey, adapterType = 'openai_compatible' } = ctx.request.body;
    const apiKeyStorage = parseApiKeyStorage(ctx.request.body.apiKeyStorage);

    if (!name || !baseUrl) {
      ctx.status = 400;
      ctx.body = { code: 400, message: 'name、baseUrl 为必填项', data: null };
      return;
    }
    if (apiKeyStorage === null) {
      ctx.status = 400;
      ctx.body = { code: 400, message: 'apiKeyStorage 只能是 database 或 browser', data: null };
      return;
    }

    const trimmedSlug = typeof slug === 'string' ? slug.trim() : '';
    if (trimmedSlug && !isValidSlug(trimmedSlug)) {
      ctx.status = 400;
      ctx.body = { code: 400, message: 'slug 格式无效，仅允许小写字母、数字和连字符', data: null };
      return;
    }

    try {
      const finalSlug = trimmedSlug || await resolveUniqueSlug(Provider, name);
      if (trimmedSlug) {
        const existing = await Provider.findOne({ where: { slug: finalSlug } });
        if (existing) {
          ctx.status = 400;
          ctx.body = { code: 400, message: 'slug 已存在', data: null };
          return;
        }
      }

      const storage = apiKeyStorage || 'database';
      if (storage === 'browser') {
        await assertBrowserStorageAllowed();
      }

      const provider = await Provider.create({
        id: uuidv4(),
        name,
        slug: finalSlug,
        base_url: baseUrl,
        api_key_encrypted: storage === 'browser' ? null : (apiKey ? encryptApiKey(apiKey) : null),
        api_key_storage: storage,
        adapter_type: adapterType,
        is_active: true
      });

      ctx.status = 200;
      ctx.body = {
        code: 201,
        message: '创建服务商成功',
        data: formatProvider(provider)
      };
    } catch (error) {
      if (error.status === 400) {
        ctx.status = 400;
        ctx.body = { code: 400, message: error.message, data: null };
        return;
      }
      logger.error('创建服务商失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: '创建服务商失败', data: null };
    }
  }

  static async getById(ctx) {
    try {
      const provider = await Provider.findByPk(ctx.params.id);
      if (!provider) {
        ctx.status = 404;
        ctx.body = { code: 404, message: '服务商不存在', data: null };
        return;
      }

      ctx.body = {
        code: 200,
        message: '获取服务商详情成功',
        data: formatProvider(provider)
      };
    } catch (error) {
      logger.error('获取服务商详情失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: '获取服务商详情失败', data: null };
    }
  }

  static async update(ctx) {
    const { name, slug, baseUrl, apiKey, adapterType, isActive } = ctx.request.body;
    const apiKeyStorage = parseApiKeyStorage(ctx.request.body.apiKeyStorage);

    try {
      const provider = await Provider.findByPk(ctx.params.id);
      if (!provider) {
        ctx.status = 404;
        ctx.body = { code: 404, message: '服务商不存在', data: null };
        return;
      }
      if (apiKeyStorage === null) {
        ctx.status = 400;
        ctx.body = { code: 400, message: 'apiKeyStorage 只能是 database 或 browser', data: null };
        return;
      }

      if (slug && slug !== provider.slug) {
        if (!isValidSlug(slug)) {
          ctx.status = 400;
          ctx.body = { code: 400, message: 'slug 格式无效', data: null };
          return;
        }
        const existing = await Provider.findOne({ where: { slug } });
        if (existing) {
          ctx.status = 400;
          ctx.body = { code: 400, message: 'slug 已存在', data: null };
          return;
        }
      }

      const currentStorage = storageOf(provider.api_key_storage);
      const nextStorage = apiKeyStorage || currentStorage;
      if (nextStorage === 'browser' && currentStorage !== 'browser') {
        await assertBrowserStorageAllowed();
      }
      const keyPatch = {};
      if (nextStorage === 'browser') {
        keyPatch.api_key_storage = 'browser';
        keyPatch.api_key_encrypted = null;
      } else if (apiKeyStorage === 'database' || apiKey !== undefined) {
        keyPatch.api_key_storage = 'database';
        if (apiKey !== undefined) {
          keyPatch.api_key_encrypted = apiKey ? encryptApiKey(apiKey) : null;
        }
      }

      await provider.update({
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
        ...(baseUrl !== undefined && { base_url: baseUrl }),
        ...(adapterType !== undefined && { adapter_type: adapterType }),
        ...(isActive !== undefined && { is_active: isActive }),
        ...keyPatch,
      });

      ctx.body = {
        code: 200,
        message: '更新服务商成功',
        data: formatProvider(provider)
      };
    } catch (error) {
      if (error.status === 400) {
        ctx.status = 400;
        ctx.body = { code: 400, message: error.message, data: null };
        return;
      }
      logger.error('更新服务商失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: '更新服务商失败', data: null };
    }
  }

  static async delete(ctx) {
    try {
      const provider = await Provider.findByPk(ctx.params.id);
      if (!provider) {
        ctx.status = 404;
        ctx.body = { code: 404, message: '服务商不存在', data: null };
        return;
      }

      await provider.update({ is_active: false });

      ctx.body = {
        code: 200,
        message: '删除服务商成功',
        data: formatProvider(provider)
      };
    } catch (error) {
      logger.error('删除服务商失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: '删除服务商失败', data: null };
    }
  }
}

module.exports = ProviderController;
