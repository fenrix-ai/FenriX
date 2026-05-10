import { team } from '../data/team'
import { TeamCard } from '../components/TeamCard'

export function Team() {
  return (
    <section id="team" className="container-page py-24 md:py-32" aria-labelledby="team-title">
      <div className="mb-12">
        <div className="font-mono text-[10px] tracking-widest uppercase text-cyan-soft mb-3">
          Team
        </div>
        <h2 id="team-title" className="font-display font-bold text-3xl md:text-5xl tracking-tightish">
          Built by students. Advised by faculty.
        </h2>
        <p className="mt-3 text-ink-dim">Chapman University · 2026 cohort</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {team.map(m => (
          <TeamCard key={m.name} member={m} />
        ))}
      </div>
    </section>
  )
}
