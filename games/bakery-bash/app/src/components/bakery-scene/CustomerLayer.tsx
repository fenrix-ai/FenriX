import { PixelSprite } from './PixelSprite'
import { customerTemplates } from './sprites/customer-templates'
import type { Customer } from '../../hooks/useBakeryScene'

interface Props {
  customers: Customer[]
}

export function CustomerLayer({ customers }: Props) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {customers.map((c) => {
        const data = customerTemplates[c.variantIndex] ?? customerTemplates[0]
        const halfW = Math.floor(data.width / 2)
        return (
          <div
            key={c.id}
            data-testid={`customer-${c.id}`}
            style={{ position: 'absolute', left: `${c.x - halfW}px`, top: `${c.y}px` }}
          >
            <PixelSprite data={data} frame={c.frame} />
          </div>
        )
      })}
    </div>
  )
}
