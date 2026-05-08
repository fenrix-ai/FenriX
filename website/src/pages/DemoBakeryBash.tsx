import { Link } from 'react-router-dom'

export function DemoBakeryBash() {
  return (
    <main className="min-h-screen container-page py-16">
      <Link to="/" className="text-ink-dim hover:text-cyan">← Back to FenriX</Link>
      <h1 className="font-display text-5xl mt-8">
        Bakery Bash demo <span className="text-ink-dim text-2xl">(placeholder)</span>
      </h1>
    </main>
  )
}
