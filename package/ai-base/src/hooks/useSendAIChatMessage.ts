import { useCallback } from 'react';
import { sendMockUserMessage } from '../utils/aiChatBridge';

/** @deprecated 请优先使用 sendMockUserMessage */
export function useSendAIChatMessage() {
  return useCallback((text: string) => {
    sendMockUserMessage(text);
  }, []);
}
