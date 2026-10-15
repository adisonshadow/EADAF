/**
 * navigate_to_page harness Tool 回归验证（node --import tsx src/registry/navigateTool.verify.ts）
 *
 * 覆盖：工具定义归属（HARNESS_TOOL_NAMES 含、HARNESS_OPENAI_TOOLS 不含）、
 *       开关开/关、无 handler、透传 invalid_target、失败不视为 Tool 失败（kind=success）。
 */
import assert from 'node:assert/strict';
import {
  NAVIGATE_TO_PAGE_TOOL,
  NAVIGATE_TO_PAGE_OPENAI_TOOL,
  HARNESS_TOOL_NAMES,
  HARNESS_OPENAI_TOOLS,
  registerBuiltinTools,
  unregisterBuiltinTools,
} from './builtinTools';
import {
  setAutoNavigate,
  registerNavigationHandler,
} from '../navigation/navigationChannel';
import { invokeFunctionCall, clearFunctionCalls } from './functionRegistry';
import type { ToolResponse } from '../types/toolResponse';

/* ------------------------------- localStorage mock ------------------------------- */
const storage = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, String(value));
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => storage.clear(),
};

function reset() {
  storage.clear();
  registerNavigationHandler(null);
}

(async () => {
  reset();
  registerBuiltinTools();

  // 1. 定义归属：进 HARNESS_TOOL_NAMES；独立 OPENAI_TOOL 不进 HARNESS_OPENAI_TOOLS
  assert.ok(HARNESS_TOOL_NAMES.has(NAVIGATE_TO_PAGE_TOOL), 'navigate_to_page 应在 HARNESS_TOOL_NAMES');
  assert.ok(
    !HARNESS_OPENAI_TOOLS.some((t) => t.function.name === NAVIGATE_TO_PAGE_TOOL),
    'navigate_to_page 不应在 HARNESS_OPENAI_TOOLS（semanticRoutes 非空时由 useAIBaseChat 单独注入）',
  );
  assert.ok(
    NAVIGATE_TO_PAGE_OPENAI_TOOL.function.description.includes('跨步骤工作流'),
    '工具描述应强调跨步骤里程碑必须跳，避免被理解成连续创建整段不跳',
  );

  // 2. 未注册 handler → no_handler；信封 kind=success（不触发 auto-continue 重试）
  setAutoNavigate(true);
  registerNavigationHandler(null);
  const noHandler = (await invokeFunctionCall(NAVIGATE_TO_PAGE_TOOL, {
    path: '/member_org/member',
  })) as ToolResponse | undefined;
  assert.equal(noHandler?.kind, 'success', 'no_handler 不应视为 Tool 失败');
  assert.equal(noHandler?.verified, true);
  assert.deepEqual(noHandler?.data, {
    navigated: false,
    reason: 'no_handler',
    message: '未注册页面跳转处理器',
  });

  // 3. 开关关：不调 handler，直接 disabled（不暴露白名单校验细节）
  setAutoNavigate(false);
  registerNavigationHandler(() => {
    throw new Error('开关关闭时不应调用 handler');
  });
  const disabled = (await invokeFunctionCall(NAVIGATE_TO_PAGE_TOOL, {
    path: '/member_org/member',
  })) as ToolResponse | undefined;
  assert.equal(disabled?.kind, 'success', 'disabled 不应视为 Tool 失败');
  assert.deepEqual(disabled?.data, {
    navigated: false,
    reason: 'disabled',
    message: '自动跳转已关闭，可在 AI 助手设置中开启',
  });

  // 4. 开关开 + handler 成功 → navigated 透传
  setAutoNavigate(true);
  registerNavigationHandler((req) => ({ navigated: true, path: req.path }));
  const ok = (await invokeFunctionCall(NAVIGATE_TO_PAGE_TOOL, {
    path: '/member_org/member',
  })) as ToolResponse | undefined;
  assert.equal(ok?.kind, 'success');
  assert.deepEqual(ok?.data, { navigated: true, path: '/member_org/member' });

  // 5. 前端白名单返回 invalid_target → 透传
  registerNavigationHandler(() => ({
    navigated: false,
    reason: 'invalid_target',
    message: '未知或非法页面: /xxx',
  }));
  const invalid = (await invokeFunctionCall(NAVIGATE_TO_PAGE_TOOL, {
    path: '/xxx',
  })) as ToolResponse | undefined;
  assert.equal(invalid?.kind, 'success', 'invalid_target 不应视为 Tool 失败');
  assert.equal(invalid?.verified, true);
  assert.deepEqual(invalid?.data, {
    navigated: false,
    reason: 'invalid_target',
    message: '未知或非法页面: /xxx',
  });

  // 6. 参数化 path 透传 params
  registerNavigationHandler((req) => ({
    navigated: true,
    path: `/member_org/member/${String(req.params?.id ?? '')}/edit`,
  }));
  const withParams = (await invokeFunctionCall(NAVIGATE_TO_PAGE_TOOL, {
    path: '/member_org/member/:id/edit',
    params: { id: 'u-42' },
  })) as ToolResponse | undefined;
  assert.deepEqual(withParams?.data, { navigated: true, path: '/member_org/member/u-42/edit' });

  unregisterBuiltinTools();
  clearFunctionCalls();
  console.log('navigateTool 回归验证全部通过');
})();
