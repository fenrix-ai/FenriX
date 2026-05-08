import { Logo } from '../components/Logo'
import { StatusPill } from '../components/StatusPill'

export function Home() {
  return (
    <main id="main">
      <section className="container-page py-32 flex flex-col items-center gap-8">
        <Logo size={140} />
        <div className="flex gap-3">
          <StatusPill status="live" />
          <StatusPill status="in-development" />
          <StatusPill status="concept" />
        </div>
        <h1 className="font-display text-4xl tracking-tightish text-ink-dim">Primitives smoke-test</h1>
      </section>
    </main>
  )
}
