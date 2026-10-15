import { Button, Checkbox, Input, Radio, Space, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { UserChoiceSegment } from '../chat/chatToolSteps';
import {
  formatUserChoiceMessage,
  type UserChoiceRequest,
  type UserChoiceSubmission,
} from '../chat/userChoice';
import { sendMockUserMessage } from '../utils/aiChatBridge';
import './UserChoiceCard.css';

export interface UserChoiceCardProps {
  segment: UserChoiceSegment;
}

function toRequest(segment: UserChoiceSegment): UserChoiceRequest {
  return {
    requestId: segment.requestId,
    question: segment.question,
    mode: segment.mode,
    options: segment.options,
    allowCustom: segment.allowCustom,
    minSelect: segment.minSelect,
    ...(segment.maxSelect != null ? { maxSelect: segment.maxSelect } : {}),
  };
}

/**
 * mid-task HITL Choice Card：单选 / 多选 + 可选自定义输入。
 * 提交后注入【用户选择】消息并续跑 Agent（与「下一步建议」A2UI 语义分离）。
 */
export default function UserChoiceCard({ segment }: UserChoiceCardProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customText, setCustomText] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [submitted, setSubmitted] = useState(Boolean(segment.submitted));

  const request = useMemo(() => toRequest(segment), [segment]);
  const customTrimmed = customText.trim();
  const effectiveCustom = segment.allowCustom && useCustom ? customTrimmed : '';

  const canSubmit = useMemo(() => {
    if (submitted) return false;
    if (segment.mode === 'single') {
      if (segment.allowCustom && useCustom) return customTrimmed.length > 0;
      return selectedIds.length === 1;
    }
    const count = selectedIds.length + (effectiveCustom ? 1 : 0);
    if (count < segment.minSelect) return false;
    if (segment.maxSelect != null && selectedIds.length > segment.maxSelect) return false;
    return count > 0;
  }, [
    submitted,
    segment.mode,
    segment.allowCustom,
    segment.minSelect,
    segment.maxSelect,
    useCustom,
    customTrimmed,
    selectedIds,
    effectiveCustom,
  ]);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const submission: UserChoiceSubmission = {
      selectedIds: segment.mode === 'single' && useCustom ? [] : selectedIds,
      ...(effectiveCustom ? { customText: effectiveCustom } : {}),
    };
    const message = formatUserChoiceMessage(request, submission);
    setSubmitted(true);
    sendMockUserMessage(message);
  };

  return (
    <div className={`eadaf-user-choice-card${submitted ? ' is-submitted' : ''}`}>
      <Typography.Text className="eadaf-user-choice-question" strong>
        {segment.question}
      </Typography.Text>

      {segment.mode === 'single' ? (
        <Radio.Group
          className="eadaf-user-choice-options"
          disabled={submitted}
          value={useCustom ? '__custom__' : selectedIds[0]}
          onChange={(e) => {
            const value = String(e.target.value);
            if (value === '__custom__') {
              setUseCustom(true);
              setSelectedIds([]);
              return;
            }
            setUseCustom(false);
            setSelectedIds([value]);
          }}
        >
          <Space direction="vertical" size={8}>
            {segment.options.map((opt) => (
              <Radio key={opt.id} value={opt.id}>
                <span className="eadaf-user-choice-label">{opt.label}</span>
                {opt.description ? (
                  <span className="eadaf-user-choice-desc">{opt.description}</span>
                ) : null}
              </Radio>
            ))}
            {segment.allowCustom ? (
              <Radio value="__custom__">
                <span className="eadaf-user-choice-label">其他</span>
              </Radio>
            ) : null}
          </Space>
        </Radio.Group>
      ) : (
        <Checkbox.Group
          className="eadaf-user-choice-options"
          disabled={submitted}
          value={selectedIds}
          onChange={(values) => setSelectedIds(values.map(String))}
        >
          <Space direction="vertical" size={8}>
            {segment.options.map((opt) => (
              <Checkbox key={opt.id} value={opt.id}>
                <span className="eadaf-user-choice-label">{opt.label}</span>
                {opt.description ? (
                  <span className="eadaf-user-choice-desc">{opt.description}</span>
                ) : null}
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      )}

      {segment.allowCustom && (segment.mode === 'multi' || useCustom) ? (
        <Input.TextArea
          className="eadaf-user-choice-custom"
          disabled={submitted || (segment.mode === 'single' && !useCustom)}
          placeholder={segment.mode === 'multi' ? '可选：补充自定义说明' : '请输入自定义内容'}
          autoSize={{ minRows: 1, maxRows: 4 }}
          value={customText}
          onChange={(e) => {
            setCustomText(e.target.value);
            if (segment.mode === 'multi' && e.target.value.trim()) setUseCustom(true);
            if (segment.mode === 'multi' && !e.target.value.trim()) setUseCustom(false);
          }}
        />
      ) : null}

      <div className="eadaf-user-choice-actions">
        <Button type="primary" size="small" disabled={!canSubmit} onClick={handleSubmit}>
          {submitted ? '已提交' : '确认选择'}
        </Button>
      </div>
    </div>
  );
}
