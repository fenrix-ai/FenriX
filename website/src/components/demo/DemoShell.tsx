import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export type DemoTab = 'lobby' | 'strategy' | 'results' | 'leaderboard'

const TABS: { id: DemoTab; label: string }[] = [
  { id: 'lobby',       label: '01 · Lobby' },
  { id: 'strategy',    label: '02 · Strategy' },
  { id: 'results',     label: '03 · Round Results' },
  { id: 'leaderboard', label: '04 · Leaderboard' }
]

type Props = { screens: Record<DemoTab, ReactNode> }

export function DemoShell({ screens }: Props) {
  const [tab, setTab] = useState<DemoTab>('lobby')
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-bg/85 backdrop-blur-md">
        <div className="container-page flex items-center justify-between h-14">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-ink-dim hover:text-ink">
            <ArrowLeft size={14} /> Back to FenriX
          </Link>
          <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 rounded-full bg-coral/10 text-coral border border-coral/20">
            <span className="w-1.5 h-1.5 rounded-full bg-coral animate-pulse" />
            DEMO · NOT PLAYABLE · v1.0
          </span>
        </div>
      </header>

      <div className="container-page grid gap-6 md:grid-cols-[200px_1fr] py-8">
        <nav aria-label="Demo screens" className="md:sticky md:top-20 self-start">
          <ul className="flex md:block gap-2 md:gap-0 md:space-y-1 overflow-x-auto md:overflow-visible">
            {TABS.map(t => (
              <li key={t.id}>
                <button
                  onClick={() => setTab(t.id)}
                  className={`block w-full text-left whitespace-nowrap px-3 py-2 rounded-md font-mono text-xs tracking-wider ${
                    tab === t.id
                      ? 'bg-cyan/15 text-cyan border border-cyan/30'
                      : 'text-ink-dim hover:text-ink hover:bg-white/5 border border-transparent'
                  }`}
                  aria-current={tab === t.id ? 'page' : undefined}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <main className="rounded-xl border border-white/8 bg-surface p-6 md:p-8 min-h-[600px]">
          {screens[tab]}
        </main>
      </div>
    </div>
  )
}
