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

// Shelf positions (back-wall 3 shelves × ~3 columns) in % relative to scene.
// Shelf Y rows at ~26%, 46%, 66% (within the 0–60% back-wall band).
const SHELF_ROW_TOPS = [14, 26, 38] // top 3 shelves
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
