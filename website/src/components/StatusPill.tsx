type Status = 'live' | 'in-development' | 'concept'
type Props = { status: Status; className?: string }

const config: Record<Status, { label: string; dot: string; bg: string; fg: string; border: string }> = {
  live:             { label: 'LIVE',           dot: 'bg-success', bg: 'bg-success/10', fg: 'text-success',   border: 'border-success/20' },
  'in-development': { label: 'IN DEVELOPMENT', dot: 'bg-cyan',    bg: 'bg-cyan/10',    fg: 'text-cyan-soft', border: 'border-cyan/20' },
  concept:          { label: 'CONCEPT',        dot: 'bg-coral',   bg: 'bg-coral/10',   fg: 'text-coral',     border: 'border-coral/20' }
}

export function StatusPill({ status, className = '' }: Props) {
  const c = config[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-widest uppercase px-2 py-1 rounded border ${c.bg} ${c.fg} ${c.border} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}
