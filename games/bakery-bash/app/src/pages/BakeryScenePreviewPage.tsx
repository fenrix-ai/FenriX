import { useState } from 'react'
import { BakeryScene, type BakerySceneMode } from '../components/bakery/BakeryScene'
import '../styles/bakery-scene.css'

/**
 * Dev-only page for visually reviewing the bakery scene in isolation,
 * without the full game context chain. Route: `/preview/bakery-scene`.
 */
export function BakeryScenePreviewPage() {
  const [mode, setMode] = useState<BakerySceneMode>('decide')
  const [tilePx, setTilePx] = useState(40)
  return (
    <div className="bakery-scene-host">
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8 }}>
        {(['decide', 'simulate', 'static'] as BakerySceneMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '4px 10px',
              background: mode === m ? '#fbbf24' : '#27272a',
              color: mode === m ? '#111' : '#eee',
              border: '1px solid #444',
              borderRadius: 4,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            {m}
          </button>
        ))}
        <input
          type="range"
          min={16}
          max={64}
          value={tilePx}
          onChange={(e) => setTilePx(Number(e.target.value))}
          style={{ marginLeft: 16 }}
        />
        <span style={{ color: '#eee', fontFamily: 'monospace' }}>{tilePx}px/tile</span>
      </div>
      <BakeryScene mode={mode} tilePx={tilePx} />
    </div>
  )
}
