import { useEffect, useRef } from 'react'
import { textToImageData, measureText, GLYPH_HEIGHT } from './pixel-font'
import { SCENE } from './scene-geometry'

interface Props {
  teamName: string
}

const SIGN_TEXT_COLOR = '#f3e2b8'
const SIGN_SHADOW_COLOR = '#4a2818'

/**
 * Fit the text to the sign width:
 * - If text fits, return it.
 * - Else truncate with '.' (single-char ellipsis) until it fits.
 */
function fitText(text: string, maxWidth: number): string {
  const upper = text.toUpperCase()
  if (measureText(upper) <= maxWidth) return upper
  // Binary search for the largest prefix that fits with a trailing '.'
  let lo = 0
  let hi = upper.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    const candidate = upper.slice(0, mid) + '.'
    if (measureText(candidate) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return upper.slice(0, lo) + '.'
}

const SIGN = SCENE.signFrame

export function TeamSign({ teamName }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (teamName.trim().length === 0) return

    const displayText = fitText(teamName, SIGN.width - 8) // 4 px padding each side
    const textWidth = measureText(displayText)
    const xOffset = Math.floor((SIGN.width - textWidth) / 2)
    const yOffset = Math.floor((SIGN.height - GLYPH_HEIGHT) / 2)

    // Shadow layer (1px down, dark)
    const shadowData = textToImageData(displayText, SIGN_SHADOW_COLOR)
    ctx.putImageData(shadowData, xOffset, yOffset + 1)
    // Main text layer
    const textData = textToImageData(displayText, SIGN_TEXT_COLOR)
    ctx.putImageData(textData, xOffset, yOffset)
  }, [teamName])

  return (
    <canvas
      ref={ref}
      width={SIGN.width}
      height={SIGN.height}
      aria-label={teamName ? `Welcome to ${teamName}` : undefined}
      style={{
        position: 'absolute',
        left: SIGN.x,
        top: SIGN.y,
        imageRendering: 'pixelated',
        pointerEvents: 'none',
      }}
    />
  )
}
