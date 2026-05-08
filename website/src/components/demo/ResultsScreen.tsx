import { demoWaterfall } from '../../data/demo-fixtures'

export function ResultsScreen() {
  let running = 0
  const bars = demoWaterfall.map((s, i) => {
    const start = running
    running += s.value
    const end = running
    const isTotal = i === demoWaterfall.length - 1
    return { ...s, start, end, isTotal }
  })
  const max = Math.max(...bars.map(b => Math.max(b.start, b.end)))
  const min = Math.min(...bars.map(b => Math.min(b.start, b.end, 0)))
  const range = max - min || 1

  const W = 720
  const H = 320
  const barW = (W - 80) / bars.length - 12
  const y = (v: number) => H - 40 - ((v - min) / range) * (H - 80)

  return (
    <div className="space-y-8">
      <header>
        <div className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">Round 3 / 5 · Results</div>
        <h2 className="mt-1 font-display font-bold text-2xl">Profit waterfall.</h2>
      </header>

      <div className="rounded-lg border border-white/8 bg-bg p-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px] h-auto" aria-label="Profit waterfall chart">
          <line x1="40" x2={W - 20} y1={y(0)} y2={y(0)} stroke="#8b95a3" strokeDasharray="2 4" opacity="0.4" />
          {bars.map((b, i) => {
            const x = 40 + i * (barW + 12)
            const top = y(Math.max(b.start, b.end))
            const height = Math.abs(y(b.start) - y(b.end))
            const fill = b.isTotal ? '#0099ff' : b.value >= 0 ? '#00d18a' : '#ff6b4a'
            return (
              <g key={b.label}>
                <rect x={x} y={top} width={barW} height={Math.max(2, height)} fill={fill} opacity="0.78" rx="2" />
                <text x={x + barW / 2} y={top - 6} textAnchor="middle" fontSize="11" fill="#e7ecf2" fontFamily="JetBrains Mono">
                  {b.value >= 0 ? '+' : ''}{b.value.toLocaleString()}
                </text>
                <text x={x + barW / 2} y={H - 18} textAnchor="middle" fontSize="10" fill="#8b95a3" fontFamily="JetBrains Mono">
                  {b.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <SummaryStat label="Net profit"        value="+$1,350" tone="success" />
        <SummaryStat label="Customers served"  value="843"     tone="ink" />
        <SummaryStat label="Round rank"        value="2 of 8"  tone="cyan" />
      </div>
    </div>
  )
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone: 'success' | 'cyan' | 'ink' }) {
  const color = tone === 'success' ? 'text-success' : tone === 'cyan' ? 'text-cyan' : 'text-ink'
  return (
    <div className="rounded-lg border border-white/8 bg-bg p-5">
      <div className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">{label}</div>
      <div className={`mt-2 font-display text-3xl ${color}`}>{value}</div>
    </div>
  )
}
