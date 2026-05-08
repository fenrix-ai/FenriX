import { ArrowRight } from 'lucide-react'
import { Logo } from '../components/Logo'

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-white/5"
      aria-labelledby="hero-title"
    >
      {/* Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 80% 10%, rgba(0,153,255,0.18), transparent 60%), radial-gradient(ellipse 40% 30% at 0% 80%, rgba(255,107,74,0.10), transparent 60%)'
        }}
      />
      {/* Grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '64px 64px'
        }}
      />

      <div className="container-page relative pt-28 pb-24 md:pt-36 md:pb-32 grid gap-16 md:grid-cols-[1.4fr_1fr] items-center">
        <div>
          <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full bg-success/10 text-success border border-success/20">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Now playtesting — Bakery Bash
          </span>
          <h1
            id="hero-title"
            className="mt-6 font-display font-bold text-5xl md:text-7xl leading-[0.95] tracking-tighter2"
          >
            We're gamifying the classroom.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-dim leading-relaxed">
            FenriX is a student-run AI studio at Chapman University, building
            competitive analytics games that teach by playing them.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href="#work"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-cyan text-bg font-medium hover:bg-cyan-soft transition-colors"
            >
              See our work <ArrowRight size={16} />
            </a>
            <a
              href="#contact"
              className="inline-flex items-center px-5 py-3 rounded-md border border-white/15 text-ink hover:bg-white/5 transition-colors"
            >
              Get in touch
            </a>
          </div>
        </div>
        <div className="hidden md:flex justify-end">
          <Logo size={280} className="drop-shadow-[0_0_60px_rgba(0,153,255,0.15)]" />
        </div>
      </div>
    </section>
  )
}
