import { useState } from 'react'
import { SceneBackdrop } from './SceneBackdrop'
import { TeamSign } from './TeamSign'
import { ChefLayer } from './ChefLayer'
import { CounterFrontLayer } from './CounterFrontLayer'
import { BreadShelfLayer } from './BreadShelfLayer'
import { CustomerLayer } from './CustomerLayer'
import { CatLayer } from './CatLayer'
import { DollarLayer } from './DollarLayer'
import { FxLayer } from './FxLayer'
import { useBakeryScene } from '../../hooks/useBakeryScene'
import type { StationKey } from './scene-geometry'

/**
 * Scene mode — controls which character/FX layers are animated.
 * - `decide`: no characters/FX (plan/menu phase); scene is a still background.
 * - `simulate`: chefs + cat + customers + FX all active (simulation phase).
 * - `static`: all layers present but not animated (preview, reduced-motion, and error-boundary fallback).
 */
export type BakerySceneMode = 'decide' | 'simulate' | 'static'

interface Props {
  mode: BakerySceneMode
  teamName: string
  staffCounts?: Record<StationKey, number>
  customerCount?: number
  menu?: string[]
  soldOut?: Set<string>
}

const DEFAULT_STAFF: Record<StationKey, number> = { bakery: 1, deli: 1, barista: 1 }
// Stable empty defaults — keep a single reference so SceneBackdrop's
// useEffect deps don't thrash on every parent re-render.
const EMPTY_MENU: string[] = []
const EMPTY_SOLD_OUT: Set<string> = new Set()

/**
 * Orchestrator for the bakery scene. Composes the backdrop + team sign +
 * character/FX layers. In later phases the cat, customers, and FX will
 * be added on top of this structure.
 */
export function PixelBakeryScene({
  mode,
  teamName,
  staffCounts = DEFAULT_STAFF,
  customerCount = 0,
  menu = EMPTY_MENU,
  soldOut = EMPTY_SOLD_OUT,
}: Props) {
  const { chefs, cat, customers, dollars } = useBakeryScene({ mode, teamName, staffCounts, customerCount })

  // Detect prefers-reduced-motion via lazy useState so it's stable across
  // re-renders but still captured at mount (safe for SSR — falls back to false).
  const [prefersReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  return (
    <div
      data-testid="pixel-bakery-scene"
      className={`pixel-bakery-scene pixel-bakery-scene--${mode}`}
    >
      <SceneBackdrop menu={menu} soldOut={soldOut} />
      <TeamSign teamName={teamName} />
      <ChefLayer chefs={chefs} />
      <CounterFrontLayer menu={menu} soldOut={soldOut} />
      <BreadShelfLayer menu={menu} soldOut={soldOut} />
      <CustomerLayer customers={customers} />
      <CatLayer cat={cat} />
      <DollarLayer dollars={dollars} />
      <FxLayer />
      {mode === 'simulate' && prefersReduced && (
        <div
          className="pixel-bakery-scene__reduced-motion-overlay"
          role="status"
          aria-live="polite"
        >
          Simulating round…
        </div>
      )}
    </div>
  )
}
