import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createRandomId } from '../utils/createRandomId';

export interface ChatReferenceItem {
  id: string;
  type: string;
  label: string;
  content: unknown;
}

export interface AddReferenceParams {
  type: string;
  label: string;
  content: unknown;
  /** 为 true 时，添加前先移除同 type 的已有引用 */
  unique?: boolean;
}

export interface ChatReferenceContextValue {
  references: ChatReferenceItem[];
  addReference: (params: AddReferenceParams) => void;
  removeReference: (id: string) => void;
  clearReferences: () => void;
}

const ChatReferenceContext = createContext<ChatReferenceContextValue | null>(null);

function createReferenceId(type: string) {
  return `${type}-${createRandomId()}`;
}

export interface ChatReferenceProviderProps {
  children: ReactNode;
}

export function ChatReferenceProvider({ children }: ChatReferenceProviderProps) {
  const [references, setReferences] = useState<ChatReferenceItem[]>([]);

  const addReference = useCallback(({ type, label, content, unique }: AddReferenceParams) => {
    setReferences((prev) => {
      const next = unique ? prev.filter((item) => item.type !== type) : prev;
      return [...next, { id: createReferenceId(type), type, label, content }];
    });
  }, []);

  const removeReference = useCallback((id: string) => {
    setReferences((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearReferences = useCallback(() => {
    setReferences([]);
  }, []);

  const value = useMemo(
    () => ({ references, addReference, removeReference, clearReferences }),
    [references, addReference, removeReference, clearReferences],
  );

  return <ChatReferenceContext.Provider value={value}>{children}</ChatReferenceContext.Provider>;
}

export function useChatReference(): ChatReferenceContextValue {
  const ctx = useContext(ChatReferenceContext);
  if (!ctx) {
    throw new Error('useChatReference must be used within ChatReferenceProvider');
  }
  return ctx;
}
