type Props = { className?: string; size?: number; eyeAnimated?: boolean }

/**
 * FenriX wolf-head logo. Hand-drawn approximation of the source artwork —
 * polygonal wolf head facing right with a cyan eye. Replace by exporting
 * a clean SVG from the source file when available; the API stays the same.
 */
export function Logo({ className = '', size = 40, eyeAnimated = true }: Props) {
  return (
    <svg
      role="img"
      aria-label="FenriX logo"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
    >
      {/* Outer head silhouette */}
      <path
        d="M 18 18 L 28 4 L 36 22 L 50 8 L 58 22 L 72 16 L 88 32 L 94 50 L 86 60 L 78 62 L 70 76 L 50 80 L 30 70 L 14 58 L 8 40 Z"
        fill="#14181d"
        stroke="#e7ecf2"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Internal facets */}
      <g fill="none" stroke="#e7ecf2" strokeWidth="1.2" strokeLinejoin="round" opacity="0.9">
        {/* Brow & forehead */}
        <polyline points="28,4 32,28 50,8" />
        <polyline points="32,28 14,32 8,40" />
        {/* Center face */}
        <polyline points="32,28 56,30 72,16" />
        <polyline points="56,30 88,32" />
        {/* Cheek to chin */}
        <polyline points="32,28 38,58 14,58" />
        <polyline points="38,58 78,62" />
        <polyline points="38,58 50,80" />
        {/* Snout */}
        <polyline points="56,30 70,38 86,60" />
        <polyline points="70,38 70,52 78,62" />
      </g>
      {/* Darker accent triangle for depth */}
      <polygon
        points="32,28 38,58 14,58 8,40 14,32"
        fill="#1c2128"
        stroke="#e7ecf2"
        strokeWidth="1.2"
        strokeLinejoin="round"
        opacity="0.6"
      />
      {/* Cyan eye */}
      <circle
        cx="70"
        cy="38"
        r="3.4"
        fill="#0099ff"
        className={eyeAnimated ? 'animate-eye-pulse' : ''}
      />
    </svg>
  )
}
