/**
 * 实测1 展示 / Planning / run_code 回归
 * node --import tsx src/chat/shiCe1Fixes.verify.ts
 */
import assert from 'node:assert/strict';
import { enrichToolDisplayName, resolveToolDisplayName } from '../utils/toolDisplayName';
import { inferToolDisplay } from '../utils/inferToolDisplay';
import {
  collapseTransientToolSurfaces,
  removeSegment,
  upsertSegment,
  type AssistantSegment,
} from './chatToolSteps';
import { runJavaScriptCode } from '../runtime/runJavaScript';
import { registerFunctionCall, unregisterFunctionCall } from '../registry/functionRegistry';
import {
  getInvocationPresentation,
  presentToolCall,
  presentToolResult,
} from '../runtime/surfacesRegistry';

{
  assert.equal(resolveToolDisplayName('update_plan', []), '生成任务清单');
  assert.equal(resolveToolDisplayName('skill', []), '加载 Skill');
  assert.equal(
    enrichToolDisplayName('update_plan', '生成任务清单', {
      plan: [{ id: 't1' }, { id: 't2' }],
    }),
    '生成任务清单 · 2项',
  );
  assert.equal(
    enrichToolDisplayName('update_plan', '更新任务清单', {
      mode: 'update',
      plan: [
        { id: 't1', status: 'completed' },
        { id: 't2', status: 'completed' },
        { id: 't3', status: 'in_progress' },
        { id: 't4', status: 'pending' },
        { id: 't5', status: 'pending' },
        { id: 't6', status: 'pending' },
      ],
    }),
    '更新任务清单 · (2/6)',
  );
  assert.equal(
    enrichToolDisplayName('skill', '加载 Skill', { slug: 'bizdata-model-design' }),
    '加载 Skill · bizdata-model-design',
  );
  assert.equal(
    enrichToolDisplayName('skill', '加载 Skill', {
      slug: 'bizdata-model-design',
      name: '业务数据模型设计',
    }),
    '加载 Skill · 业务数据模型设计',
  );
  assert.equal(
    enrichToolDisplayName('http_request', '公共 HTTP 请求', {
      method: 'GET',
      path: '/api/v1/bizdata/entities',
      status: 200,
    }),
    'HTTP GET /api/v1/bizdata/entities · 200',
  );
}

{
  const call = presentToolCall('skill', {
    slug: 'bizdata-model-design',
    name: '业务数据模型设计',
  });
  assert.equal(call.title, '加载 Skill');
  assert.equal(call.subtitle, '业务数据模型设计');
  assert.equal(call.presentation.collapseAfter, true);
  assert.equal(call.presentation.collapsedPreviewLines, 0);
}

{
  const display = inferToolDisplay({
    ok: true,
    kind: 'success',
    data: {
      mode: 'update',
      plan: [
        { id: 't1', content: 'a', status: 'completed' },
        { id: 't2', content: 'b', status: 'in_progress' },
      ],
    },
    meta: { tool: 'update_plan' },
  });
  assert.equal(display?.kind, 'planning');
  assert.equal(display?.collapsed, true);
  // 标题在 chrome，不在 display
  assert.equal(display?.title, undefined);
}

{
  const httpDisplay = inferToolDisplay({
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
  });
  assert.equal(httpDisplay?.collapsed, true);
  assert.equal(httpDisplay?.visibility, 'transient');
  assert.equal(httpDisplay?.title, undefined);
  assert.equal(httpDisplay?.previewLines, undefined);
  const payload = httpDisplay?.payload as { method?: string; path?: string; body?: string };
  assert.equal(payload?.method, 'GET');
  assert.equal(payload?.path, '/x');
  assert.equal(payload?.body, 'Not Found');

  const presented = presentToolResult(
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
      display: httpDisplay,
      meta: { tool: 'http_request' },
    },
  );
  assert.equal(presented.title, 'HTTP 请求');
  assert.ok(presented.subtitle?.includes('404'));
  assert.equal(presented.presentation.contentMode, 'request_response');
  assert.equal(presented.presentation.collapsedPreviewLines, 0);
}

{
  const httpPres = getInvocationPresentation('http_request');
  assert.equal(httpPres.collapseAfter, true);
  assert.equal(httpPres.collapsedPreviewLines, 0);
}

{
  let segs: AssistantSegment[] = [];
  segs = upsertSegment(segs, {
    kind: 'planning',
    id: 'planning-next-moves-latest',
    title: 'Planning next moves',
    items: [{ id: 't1', label: 'x', status: 'in_progress' }],
  });
  segs = upsertSegment(segs, {
    kind: 'tool',
    id: 's1',
    step: {
      id: 's1',
      functionName: 'http_request',
      displayName: 'HTTP 请求 · GET /x',
      title: 'HTTP 请求',
      subtitle: 'GET /x',
      presentation: getInvocationPresentation('http_request'),
      status: 'success',
      display: {
        kind: 'json',
        payload: { a: 1 },
        visibility: 'transient',
        collapsed: false,
      },
    },
  });
  segs = collapseTransientToolSurfaces(segs);
  const tool = segs.find((s) => s.kind === 'tool' && s.id === 's1');
  assert.ok(tool && tool.kind === 'tool');
  if (tool.kind !== 'tool') throw new Error('expected tool segment');
  assert.equal(tool.step.display?.collapsed, true);
  // technical http：按 presentation 留 0 行（全收）
  assert.equal(tool.step.display?.previewLines, 0);
  segs = removeSegment(segs, 'planning-next-moves-latest');
  assert.equal(segs.some((s) => s.kind === 'planning'), false);
}

registerFunctionCall({
  name: 'shi_ce_echo',
  description: 'echo',
  parameters: { type: 'object', properties: {} },
  handler: async () => ({ ok: true }),
});

{
  const { value } = await runJavaScriptCode(
    'return { keys: Object.keys(tools).filter(k => k !== "list"), listed: tools.list().includes("shi_ce_echo") };',
    async () => ({}),
    { toolNames: ['shi_ce_echo', 'bizdata_list_entity_summaries'] },
  );
  const row = value as { keys: string[]; listed: boolean };
  assert.ok(row.keys.includes('shi_ce_echo'));
  assert.equal(row.listed, true);
}

unregisterFunctionCall('shi_ce_echo');

console.log('shiCe1Fixes.verify.ts: all assertions passed');
