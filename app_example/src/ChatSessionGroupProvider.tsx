import { ChatSessionGroupProvider as BaseChatSessionGroupProvider } from '@eadaf/ai-base';
import { useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

function resolveChatSessionGroupFromPathname(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (!segments.length) return 'default';
  return segments[0];
}

export function ChatSessionGroupProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const groupId = useMemo(() => resolveChatSessionGroupFromPathname(pathname), [pathname]);
  return <BaseChatSessionGroupProvider groupId={groupId}>{children}</BaseChatSessionGroupProvider>;
}
