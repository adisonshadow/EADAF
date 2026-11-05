/**
 * 「只存储 API Key 在浏览器」：密钥留在本机 localStorage，不进数据库。
 * 对话请求按模型 slug 找到服务商，只在该服务商是浏览器模式时附带请求头。
 */

const STORAGE_KEY = 'eadaf.browserProviderApiKeys';
export const BROWSER_PROVIDER_API_KEY_HEADER = 'X-Eadaf-Provider-Api-Key';

type ModelApiKeyRoute = {
  slug?: string;
  providerId?: string;
  apiKeyStorage?: string;
};

const routes = new Map<string, { providerId: string; apiKeyStorage: string }>();

function readMap(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function readBrowserProviderApiKey(providerId?: string | null): string {
  if (!providerId) return '';
  return readMap()[providerId] || '';
}

export function writeBrowserProviderApiKey(providerId: string, apiKey: string) {
  const next = readMap();
  const trimmed = apiKey.trim();
  if (!trimmed) delete next[providerId];
  else next[providerId] = trimmed;
  writeMap(next);
}

export function clearBrowserProviderApiKey(providerId?: string | null) {
  if (!providerId) return;
  const next = readMap();
  if (!next[providerId]) return;
  delete next[providerId];
  writeMap(next);
}

/** 模型列表加载后记下 slug → 服务商，供随后的对话请求附带浏览器密钥 */
export function rememberModelApiKeyRoutes(models: ModelApiKeyRoute[] | null | undefined) {
  if (!Array.isArray(models)) return;
  for (const model of models) {
    if (!model?.slug || !model.providerId) continue;
    routes.set(model.slug, {
      providerId: model.providerId,
      apiKeyStorage: model.apiKeyStorage === 'browser' ? 'browser' : 'database',
    });
  }
}

export function browserProviderApiKeyHeader(slug?: string | null): Record<string, string> {
  if (!slug) return {};
  const route = routes.get(slug);
  if (!route || route.apiKeyStorage !== 'browser') return {};
  const apiKey = readBrowserProviderApiKey(route.providerId);
  if (!apiKey) return {};
  return { [BROWSER_PROVIDER_API_KEY_HEADER]: apiKey };
}

export function slugFromChatBody(body: unknown): string | undefined {
  if (typeof body !== 'string' || !body) return undefined;
  try {
    const parsed = JSON.parse(body) as { slug?: unknown };
    return typeof parsed.slug === 'string' ? parsed.slug : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 把本机密钥写进对话请求体的 providerApiKey。
 * 不用自定义请求头，避免被 CORS 白名单拦住；服务端转发上游前会删掉这个字段。
 */
export function withBrowserProviderApiKeyBody(body: string | undefined): string | undefined {
  if (!body) return body;
  let parsed: { slug?: string; providerApiKey?: string };
  try {
    parsed = JSON.parse(body) as { slug?: string };
  } catch {
    return body;
  }
  const key = browserProviderApiKeyHeader(parsed.slug)[BROWSER_PROVIDER_API_KEY_HEADER];
  if (!key) return body;
  parsed.providerApiKey = key;
  return JSON.stringify(parsed);
}
