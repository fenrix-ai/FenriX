import { bakeryLayout, getTileBackgroundStyle } from './scene-data'

interface Props {
  tilePx: number
}

export function SceneFurniture({ tilePx }: Props) {
  return (
    <div
      className="bakery-scene__layer bakery-scene__layer--furniture"
      aria-hidden
    >
      {bakeryLayout.furniture.flatMap((row, rowIdx) =>
        row.map((tileKey, colIdx) => {
          if (tileKey === null) return null
          return (
            <div
              key={`${rowIdx}:${colIdx}`}
              data-tile={tileKey}
              data-tile-col={colIdx}
              data-tile-row={rowIdx}
              style={{
                position: 'absolute',
                left: `${colIdx * tilePx}px`,
                top: `${rowIdx * tilePx}px`,
                ...getTileBackgroundStyle(tileKey, tilePx),
              }}
            />
          )
        }),
      )}
    </div>
  )
}
