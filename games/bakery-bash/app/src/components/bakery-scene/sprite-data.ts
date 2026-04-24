/**
 * A single pixel-art sprite, authored as a palette + per-frame character grid.
 *
 * - `palette[i]` is a CSS color string (e.g. '#ff00aa'). Up to 16 entries
 *   per sprite; any more and the grids become unreadable.
 * - Each frame is an array of exactly `height` strings, each exactly `width`
 *   characters long. Each character is either a digit/letter indexing into
 *   `palette`, or a space ' ' meaning fully transparent.
 *
 * Palette indices use single characters so grids stay compact and readable:
 *   '0'-'9' map to palette indices 0-9, and 'a'-'f' map to 10-15 (hex-style).
 */
export interface SpriteData {
  width: number
  height: number
  palette: string[]
  frames: string[][]
}

/** Convert a palette-index character to its numeric index, or null for space. */
function cellToIndex(c: string): number | null {
  if (c === ' ') return null
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48
  if (c >= 'a' && c <= 'f') return 10 + c.charCodeAt(0) - 97
  throw new Error(`Invalid cell character '${c}' (use 0-9, a-f, or space)`)
}

/** Parse '#rrggbb' into [r, g, b]. */
function parseHexColor(hex: string): [number, number, number] {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  if (h.length !== 6) {
    throw new Error(`Palette color must be '#rrggbb' format, got '${hex}'`)
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/**
 * Validate a SpriteData blob at module load time. Throws on any mismatch —
 * we'd rather crash at test time than render a corrupted sprite.
 */
export function validateSpriteData(data: SpriteData): void {
  for (let f = 0; f < data.frames.length; f++) {
    const frame = data.frames[f]
    if (frame.length !== data.height) {
      throw new Error(
        `Frame ${f}: height mismatch (expected ${data.height}, got ${frame.length} rows)`,
      )
    }
    for (let y = 0; y < frame.length; y++) {
      const row = frame[y]
      if (row.length !== data.width) {
        throw new Error(
          `Frame ${f} row ${y}: width mismatch (expected ${data.width}, got ${row.length} chars)`,
        )
      }
      for (let x = 0; x < row.length; x++) {
        const idx = cellToIndex(row[x])
        if (idx !== null && idx >= data.palette.length) {
          throw new Error(
            `Frame ${f} row ${y} col ${x}: palette index ${idx} out of bounds (palette has ${data.palette.length} colors)`,
          )
        }
      }
    }
  }
}

/**
 * Render the given frame of the sprite to raw RGBA bytes. Returns an object
 * shaped like the return of `ctx.getImageData()` so callers can hand it
 * straight to `ctx.putImageData()`.
 */
export function gridToImageData(
  data: SpriteData,
  frame: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const rgba = new Uint8ClampedArray(data.width * data.height * 4)
  const rows = data.frames[frame]
  if (!rows) throw new Error(`Frame ${frame} not found (have ${data.frames.length} frames)`)
  // Pre-parse palette to [r,g,b] triples.
  const rgb = data.palette.map(parseHexColor)
  for (let y = 0; y < data.height; y++) {
    const row = rows[y]
    for (let x = 0; x < data.width; x++) {
      const idx = cellToIndex(row[x])
      const pixel = (y * data.width + x) * 4
      if (idx === null) {
        rgba[pixel + 3] = 0 // transparent
      } else {
        const [r, g, b] = rgb[idx]
        rgba[pixel] = r
        rgba[pixel + 1] = g
        rgba[pixel + 2] = b
        rgba[pixel + 3] = 255
      }
    }
  }
  return { data: rgba, width: data.width, height: data.height }
}
