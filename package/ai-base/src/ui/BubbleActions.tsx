import { RedoOutlined } from '@ant-design/icons';
import { Actions } from '@ant-design/x';
import { useMemo, type ReactNode } from 'react';

export interface BubbleActionsProps {
  text?: string;
  onRetry?: () => void;
}

export default function BubbleActions({ text, onRetry }: BubbleActionsProps) {
  const items = useMemo(() => {
    const next: Array<{
      key: string;
      label?: string;
      icon?: ReactNode;
      actionRender?: () => ReactNode;
      onItemClick?: () => void;
    }> = [];
    if (text) {
      next.push({
        key: 'copy',
        label: '复制',
        actionRender: () => <Actions.Copy text={text} />,
      });
    }
    if (onRetry) {
      next.push({
        key: 'retry',
        icon: <RedoOutlined />,
        label: '重试',
        onItemClick: onRetry,
      });
    }
    return next;
  }, [onRetry, text]);

  if (!items.length) return null;

  return <Actions className="aibase-chat-bubble-actions" items={items} variant="borderless" fadeIn />;
}
