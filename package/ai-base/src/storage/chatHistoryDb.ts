import type { ConversationItemType } from '@ant-design/x';
import type { MessageInfo } from '@ant-design/x-sdk';
import type { AssistantSegment, ChatToolStep } from '../chat/chatToolSteps';
import type { EADAFChatMessage } from '../chat/EADAFChatProvider';

const DB_NAME = 'eadaf-aibase-chat';
const DB_VERSION = 1;
const META_STORE = 'meta';
const MESSAGES_STORE = 'messages';

export interface ChatStorageMeta {
  conversations: ConversationItemType[];
  activeConversationKey: string;
}

export interface PersistedChatMessage {
  id: string;
  status: string;
  message: EADAFChatMessage & {
    reasoningContent?: string;
    toolSteps?: ChatToolStep[];
  };
}

interface MetaRecord extends ChatStorageMeta {
  namespace: string;
  updatedAt: number;
}

interface MessagesRecord {
  id: string;
  namespace: string;
  conversationKey: string;
  messages: PersistedChatMessage[];
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'namespace' });
        }
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    });
  }
  return dbPromise;
}

function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = runner(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      }),
  );
}

function messagesRecordId(namespace: string, conversationKey: string): string {
  return `${namespace}::${conversationKey}`;
}

export function getChatStorageNamespace(config: {
  applicationId?: string;
  scopeSlug?: string;
  /** 路由大类会话分组，优先于 scopeSlug（如 business_data、api_services） */
  sessionGroupId?: string;
}): string {
  const app = config.applicationId || 'default-app';
  const group = config.sessionGroupId || config.scopeSlug || 'global';
  return `${app}::${group}`;
}

export async function loadChatMeta(namespace: string): Promise<ChatStorageMeta | null> {
  try {
    const record = (await runTransaction<MetaRecord | undefined>(
      META_STORE,
      'readonly',
      (store) => store.get(namespace),
    )) as MetaRecord | undefined;
    if (!record?.conversations?.length || !record.activeConversationKey) {
      return null;
    }
    return {
      conversations: record.conversations,
      activeConversationKey: record.activeConversationKey,
    };
  } catch {
    return null;
  }
}

export async function saveChatMeta(namespace: string, meta: ChatStorageMeta): Promise<void> {
  try {
    const record: MetaRecord = {
      namespace,
      conversations: meta.conversations,
      activeConversationKey: meta.activeConversationKey,
      updatedAt: Date.now(),
    };
    await runTransaction(META_STORE, 'readwrite', (store) => store.put(record));
  } catch (error) {
    console.warn('[chatHistoryDb] saveChatMeta failed:', error);
  }
}

export async function loadConversationMessages(
  namespace: string,
  conversationKey: string,
): Promise<PersistedChatMessage[]> {
  try {
    const record = (await runTransaction<MessagesRecord | undefined>(
      MESSAGES_STORE,
      'readonly',
      (store) => store.get(messagesRecordId(namespace, conversationKey)),
    )) as MessagesRecord | undefined;
    return Array.isArray(record?.messages) ? record.messages : [];
  } catch {
    return [];
  }
}

const PERSISTABLE_STATUSES = new Set(['success', 'error', 'abort', 'local']);

/** 多模态 apiContent：去掉 base64/data URL，保留结构引用，避免 IDB 爆仓且刷新后不完全失明 */
export function sanitizeApiContentForPersist(
  apiContent: EADAFChatMessage['apiContent'],
): EADAFChatMessage['apiContent'] | undefined {
  if (apiContent == null) return undefined;
  if (typeof apiContent === 'string') {
    if (apiContent.startsWith('data:') || apiContent.length > 8_000) {
      return '[附件内容已省略：刷新后请重新上传以供模型查看]';
    }
    return apiContent;
  }
  if (!Array.isArray(apiContent)) return undefined;
  return apiContent.map((part) => {
    if (!part || typeof part !== 'object') return part;
    const row = { ...part } as Record<string, unknown>;
    const imageUrl = row.image_url;
    if (imageUrl && typeof imageUrl === 'object') {
      const img = { ...(imageUrl as Record<string, unknown>) };
      const url = typeof img.url === 'string' ? img.url : '';
      if (url.startsWith('data:') || url.length > 500) {
        img.url = '[omitted:image]';
        row.image_url = img;
      }
    }
    const inputAudio = row.input_audio;
    if (inputAudio && typeof inputAudio === 'object') {
      row.input_audio = { ...(inputAudio as object), data: '[omitted:audio]' };
    }
    if (typeof row.data === 'string' && (row.data.startsWith('data:') || row.data.length > 500)) {
      row.data = '[omitted:binary]';
    }
    return row;
  });
}

function toolStepsFromSegments(segments?: AssistantSegment[]): ChatToolStep[] | undefined {
  if (!segments?.length) return undefined;
  const steps = segments
    .filter((s): s is Extract<AssistantSegment, { kind: 'tool' }> => s.kind === 'tool')
    .map((s) => s.step);
  return steps.length ? steps : undefined;
}

export function sanitizeMessagesForPersist(
  messages: MessageInfo<EADAFChatMessage>[],
): PersistedChatMessage[] {
  return messages
    .filter((item) => PERSISTABLE_STATUSES.has(item.status))
    .filter((item) => item.message.role === 'user' || item.message.role === 'assistant')
    .map((item) => {
      const msg = item.message as EADAFChatMessage & {
        reasoningContent?: string;
        toolSteps?: ChatToolStep[];
        attachments?: EADAFChatMessage['attachments'];
        segments?: AssistantSegment[];
      };
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.attachments) && msg.attachments.length
            ? `[附件: ${msg.attachments.map((a) => a.name).join('、')}]`
            : '[含多模态附件]';
      const toolSteps = msg.toolSteps?.length
        ? msg.toolSteps
        : toolStepsFromSegments(msg.segments);
      const apiContent = sanitizeApiContentForPersist(msg.apiContent);
      return {
        id: String(item.id),
        status: item.status,
        message: {
          role: msg.role,
          content,
          ...(msg.reasoningContent ? { reasoningContent: msg.reasoningContent } : {}),
          ...(toolSteps?.length ? { toolSteps } : {}),
          ...(msg.attachments?.length ? { attachments: msg.attachments } : {}),
          ...(apiContent != null ? { apiContent } : {}),
          ...(msg.segments?.length ? { segments: msg.segments } : {}),
        },
      };
    });
}

export async function saveConversationMessages(
  namespace: string,
  conversationKey: string,
  messages: MessageInfo<EADAFChatMessage>[],
): Promise<void> {
  const sanitized = sanitizeMessagesForPersist(messages);
  if (!sanitized.length) {
    try {
      await runTransaction(MESSAGES_STORE, 'readwrite', (store) =>
        store.delete(messagesRecordId(namespace, conversationKey)),
      );
    } catch (error) {
      console.warn('[chatHistoryDb] deleteConversationMessages failed:', error);
    }
    return;
  }

  try {
    const record: MessagesRecord = {
      id: messagesRecordId(namespace, conversationKey),
      namespace,
      conversationKey,
      messages: sanitized,
      updatedAt: Date.now(),
    };
    await runTransaction(MESSAGES_STORE, 'readwrite', (store) => store.put(record));
  } catch (error) {
    console.warn('[chatHistoryDb] saveConversationMessages failed:', error);
  }
}
