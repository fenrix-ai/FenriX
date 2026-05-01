import { useEffect, useRef, useState } from 'react'
import { SCENE } from './scene-geometry'

/**
 * Apr 30 — Maintenance staff walkers, displayed at the top of the
 * simulation scene IN FRONT of the counter (rendered after
 * CounterFrontLayer in PixelBakeryScene so they overlap the counter
 * graphic).
 *
 * Two roles, alternating by hire order:
 *   - mechanic — carries a wrench (asset: /assets/maintenance/mechanic.svg)
 *   - janitor — carries a mop (asset: /assets/maintenance/janitor.svg)
 *
 * Asset files are pending; the layer falls back to an emoji placeholder
 * if the SVG fails to load so the simulation never renders broken
 * images. Once Kavin's SVGs are dropped at the paths above, the
 * placeholder vanishes automatically.
 */

interface Props {
  /** Number of maintenance staff hired (`pendingDecision.staffCounts.maintenanceGuys`). */
  count: number
}

const WALKER_SIZE = 32
/** Walking band sits at the top of the floor strip, in front of the
 *  counter. The counter spans y=140..180; the walkers sit at y≈148 so
 *  the upper half of their sprite peeks above the counter while their
 *  feet stay below the counter line (z-ordered in front). */
const WALKER_TOP_Y = 144
const WALK_X_MIN = 16
const WALK_X_MAX = 440
const SPEED_MIN = 0.018
const SPEED_MAX = 0.04

type Role = 'mechanic' | 'janitor'

interface WalkerState {
  x: number
  direction: 1 | -1
  speed: number
  bobPhase: number
  role: Role
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function makeInitial(index: number, total: number): WalkerState {
  const span = WALK_X_MAX - WALK_X_MIN
  const slot = total > 0 ? span / total : span
  // Alternate roles so a hired pair shows one mechanic + one janitor.
  const role: Role = index % 2 === 0 ? 'mechanic' : 'janitor'
  return {
    x: Math.round(WALK_X_MIN + slot * (index + 0.5)),
    direction: Math.random() < 0.5 ? -1 : 1,
    speed: randRange(SPEED_MIN, SPEED_MAX),
    bobPhase: Math.random() * Math.PI * 2,
    role,
  }
}

const ROLE_PLACEHOLDER: Record<Role, string> = {
  mechanic: '🔧',
  janitor: '🧹',
}

const ROLE_LABEL: Record<Role, string> = {
  mechanic: 'Mechanic',
  janitor: 'Janitor',
}

export function MaintenanceWalkers({ count }: Props) {
  const visibleCount = Math.max(0, Math.floor(count))

  const statesRef = useRef<WalkerState[]>([])
  const [, setTick] = useState(0)
  const lastTsRef = useRef<number | null>(null)

  // Initialize / resize states when the hire count changes.
  useEffect(() => {
    const current = statesRef.current
    const next: WalkerState[] = []
    for (let i = 0; i < visibleCount; i++) {
      next.push(current[i] ?? makeInitial(i, visibleCount))
    }
    statesRef.current = next
  }, [visibleCount])

  useEffect(() => {
    if (visibleCount === 0) return
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    let raf = 0
    const step = (ts: number) => {
      const last = lastTsRef.current ?? ts
      const dt = ts - last
      lastTsRef.current = ts
      const states = statesRef.current
      for (const s of states) {
        s.x += s.direction * s.speed * dt
        if (s.x <= WALK_X_MIN) {
          s.x = WALK_X_MIN
          s.direction = 1
        } else if (s.x >= WALK_X_MAX) {
          s.x = WALK_X_MAX
          s.direction = -1
        }
        s.bobPhase += dt * 0.007
      }
      setTick((t) => (t + 1) % 1_000_000)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [visibleCount])

  if (visibleCount === 0) return null

  return (
    <div
      aria-hidden
      data-testid="maintenance-walkers"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        width: SCENE.width,
        height: SCENE.height,
        // Layer on top of the counter front (rendered after
        // CounterFrontLayer in PixelBakeryScene). z-index keeps the
        // walkers visible above any earlier-positioned layers that share
        // the same stacking context.
        zIndex: 5,
      }}
    >
      {statesRef.current.map((s, i) => {
        const bob = Math.round(Math.sin(s.bobPhase) * 1.5)
        const flip = s.direction === -1 ? 'scaleX(-1)' : 'scaleX(1)'
        const asset = `/assets/maintenance/${s.role}.svg`
        return (
          <div
            key={`maint-${i}`}
            data-testid={`maintenance-walker-${i}`}
            title={ROLE_LABEL[s.role]}
            style={{
              position: 'absolute',
              left: `${Math.round(s.x - WALKER_SIZE / 2)}px`,
              top: `${WALKER_TOP_Y + bob}px`,
              width: `${WALKER_SIZE}px`,
              height: `${WALKER_SIZE}px`,
              transform: flip,
              transformOrigin: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
            }}
          >
            <img
              src={asset}
              alt=""
              width={WALKER_SIZE}
              height={WALKER_SIZE}
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                imageRendering: 'auto',
                filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.4))',
              }}
              onError={(e) => {
                // Asset not yet shipped — fall back to the emoji
                // placeholder so the simulation isn't broken.
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                const parent = e.currentTarget.parentElement
                if (parent && !parent.dataset.fallbackShown) {
                  parent.dataset.fallbackShown = '1'
                  parent.textContent = ROLE_PLACEHOLDER[s.role]
                }
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
