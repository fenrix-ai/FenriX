import { useEffect, useRef, useState } from 'react'
import { SCENE } from './scene-geometry'
import type { SpecialtyChefBadge } from './SpecialtyChefBadges'

/**
 * Apr 30 — Specialty chef WALKERS (replaces static portrait cameos for the
 * simulation phase). Each chef paces back-and-forth in a band BEHIND the
 * counter (rendered before CounterFrontLayer in PixelBakeryScene), using
 * the existing nationality SVG portraits at a larger size so they're not
 * occluded by the bakery station / espresso machine.
 *
 * Sized at 40×40 px (vs the 22×22 wall cameos) so the chef silhouette is
 * clearly visible above the counter line. Each walker has its own random
 * speed + start position so the team's 1–3 specialty chefs don't pace in
 * sync.
 */

interface Props {
  chefs: SpecialtyChefBadge[]
}

const WALKER_SIZE = 40
/** Horizontal walking band — keep clear of the door (x=456) on the right. */
const WALK_X_MIN = 24
const WALK_X_MAX = 420
/** Top-edge Y for the walker. Sits behind counter (which spans y=140..180)
 * so the bottom of the sprite tucks under the counter front overlay. */
const WALKER_TOP_Y = 104
const SPEED_MIN = 0.015 // px / ms
const SPEED_MAX = 0.035

interface WalkerState {
  x: number
  direction: 1 | -1
  speed: number
  bobPhase: number
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function makeInitial(index: number, total: number): WalkerState {
  // Spread starting positions evenly across the band so the walkers don't
  // overlap on first paint.
  const span = WALK_X_MAX - WALK_X_MIN
  const slot = total > 0 ? span / total : span
  return {
    x: Math.round(WALK_X_MIN + slot * (index + 0.5)),
    direction: Math.random() < 0.5 ? -1 : 1,
    speed: randRange(SPEED_MIN, SPEED_MAX),
    bobPhase: Math.random() * Math.PI * 2,
  }
}

export function SpecialtyChefWalkers({ chefs }: Props) {
  // Cap at 3 — matches specialtyChefCap.
  const visible = chefs.slice(0, 3)

  // Initial states (one per chef, keyed by id so re-renders don't reset).
  const statesRef = useRef<Record<string, WalkerState>>({})
  const [, setTick] = useState(0)
  const lastTsRef = useRef<number | null>(null)

  // Initialize / clean up walker state when the chef list changes.
  useEffect(() => {
    const next: Record<string, WalkerState> = {}
    visible.forEach((c, i) => {
      next[c.id] = statesRef.current[c.id] ?? makeInitial(i, visible.length)
    })
    statesRef.current = next
  }, [visible])

  // Animation loop — paces each walker between WALK_X_MIN..MAX with a
  // gentle vertical bob.
  useEffect(() => {
    if (visible.length === 0) return
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
      for (const id in states) {
        const s = states[id]
        s.x += s.direction * s.speed * dt
        if (s.x <= WALK_X_MIN) {
          s.x = WALK_X_MIN
          s.direction = 1
        } else if (s.x >= WALK_X_MAX) {
          s.x = WALK_X_MAX
          s.direction = -1
        }
        s.bobPhase += dt * 0.006
      }
      setTick((t) => (t + 1) % 1_000_000)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [visible.length])

  if (visible.length === 0) return null

  return (
    <div
      aria-hidden
      data-testid="specialty-chef-walkers"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        width: SCENE.width,
        height: SCENE.height,
      }}
    >
      {visible.map((chef) => {
        const s = statesRef.current[chef.id]
        if (!s) return null
        const bob = Math.round(Math.sin(s.bobPhase) * 1.5)
        const portrait = `/assets/chefs/${chef.nationality}-${chef.gender}.svg`
        const flip = s.direction === -1 ? 'scaleX(-1)' : 'scaleX(1)'
        return (
          <div
            key={chef.id}
            data-testid={`specialty-chef-walker-${chef.id}`}
            title={chef.name}
            style={{
              position: 'absolute',
              left: `${Math.round(s.x - WALKER_SIZE / 2)}px`,
              top: `${WALKER_TOP_Y + bob}px`,
              width: `${WALKER_SIZE}px`,
              height: `${WALKER_SIZE}px`,
              transform: flip,
              transformOrigin: 'center',
            }}
          >
            <img
              src={portrait}
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
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
