import React from 'react';
import { message } from '@/utils/antdAppApis';
import { copyTextToClipboard } from '@/utils/clipboard';
import './EntityCodeChip.css';

interface EntityCodeChipProps {
  code?: string;
}

function splitEntityCode(code: string): { prefix: string; leaf: string } {
  const parts = code.split(':').filter(Boolean);
  if (parts.length <= 1) {
    return { prefix: '', leaf: code || '' };
  }
  return {
    prefix: `${parts.slice(0, -1).join(':')}:`,
    leaf: parts[parts.length - 1],
  };
}

const EntityCodeChip: React.FC<EntityCodeChipProps> = ({ code }) => {
  const fullCode = (code || '').trim();
  const { prefix, leaf } = splitEntityCode(fullCode);

  if (!fullCode) return null;

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(fullCode);
    if (ok) message.success('复制成功');
    else message.error('复制失败，请检查浏览器剪贴板权限');
  };

  return (
    <span
      className="entity-code-chip"
      role="button"
      tabIndex={0}
      title={fullCode}
      aria-label={`实体 Code ${fullCode}，点击复制`}
      onClick={handleCopy}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void handleCopy();
        }
      }}
    >
      {prefix ? (
        <span className="entity-code-chip__prefix" aria-hidden={!prefix}>
          <span className="entity-code-chip__prefix-inner">{prefix}</span>
        </span>
      ) : null}
      <span className="entity-code-chip__leaf">{leaf}</span>
    </span>
  );
};

export default EntityCodeChip;
