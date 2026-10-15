/** JSON 预览文本；JSON.stringify(undefined) 为 undefined，须兜底以免 .length 崩溃 */
export function payloadToPreviewText(payload: unknown, previewLines?: number): string {
  let text: string;
  try {
    const serialized = JSON.stringify(payload, null, 2);
    text = serialized ?? String(payload);
  } catch {
    text = String(payload);
  }
  if (text.length > 4000) text = `${text.slice(0, 3999)}…`;
  if (typeof previewLines === 'number' && previewLines > 0) {
    const lines = text.split('\n');
    if (lines.length > previewLines) {
      text = `${lines.slice(0, previewLines).join('\n')}\n…`;
    }
  }
  return text;
}
