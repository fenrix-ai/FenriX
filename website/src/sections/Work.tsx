import { projects } from '../data/projects'
import { ProjectCard } from '../components/ProjectCard'

export function Work() {
  const [featured, ...rest] = projects
  return (
    <section id="work" className="container-page py-24 md:py-32" aria-labelledby="work-title">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-cyan-soft mb-3">
            Selected work
          </div>
          <h2 id="work-title" className="font-display font-bold text-3xl md:text-5xl tracking-tightish">
            Four projects in flight.
          </h2>
        </div>
        <p className="text-ink-dim max-w-xs md:text-right">
          One classroom at a time. Ship, watch students play, fix what hurts.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-3 auto-rows-fr">
        <ProjectCard project={featured!} featured />
        {rest.map(p => (
          <ProjectCard key={p.slug} project={p} />
        ))}
      </div>
    </section>
  )
}
