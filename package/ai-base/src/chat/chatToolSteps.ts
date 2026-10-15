import type { NextStepItem } from '../a2ui/parseA2uiCommands';
import type { ToolDisplay } from '../types/toolResponse';
import type { InvocationPresentation } from '../runtime/surfacesTypes';

export type ChatToolStepStatus = 'loading' | 'success' | 'error' | 'business_error';

export interface ChatToolStep {
  id: string;
  functionName: string;
  /**
   * 兼容旧复制/回放：通常为 `title · subtitle`。
   * 新 UI 优先用 title / subtitle。
   */
  displayName: string;
  /** 标题栏主标题（静态动词，如「加载 Skill」） */
  title?: string;
  /** 标题栏副标题（动态，如 Skill 名 / HTTP path） */
  subtitle?: string;
  status: ChatToolStepStatus;
  durationMs?: number;
  error?: string;
  /** 用户可见 Surface（与模型上下文解耦） */
  display?: ToolDisplay;
  /** 壳配置快照（折叠/高度/内容模式） */
  presentation?: InvocationPresentation;
  /** 调用参数（IN / request 侧） */
  args?: Record<string, unknown>;
}

export interface AssistantChatMessage {
  role: 'assistant';
  content: string;
  reasoningContent?: string;
  toolSteps?: ChatToolStep[];
}

export type PlanningItemStatus = 'pending' | 'in_progress' | 'completed';

export interface PlanningItemView {
  id: string;
  label: string;
  status: PlanningItemStatus;
}

export function upsertToolStep(
  steps: ChatToolStep[] | undefined,
  step: ChatToolStep,
): ChatToolStep[] {
  const list = steps ? [...steps] : [];
  const index = list.findIndex((item) => item.id === step.id);
  if (index >= 0) {
    list[index] = { ...list[index], ...step };
    return list;
  }
  return [...list, step];
}

/**
 * 有序 segment：把一轮 assistant 回复拆成按 AI 输出顺序排列的单元。
 * - text：一段文本（通常是某一轮的回复正文）
 * - tool：一次工具调用（单条 ThoughtChain）
 *
 * segments 取代了原先「整轮累加 content + toolSteps[]」的扁平结构，
 * 渲染时按数组顺序铺开，文本与 ThoughtChain 自然交错，保留输出时序。
 */
// Planning next moves：展示结构化执行过程中用户可感知的“接下来要做什么”
export type PlanningNextMovesSegment = {
  kind: 'planning';
  id: string;
  title: string;
  items: PlanningItemView[];
  /** 可选：当存在失败并即将重试时，给用户明确“重试什么”提示 */
  hint?: string;
};

/** mid-task HITL：ask_user 挂起后展示的选择卡片 */
export type UserChoiceSegment = {
  kind: 'user_choice';
  id: string;
  requestId: string;
  question: string;
  mode: 'single' | 'multi';
  options: Array<{ id: string; label: string; description?: string }>;
  allowCustom: boolean;
  minSelect: number;
  maxSelect?: number;
  /** 提交后锁定，防重复点击 */
  submitted?: boolean;
};

/** 阶段完成后的可选快捷动作（由 task_complete.next_steps 写入） */
export type NextStepsSegment = {
  kind: 'next_steps';
  id: string;
  steps: NextStepItem[];
};

export type AssistantSegment =
  | { kind: 'text'; id: string; content: string }
  | { kind: 'tool'; id: string; step: ChatToolStep }
  | PlanningNextMovesSegment
  | UserChoiceSegment
  | NextStepsSegment;

/**
 * 按 id upsert 一个 segment：
 * - 已存在则就地更新（工具段 loading→success 时复用，保持位置不变）
 * - 新增则 append 到末尾，保证顺序 = AI 输出顺序
 *
 * 文本段采用「合并到末尾相邻文本段」策略：同一轮的流式回调会反复 upsert 同一个
 * text segment id（如 `text-round-1`），就地更新内容即可，避免文本碎片化。
 */
export function upsertSegment(
  segments: AssistantSegment[] | undefined,
  segment: AssistantSegment,
): AssistantSegment[] {
  const list = segments ? [...segments] : [];
  const index = list.findIndex((item) => item.id === segment.id);
  if (index >= 0) {
    list[index] =
      list[index].kind === 'tool' && segment.kind === 'tool'
        ? { ...list[index], step: { ...list[index].step, ...segment.step } }
        : segment;
    return list;
  }
  return [...list, segment];
}

/** 按 id 移除 segment（Planning 过程态隐藏等） */
export function removeSegment(
  segments: AssistantSegment[] | undefined,
  id: string,
): AssistantSegment[] {
  if (!segments?.length) return segments || [];
  return segments.filter((item) => item.id !== id);
}

/**
 * 新 Tool 开始时：把先前 transient Surface 按 presentation 收起（保留标题栏）。
 * collapsedPreviewLines：0 全收；>0 留 N 行预览。
 */
export function collapseTransientToolSurfaces(
  segments: AssistantSegment[] | undefined,
): AssistantSegment[] {
  if (!segments?.length) return segments || [];
  return segments.map((seg) => {
    if (seg.kind !== 'tool') return seg;
    const display = seg.step.display;
    if (!display || display.visibility !== 'transient') return seg;
    const previewLines =
      seg.step.presentation?.collapsedPreviewLines ?? display.previewLines ?? 2;
    if (display.collapsed && (display.previewLines ?? previewLines) === previewLines) {
      return seg;
    }
    return {
      ...seg,
      step: {
        ...seg.step,
        display: {
          ...display,
          collapsed: true,
          previewLines,
        },
      },
    };
  });
}
