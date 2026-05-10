const stats = [
  { value: '4', label: 'Active projects' },
  { value: '8', label: 'Contributors' },
  { value: '1', label: 'University' }
]

export function Mission() {
  return (
    <section id="about" className="container-page py-24 md:py-32" aria-labelledby="mission-title">
      <div className="grid gap-12 md:grid-cols-[1fr_1fr] items-start">
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-cyan-soft mb-4">
            Mission
          </div>
          <h2 id="mission-title" className="font-display font-bold text-3xl md:text-5xl tracking-tightish leading-tight">
            Mythic build.<br />Modern minds.
          </h2>
        </div>
        <div className="space-y-5 text-lg text-ink-dim leading-relaxed">
          <p>
            <span className="text-ink font-medium">FenriX</span> takes its name from{' '}
            <span className="text-ink">Fenrir</span>, the great wolf of Norse myth, fused with{' '}
            <span className="text-ink">AI</span>. We believe the fastest way to learn a
            decision is to live with the consequences of making it.
          </p>
          <p>
            We design competitive simulations that turn coursework into strategy —
            economics into a marketplace, sports analytics into a war room, debate into
            an arena. Students play. The math sticks.
          </p>
        </div>
      </div>

      <div className="mt-16 grid grid-cols-3 gap-px bg-white/5 border border-white/5 rounded-xl overflow-hidden">
        {stats.map(s => (
          <div key={s.label} className="bg-bg p-6 md:p-10 text-center">
            <div className="font-display font-bold text-5xl md:text-6xl text-cyan tracking-tightish">{s.value}</div>
            <div className="mt-2 font-mono text-[10px] tracking-widest uppercase text-ink-dim">{s.label}</div>
          </div>
        ))}
      </div>

      <blockquote className="mt-16 border-l-2 border-cyan pl-6 max-w-2xl">
        <p className="font-display text-2xl md:text-3xl tracking-tightish">"Do the Hard Things."</p>
        <footer className="mt-3 text-sm text-ink-dim">— Prof. Tim Frenzel, Faculty Advisor</footer>
      </blockquote>
    </section>
  )
}
