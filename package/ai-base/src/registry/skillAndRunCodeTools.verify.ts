/**
 * skill / run_code harness 回归（node --import tsx src/registry/skillAndRunCodeTools.verify.ts）
 */
import assert from 'node:assert/strict';
import {
  HARNESS_TOOL_NAMES,
  HARNESS_OPENAI_TOOLS,
  SKILL_TOOL,
  RUN_CODE_TOOL,
  SKILL_OPENAI_TOOL,
  RUN_CODE_OPENAI_TOOL,
  registerBuiltinTools,
  unregisterBuiltinTools,
} from './builtinTools';
import {
  getFunctionCallDef,
  registerFunctionCall,
  unregisterFunctionCall,
} from './functionRegistry';
import { beginTurn } from './agentPlanState';
import {
  clearSkillGrantedTools,
  setSkillGrantedTools,
} from './skillGrantRegistry';
import {
  registerSkillBodyLoader,
  registerSkillActivatedListener,
} from './skillBodyChannel';

assert.ok(HARNESS_TOOL_NAMES.has(SKILL_TOOL));
assert.ok(HARNESS_TOOL_NAMES.has(RUN_CODE_TOOL));
assert.equal(
  HARNESS_OPENAI_TOOLS.some((t) => t.function.name === SKILL_TOOL),
  false,
  'skill 由会话层 alwaysHarness 注入，不进 HARNESS_OPENAI_TOOLS',
);
assert.equal(SKILL_OPENAI_TOOL.function.name, SKILL_TOOL);
assert.equal(RUN_CODE_OPENAI_TOOL.function.name, RUN_CODE_TOOL);

registerBuiltinTools();
assert.ok(getFunctionCallDef(SKILL_TOOL));
assert.ok(getFunctionCallDef(RUN_CODE_TOOL));

let activated = '';
registerSkillActivatedListener((skill) => {
  activated = skill.slug;
});
registerSkillBodyLoader(async (slug) => ({
  slug,
  name: slug,
  contentMarkdown: '# body',
  skill: {
    id: '1',
    slug,
    name: slug,
    contentMarkdown: '# body',
    tools: [{ functionName: 'demo_tool', name: 'demo', description: '', parameters: {} }],
  },
}));

const skillHandler = getFunctionCallDef(SKILL_TOOL)!.handler;
const skillRes = await skillHandler({ slug: 'demo-skill' });
assert.equal((skillRes as { ok?: boolean }).ok, true);
assert.equal(activated, 'demo-skill');
assert.ok(String((skillRes as { data?: { content?: string } }).data?.content || '').includes('<skill_content'));
assert.deepEqual((skillRes as { data?: { grantedTools?: string[] } }).data?.grantedTools, [
  'demo_tool',
]);
assert.ok(String((skillRes as { agentHint?: string }).agentHint || '').includes('直接调用'));

const runHandler = getFunctionCallDef(RUN_CODE_TOOL)!.handler;
const runRes = await runHandler({
  language: 'javascript',
  source: 'return 1 + 1;',
});
assert.equal((runRes as { ok?: boolean }).ok, true);
assert.equal((runRes as { data?: { value?: number } }).data?.value, 2);

const pyRes = await runHandler({ language: 'python', source: 'print(1)' });
assert.equal((pyRes as { ok?: boolean }).ok, false);

/* run_code 拿到「本回合未授权」的 Tool：回执要点名该加载哪个 Skill，且不可重试 */
registerFunctionCall({
  name: 'aibase_list_skills',
  description: '列出 Skill（AI 管理专属 client Tool）',
  parameters: { type: 'object', properties: {} },
  handler: async () => ({ ok: true }),
});
setSkillGrantedTools([
  { slug: 'aibase-capability-design', name: '能力设计', grantedTools: ['aibase_list_skills'] },
]);
const endTurn = beginTurn({
  conversationKey: 'verify-run-code',
  plan: [],
  toolOutcomes: [],
  invokedToolNames: new Set<string>(),
  availableToolNames: new Set(['demo_tool']),
  invokeAuthorizedTool: async (name) => ({ tool: name }),
});

{
  const denied = (await runHandler({
    source: 'const a = tools.schema("aibase_list_skills"); return a;',
  })) as {
    ok?: boolean;
    error?: { code?: string; retryable?: boolean; hint?: string; message?: string };
    agentHint?: string;
  };
  assert.equal(denied.ok, false);
  assert.equal(denied.error?.code, 'TOOL_NOT_AUTHORIZED', '已注册但本回合未授权');
  assert.equal(denied.error?.retryable, false, '换名字重试没有意义 → 不可重试');
  assert.ok(String(denied.error?.hint || '').includes('aibase-capability-design'));
  assert.ok(
    String(denied.error?.hint || '').includes('skill({ slug: "aibase-capability-design" })'),
    '要直接告诉模型加载哪个 Skill',
  );
  assert.ok(String(denied.agentHint || '').includes('aibase-capability-design'));
  assert.ok(String(denied.agentHint || '').includes('demo_tool'), '仍要列出本回合可编排名');
}

{
  const unknown = (await runHandler({
    source: 'return await tools.schema("no_such_tool");',
  })) as { ok?: boolean; error?: { code?: string } };
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error?.code, 'TOOL_NOT_FOUND', '根本没注册过的名字');
}

{
  // 直接调用（不是 schema）同样走同一套回执
  const direct = (await runHandler({
    source: 'return await tools.aibase_list_skills({});',
  })) as { ok?: boolean; error?: { code?: string } };
  assert.equal(direct.ok, false);
  assert.equal(direct.error?.code, 'TOOL_NOT_AUTHORIZED');
}

endTurn();
clearSkillGrantedTools();
unregisterFunctionCall('aibase_list_skills');

registerSkillBodyLoader(null);
registerSkillActivatedListener(null);
unregisterBuiltinTools();

console.log('skillAndRunCodeTools.verify.ts: all assertions passed');
