import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, Image as ImageIcon } from 'lucide-react'

/**
 * Bakery Bash preview block.
 *
 * Tries (in order):
 *   /bakery-bash-screenshot.png
 *   /bakery-bash-screenshot.jpg
 *
 * Drop a real screenshot at website/public/bakery-bash-screenshot.png to
 * replace the neutral placeholder. The placeholder intentionally doesn't
 * try to mimic the game UI — it's a quiet "no image yet" slot.
 */
function BakeryBashPreview() {
  const [pngFailed, setPngFailed] = useState(false)
  const [jpgFailed, setJpgFailed] = useState(false)

  if (!pngFailed) {
    return (
      <PreviewFrame>
        <img
          src="/bakery-bash-screenshot.png"
          alt="Bakery Bash gameplay"
          className="w-full h-full object-contain"
          onError={() => setPngFailed(true)}
        />
      </PreviewFrame>
    )
  }

  if (!jpgFailed) {
    return (
      <PreviewFrame>
        <img
          src="/bakery-bash-screenshot.jpg"
          alt="Bakery Bash gameplay"
          className="w-full h-full object-contain"
          onError={() => setJpgFailed(true)}
        />
      </PreviewFrame>
    )
  }

  // Neutral placeholder — does not impersonate the game UI.
  return (
    <PreviewFrame>
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-white/[0.02]">
        <ImageIcon size={28} className="text-ink-dim/60" strokeWidth={1.4} />
        <div className="font-mono text-[10px] tracking-widest uppercase text-ink-dim/70">
          Screenshot coming soon
        </div>
      </div>
    </PreviewFrame>
  )
}

function PreviewFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative aspect-[3/2] rounded-xl border border-white/10 bg-[#FFF5DD] overflow-hidden">
      {children}
    </div>
  )
}

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
          {/*
            Bakery Bash preview slot.
            To use a real screenshot: drop a file at
              website/public/bakery-bash-screenshot.png
            (or .jpg) and the <img> below will pick it up. The placeholder
            block renders only when the image is missing.
          */}
          <BakeryBashPreview />

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
