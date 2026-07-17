import type { ReactNode } from 'react';

export const TickerBar = ({ tag, children }: { tag: string; children: ReactNode }) => (
  <div className="ticker"><span className="tag">{tag}</span><span>{children}</span></div>
);
