#!/usr/bin/env node
/**
 * 生成 dist/style.css（跨平台，替代 `cp` + `cat` 的 Unix 写法）。
 *
 * 打包产物里样式要按「面板 → 组件」的顺序拼接，后写的规则才能覆盖前面的默认值：
 *   AIChatPanel.css → NextStepA2uiDeck.css → UserChoiceCard.css
 *   → ToolResultSurface.css → InvocationCard.css
 *
 * 用法（在 package/ai-base 下）：tsup && node scripts/build-css.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const PARTS = [
  'src/ui/AIChatPanel.css',
  'src/a2ui/NextStepA2uiDeck.css',
  'src/ui/UserChoiceCard.css',
  'src/ui/ToolResultSurface.css',
  'src/ui/invocation/InvocationCard.css',
];

const css = PARTS.map((rel) => {
  const text = readFileSync(resolve(root, rel), 'utf8');
  return `/* ${rel} */\n${text.trimEnd()}\n`;
}).join('\n');

const out = resolve(root, 'dist/style.css');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, css, 'utf8');
console.log(`✓ dist/style.css (${css.length} chars, ${PARTS.length} files)`);
