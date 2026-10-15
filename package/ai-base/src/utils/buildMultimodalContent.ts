import type { Attachment } from '@ant-design/x/es/attachments';
import {
  isTextLikeDocument,
  resolveFileModality,
} from './modelAttachmentConfig';

export type MultimodalContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'input_audio'; input_audio: { data: string; format: string } };

export type ChatMessageContent = string | MultimodalContentPart[];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsText(file);
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return readFileAsDataUrl(file).then((dataUrl) => {
    const comma = dataUrl.indexOf(',');
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  });
}

function audioFormatFromMime(mime: string): string {
  const sub = mime.split('/')[1] || 'wav';
  if (sub.includes('mpeg') || sub === 'mp3') return 'mp3';
  if (sub.includes('wav')) return 'wav';
  if (sub.includes('ogg')) return 'ogg';
  return sub;
}

export interface ChatAttachmentMeta {
  uid: string;
  name: string;
  mimeType?: string;
  modality?: string;
}

export async function buildMultimodalUserContent(
  text: string,
  attachments: Attachment[],
  inputTags?: string[],
): Promise<{ content: ChatMessageContent; attachmentMeta: ChatAttachmentMeta[] }> {
  const trimmedText = text.trim();
  const parts: MultimodalContentPart[] = [];
  const attachmentMeta: ChatAttachmentMeta[] = [];

  if (trimmedText) {
    parts.push({ type: 'text', text: trimmedText });
  }

  for (const item of attachments) {
    const file = item.originFileObj as File | undefined;
    if (!file) continue;

    const modality = resolveFileModality(file, inputTags);
    if (!modality) continue;

    attachmentMeta.push({
      uid: item.uid,
      name: file.name,
      mimeType: file.type,
      modality,
    });

    if (modality === 'image') {
      const url = await readFileAsDataUrl(file);
      parts.push({ type: 'image_url', image_url: { url } });
      continue;
    }

    if (modality === 'audio') {
      const data = await readFileAsBase64(file);
      parts.push({
        type: 'input_audio',
        input_audio: { data, format: audioFormatFromMime(file.type) },
      });
      continue;
    }

    if (modality === 'video') {
      parts.push({
        type: 'text',
        text: `[视频附件: ${file.name}，大小 ${Math.ceil(file.size / 1024)}KB — 当前网关暂未直接传输视频流，请改用文本描述或截图]`,
      });
      continue;
    }

    if (modality === 'file') {
      if (isTextLikeDocument(file)) {
        const docText = await readFileAsText(file);
        parts.push({
          type: 'text',
          text: `[文档附件: ${file.name}]\n${docText}`,
        });
      } else {
        parts.push({
          type: 'text',
          text: `[文档附件: ${file.name}（${file.type || '未知类型'}，${Math.ceil(file.size / 1024)}KB）— 请将文档正文粘贴为文本，或上传 txt/md/csv 等文本格式]`,
        });
      }
    }
  }

  if (!parts.length) {
    return { content: trimmedText, attachmentMeta };
  }

  if (parts.length === 1 && parts[0].type === 'text') {
    return { content: parts[0].text, attachmentMeta };
  }

  return { content: parts, attachmentMeta };
}

export function formatUserDisplayWithAttachments(
  text: string,
  attachmentMeta?: ChatAttachmentMeta[],
): string {
  if (!attachmentMeta?.length) return text;
  const names = attachmentMeta.map((item) => item.name).join('、');
  const prefix = `[附件: ${names}]`;
  return text ? `${prefix}\n${text}` : prefix;
}
