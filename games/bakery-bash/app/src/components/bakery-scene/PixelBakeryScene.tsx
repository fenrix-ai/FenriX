import { SceneBackdrop } from './SceneBackdrop'
import { TeamSign } from './TeamSign'

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
}

/**
 * Orchestrator for the bakery scene. Composes the backdrop + team sign +
 * (future) character/FX layers. In this phase only the static layers exist;
 * chefs, cat, customers, and FX land in Phases 5-8.
 */
export function PixelBakeryScene({ mode, teamName }: Props) {
  return (
    <div
      data-testid="pixel-bakery-scene"
      className={`pixel-bakery-scene pixel-bakery-scene--${mode}`}
    >
      <SceneBackdrop />
      <TeamSign teamName={teamName} />
    </div>
  )
}
