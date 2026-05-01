import { PixelSprite } from './PixelSprite'
import { cat as catSprite } from './sprites/cat'
import type { Cat } from '../../hooks/useBakeryScene'

interface Props {
  cat: Cat
}

export function CatLayer({ cat }: Props) {
  const scale = 1.5
  const halfW = Math.floor((catSprite.width * scale) / 2)
  return (
    <div
      data-testid="cat-wrapper"
      aria-hidden
      style={{
        position: 'absolute',
        left: `${cat.x - halfW}px`,
        top: `${cat.y}px`,
        pointerEvents: 'none',
      }}
    >
      <PixelSprite data={catSprite} frame={cat.frame} pixelScale={scale} />
    </div>
  )
}
