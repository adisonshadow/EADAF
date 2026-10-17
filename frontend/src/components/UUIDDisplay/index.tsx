import React, { useState } from 'react';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { copyTextToClipboard } from '@/utils/clipboard';

interface UUIDDisplayProps {
  uuid: string;
  style?: React.CSSProperties;
}

const UUIDDisplay: React.FC<UUIDDisplayProps> = ({ uuid, style }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void copyTextToClipboard(uuid).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  const displayText = uuid ? `${uuid.slice(0, 3)}...${uuid.slice(-2)}` : '';

  return (
    <Tooltip title={uuid}>
      <span
        style={{
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          ...style,
        }}
        onClick={handleCopy}
      >
        {displayText}
        {copied ? (
          <CheckOutlined style={{ fontSize: 12, color: '#52c41a' }} />
        ) : (
          <CopyOutlined style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }} />
        )}
      </span>
    </Tooltip>
  );
};

export default UUIDDisplay;
