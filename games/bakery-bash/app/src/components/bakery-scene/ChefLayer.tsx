import { PixelSprite } from './PixelSprite'
import type { Chef } from '../../hooks/useBakeryScene'
import { chefBakery } from './sprites/chef-bakery'
import { chefDeli } from './sprites/chef-deli'
import { chefBarista } from './sprites/chef-barista'

const SPRITE_FOR_STATION = {
  bakery: chefBakery,
  deli: chefDeli,
  barista: chefBarista,
} as const

interface Props {
  chefs: Chef[]
}

export function ChefLayer({ chefs }: Props) {
  return (
    <div
      aria-hidden
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {chefs.map((c) => {
        const data = SPRITE_FOR_STATION[c.station]
        const scale = 1.5
        const halfW = Math.floor((data.width * scale) / 2)
        return (
          <div
            key={c.id}
            data-testid={`chef-${c.id}`}
            style={{
              position: 'absolute',
              left: `${c.x - halfW}px`,
              top: `${c.y}px`,
            }}
          >
            <PixelSprite data={data} frame={c.frame} pixelScale={scale} />
          </div>
        )
      })}
    </div>
  )
}
