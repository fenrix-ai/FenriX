import { demoPlayers } from '../../data/demo-fixtures'

const statusStyles = {
  ready:     { dot: 'bg-ink-dim',           label: 'Ready'      },
  thinking:  { dot: 'bg-cyan animate-pulse', label: 'Thinking…'  },
  submitted: { dot: 'bg-success',           label: 'Submitted'  }
} as const

export function LobbyScreen() {
  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">Round 1 / 5</div>
          <h2 className="mt-1 font-display font-bold text-2xl">Bidding closed.</h2>
        </div>
        <div className="font-mono text-cyan-soft text-sm">⏱ 02:14 to next round</div>
      </header>

      <div className="rounded-lg border border-white/8 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-ink-dim font-mono text-[10px] tracking-widest uppercase">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Player</th>
              <th className="text-left px-4 py-3 font-medium">Bakery</th>
              <th className="text-right px-4 py-3 font-medium">Cash</th>
              <th className="text-right px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {demoPlayers.map((p, i) => {
              const s = statusStyles[p.status]
              return (
                <tr key={p.id} className={i % 2 ? 'bg-bg' : 'bg-surface'}>
                  <td className="px-4 py-3 font-mono text-ink">{p.handle}</td>
                  <td className="px-4 py-3">{p.bakery}</td>
                  <td className="px-4 py-3 text-right font-mono">${p.cash.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      <span className="text-ink-dim">{s.label}</span>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
