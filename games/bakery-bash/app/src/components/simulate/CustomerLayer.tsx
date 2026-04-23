import type { CustomerActor } from '../../hooks/useSceneAnimation'

const CUSTOMER_SPRITES = [
  '/assets/customers/customer-1.svg',
  '/assets/customers/customer-2.svg',
  '/assets/customers/customer-3.svg',
]

interface Props {
  customers: CustomerActor[]
  sceneWidthLogical?: number
}

export function CustomerLayer({ customers, sceneWidthLogical = 480 }: Props) {
  return (
    <div className="pixel-scene__customer-layer">
      {customers.map((c) => {
        const leftPct = (c.x / sceneWidthLogical) * 100
        // WALK_OUT actors face right (exiting); WALK_IN and AT_COUNTER face left.
        const facing = c.phase === 'WALK_OUT' ? 'right' : 'left'
        const spriteIdx = c.variantIdx % CUSTOMER_SPRITES.length
        return (
          <div
            key={c.id}
            className="pixel-customer"
            data-facing={facing}
            data-phase={c.phase}
            data-variant={c.variantIdx}
            style={{ left: `calc(${leftPct}% - 18px)` }}
          >
            <img src={CUSTOMER_SPRITES[spriteIdx]} alt="" aria-hidden="true" />
          </div>
        )
      })}
    </div>
  )
}
