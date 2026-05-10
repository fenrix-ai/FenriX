import { useState } from 'react'

type Props = { className?: string; size?: number; eyeAnimated?: boolean }

/**
 * FenriX wolf-head logo. Loads the real artwork from /fenrix-logo.png
 * (drop your file at website/public/fenrix-logo.png). Falls back to a
 * hand-drawn polygonal SVG if the file is missing.
 */
export function Logo({ className = '', size = 40, eyeAnimated = true }: Props) {
  const [imgFailed, setImgFailed] = useState(false)

  if (!imgFailed) {
    return (
      <img
        src="/fenrix-logo.png"
        alt="FenriX logo"
        width={size}
        height={size}
        onError={() => setImgFailed(true)}
        className={className}
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    )
  }

  return (
    <svg
      role="img"
      aria-label="FenriX logo"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
    >
      <path
        d="M 18 18 L 28 4 L 36 22 L 50 8 L 58 22 L 72 16 L 88 32 L 94 50 L 86 60 L 78 62 L 70 76 L 50 80 L 30 70 L 14 58 L 8 40 Z"
        fill="#14181d"
        stroke="#e7ecf2"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <g fill="none" stroke="#e7ecf2" strokeWidth="1.2" strokeLinejoin="round" opacity="0.9">
        <polyline points="28,4 32,28 50,8" />
        <polyline points="32,28 14,32 8,40" />
        <polyline points="32,28 56,30 72,16" />
        <polyline points="56,30 88,32" />
        <polyline points="32,28 38,58 14,58" />
        <polyline points="38,58 78,62" />
        <polyline points="38,58 50,80" />
        <polyline points="56,30 70,38 86,60" />
        <polyline points="70,38 70,52 78,62" />
      </g>
      <polygon
        points="32,28 38,58 14,58 8,40 14,32"
        fill="#1c2128"
        stroke="#e7ecf2"
        strokeWidth="1.2"
        strokeLinejoin="round"
        opacity="0.6"
      />
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
