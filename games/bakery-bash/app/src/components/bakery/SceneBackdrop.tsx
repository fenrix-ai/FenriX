import { bakeryLayout, getTileBackgroundStyle } from './scene-data'

interface Props {
  tilePx: number
}

export function SceneBackdrop({ tilePx }: Props) {
  return (
    <div className="bakery-scene__layer bakery-scene__layer--floor" aria-hidden>
      {bakeryLayout.floor.flatMap((row, rowIdx) =>
        row.map((tileKey, colIdx) => (
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
        )),
      )}
    </div>
  )
}
