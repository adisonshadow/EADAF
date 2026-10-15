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
import { getFunctionCallDef } from './functionRegistry';
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

registerSkillBodyLoader(null);
registerSkillActivatedListener(null);
unregisterBuiltinTools();

console.log('skillAndRunCodeTools.verify.ts: all assertions passed');
