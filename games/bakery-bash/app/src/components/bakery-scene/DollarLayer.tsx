import type { Dollar } from '../../hooks/useBakeryScene'

interface Props {
  dollars: Dollar[]
}

/**
 * Dollar bills are rendered as DOM <div>s with a CSS keyframe animation.
 * Animation: float up 30 px, drift ±8 px horizontally, rotate ±20°, fade
 * to zero opacity in the final 200 ms of the 800 ms lifetime.
 *
 * See pixel-scene.css for .dollar-bill keyframes.
 */
export function DollarLayer({ dollars }: Props) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {dollars.map((d) => {
        const drift = (parseInt(d.id.split('-')[1], 10) % 17) - 8
        const rot = (parseInt(d.id.split('-')[1], 10) % 41) - 20
        return (
          <div
            key={d.id}
            className="dollar-bill"
            style={{
              left: `${d.x}px`,
              top: `${d.y}px`,
              ['--drift' as never]: `${drift}px`,
              ['--rot' as never]: `${rot}deg`,
            } as React.CSSProperties}
          />
        )
      })}
    </div>
  )
}
