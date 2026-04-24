import { useEffect, useState } from 'react'
import { SCENE } from './scene-geometry'

interface Wisp {
  id: number
  x: number
}

let wispIdCounter = 0

/**
 * Oven steam FX — spawns 1-2 wisps every 3-5 seconds from the top of the oven.
 * Each wisp is a CSS-animated DOM element that fades up and dissipates.
 */
export function FxLayer() {
  const [wisps, setWisps] = useState<Wisp[]>([])

  useEffect(() => {
    let cancelled = false
    const schedule = () => {
      if (cancelled) return
      const delayMs = 3000 + Math.random() * 2000
      setTimeout(() => {
        if (cancelled) return
        const count = 1 + Math.floor(Math.random() * 2) // 1 or 2 wisps
        const newWisps: Wisp[] = []
        for (let i = 0; i < count; i++) {
          newWisps.push({
            id: wispIdCounter++,
            x: 210 + Math.random() * 40,
          })
        }
        setWisps((prev) => [...prev, ...newWisps])
        setTimeout(() => {
          if (cancelled) return
          setWisps((prev) => prev.filter((w) => !newWisps.includes(w)))
        }, 1400)
        schedule()
      }, delayMs)
    }
    schedule()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {wisps.map((w) => (
        <div
          key={w.id}
          className="oven-steam"
          style={{ left: `${w.x}px`, top: `${SCENE.zones.midBand.y + 18}px` }}
        />
      ))}
    </div>
  )
}
