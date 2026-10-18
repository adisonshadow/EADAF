import {
  CheckCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  InfoCircleFilled,
} from '@ant-design/icons';
import { Button, Popover, theme } from 'antd';
import React from 'react';

export type HeaderNoticeType = 'info' | 'success' | 'warning' | 'error';

export interface HeaderNoticeProps {
  /** 对齐 antd Alert 的 type:决定图标与颜色,缺省 warning */
  type?: HeaderNoticeType;
  /** Popover 标题,一般用原 Alert 的 message */
  message: React.ReactNode;
  /** Popover 正文,一般用原 Alert 的 description */
  description: React.ReactNode;
  /** 触发按钮的可访问名称 */
  ariaLabel: string;
}

const NOTICE_ICONS = {
  info: InfoCircleFilled,
  success: CheckCircleFilled,
  warning: ExclamationCircleFilled,
  error: CloseCircleFilled,
} as const;

/**
 * 卡片头部的提示入口。
 * 原来压在标题下的整块 Alert 会占掉正文首屏,这里收进 Popover:
 * 图标留在 header,点开即看同一段文案,正文直接从表单/上传框开始。
 */
const HeaderNotice: React.FC<HeaderNoticeProps> = ({
  type = 'warning',
  message,
  description,
  ariaLabel,
}) => {
  const { token } = theme.useToken();
  const color = {
    info: token.colorInfo,
    success: token.colorSuccess,
    warning: token.colorWarning,
    error: token.colorError,
  }[type];
  const Icon = NOTICE_ICONS[type];
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      title={message}
      content={
        <div style={{ maxWidth: 340, lineHeight: 1.7 }}>{description}</div>
      }
    >
      <Button
        type="text"
        size="small"
        aria-label={ariaLabel}
        icon={<Icon style={{ color, fontSize: 16 }} />}
      />
    </Popover>
  );
};

export default HeaderNotice;
