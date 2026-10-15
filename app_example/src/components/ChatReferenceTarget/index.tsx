import type { MouseEvent, ReactNode } from 'react';
import './index.css';
import { Tooltip } from 'antd';

/** 表示「可添加 Chat 引用」的目标元素 className */
export const CHAT_REFERENCE_TARGET_CLASS = 'chat-reference-target';

export interface ChatReferenceTargetProps {
  children?: ReactNode;
  onClick?: (event: MouseEvent<HTMLSpanElement>) => void;
}

export default function ChatReferenceTarget({ children, onClick }: ChatReferenceTargetProps) {
  return (
    <Tooltip title="添加到AI">
      <span className={CHAT_REFERENCE_TARGET_CLASS} onClick={onClick} role="button" tabIndex={0}>
        {children}
        <img src="/at.svg" alt="" className="chat-reference-target-icon" aria-hidden />
      </span>
    </Tooltip>
  );
}
