import type { ChatSkillContext } from './skillLoader';

/**
 * ChatSkillContext 内存缓存，解决 skill 加载 N+1 + 每次进页面/切路由全量重拉的问题。
 *
 * 维度：apiBase + applicationId + scopeSlug + fallbackSkillSlugs，命中且未过期直接返回。
 * TTL 默认 5 分钟；管理后台编辑 Skill 后可调 invalidateSkillCache() 主动失效。
 */

interface CacheEntry {
  ctx: ChatSkillContext;
  expireAt: number;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 分钟

export function buildSkillCacheKey(parts: {
  apiBase: string;
  applicationId?: string;
  scopeSlug?: string;
  fallbackSlugs: string[];
}): string {
  return [
    parts.apiBase,
    parts.applicationId || '_',
    parts.scopeSlug || '_',
    [...parts.fallbackSlugs].sort().join(','),
  ].join('::');
}

export function getCachedSkillContext(key: string): ChatSkillContext | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expireAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.ctx;
}

export function setCachedSkillContext(key: string, ctx: ChatSkillContext, ttl = DEFAULT_TTL): void {
  cache.set(key, { ctx, expireAt: Date.now() + ttl });
}

/**
 * 失效缓存。传入 key 失效单条；不传 key 清空全部（供管理后台批量编辑后调用）。
 */
export function invalidateSkillCache(key?: string): void {
  if (key) {
    cache.delete(key);
    return;
  }
  cache.clear();
}
