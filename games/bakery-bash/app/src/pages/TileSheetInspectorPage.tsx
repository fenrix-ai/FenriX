import { useState } from 'react'

type Sheet = {
  name: string
  url: string
  cols: number
  rows: number
}

const SHEETS: Sheet[] = [
  {
    name: 'modern-houses',
    url: '/assets/bakery-v2/tiles/modern-houses.png',
    cols: 48,
    rows: 32,
  },
  {
    name: 'rpg-urban',
    url: '/assets/bakery-v2/tiles/rpg-urban.png',
    cols: 27,
    rows: 18,
  },
  {
    name: 'tiny-town',
    url: '/assets/bakery-v2/tiles/tiny-town.png',
    cols: 12,
    rows: 11,
  },
  {
    name: 'tiny-dungeon',
    url: '/assets/bakery-v2/tiles/tiny-dungeon.png',
    cols: 12,
    rows: 11,
  },
]

const DEFAULT_tilePx = 48

/**
 * Dev-only browser for the bundled spritesheets. Click any tile to copy the
 * `{ sheet, col, row }` object to the clipboard so I can paste into the tile
 * registry. Route: `/preview/tile-inspector`.
 */
export function TileSheetInspectorPage() {
  const [sheetName, setSheetName] = useState<string>(SHEETS[0].name)
  const [tilePx, setTilePx] = useState(DEFAULT_tilePx)
  const [showLabels, setShowLabels] = useState(true)
  const [picked, setPicked] = useState<{ col: number; row: number } | null>(
    null,
  )
  const sheet = SHEETS.find((s) => s.name === sheetName)!

  return (
    <div style={{ background: '#111', minHeight: '100vh', color: '#eee', padding: 16, fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        {SHEETS.map((s) => (
          <button
            key={s.name}
            onClick={() => { setSheetName(s.name); setPicked(null); }}
            style={{
              padding: '4px 10px',
              background: s.name === sheetName ? '#fbbf24' : '#27272a',
              color: s.name === sheetName ? '#111' : '#eee',
              border: '1px solid #444',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {s.name} ({s.cols}x{s.rows})
          </button>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
          labels
        </label>
        <input
          type="range"
          min={16}
          max={96}
          value={tilePx}
          onChange={(e) => setTilePx(Number(e.target.value))}
          style={{ width: 140 }}
        />
        <span>{tilePx}px/tile</span>
        <div style={{ marginLeft: 'auto', padding: '6px 12px', background: '#27272a', borderRadius: 4 }}>
          {picked
            ? `{ sheet: '${sheetName}', col: ${picked.col}, row: ${picked.row} }`
            : 'click a tile'}
        </div>
      </div>
      <div
        style={{
          position: 'relative',
          width: sheet.cols * tilePx,
          height: sheet.rows * tilePx,
          backgroundImage: `url('${sheet.url}')`,
          backgroundSize: `${sheet.cols * tilePx}px ${sheet.rows * tilePx}px`,
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          border: '2px solid #333',
        }}
      >
        {Array.from({ length: sheet.rows }).flatMap((_, row) =>
          Array.from({ length: sheet.cols }).map((_, col) => (
            <div
              key={`${row}:${col}`}
              onClick={() => setPicked({ col, row })}
              style={{
                position: 'absolute',
                left: col * tilePx,
                top: row * tilePx,
                width: tilePx,
                height: tilePx,
                cursor: 'crosshair',
                outline:
                  picked?.col === col && picked?.row === row
                    ? '2px solid #fbbf24'
                    : '1px dashed rgba(255,255,255,0.06)',
                outlineOffset: -1,
                boxSizing: 'border-box',
              }}
              title={`col=${col} row=${row}`}
            >
              {showLabels && tilePx >= 32 && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 1,
                    fontSize: 9,
                    lineHeight: '9px',
                    color: '#fff',
                    textShadow: '0 0 2px #000, 0 0 2px #000',
                    fontFamily: 'monospace',
                    pointerEvents: 'none',
                  }}
                >
                  {col},{row}
                </span>
              )}
            </div>
          )),
        )}
      </div>
    </div>
  )
}
