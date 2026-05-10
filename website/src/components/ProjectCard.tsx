import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatusPill } from './StatusPill'
import type { Project } from '../data/projects'

type Props = { project: Project; featured?: boolean }

export function ProjectCard({ project, featured = false }: Props) {
  const wrapperCls = `block h-full ${featured ? 'md:col-span-3' : ''}`
  const inner = (
    <article
      className="group relative h-full overflow-hidden rounded-xl border border-white/8 bg-surface p-6 md:p-8 transition-all duration-300 hover:-translate-y-1 hover:border-cyan/40 hover:bg-surface-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <StatusPill status={project.status} />
        <span className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">
          {project.domain}
        </span>
      </div>
      <div className={featured ? 'md:flex md:items-end md:justify-between md:gap-12' : ''}>
        <div>
          <h3
            className={`mt-6 font-display font-bold tracking-tightish ${
              featured ? 'text-4xl md:text-6xl' : 'text-2xl md:text-3xl'
            }`}
          >
            {project.name}
          </h3>
          <p className={`mt-3 text-ink-dim leading-relaxed ${featured ? 'text-lg max-w-xl' : 'text-sm'}`}>
            {project.tagline}
          </p>
        </div>
        {featured && (
          <p className="mt-3 md:mt-0 md:max-w-sm md:text-right text-ink-dim text-sm leading-relaxed">
            {project.description}
          </p>
        )}
      </div>
      {project.href && (
        <span className="mt-6 inline-flex items-center gap-1.5 font-medium text-cyan group-hover:text-cyan-soft transition-colors">
          View demo <ArrowUpRight size={14} />
        </span>
      )}
    </article>
  )
  return project.href
    ? <Link to={project.href} className={wrapperCls}>{inner}</Link>
    : <div className={wrapperCls}>{inner}</div>
}
