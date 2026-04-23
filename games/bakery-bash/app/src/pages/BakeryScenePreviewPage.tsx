import { useState } from 'react'
import { PixelBakeryScene, type BakerySceneMode } from '../components/bakery-scene/PixelBakeryScene'
import '../styles/pixel-scene.css'

/**
 * Dev-only preview for the pixel bakery scene. Route: /preview/bakery-scene.
 * Useful for iterating on sprites and animations in isolation.
 */
export function BakeryScenePreviewPage() {
  const [mode, setMode] = useState<BakerySceneMode>('decide')
  const [teamName, setTeamName] = useState('CRUMBS & CO')
  const [scale, setScale] = useState(2)

  return (
    <div className="pixel-bakery-scene-host" style={{ flexDirection: 'column', gap: 16, padding: 24 }}>
      <div style={{ display: 'flex', gap: 8, color: '#eee', fontFamily: 'monospace' }}>
        {(['decide', 'simulate', 'static'] as BakerySceneMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '4px 12px',
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
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="Team name"
          style={{
            padding: '4px 8px',
            background: '#27272a',
            color: '#eee',
            border: '1px solid #444',
            borderRadius: 4,
            fontFamily: 'monospace',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          scale
          <input
            type="range"
            min={1}
            max={3}
            step={1}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          />
          {scale}×
        </label>
      </div>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
        <PixelBakeryScene mode={mode} teamName={teamName} />
      </div>
    </div>
  )
}
