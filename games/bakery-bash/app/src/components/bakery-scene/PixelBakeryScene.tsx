import { useState } from 'react'
import { SceneBackdrop } from './SceneBackdrop'
import { TeamSign } from './TeamSign'
import { ChefLayer } from './ChefLayer'
import {
  SpecialtyChefBadges,
  type SpecialtyChefBadge,
} from './SpecialtyChefBadges'
import { SpecialtyChefWalkers } from './SpecialtyChefWalkers'
import { MaintenanceWalkers } from './MaintenanceWalkers'
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
  /**
   * K-07 — team's specialty chefs (max 3). Rendered as portrait cameos
   * on the back wall above the team sign in non-simulate modes. In
   * `simulate` mode they pace as walkers behind the counter instead
   * (Apr 30).
   */
  specialtyChefs?: SpecialtyChefBadge[]
  /**
   * Apr 30 — number of maintenance staff hired (mechanic + janitor),
   * walking back-and-forth in front of the counter at the top of the
   * scene during the simulate phase. 0 (default) skips the layer.
   */
  maintenanceCount?: number
}

// Default to a single front-counter barista. Real-game callers (SimulatePhase)
// override with player-chosen staff counts.
const DEFAULT_STAFF: Record<StationKey, number> = { bakery: 0, deli: 0, barista: 1 }
// Stable empty defaults — keep a single reference so SceneBackdrop's
// useEffect deps don't thrash on every parent re-render.
const EMPTY_MENU: string[] = []
const EMPTY_SOLD_OUT: Set<string> = new Set()
const EMPTY_SPECIALTY_CHEFS: SpecialtyChefBadge[] = []

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
  specialtyChefs = EMPTY_SPECIALTY_CHEFS,
  maintenanceCount = 0,
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
      {/* Apr 30 — in simulate mode, swap the static back-wall cameos for
          walking specialty chefs that pace BEHIND the counter (rendered
          before CounterFrontLayer so the counter occludes their feet). */}
      {mode === 'simulate' ? (
        <SpecialtyChefWalkers chefs={specialtyChefs} />
      ) : (
        <SpecialtyChefBadges chefs={specialtyChefs} />
      )}
      <ChefLayer chefs={chefs} />
      <CounterFrontLayer menu={menu} soldOut={soldOut} />
      {/* Apr 30 — maintenance staff walk IN FRONT of the counter
          (rendered after CounterFrontLayer). Only active in simulate. */}
      {mode === 'simulate' && (
        <MaintenanceWalkers count={maintenanceCount} />
      )}
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
