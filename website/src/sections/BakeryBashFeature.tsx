import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'

const steps = [
  { n: '01', title: 'Pick strategy', body: 'Set prices, ad budget, staff levels.' },
  { n: '02', title: 'Run the round', body: 'Customers walk the plaza. Money moves.' },
  { n: '03', title: 'See results', body: 'Read the scoreboard. Adjust. Run it back.' }
]

export function BakeryBashFeature() {
  return (
    <section
      className="border-y border-white/5 bg-gradient-to-b from-bg to-surface/40"
      aria-labelledby="bb-feature-title"
    >
      <div className="container-page py-24 md:py-32">
        <div className="grid gap-12 md:grid-cols-[1.1fr_1fr] items-center">
          <div className="relative aspect-[4/3] rounded-xl border border-white/10 bg-surface overflow-hidden shadow-2xl shadow-cyan/5">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan/10 via-transparent to-coral/10" />
            <div className="absolute top-0 left-0 right-0 h-8 bg-bg/80 border-b border-white/5 flex items-center gap-1.5 px-3">
              <span className="w-2.5 h-2.5 rounded-full bg-coral/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-success/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-cyan/70" />
              <span className="ml-3 font-mono text-[10px] text-ink-dim">bakery-bash · round 3 · 02:14 left</span>
            </div>
            <div className="absolute inset-0 pt-8 grid grid-cols-2 gap-3 p-4 text-[10px] font-mono">
              <div className="rounded border border-white/8 bg-surface-raised p-3">
                <div className="text-ink-dim mb-1 tracking-widest uppercase">Revenue</div>
                <div className="text-cyan font-display text-2xl">$5,400</div>
                <div className="text-success mt-1">+18% vs last round</div>
              </div>
              <div className="rounded border border-white/8 bg-surface-raised p-3">
                <div className="text-ink-dim mb-1 tracking-widest uppercase">Customers</div>
                <div className="text-ink font-display text-2xl">843</div>
                <div className="text-coral mt-1">−4% vs forecast</div>
              </div>
              <div className="col-span-2 rounded border border-white/8 bg-surface-raised p-3">
                <div className="text-ink-dim mb-2 tracking-widest uppercase">Leaderboard</div>
                <div className="space-y-1">
                  <div className="flex justify-between"><span className="text-cyan">★ sofia_v</span><span>$4,870</span></div>
                  <div className="flex justify-between"><span>kavin.r</span><span>$4,210</span></div>
                  <div className="flex justify-between"><span>mia.t</span><span>$3,540</span></div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="font-mono text-[10px] tracking-widest uppercase text-coral mb-3">
              Featured
            </div>
            <h2 id="bb-feature-title" className="font-display font-bold text-3xl md:text-5xl tracking-tightish">
              Bakery Bash.
            </h2>
            <p className="mt-4 text-lg text-ink-dim leading-relaxed">
              Run a competing bakery in a shared plaza. Five rounds. Real-time
              leaderboard. Real-time regret.
            </p>
            <ul className="mt-8 space-y-3 text-ink">
              <li className="flex items-start gap-3"><span className="text-cyan font-mono text-sm mt-1">→</span> Five rounds of pricing, ads, and hiring decisions</li>
              <li className="flex items-start gap-3"><span className="text-cyan font-mono text-sm mt-1">→</span> Compete head-to-head with your classmates</li>
              <li className="flex items-start gap-3"><span className="text-cyan font-mono text-sm mt-1">→</span> Live leaderboard, post-round analytics</li>
            </ul>
            <Link
              to="/demo/bakery-bash"
              className="mt-8 inline-flex items-center gap-2 px-5 py-3 rounded-md bg-coral text-bg font-medium hover:bg-coral/80 transition-colors"
            >
              <Play size={16} /> Play the demo
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-px bg-white/5 border border-white/5 rounded-xl overflow-hidden md:grid-cols-3">
          {steps.map(s => (
            <div key={s.n} className="bg-bg p-8">
              <div className="font-mono text-xs text-cyan-soft">{s.n}</div>
              <div className="mt-2 font-display text-xl">{s.title}</div>
              <p className="mt-1 text-sm text-ink-dim">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
