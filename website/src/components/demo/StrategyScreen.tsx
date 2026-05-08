import { useState } from 'react'
import { Plus, Minus } from 'lucide-react'

export function StrategyScreen() {
  const [price, setPrice] = useState(6.5)
  const [adSpend, setAdSpend] = useState(400)
  const [staff, setStaff] = useState(3)

  const demand = Math.round(800 + adSpend * 0.4 - (price - 5) * 60)
  const revenue = Math.round(demand * price)
  const margin = Math.max(0, Math.round((price - 2.4) / price * 100))

  return (
    <div className="space-y-8">
      <header>
        <div className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">Round 2 / 5 · Strategy</div>
        <h2 className="mt-1 font-display font-bold text-2xl">Set your plan.</h2>
        <p className="text-ink-dim text-sm mt-1">All inputs are local — nothing is saved.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Slider label="Croissant price" min={3} max={12} step={0.25} value={price} onChange={setPrice} format={v => `$${v.toFixed(2)}`} />
        <Slider label="Ad spend" min={0} max={2000} step={50} value={adSpend} onChange={setAdSpend} format={v => `$${v.toLocaleString()}`} />
      </div>

      <div className="rounded-lg border border-white/8 bg-bg p-5 flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">Bakers on shift</div>
          <div className="mt-1 font-display text-3xl">{staff}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setStaff(s => Math.max(1, s - 1))} className="w-9 h-9 rounded-md border border-white/10 hover:bg-white/5 inline-flex items-center justify-center" aria-label="Hire one fewer baker"><Minus size={14} /></button>
          <button onClick={() => setStaff(s => Math.min(8, s + 1))} className="w-9 h-9 rounded-md border border-white/10 hover:bg-white/5 inline-flex items-center justify-center" aria-label="Hire one more baker"><Plus size={14} /></button>
        </div>
      </div>

      <div className="rounded-lg bg-cyan/5 border border-cyan/15 p-5">
        <div className="font-mono text-[10px] tracking-widest uppercase text-cyan-soft">Forecast</div>
        <div className="mt-2 grid grid-cols-3 gap-4 text-center">
          <Stat label="Demand" value={demand.toString()} />
          <Stat label="Revenue" value={`$${revenue.toLocaleString()}`} />
          <Stat label="Margin" value={`${margin}%`} />
        </div>
      </div>

      <button className="px-6 py-3 rounded-md bg-cyan/40 text-bg font-medium cursor-not-allowed opacity-60" disabled>
        Submit (demo — disabled)
      </button>
    </div>
  )
}

function Slider({ label, min, max, step, value, onChange, format }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; format: (v: number) => string
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-bg p-5">
      <div className="flex items-baseline justify-between">
        <label className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">{label}</label>
        <span className="font-display text-2xl text-cyan">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="mt-4 w-full accent-cyan"
        aria-label={label}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-display text-2xl">{value}</div>
      <div className="mt-1 font-mono text-[10px] tracking-widest uppercase text-ink-dim">{label}</div>
    </div>
  )
}
