export interface NextStepItem {
  id: string;
  label: string;
}

export interface ParsedA2uiCommandsPayload {
  steps: NextStepItem[];
  hasSteps: boolean;
  /** 正文中已剥离 a2ui-commands 块 */
  displayText: string;
  /** 流式输出中检测到未闭合的 a2ui-commands 块 */
  isStreamingBlock: boolean;
}

const A2UI_COMMANDS_FENCE_RE = /```a2ui-commands\s*([\s\S]*?)```/gi;

function findMatchingObjectEnd(s: string, openIdx: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openIdx; i < s.length; i += 1) {
    const c = s[i]!;
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseStepsJson(jsonText: string): NextStepItem[] {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    const rawSteps = (parsed as Record<string, unknown>).steps;
    if (!Array.isArray(rawSteps)) return [];
    return rawSteps
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const rec = item as Record<string, unknown>;
        const id = typeof rec.id === 'string' ? rec.id.trim() : '';
        const label = typeof rec.label === 'string' ? rec.label.trim() : '';
        if (!id || !label || label.length >= 30) return null;
        return { id, label };
      })
      .filter((item): item is NextStepItem => item != null);
  } catch {
    return [];
  }
}

function stripIncompleteFence(text: string): { displayText: string; isStreamingBlock: boolean } {
  const openIdx = text.search(/```a2ui-commands\b/i);
  if (openIdx < 0) return { displayText: text, isStreamingBlock: false };
  const afterOpen = text.slice(openIdx);
  if (/```a2ui-commands\s*[\s\S]*?```/i.test(afterOpen)) {
    return { displayText: text, isStreamingBlock: false };
  }
  return {
    displayText: text.slice(0, openIdx).trimEnd(),
    isStreamingBlock: true,
  };
}

function stripLooseStepsJson(text: string): { steps: NextStepItem[]; displayText: string } {
  const marker = text.indexOf('"steps"');
  if (marker < 0) return { steps: [], displayText: text };
  const openBrace = text.lastIndexOf('{', marker);
  if (openBrace < 0) return { steps: [], displayText: text };
  const closeBrace = findMatchingObjectEnd(text, openBrace);
  if (closeBrace < 0) return { steps: [], displayText: text };
  const jsonSlice = text.slice(openBrace, closeBrace + 1);
  const steps = parseStepsJson(jsonSlice);
  if (!steps.length) return { steps: [], displayText: text };
  const displayText = `${text.slice(0, openBrace)}${text.slice(closeBrace + 1)}`.trim();
  return { steps, displayText };
}

export function extractA2uiCommandsPayload(content: string): ParsedA2uiCommandsPayload {
  const trimmed = content.trim();
  if (!trimmed) {
    return { steps: [], hasSteps: false, displayText: '', isStreamingBlock: false };
  }

  let displayText = trimmed;
  const steps: NextStepItem[] = [];
  let fenceRemoved = false;

  displayText = displayText.replace(A2UI_COMMANDS_FENCE_RE, (_match, inner: string) => {
    const parsed = parseStepsJson(String(inner).trim());
    if (parsed.length) steps.push(...parsed);
    fenceRemoved = fenceRemoved || parsed.length > 0;
    return '';
  });

  if (!steps.length) {
    const loose = stripLooseStepsJson(displayText);
    if (loose.steps.length) {
      steps.push(...loose.steps);
      displayText = loose.displayText;
      fenceRemoved = true;
    }
  }

  displayText = displayText.replace(/\n{3,}/g, '\n\n').trim();

  const streaming = stripIncompleteFence(trimmed);
  if (streaming.isStreamingBlock) {
    return {
      steps: [],
      hasSteps: false,
      displayText: streaming.displayText,
      isStreamingBlock: true,
    };
  }

  const uniqueSteps = steps.filter(
    (item, index, arr) => arr.findIndex((other) => other.id === item.id) === index,
  );

  return {
    steps: uniqueSteps,
    hasSteps: uniqueSteps.length > 0,
    displayText: fenceRemoved ? displayText : trimmed,
    isStreamingBlock: false,
  };
}
