import { SceneBackdrop } from './SceneBackdrop'
import { SceneFurniture } from './SceneFurniture'
import { SCENE_WIDTH_TILES, SCENE_HEIGHT_TILES } from './scene-data'

export type BakerySceneMode = 'decide' | 'simulate' | 'static'

interface Props {
  mode: BakerySceneMode
  tilePx?: number
}

/**
 * The canonical hero bakery view rendered during Decide and Simulate phases.
 *
 * The scene is laid out at a fixed tile grid (`SCENE_WIDTH_TILES` x
 * `SCENE_HEIGHT_TILES`) and scaled by `tilePx`. Layers stack absolutely
 * so tile-level occlusion behaves predictably.
 *
 * This component owns no animation state yet (Phase 3 wires
 * `useBakerySceneAnimation` for chefs/customers). Layouts are decorative —
 * clicks do not travel from scene elements to state (locked decision Q4).
 */
export function BakeryScene({ mode, tilePx = 32 }: Props) {
  const width = SCENE_WIDTH_TILES * tilePx
  const height = SCENE_HEIGHT_TILES * tilePx
  return (
    <div
      className={`bakery-scene bakery-scene--${mode}`}
      data-testid="bakery-scene"
      style={
        {
          position: 'relative',
          width: `${width}px`,
          height: `${height}px`,
          '--bakery-scene-tile-px': `${tilePx}px`,
          '--bakery-scene-width': `${width}px`,
          '--bakery-scene-height': `${height}px`,
        } as React.CSSProperties
      }
    >
      <SceneBackdrop tilePx={tilePx} />
      {/* Painted wall band along the top/bottom edges — see bakery-scene.css. */}
      <div
        className="bakery-scene__wall"
        aria-hidden
        style={{ height: `${tilePx * 2}px` }}
      />
      <div
        className="bakery-scene__wall bakery-scene__wall--front"
        aria-hidden
        style={{ height: `${tilePx * 1.25}px` }}
      />
      <SceneFurniture tilePx={tilePx} />
    </div>
  )
}
