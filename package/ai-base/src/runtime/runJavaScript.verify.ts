/**
 * node --import tsx src/runtime/runJavaScript.verify.ts
 */
import assert from 'node:assert/strict';
import { runJavaScriptCode } from './runJavaScript';

{
  const { value } = await runJavaScriptCode(
    'const a = await tools.echo({ n: 1 }); return a.n + 2;',
    async (name, args) => {
      assert.equal(name, 'echo');
      return args;
    },
    { toolNames: ['echo'] },
  );
  assert.equal(value, 3);
}

{
  const { value } = await runJavaScriptCode('return Object.keys(tools).sort();', async () => null, {
    toolNames: ['alpha', 'beta'],
  });
  assert.deepEqual(value, ['alpha', 'beta', 'list', 'schema'].sort());
}

{
  await assert.rejects(
    () => runJavaScriptCode('', async () => null),
    /source 不能为空/,
  );
}

{
  await assert.rejects(
    () =>
      runJavaScriptCode('return await tools.missing({});', async () => {
        throw new Error('未注册');
      }),
    /未授权或不在本回合可编排名: missing/,
  );
}

{
  // 实测3: tools.filter 不得伪装成已注册 Tool
  let invoked = '';
  await assert.rejects(
    () =>
      runJavaScriptCode('return await tools.filter({ x: 1 });', async (name) => {
        invoked = name;
        return {};
      }, { toolNames: ['echo'] }),
    /未授权或不在本回合可编排名: filter/,
  );
  assert.equal(invoked, '');
}

{
  const { value } = await runJavaScriptCode(
    'return tools.schema("echo");',
    async () => null,
    {
      toolNames: ['echo'],
      contracts: [
        {
          name: 'echo',
          description: 'echo tool',
          parameters: {
            type: 'object',
            properties: { n: { type: 'number' } },
            required: ['n'],
          },
        },
      ],
    },
  );
  const row = value as { name: string; parameters: { required?: string[] } };
  assert.equal(row.name, 'echo');
  assert.deepEqual(row.parameters.required, ['n']);
}

{
  // 实测2: 脚本内 `const tools = …` 不得与注入参数冲突
  const { value } = await runJavaScriptCode(
    'const tools = 1; return tools.list().includes("echo");',
    async () => null,
    { toolNames: ['echo'] },
  );
  assert.equal(value, true);
}

{
  const { value } = await runJavaScriptCode(
    'let tools = { local: true }; return { viaBridge: typeof tools.list === "function", localShadow: false };',
    async () => null,
    { toolNames: ['echo'] },
  );
  const row = value as { viaBridge: boolean };
  assert.equal(row.viaBridge, true);
}

console.log('runJavaScript.verify.ts: all assertions passed');
