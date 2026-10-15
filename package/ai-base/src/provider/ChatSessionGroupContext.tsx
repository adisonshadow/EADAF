import { createContext, useContext, type ReactNode } from 'react';

const ChatSessionGroupContext = createContext<string>('global');

export interface ChatSessionGroupProviderProps {
  /** 会话分组 ID，同组页面共享会话（如 business_data） */
  groupId: string;
  children: ReactNode;
}

export function ChatSessionGroupProvider({ groupId, children }: ChatSessionGroupProviderProps) {
  return (
    <ChatSessionGroupContext.Provider value={groupId}>{children}</ChatSessionGroupContext.Provider>
  );
}

export function useChatSessionGroupId(): string {
  return useContext(ChatSessionGroupContext);
}
