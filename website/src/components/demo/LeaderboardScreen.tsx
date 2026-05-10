import { useState } from 'react'
import { demoLeaderboard } from '../../data/demo-fixtures'
import { ChevronDown, ChevronUp } from 'lucide-react'

type SortKey = 'rank' | 'netProfit'

export function LeaderboardScreen() {
  const [sort, setSort] = useState<SortKey>('rank')
  const sorted = [...demoLeaderboard].sort((a, b) =>
    sort === 'netProfit' ? b.netProfit - a.netProfit : a.rank - b.rank
  )
  return (
    <div className="space-y-6">
      <header>
        <div className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">Final · 5 / 5</div>
        <h2 className="mt-1 font-display font-bold text-2xl">Leaderboard.</h2>
      </header>

      <div className="rounded-lg border border-white/8 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-ink-dim font-mono text-[10px] tracking-widest uppercase">
            <tr>
              <th className="text-left px-4 py-3">
                <button onClick={() => setSort('rank')} className="inline-flex items-center gap-1 hover:text-ink">
                  Rank {sort === 'rank' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                </button>
              </th>
              <th className="text-left px-4 py-3">Player</th>
              <th className="text-left px-4 py-3">Bakery</th>
              <th className="text-right px-4 py-3">
                <button onClick={() => setSort('netProfit')} className="inline-flex items-center gap-1 hover:text-ink">
                  Net profit {sort === 'netProfit' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.player} className={`${i % 2 ? 'bg-bg' : 'bg-surface'} ${row.rank === 1 ? 'ring-1 ring-inset ring-cyan/30' : ''}`}>
                <td className="px-4 py-3 font-mono">
                  {row.rank === 1 && <span className="text-cyan mr-1">★</span>}
                  {row.rank}
                </td>
                <td className="px-4 py-3 font-mono">{row.player}</td>
                <td className="px-4 py-3">{row.bakery}</td>
                <td className={`px-4 py-3 text-right font-mono ${row.netProfit >= 0 ? 'text-success' : 'text-coral'}`}>
                  {row.netProfit >= 0 ? '+' : ''}${row.netProfit.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
