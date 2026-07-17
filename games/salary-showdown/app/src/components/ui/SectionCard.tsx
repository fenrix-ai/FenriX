import { useState, type ReactNode } from 'react';

export function SectionCard({ num, title, status, children, defaultOpen = true }: {
  num: number; title: string; status: string; children: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="section">
      <header onClick={() => setOpen((o) => !o)}>
        <span className="num">{num}</span>
        <span className="title">{title}</span>
        <span className="status">{status} {open ? '' : '· tap to expand'}</span>
      </header>
      {open && <div className="body">{children}</div>}
    </section>
  );
}
