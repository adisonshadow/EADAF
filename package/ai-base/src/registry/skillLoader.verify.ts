/**
 * buildCombinedSystemPrompt 导航协议回归验证
 * node --import tsx src/registry/skillLoader.verify.ts
 */
import assert from 'node:assert/strict';
import { buildCombinedSystemPrompt } from './skillLoader';
import type { AIBaseSkill, ResolvedAIChatConfig } from '../types';

const emptyConfig = {
  enableStructuredTermination: true,
  semanticRoutes: [],
  systemPromptPrefix: '',
} as unknown as ResolvedAIChatConfig;

const withRoutes = {
  enableStructuredTermination: true,
  semanticRoutes: [
    {
      path: '/api_services/:id/edit',
      title: '编辑 API',
      description: '编辑已有 API 服务',
      domain: 'api_services',
      params: { id: { type: 'string', description: '服务 id' } },
    },
  ],
  systemPromptPrefix: '',
} as unknown as ResolvedAIChatConfig;

const skills: AIBaseSkill[] = [
  {
    id: 's1',
    name: '建模',
    slug: 'bizdata-model-design',
    contentMarkdown: '创建实体',
  },
];

{
  const prompt = buildCombinedSystemPrompt([], emptyConfig, '');
  assert.ok(prompt.includes('task_complete'));
  assert.equal(prompt.includes('navigate_to_page'), false, '无清单时不提跳转工具');
}

{
  const prompt = buildCombinedSystemPrompt(skills, withRoutes, '', { autoNavigate: true });
  assert.ok(prompt.includes('navigate_to_page —— 写成功后的页面跳转'));
  assert.ok(prompt.includes('当前自动跳转开关：已开启'));
  assert.ok(prompt.includes('跨步骤工作流'));
  assert.ok(prompt.includes('禁止因为「后面还有步骤 / 连续创建」'));
  assert.ok(prompt.includes('/api_services/:id/edit'));
  const navIdx = prompt.indexOf('navigate_to_page —— 写成功后的页面跳转');
  const skillIdx = prompt.indexOf('## 已加载 Skill');
  assert.ok(navIdx >= 0 && skillIdx > navIdx, '跳转硬约束应在 Skill 正文之前');
}

{
  const catalogPrompt = buildCombinedSystemPrompt(skills, emptyConfig, '', {
    catalog: [
      {
        slug: 'bizdata-model-design',
        name: '建模',
        description: '设计实体',
        bodyPrefetched: true,
      },
      {
        slug: 'bizdata-api-service-create',
        name: '创建 API',
        description: '批量创建服务',
        bodyPrefetched: false,
      },
    ],
  });
  assert.ok(catalogPrompt.includes('## Skill 目录（摘要）'));
  assert.ok(catalogPrompt.includes('`bizdata-api-service-create`'));
  assert.ok(catalogPrompt.includes('（已加载正文）'));
  assert.ok(catalogPrompt.includes('### skill —— 按需加载 Skill 正文'));
}

{
  const prompt = buildCombinedSystemPrompt(skills, withRoutes, '', { autoNavigate: false });
  assert.ok(prompt.includes('当前自动跳转开关：已关闭'));
  assert.equal(prompt.includes('当前自动跳转开关：已开启'), false);
  assert.equal(
    prompt.includes('navigate_to_page —— 写成功后的页面跳转（硬约束）'),
    false,
    '开关关闭时不注入必须跳转硬约束',
  );
  assert.ok(prompt.includes('/api_services/:id/edit'), '关闭时仍注入清单供口头说明');
}

{
  const userPrompt = buildCombinedSystemPrompt([], emptyConfig, '', { decisionPreference: 'user' });
  assert.ok(userPrompt.includes('让用户抉择'));
  assert.ok(userPrompt.includes('必须**调用 ask_user'));

  const aiPrompt = buildCombinedSystemPrompt([], emptyConfig, '', { decisionPreference: 'ai' });
  assert.ok(aiPrompt.includes('让 AI 自己抉择'));
  assert.equal(aiPrompt.includes('必须**调用 ask_user'), false);
}

{
  const prompt = buildCombinedSystemPrompt([], emptyConfig, '');
  assert.ok(prompt.includes('**必须**填写 next_steps'));
  assert.ok(prompt.includes('禁止**再输出'));
  assert.ok(prompt.includes('a2ui-commands'));
}

console.log('skillLoader 导航协议回归验证全部通过');
