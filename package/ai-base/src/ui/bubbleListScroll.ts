import type { RefObject } from 'react';
import type { BubbleListRef } from '@ant-design/x/es/bubble/interface';

function isScrollBoxReady(listRef: RefObject<BubbleListRef | null>): listRef is RefObject<BubbleListRef> {
  return !!listRef.current?.scrollBoxNativeElement;
}

/** Bubble.List 挂载/更新后滚动到底部（含外部 sendMockUserMessage 首条消息场景） */
export function scrollBubbleListToBottom(
  listRef: RefObject<BubbleListRef | null>,
  behavior: ScrollBehavior = 'smooth',
  maxAttempts = 20,
) {
  const tryScroll = (attempt: number) => {
    if (isScrollBoxReady(listRef)) {
      try {
        listRef.current.scrollTo({ top: 'bottom', behavior });
      } catch {
        const scrollBox = listRef.current.scrollBoxNativeElement;
        scrollBox.scrollTo({ top: scrollBox.scrollHeight, behavior });
      }
      return;
    }
    if (attempt < maxAttempts) {
      requestAnimationFrame(() => tryScroll(attempt + 1));
    }
  };
  tryScroll(0);
}
