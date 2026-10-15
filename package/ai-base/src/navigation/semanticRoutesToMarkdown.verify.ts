/**
 * semanticRoutesToMarkdown 回归验证（node --import tsx src/navigation/semanticRoutesToMarkdown.verify.ts）
 *
 * 覆盖：按 domain 分组、hidden 过滤、空数组、params 标注。
 */
import assert from 'node:assert/strict';
import { semanticRoutesToMarkdown } from './semanticRoutesToMarkdown';
import type { SemanticRoute } from '../types';

const routes: SemanticRoute[] = [
  {
    path: '/member_org/member/:id/edit',
    title: '编辑成员',
    description: '编辑已有成员',
    domain: 'member_org',
    params: { id: { type: 'string', description: '成员 id' } },
  },
  {
    path: '/member_org/member',
    title: '成员管理',
    description: '成员列表',
    domain: 'member_org',
  },
  {
    path: '/ai_management/providers',
    title: 'AI 服务商',
    description: '查看与管理 AI 服务商',
    domain: 'ai_management',
  },
  {
    path: '/secret-page',
    title: '隐藏页',
    description: '不进 prompt',
    domain: 'member_org',
    hidden: true,
  },
];

const md = semanticRoutesToMarkdown(routes);
assert.ok(md.includes('[member_org]'), '应按 domain 分组');
assert.ok(md.includes('[ai_management]'), '应包含多 domain');
assert.ok(md.includes('编辑成员 /member_org/member/:id/edit'), '应输出标题 + path');
assert.ok(md.includes('(params: id)'), '有 params 时应标注');
assert.ok(!md.includes('secret-page'), 'hidden 条目不应输出');
assert.ok(!md.includes('隐藏页'), 'hidden 条目不应输出');

// 空数组 → 空字符串
assert.equal(semanticRoutesToMarkdown([]), '');
assert.equal(semanticRoutesToMarkdown(undefined as unknown as SemanticRoute[]), '');

// 全部 hidden → 空字符串
assert.equal(
  semanticRoutesToMarkdown([
    { path: '/a', title: 'A', description: 'a', domain: 'x', hidden: true },
  ]),
  '',
);

{
  const truncated = semanticRoutesToMarkdown(routes, {
    preferDomains: ['member_org'],
  });
  assert.ok(truncated.includes('编辑成员 /member_org/member/:id/edit'), '优先域应全量');
  assert.ok(truncated.includes('### 其他域（摘要'), '非优先域应摘要');
  assert.ok(truncated.includes('[ai_management] 1 个页面'), '非优先域只列计数');
  assert.equal(truncated.includes('/ai_management/providers'), false, '非优先域不展开 path');
}

console.log('semanticRoutesToMarkdown 回归验证全部通过');
