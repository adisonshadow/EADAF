import type { ChatToolStep } from '../chat/chatToolSteps';
import InvocationCard from './invocation/InvocationCard';

interface ToolInvokeStepsProps {
  /** 单个 Tool 调用步骤；每个 Tool 渲染为独立 InvocationCard。 */
  step?: ChatToolStep;
}

/**
 * 渲染单条 Tool 调用为统一 InvocationCard（标题栏 + 可折叠内容区）。
 * 由 AssistantSegments 在按输出顺序遍历 segments 时逐个调用。
 */
export default function ToolInvokeSteps({ step }: ToolInvokeStepsProps) {
  if (!step) return null;
  return <InvocationCard step={step} />;
}
