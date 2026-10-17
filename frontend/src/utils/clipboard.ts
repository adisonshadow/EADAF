/**
 * 复制文本到剪贴板。
 *
 * 为什么需要兜底：`navigator.clipboard` 只在**安全上下文**（https 或 localhost）可用。
 * 内部部署常见用 `http://192.168.x.x:29527` 访问管理端，此时 `navigator.clipboard` 是
 * `undefined`，直接 `navigator.clipboard?.writeText(...)` 会拿到 undefined 再 `.then` 抛错，
 * 表现为「点了复制没反应」。这里统一走 Clipboard API + 隐藏 textarea 双通道。
 *
 * @returns 是否复制成功（失败时调用方应提示用户手动复制）
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? '');
  if (!value) return false;

  // 1) 安全上下文：用标准 Clipboard API
  try {
    if (
      typeof navigator !== 'undefined'
      && typeof window !== 'undefined'
      && window.isSecureContext
      && navigator.clipboard?.writeText
    ) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* 权限被拒 / 文档未聚焦：继续走兜底 */
  }

  // 2) 非安全上下文兜底：隐藏 textarea + execCommand('copy')
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    textarea.style.padding = '0';
    textarea.style.border = 'none';
    textarea.style.outline = 'none';
    textarea.style.boxShadow = 'none';
    textarea.style.background = 'transparent';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';

    document.body.appendChild(textarea);
    const selection = document.getSelection();
    const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.select();
    textarea.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (selection) {
      selection.removeAllRanges();
      if (previousRange) selection.addRange(previousRange);
    }
    return ok;
  } catch {
    return false;
  }
}
