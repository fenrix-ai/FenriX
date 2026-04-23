import type { DollarPopup } from '../../hooks/useSceneAnimation'

interface Props {
  dollars: DollarPopup[]
  sceneWidthLogical?: number
  sceneHeightLogical?: number
}

export function DollarLayer({
  dollars,
  sceneWidthLogical = 480,
  sceneHeightLogical = 270,
}: Props) {
  return (
    <div className="pixel-scene__dollar-layer">
      {dollars.map((d, idx) => {
        const leftPct = (d.x / sceneWidthLogical) * 100
        const topPct = (d.y / sceneHeightLogical) * 100
        const variantClass = `pixel-dollar--var-${idx % 6}`
        return (
          <img
            key={d.id}
            src="/assets/scene/dollar-bill.svg"
            alt=""
            aria-hidden="true"
            className={`pixel-dollar ${variantClass}`}
            style={{
              left: `calc(${leftPct}% - 11px)`,
              top: `calc(${topPct}% - 7px)`,
            }}
          />
        )
      })}
    </div>
  )
}
