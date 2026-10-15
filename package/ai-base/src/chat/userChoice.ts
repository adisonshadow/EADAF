/**
 * ask_user / 用户选择卡片：类型、信封判定与提交文案格式化。
 */

export const ASK_USER_TOOL = 'ask_user';

export type UserChoiceMode = 'single' | 'multi';

export interface UserChoiceOption {
  id: string;
  label: string;
  description?: string;
}

/** Tool 参数（模型侧） */
export interface AskUserArgs {
  question?: string;
  mode?: UserChoiceMode;
  options?: UserChoiceOption[];
  allowCustom?: boolean;
  minSelect?: number;
  maxSelect?: number;
}

/** 写入 assistant segment / UI 的请求快照 */
export interface UserChoiceRequest {
  requestId: string;
  question: string;
  mode: UserChoiceMode;
  options: UserChoiceOption[];
  allowCustom: boolean;
  minSelect: number;
  maxSelect?: number;
}

/** 用户提交的选择 */
export interface UserChoiceSubmission {
  selectedIds: string[];
  customText?: string;
}

export function isUserChoiceRequestData(data: unknown): data is UserChoiceRequest {
  if (!data || typeof data !== 'object') return false;
  const row = data as Record<string, unknown>;
  return (
    typeof row.requestId === 'string' &&
    typeof row.question === 'string' &&
    (row.mode === 'single' || row.mode === 'multi') &&
    Array.isArray(row.options)
  );
}

export function formatUserChoiceMessage(
  request: UserChoiceRequest,
  submission: UserChoiceSubmission,
): string {
  const modeLabel = request.mode === 'multi' ? '多选' : '单选';
  const selected = submission.selectedIds
    .map((id) => {
      const opt = request.options.find((item) => item.id === id);
      if (!opt) return id;
      return opt.description ? `${opt.id}（${opt.label}：${opt.description}）` : `${opt.id}（${opt.label}）`;
    })
    .join('、');
  const custom = submission.customText?.trim() || '（无）';
  const lines = [
    '【用户选择】',
    `题：${request.question}`,
    `模式：${modeLabel}`,
    `已选：${selected || '（无）'}`,
    `自定义：${custom}`,
  ];
  return lines.join('\n');
}
