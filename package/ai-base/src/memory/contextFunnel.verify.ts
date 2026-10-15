/**
 * 上下文漏斗沉淀回归（node --import tsx src/memory/contextFunnel.verify.ts）
 */
import assert from 'node:assert/strict';
import {
  compactHistoryForApi,
  compactTurnToolMessages,
  estimateMessageChars,
  MULTIMODAL_IMAGE_CHARS,
  MAX_CONTEXT_CHARS,
  COMPACT_THRESHOLD,
  KEEP_RECENT_MESSAGES,
} from '../chat/contextBudget';
import type { EADAFChatMessage } from '../chat/EADAFChatProvider';
import {
  beginTurn,
  getPlan,
  setPlan,
  getPlanForConversation,
} from '../registry/agentPlanState';
import {
  appendSessionFacts,
  distillSessionSummary,
  extractFactsFromEnvelope,
  getSessionFacts,
  getSessionPlan,
  getSessionSummary,
  resetSessionWorkingMemory,
  setSessionPlan,
  buildSceneCard,
  buildWorkingMemoryInjection,
  getSessionWorkingMemory,
} from './index';
import { formatMessageWithReferences, formatReferencePointer } from '../utils/formatChatReferences';
import { sanitizeApiContentForPersist } from '../storage/chatHistoryDb';
import { aggregateToolResults } from '../utils/aggregateToolResults';
import type { ToolResponse } from '../types/toolResponse';
import {
  registerAISurface,
  unregisterAISurface,
  getAISurface,
  clearAISurfacesForTests,
  surfaceRegistryKey,
} from '../registry/aiSurfaceRegistry';

resetSessionWorkingMemory();
clearAISurfacesForTests();

/* -------------------------------------------------------------------------- */
/* 估算器：多模态不按 base64 全文计数                                             */
/* -------------------------------------------------------------------------- */
{
  const hugeBase64 = `data:image/png;base64,${'A'.repeat(200_000)}`;
  const msg: EADAFChatMessage = {
    role: 'user',
    content: [{ type: 'image_url', image_url: { url: hugeBase64 } }],
  };
  const chars = estimateMessageChars(msg);
  assert.equal(chars, MULTIMODAL_IMAGE_CHARS);
  assert.ok(chars < 10_000, '一张图不应按百万字符计入预算');
}

/* -------------------------------------------------------------------------- */
/* compaction 非破坏视图 + 结构化中文摘要                                         */
/* -------------------------------------------------------------------------- */
{
  const history: EADAFChatMessage[] = [];
  for (let i = 0; i < 20; i += 1) {
    history.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `消息 ${i} ${'x'.repeat(8_000)}`,
    });
  }
  const usage = history.reduce((s, m) => s + estimateMessageChars(m), 0);
  assert.ok(usage >= MAX_CONTEXT_CHARS * COMPACT_THRESHOLD);

  const result = compactHistoryForApi(history);
  assert.equal(result.compacted, true);
  assert.equal(result.trimmedCount, 20 - KEEP_RECENT_MESSAGES);
  assert.ok(result.summary?.includes('上下文已压缩'));
  assert.ok(String(result.history[0]?.content).includes('完整历史仍保留'));
  // 原 history 未被原地破坏
  assert.equal(history.length, 20);
}

/* -------------------------------------------------------------------------- */
/* Turn 内 tool 降级                                                             */
/* -------------------------------------------------------------------------- */
{
  const msgs = Array.from({ length: 12 }, (_, i) => ({
    role: 'tool',
    name: 'demo',
    tool_call_id: `c${i}`,
    content: JSON.stringify({ ok: true, big: 'x'.repeat(100) }),
  }));
  const compacted = compactTurnToolMessages(msgs, 8);
  assert.equal(compacted.length, 12);
  assert.ok(String(compacted[0].content).includes('早期工具结果已降级'));
  assert.ok(!String(compacted[11].content).includes('早期工具结果已降级'));
}

/* -------------------------------------------------------------------------- */
/* L3：会话级 plan 跨 turn 连续（ask_user 恢复场景）                               */
/* -------------------------------------------------------------------------- */
{
  const key = 'sess-ask-user';
  resetSessionWorkingMemory(key);
  setSessionPlan(key, [
    { id: 't1', content: '创建实体', status: 'in_progress' },
    { id: 't2', content: '校验模型', status: 'pending' },
  ]);

  const end1 = beginTurn({
    conversationKey: key,
    plan: getSessionPlan(key),
    toolOutcomes: [],
    invokedToolNames: new Set(),
  });
  setPlan([
    { id: 't1', content: '创建实体', status: 'completed' },
    { id: 't2', content: '校验模型', status: 'in_progress' },
  ]);
  end1();

  // 模拟 ask_user 后新 turn：不得 beginTurn({ plan: [] })
  const end2 = beginTurn({
    conversationKey: key,
    plan: getSessionPlan(key),
    toolOutcomes: [],
    invokedToolNames: new Set(),
  });
  assert.equal(getPlan().length, 2);
  assert.equal(getPlan()[0].status, 'completed');
  assert.equal(getPlanForConversation(key)[1].status, 'in_progress');
  end2();
}

/* -------------------------------------------------------------------------- */
/* L1：信封层抽取（序列化之前）                                                   */
/* -------------------------------------------------------------------------- */
{
  const envelope: ToolResponse = {
    ok: true,
    verified: true,
    kind: 'success',
    data: { id: 'ent-1', code: 'Order', name: '订单' },
    meta: { tool: 'bizdata_create_entity' },
  };
  const facts = extractFactsFromEnvelope(envelope, { turnId: 't1', toolCallId: 'c1' });
  assert.ok(facts.some((f) => f.type === 'mutation_result'));
  assert.ok(facts.some((f) => f.type === 'entity_ref' && f.subject.code === 'Order'));
}

/* -------------------------------------------------------------------------- */
/* 聚合：优先结构化信封，截断 JSON 不误报 failed                                  */
/* -------------------------------------------------------------------------- */
{
  const truncated = '{"ok":true,"kind":"success","meta":{"tool":"x"},"data":"PARTIAL';
  const callId = 'call-ok';
  const envelopes = new Map<string, ToolResponse>([
    [
      callId,
      {
        ok: true,
        verified: true,
        kind: 'success',
        data: { items: [1, 2, 3] },
        meta: { tool: 'apiservice_run_test' },
      },
    ],
  ]);
  const messages = [
    { role: 'tool', name: 'apiservice_run_test', tool_call_id: callId, content: truncated },
    { role: 'tool', name: 'apiservice_run_test', tool_call_id: 'c2', content: truncated },
    { role: 'tool', name: 'apiservice_run_test', tool_call_id: 'c3', content: truncated },
  ];
  // 无信封时 truncated 解析失败 → failed
  const without = aggregateToolResults(messages, {
    resultAggregation: { tools: ['apiservice_run_test'], minBatchSize: 3 },
  });
  assert.ok(String(without[2].content).includes('"failed":3') || String(without[2].content).includes('failed'));

  // 有结构化信封时第一条应算 ok
  const withEnv = aggregateToolResults(
    messages,
    { resultAggregation: { tools: ['apiservice_run_test'], minBatchSize: 3 } },
    envelopes,
  );
  assert.ok(String(withEnv[0].content).includes('ok'));
}

/* -------------------------------------------------------------------------- */
/* L2 scene card + 引用指针                                                     */
/* -------------------------------------------------------------------------- */
{
  const card = buildSceneCard({
    route: '/bizdata/entities',
    surfaces: [
      {
        id: 'entity-form',
        domain: 'bizdata',
        label: '实体表单',
        data: {
          focus: { id: 'e1', code: 'Order', name: '订单' },
          formDirty: true,
          fields: [
            { key: 'id', required: true, type: 'uuid' },
            { key: 'status', type: 'varchar' },
            { key: 'amount', type: 'numeric' },
          ],
        },
      },
    ],
    pinnedRefs: [{ id: 'ref-1', type: 'entity', label: '订单', content: { id: 'e1', rows: Array.from({ length: 20 }, (_, i) => i) } }],
  });
  assert.ok(card.includes('当前场景'));
  assert.ok(card.includes('Order'));
  assert.ok(card.includes('fields:'));
  assert.ok(card.includes('id*'));
  assert.ok(card.includes('status'));
  assert.ok(!card.includes('rows'));

  const ptr = formatReferencePointer({
    id: 'ref-1',
    type: 'entity',
    label: '订单',
    content: { id: 'e1', code: 'Order', huge: 'x'.repeat(5000) },
  });
  assert.ok(ptr.includes('id: ref-1'));
  assert.ok(!ptr.includes('huge'));
  const msg = formatMessageWithReferences('帮我改', [
    { id: 'ref-1', type: 'entity', label: '订单', content: { id: 'e1' } },
  ]);
  assert.ok(msg.includes('[引用上下文]'));
  assert.ok(!msg.includes('"id":"e1"'));
}

/* -------------------------------------------------------------------------- */
/* Surface 作用域                                                               */
/* -------------------------------------------------------------------------- */
{
  clearAISurfacesForTests();
  registerAISurface({
    id: 'form',
    domain: 'bizdata',
    label: 'A',
    read: () => ({ a: 1 }),
  });
  registerAISurface({
    id: 'form',
    domain: 'uac',
    label: 'B',
    read: () => ({ b: 1 }),
  });
  assert.ok(getAISurface('form', 'bizdata'));
  assert.ok(getAISurface('form', 'uac'));
  assert.equal(surfaceRegistryKey('bizdata', 'form'), 'bizdata::form');
  unregisterAISurface('form', 'bizdata');
  assert.equal(getAISurface('form', 'bizdata'), undefined);
  assert.ok(getAISurface('form', 'uac'));
  clearAISurfacesForTests();
}

/* -------------------------------------------------------------------------- */
/* L0 apiContent 持久化策略                                                     */
/* -------------------------------------------------------------------------- */
{
  const sanitized = sanitizeApiContentForPersist([
    { type: 'text', text: '看图' },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${'B'.repeat(1000)}` } },
  ]);
  assert.ok(Array.isArray(sanitized));
  const img = sanitized![1] as { image_url: { url: string } };
  assert.equal(img.image_url.url, '[omitted:image]');
}

/* -------------------------------------------------------------------------- */
/* L4 蒸馏                                                                      */
/* -------------------------------------------------------------------------- */
{
  const key = 'sess-l4';
  resetSessionWorkingMemory(key);
  setSessionPlan(key, [
    { id: 't1', content: '建实体 Order', status: 'completed' },
  ]);
  appendSessionFacts(key, [
    {
      factId: 'f1',
      type: 'entity_ref',
      subject: { kind: 'Entity', id: 'e1', code: 'Order' },
      predicate: 'observed',
      value: { code: 'Order' },
      source: { tool: 'bizdata_create_entity' },
      ts: Date.now(),
    },
  ]);
  const summary = distillSessionSummary(key, {
    deliverySummary: '已完成订单实体建模',
    clearPlan: true,
  });
  assert.ok(summary.includes('订单'));
  assert.equal(getSessionPlan(key).length, 0);
  assert.ok(getSessionSummary(key));
  assert.ok(getSessionFacts(key).length >= 1);

  const injection = buildWorkingMemoryInjection({
    memory: getSessionWorkingMemory(key),
    sceneCard: '',
    focusIds: new Set(['e1']),
    otherSummaries: [],
  });
  assert.ok(injection.includes('本会话摘要') || injection.includes('相关事实'));
}

resetSessionWorkingMemory();
clearAISurfacesForTests();
console.log('contextFunnel.verify.ts: all assertions passed');
