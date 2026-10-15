# P2 — Skill/Tool 加载 N+1 与缓存

> **已被吸收**：与 [`新Agent架构方案`](../TODOs/新Agent架构方案/README.md) MS2 并行；排期见 [09](../TODOs/新Agent架构方案/09-路线图与问题分级.md)。本文保留锚点。

## 背景

`loadChatSkillContext` 先 `getCapabilities` 拿到 skill meta 列表，再对每个 slug 单独
`GET /v1/ai/skills/:slug`（N 次请求）。这些数据**变化频率极低却完全无缓存**——每次
`useAIBaseChat` 挂载或 config 变更（路由切换、PageScope 更新）都重新拉取，造成：

- 首屏抖动：每次进入页面都要等 N 个 skill body 请求。
- 后端压力：相同 applicationId/scope 反复查询 + include（Skill↔Tool↔Scope join）。
- 浪费：P0-1 后 `capabilities` 接口已下发 `completionStrategy`，但 skill body
  （contentMarkdown + tools）仍要逐个取。

## 当前问题（锚点）

- `package/ai-base/src/registry/skillLoader.ts:74`
  ```ts
  const remoteSkills = skillMetas.length
    ? ((await Promise.all(skillMetas.map((item) => loadSkill(client, item.slug))))
        .filter(Boolean) as AIBaseSkill[])
    : [];
  ```
  → N 次 `GET /v1/ai/skills/:slug`，无缓存。
- `package/ai-base/src/chat/useAIBaseChat.ts` 的 skill 加载 effect
  依赖 `[client, config]`，config 一变就全量重拉。
- 后端 `backend/src/controllers/skillController.js` `getPublicBySlug` 每次 `findByPk` + include。

## 目标方案

1. **后端批量接口**：`GET /v1/ai/skills?slugs=a,b,c` 一次返回多个 skill body（含 tools）。
2. **后端 ETag / Last-Modified**：skill 资源加 `updated_at`，支持条件请求（304）。
3. **前端内存缓存**：按 `applicationId + scopeSlug` 维度缓存 `ChatSkillContext`，
   带过期时间 + 手动失效；config 变更时优先复用缓存。

## 改动清单（按文件）

### 后端

- **新建 `backend/src/controllers/skillController.js` → `getPublicBySlugs`**（list 批量）
  - 入参 `ctx.query.slugs`（逗号分隔）。
  - `Skill.findAll({ where: { slug: [...], is_active: true }, include: skillInclude })`。
  - 复用 `formatSkill` + `formatOpenAITool`，返回 `{ data: skills[] }`。
- **`backend/src/routes/aiRoutes.js`**：注册 `router.get('/skills', auth, SkillController.getPublicBySlugs)`
  （注意放在 `/skills/:slug` 之前，避免路由冲突）。
- **`backend/src/controllers/skillController.js` `getPublicBySlug`**：响应头加
  `ETag: W/"<updatedAt>-<slug>"`；处理 `If-None-Match` 返回 304。
- **（可选）迁移**：给 `aibase.skills` 索引 `(is_active, slug)` 加速批量查询。

### 前端 SDK

- **`package/ai-base/src/sdk/client.ts`**：
  ```ts
  async loadSkills(slugs: string[]): Promise<AIBaseSkill[]> {
    if (!slugs.length) return [];
    const res = await this.request<{ data: AIBaseSkill[] }>(
      `/v1/ai/skills?slugs=${encodeURIComponent(slugs.join(','))}`,
    );
    return res.data || [];
  }
  ```
- **`package/ai-base/src/registry/skillLoader.ts`**：
  - `loadSkillsBySlugs` 改用 `client.loadSkills(slugs)`（单请求替代 N 个）。
  - `loadChatSkillContext` 中 `skillMetas.map(loadSkill)` 也用批量接口：
    从 `caps.skills` 取 slug 列表 → 一次 `client.loadSkills([...])`。
  - 加缓存层（见下）。
- **新建 `package/ai-base/src/registry/skillCache.ts`**：
  ```ts
  interface CacheEntry { ctx: ChatSkillContext; expireAt: number; }
  const cache = new Map<string, CacheEntry>();
  const DEFAULT_TTL = 5 * 60 * 1000; // 5 分钟
  export function getCachedSkillContext(key: string): ChatSkillContext | undefined;
  export function setCachedSkillContext(key: string, ctx: ChatSkillContext, ttl?): void;
  export function invalidateSkillCache(key?: string): void; // key 为空清空全部
  ```
  `loadChatSkillContext` 先查缓存（key = `${apiBase}::${applicationId}::${scopeSlug}::${fallback.join(',')}`），
  命中且未过期直接返回；未命中则拉取后写入。
- **`useAIBaseChat.ts`**：加载 effect 仍依赖 `[client, config]`，但内部走缓存；
  也可暴露 `refreshSkills()`（调 `invalidateSkillCache` + 重拉）供「Skill 已更新」场景手动刷新。

### 导出

- `index.ts` 导出 `invalidateSkillCache`（供管理后台在编辑 Skill 后主动失效）。

## 验证方式

- 后端：`curl '/api/v1/ai/skills?slugs=a,b,c' -H 'Authorization: Bearer ...'` 返回数组；
  第二次带 `If-None-Match` 返回 304。
- 前端：进入页面一次后，路由切换再回来，Network 中**不应**再出现 `/v1/ai/skills/:slug`。
- 缓存失效：调 `invalidateSkillCache()` 后下次加载重新请求。

## 风险 / 回退

- 批量接口 `slugs` 过长可能撞 URL 长度限制 → 限制单次最多 50 个，或改 POST body。
- 缓存 TTL 期间 Skill 被后台编辑 → 提供 `invalidateSkillCache` 手动失效；管理后台编辑后调一次。
- ETag 计算用 `updated_at`：批量接口的 ETag 需取各 skill `updated_at` 最大值的聚合。
