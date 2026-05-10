type Palette = 'cyan' | 'coral' | 'mixed'

export function initialsOf(name: string): string {
  if (!name) return '?'
  const cleaned = name.replace(/\b(Prof\.|Dr\.|Mr\.|Ms\.|Mrs\.)\s*/gi, '').trim()
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0]![0]!.toUpperCase()
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase()
}

function hashOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const PALETTES: Palette[] = ['cyan', 'coral', 'mixed']
export function avatarPaletteFor(name: string): Palette {
  return PALETTES[hashOf(name) % PALETTES.length]!
}

const PATTERNS = [
  // Asymmetric polygon, top-right facets
  'M 0 0 L 100 30 L 100 100 L 30 100 Z',
  // Diamond
  'M 50 5 L 95 50 L 50 95 L 5 50 Z',
  // Top-left triangle
  'M 0 0 L 100 0 L 0 100 Z',
  // Pentagon
  'M 50 5 L 95 35 L 80 90 L 20 90 L 5 35 Z',
  // Rotated square
  'M 50 0 L 100 50 L 50 100 L 0 50 Z',
  // Shifted parallelogram
  'M 20 10 L 100 30 L 80 90 L 0 70 Z'
]

type Props = {
  name: string
  photo?: string
  size?: number
  className?: string
}

export function GeometricAvatar({ name, photo, size = 96, className = '' }: Props) {
  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        width={size}
        height={size}
        className={`rounded-xl object-cover ${className}`}
      />
    )
  }
  const palette = avatarPaletteFor(name)
  const path = PATTERNS[hashOf(name) % PATTERNS.length]!
  const initials = initialsOf(name)
  const fill = palette === 'cyan' ? '#0099ff' : palette === 'coral' ? '#ff6b4a' : 'url(#fenrix-mix)'
  const gradientId = `fenrix-mix-${hashOf(name)}`

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`rounded-xl bg-surface-raised border border-white/8 ${className}`}
      role="img"
      aria-label={`${name} avatar`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0099ff" />
          <stop offset="100%" stopColor="#ff6b4a" />
        </linearGradient>
      </defs>
      <path d={path} fill={palette === 'mixed' ? `url(#${gradientId})` : fill} opacity="0.18" />
      <text
        x="50"
        y="60"
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="500"
        fontSize="34"
        fill="#e7ecf2"
      >
        {initials}
      </text>
    </svg>
  )
}
