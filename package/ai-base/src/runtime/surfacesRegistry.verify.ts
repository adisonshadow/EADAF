/**
 * ctx.surfaces presentation / presentCall / presentResult 回归
 * node --import tsx src/runtime/surfacesRegistry.verify.ts
 */
import assert from 'node:assert/strict';
import {
  clearSurfacesOverrides,
  getInvocationPresentation,
  presentToolCall,
  presentToolResult,
  registerInvocationPresentation,
} from './surfacesRegistry';
import { createAgentContext } from './createAgentContext';
import { clearFunctionCalls, getFunctionCallDef } from '../registry/functionRegistry';
import { registerToolDisplayNames } from '../utils/toolDisplayNameFallbacks';

clearSurfacesOverrides();

{
  const skill = getInvocationPresentation('skill');
  assert.equal(skill.title, '加载 Skill');
  assert.equal(skill.category, 'technical');
  assert.equal(skill.collapseAfter, true);
  assert.equal(skill.collapsedPreviewLines, 0);
  assert.equal(skill.contentMode, 'name_output');
}

{
  const http = getInvocationPresentation('http_request');
  assert.equal(http.contentMode, 'request_response');
  assert.equal(http.collapseDuring, true);
  assert.equal(http.collapseAfter, true);
}

{
  const code = getInvocationPresentation('run_code');
  assert.equal(code.contentMode, 'in_out');
  assert.equal(code.icon, 'code');
}

{
  const call = presentToolCall('skill', {
    slug: 'bizdata-model-design',
    name: '业务数据模型设计',
  });
  assert.equal(call.title, '加载 Skill');
  assert.equal(call.subtitle, '业务数据模型设计');
}

{
  const call = presentToolCall('http_request', {
    method: 'GET',
    path: '/api/v1/business-data/entities/summaries',
  });
  assert.equal(call.title, 'HTTP 请求');
  assert.ok(call.subtitle?.includes('GET'));
  assert.ok(call.subtitle?.includes('/api/v1/business-data/entities/summaries'));
}

{
  const result = presentToolResult(
    'http_request',
    { method: 'GET', path: '/x' },
    {
      ok: true,
      kind: 'success',
      data: {
        status: 404,
        ok: false,
        method: 'GET',
        path: '/x',
        url: 'http://localhost/x',
        headers: {},
        body: 'Not Found',
      },
      meta: { tool: 'http_request' },
    },
  );
  assert.equal(result.title, 'HTTP 请求');
  assert.ok(result.subtitle?.includes('404'));
  assert.equal(result.display?.collapsed, true);
  assert.equal(result.presentation.collapsedPreviewLines, 0);
  // 不再把标题塞进 display（避免与标题栏重复）
  assert.equal(result.display?.title, undefined);
}

{
  const plan = presentToolResult(
    'update_plan',
    { mode: 'create', plan: [{ id: 't1' }, { id: 't2' }, { id: 't3' }] },
    {
      ok: true,
      kind: 'success',
      data: {
        mode: 'create',
        plan: [
          { id: 't1', content: 'a', status: 'pending' },
          { id: 't2', content: 'b', status: 'pending' },
          { id: 't3', content: 'c', status: 'pending' },
        ],
      },
      meta: { tool: 'update_plan' },
    },
  );
  assert.equal(plan.title, '生成任务清单');
  assert.equal(plan.subtitle, '3项');
  assert.equal(plan.display?.kind, 'planning');
  assert.equal(plan.presentation.collapseAfter, false);
}

{
  const dispose = registerInvocationPresentation('bizdata_list_entity_summaries', {
    title: '列出实体摘要',
    category: 'business',
    icon: 'table',
    contentMode: 'name_output',
    collapseAfter: false,
  });
  const p = getInvocationPresentation('bizdata_list_entity_summaries');
  assert.equal(p.category, 'business');
  assert.equal(p.collapseAfter, false);
  assert.equal(p.icon, 'table');
  dispose();
}

{
  // 未单独注册时：需宿主注入展示名；此处模拟 EADAF 注入
  const disposeNames = registerToolDisplayNames({
    bizdata_get_scope_description: '读取 Scope 业务说明',
    bizdata_list_entity_summaries: '列出实体摘要',
  });
  const scope = getInvocationPresentation('bizdata_get_scope_description');
  assert.equal(scope.title, '读取 Scope 业务说明');
  assert.equal(scope.collapseAfter, true);
  assert.equal(scope.collapseDuring, true);
  const call = presentToolCall('bizdata_get_scope_description', { scopeCode: 'web' });
  assert.equal(call.title, '读取 Scope 业务说明');
  assert.equal(call.subtitle, 'web');
  const list = getInvocationPresentation('bizdata_list_entity_summaries');
  assert.equal(list.title, '列出实体摘要');
  assert.equal(list.collapseAfter, true);
  disposeNames();
}

{
  clearFunctionCalls();
  const handle = createAgentContext({
    plugins: [
      {
        name: 'surfaces-test',
        inject: ['tools', 'surfaces'],
        apply(ctx) {
          ctx.tools.register({
            name: 'demo_surface_tool',
            description: 'demo',
            parameters: { type: 'object', properties: {} },
            presentation: {
              title: '演示工具',
              category: 'business',
              icon: 'write',
            },
            handler: async () => ({ ok: true }),
          });
          ctx.surfaces.registerPresentation('demo_override', {
            title: '覆盖项',
            category: 'technical',
          });
        },
      },
    ],
  });

  // Cordis fiber 可能异步就绪
  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    if (getFunctionCallDef('demo_surface_tool')) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(ready, true);
  assert.equal(getInvocationPresentation('demo_surface_tool').title, '演示工具');
  assert.equal(getInvocationPresentation('demo_override').title, '覆盖项');
  assert.ok(handle.ctx.surfaces);
  assert.equal(typeof handle.ctx.surfaces.presentCall, 'function');

  handle.dispose();
  clearSurfacesOverrides();
  clearFunctionCalls();
}

{
  // 启发式：list 类默认 business + table icon + 默认折叠
  const list = getInvocationPresentation('acme_list_orders');
  assert.equal(list.category, 'business');
  assert.equal(list.icon, 'table');
  assert.equal(list.collapseAfter, true);
}

console.log('surfacesRegistry.verify.ts: all assertions passed');
