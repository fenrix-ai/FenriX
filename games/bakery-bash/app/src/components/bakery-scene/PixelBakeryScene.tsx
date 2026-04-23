import { SceneBackdrop } from './SceneBackdrop'
import { TeamSign } from './TeamSign'
import { ChefLayer } from './ChefLayer'
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
}

const DEFAULT_STAFF: Record<StationKey, number> = { bakery: 1, deli: 1, barista: 1 }

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
}: Props) {
  const { chefs } = useBakeryScene({ mode, teamName, staffCounts, customerCount })
  return (
    <div
      data-testid="pixel-bakery-scene"
      className={`pixel-bakery-scene pixel-bakery-scene--${mode}`}
    >
      <SceneBackdrop />
      <TeamSign teamName={teamName} />
      <ChefLayer chefs={chefs} />
    </div>
  )
}
