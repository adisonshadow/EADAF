/**
 * 语义化路由清单 + 解析/白名单回归验证（node --import tsx src/ai/semanticRoutes.verify.ts）
 *
 * 覆盖（docs/TODOs/AIBase-语义化路由与AI决策跳转方案-v2.md 7.1）：
 * - path 全局唯一、以 / 开头；
 * - :param 与 params 声明一致；
 * - toAIChatSemanticRoutes 过滤 redirect、不泄漏实现细节、hiddenFromAI → hidden；
 * - resolveSemanticRoutePath：无参/参数化、缺参、多余参数、注入防护、类型校验；
 * - isAllowedNavigationTarget 白名单。
 */
import assert from 'node:assert/strict';
import {
  EADAF_SEMANTIC_ROUTES,
  toAIChatSemanticRoutes,
  isSemanticRedirect,
  type AppSemanticEntry,
  type AppSemanticRoute,
} from '../routes/semanticRegistry';
import { resolveSemanticRoutePath, isAllowedNavigationTarget } from './semanticRoutes';
import { appRouteMeta, buildMenuData } from '../routes/config';
import { PAGE_ELEMENTS } from '../routes/routeElements';
import type { SemanticRoute } from '@eadaf/ai-base';

/* ----------------------------- 清单约束 ----------------------------- */

const seen = new Map<string, AppSemanticEntry>();
for (const entry of EADAF_SEMANTIC_ROUTES) {
  assert.ok(entry.path.startsWith('/'), `${entry.path} 应以 / 开头`);
  assert.ok(!seen.has(entry.path), `path 重复: ${entry.path}`);
  seen.set(entry.path, entry);
}

// :param 与 params 声明一致（双向）
for (const entry of EADAF_SEMANTIC_ROUTES) {
  if (isSemanticRedirect(entry)) continue;
  const placeholders = (entry.path.match(/:[a-zA-Z0-9_]+/g) ?? []).map((p) => p.slice(1));
  const declared = entry.params ? Object.keys(entry.params) : [];
  for (const name of placeholders) {
    assert.ok(declared.includes(name), `${entry.path} 占位符 :${name} 未在 params 声明`);
  }
  for (const name of declared) {
    assert.ok(placeholders.includes(name), `${entry.path} 声明了 ${name} 但模板无占位符`);
  }
}

/* ------------------------ toAIChatSemanticRoutes ------------------------ */

const semanticRoutes = toAIChatSemanticRoutes();
assert.ok(semanticRoutes.length > 0, 'AI 清单不应为空');
assert.ok(
  semanticRoutes.every((r) => r.path && r.title && r.description && r.domain),
  '每条 AI 条目须有 path/title/description/domain',
);
assert.ok(
  semanticRoutes.every((r) => !('pageKey' in r) && !('scopeGroup' in r) && !('mode' in r)),
  'AI 条目不应泄漏 pageKey/scopeGroup/mode 实现细节',
);
const redirectPaths = EADAF_SEMANTIC_ROUTES.filter(isSemanticRedirect).map((r) => r.path);
for (const p of redirectPaths) {
  assert.ok(
    !semanticRoutes.some((r) => r.path === p),
    `redirect ${p} 不应出现在 AI 清单`,
  );
}

/* ------------------------- resolveSemanticRoutePath ------------------------- */

// 无参路由
assert.equal(
  resolveSemanticRoutePath('/member_org/member', undefined, semanticRoutes),
  '/member_org/member',
);
assert.equal(
  resolveSemanticRoutePath('/member_org/member', {}, semanticRoutes),
  null,
  '无参路由传空对象应拒绝',
);
assert.equal(
  resolveSemanticRoutePath('/member_org/member', { a: '1' }, semanticRoutes),
  null,
  '无参路由传参数应拒绝',
);

// 参数化路由
assert.equal(
  resolveSemanticRoutePath('/member_org/member/:id/edit', { id: 'u-42' }, semanticRoutes),
  '/member_org/member/u-42/edit',
);
assert.equal(
  resolveSemanticRoutePath('/member_org/member/:id/edit', { id: '你好' }, semanticRoutes),
  '/member_org/member/%E4%BD%A0%E5%A5%BD/edit',
  '非 ASCII 应 encodeURIComponent',
);
assert.equal(
  resolveSemanticRoutePath('/member_org/member/:id/edit', { id: 'a b' }, semanticRoutes),
  '/member_org/member/a%20b/edit',
  '空格应编码',
);
assert.equal(
  resolveSemanticRoutePath('/member_org/member/:id/edit', {}, semanticRoutes),
  null,
  '缺参空对象应拒绝',
);
assert.equal(
  resolveSemanticRoutePath('/member_org/member/:id/edit', undefined, semanticRoutes),
  null,
  '缺参 undefined 应拒绝',
);
assert.equal(
  resolveSemanticRoutePath('/member_org/member/:id/edit', { id: '1', x: '2' }, semanticRoutes),
  null,
  '多余参数应拒绝',
);

// 未知 / 已解析 URL 不是模板
assert.equal(resolveSemanticRoutePath('/nope', undefined, semanticRoutes), null);
assert.equal(
  resolveSemanticRoutePath('/member_org/member/1/edit', undefined, semanticRoutes),
  null,
  '已解析 URL 不是模板',
);

// 注入防护
assert.equal(
  resolveSemanticRoutePath('/member_org/member/:id/edit', { id: '../x' }, semanticRoutes),
  null,
  '路径穿越 .. 应拒绝',
);
assert.equal(
  resolveSemanticRoutePath('/member_org/member/:id/edit', { id: 'a//b' }, semanticRoutes),
  null,
  '// 应拒绝',
);
assert.equal(
  resolveSemanticRoutePath('/member_org/member/:id/edit', { id: 'http://evil.com' }, semanticRoutes),
  null,
  'http(s): 应拒绝',
);
assert.equal(
  resolveSemanticRoutePath('/member_org/member/:id/edit', { id: 'javascript:alert(1)' }, semanticRoutes),
  null,
  'javascript: 应拒绝',
);

// number 参数类型（构造自定义 routes 验证）
const numRoutes: SemanticRoute[] = [
  {
    path: '/x/:n/view',
    title: 'X',
    description: 'x',
    domain: 'x',
    params: { n: { type: 'number', description: '数字参数' } },
  },
];
assert.equal(resolveSemanticRoutePath('/x/:n/view', { n: 7 }, numRoutes), '/x/7/view');
assert.equal(resolveSemanticRoutePath('/x/:n/view', { n: '7' }, numRoutes), '/x/7/view');
assert.equal(resolveSemanticRoutePath('/x/:n/view', { n: 'abc' }, numRoutes), null);
assert.equal(resolveSemanticRoutePath('/x/:n/view', { n: 1.5 }, numRoutes), '/x/1.5/view');

/* -------------------------- isAllowedNavigationTarget -------------------------- */

assert.ok(isAllowedNavigationTarget('/member_org/member', semanticRoutes));
assert.ok(isAllowedNavigationTarget('/member_org/member/u-42/edit', semanticRoutes));
assert.ok(isAllowedNavigationTarget('/business_data/database/tables/tbl-1/schema', semanticRoutes));
assert.ok(isAllowedNavigationTarget('/ai_management/providers', semanticRoutes));
assert.ok(!isAllowedNavigationTarget('/xxx', semanticRoutes));
assert.ok(!isAllowedNavigationTarget('http://evil.com', semanticRoutes));
assert.ok(!isAllowedNavigationTarget('/member_org/member/../etc/edit', semanticRoutes));
assert.ok(!isAllowedNavigationTarget('/api_services/list/extra', semanticRoutes));

console.log('semanticRoutes 清单约束 + 解析 + 白名单 回归验证全部通过');

/* ------------------- buildAppRouteMeta 派生（菜单冒烟） ------------------- */

const metaByPath = new Map(appRouteMeta.map((m) => [m.path, m]));

// 关键 path 必须存在（对照现 index.tsx / config.ts 全量）
const CRITICAL_PATHS = [
  '/member_org', '/member_org/member', '/member_org/member/:id/edit', '/member_org/organization',
  '/permissions', '/permissions/menu', '/permissions/button', '/permissions/api',
  '/service_provider', '/service_provider/:id/top-level-skill',
  '/file_storage', '/file_storage/buckets', '/file_storage/browser',
  '/business_data', '/business_data/model-design', '/business_data/model-design/relations-graph',
  '/business_data/materialization/execute', '/business_data/database-connections', '/business_data/database',
  '/business_data/database/tables/:entityId/schema', '/business_data/database/tables/:entityId/data',
  '/business_data/metrics', '/business_data/metrics/create', '/business_data/metrics/:id/edit',
  '/business_data/metrics/dashboard', '/business_data/data-standards', '/business_data/metadata',
  '/api_services', '/api_services/create', '/api_services/list', '/api_services/:id/edit',
  '/api_services/:id/test', '/api_services/exception-responses', '/api_services/outbound-webhooks',
  '/api_services/collection-pipelines', '/api_services/collection-pipelines/create',
  '/api_services/collection-pipelines/:id/edit', '/api_services/collection-pipelines/:id/test',
  '/app_deployment', '/app_deployment/app-data', '/app_deployment/platform-data',
  '/app_deployment/publish-platform', '/app_deployment/publish-app',
  '/ai_management', '/ai_management/providers', '/ai_management/models', '/ai_management/scopes',
  '/ai_management/tools', '/ai_management/skills', '/ai_management/chat-demo',
  '/ai_management/request-logs', '/system', '/system/operation-logs', '/system/settings', '/account/center', '/account/sessions',
];
for (const p of CRITICAL_PATHS) {
  assert.ok(metaByPath.has(p), `appRouteMeta 缺少关键 path: ${p}`);
}

// 关键 UI 属性与现网一致
assert.equal(metaByPath.get('/member_org')?.icon, 'TeamOutlined');
assert.equal(metaByPath.get('/permissions')?.icon, 'AuditOutlined');
assert.equal(metaByPath.get('/business_data')?.icon, 'DatabaseOutlined');
assert.equal(metaByPath.get('/app_deployment')?.name, '应用部署');
assert.equal(metaByPath.get('/app_deployment')?.icon, 'DeploymentUnitOutlined');
assert.equal(metaByPath.get('/business_data/model-design')?.name, '数据模型');
assert.equal(metaByPath.get('/business_data/model-design')?.noContentPadding, true);
assert.equal(metaByPath.get('/business_data/model-design/relations-graph')?.hideInMenu, true);
assert.equal(metaByPath.get('/business_data/data-standards')?.requiresFeature, 'metadataEnabled');
assert.equal(metaByPath.get('/business_data/metadata')?.requiresFeature, 'metadataEnabled');
assert.equal(metaByPath.get('/business_data/metadata')?.noContentPadding, true);
assert.equal(metaByPath.get('/api_services/list')?.noContentPadding, true);
assert.equal(metaByPath.get('/api_services/:id/edit')?.hideInMenu, true);
assert.equal(metaByPath.get('/api_services/:id/edit')?.noContentPadding, true);
assert.equal(metaByPath.get('/ai_management/scopes')?.hideInMenu, true);
assert.equal(metaByPath.get('/system')?.name, '系统');
assert.equal(metaByPath.get('/system')?.icon, 'SettingOutlined');
assert.equal(metaByPath.get('/system')?.hideInMenu, true);
assert.equal(metaByPath.get('/system/operation-logs')?.name, '操作日志');
assert.equal(metaByPath.get('/system/operation-logs')?.hideInMenu, true);
assert.equal(metaByPath.get('/system/settings')?.hideInMenu, true);
assert.equal(metaByPath.get('/account/center')?.hideInMenu, true);
assert.equal(metaByPath.get('/account/center')?.layout, undefined);
assert.equal(metaByPath.get('/account/sessions')?.name, '我的账户登录信息');
assert.equal(metaByPath.get('/account/sessions')?.hideInMenu, true);

// 菜单根顺序（系统分组不进主导航，仅头像下拉）
const menu = buildMenuData();
const rootPaths = menu.map((m) => m.path);
assert.deepEqual(rootPaths, [
  '/member_org',
  '/permissions',
  '/service_provider',
  '/file_storage',
  '/business_data',
  '/api_services',
  '/app_deployment',
  '/ai_management',
]);

// 应用部署子菜单：4 项，顺序与需求一致（发布平台 / 发布应用 仅 DEV 模式可用，菜单仍展示）
const appDeploymentRoot = menu.find((m) => m.path === '/app_deployment');
assert.deepEqual(
  (appDeploymentRoot?.children ?? []).map((c) => c.path),
  [
    '/app_deployment/app-data',
    '/app_deployment/platform-data',
    '/app_deployment/publish-platform',
    '/app_deployment/publish-app',
  ],
);
assert.deepEqual(
  (appDeploymentRoot?.children ?? []).map((c) => c.name),
  ['应用数据导出/导入', 'EADAF数据导出/导入', '发布平台', '发布应用'],
);

// 抽样：member_org 子菜单
const memberRoot = menu.find((m) => m.path === '/member_org');
assert.deepEqual(
  (memberRoot?.children ?? []).map((c) => c.path),
  ['/member_org/member', '/member_org/organization', '/member_org/role'],
);

// 抽样：business_data 子菜单（execute 三级路径应上提为二级；metadata 功能关闭时隐藏相关项）
const bizRoot = menu.find((m) => m.path === '/business_data');
assert.deepEqual(
  (bizRoot?.children ?? []).map((c) => c.path),
  [
    '/business_data/model-design',
    '/business_data/materialization/execute',
    '/business_data/metrics',
    '/business_data/database-connections',
    '/business_data/database',
  ],
);

// metadataEnabled 开启时，数据标准/元数据进入 business_data 子菜单（且顺序与现网一致）
const bizWithMeta = buildMenuData({ metadataEnabled: true } as Parameters<typeof buildMenuData>[0]);
const bizWithMetaRoot = bizWithMeta.find((m) => m.path === '/business_data');
assert.deepEqual(
  (bizWithMetaRoot?.children ?? []).map((c) => c.path),
  [
    '/business_data/model-design',
    '/business_data/materialization/execute',
    '/business_data/metrics',
    '/business_data/database-connections',
    '/business_data/database',
    '/business_data/data-standards',
    '/business_data/metadata',
  ],
);

console.log('buildAppRouteMeta 菜单派生冒烟通过');

/* ---------------- 业务路由派生（P4c） ---------------- */

// pageKey → PAGE_ELEMENTS 映射完整性（工厂页必须有 mode）。
// 注：buildBusinessRoutes 的路由树在 tsc build + 运行时冒烟验证。
for (const entry of EADAF_SEMANTIC_ROUTES) {
  if (isSemanticRedirect(entry)) continue;
  const factory = PAGE_ELEMENTS[entry.pageKey];
  assert.ok(factory, `pageKey 缺少 PAGE_ELEMENTS 映射: ${entry.pageKey} (${entry.path})`);
  if (typeof factory === 'function') {
    assert.ok(entry.mode, `${entry.path} 需要 mode（pageKey: ${entry.pageKey}）`);
  }
}
// 语义清单条目与 PAGE_ELEMENTS 键无悬空（多余映射无害但提示清理）
const usedPageKeys = new Set(
  EADAF_SEMANTIC_ROUTES.filter((e): e is AppSemanticRoute => !isSemanticRedirect(e)).map(
    (e) => e.pageKey,
  ),
);
const extraPageKeys = Object.keys(PAGE_ELEMENTS).filter((k) => !usedPageKeys.has(k));
assert.deepEqual(extraPageKeys, [], `PAGE_ELEMENTS 存在未使用映射: ${extraPageKeys.join(', ')}`);

console.log('业务路由派生（pageKey ↔ element 映射）冒烟通过');
