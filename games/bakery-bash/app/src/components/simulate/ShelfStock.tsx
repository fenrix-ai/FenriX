import type { ProductKey } from '../../types/game'

const SHELF_PRODUCTS: ProductKey[] = [
  'croissant',
  'cookie',
  'bagel',
  'sandwich',
  'coffee',
  'matcha',
]

interface Props {
  soldOut: Set<ProductKey>
  menu: Partial<Record<ProductKey, boolean>>
}

// Shelf positions (back-wall shelves are at ~14%, 27%, 40% of scene).
// We use the lower two rows so the hanging sign doesn't overlap the items.
const SHELF_ROW_TOPS = [29, 42]
const SHELF_COLS_LEFT = [40, 54, 68]

export function ShelfStock({ soldOut, menu }: Props) {
  return (
    <div className="pixel-scene__shelves">
      {SHELF_PRODUCTS.map((product, idx) => {
        const onMenu = menu[product] !== false
        const empty = !onMenu || soldOut.has(product)
        const row = Math.floor(idx / 3)
        const col = idx % 3
        const topPct = SHELF_ROW_TOPS[row]
        const leftPct = SHELF_COLS_LEFT[col]
        const src = empty
          ? '/assets/scene/shelf-product-empty.svg'
          : `/assets/products/${product}.svg`
        return (
          <img
            key={product}
            className="pixel-scene__shelf-item"
            src={src}
            alt=""
            aria-hidden="true"
            style={{
              top: `${topPct}%`,
              left: `${leftPct}%`,
              width: empty ? '5.5%' : '6%',
            }}
          />
        )
      })}
    </div>
  )
}
