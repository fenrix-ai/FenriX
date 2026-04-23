import type { AdType } from '../../types/game'

const AD_ICONS: Record<AdType, string> = {
  TV: '/assets/ads/tv.svg',
  Radio: '/assets/ads/radio.svg',
  Newspaper: '/assets/ads/newspaper.svg',
  Billboard: '/assets/ads/billboard.svg',
}

interface Props {
  adWon: AdType | null | undefined
}

export function AdDisplay({ adWon }: Props) {
  if (!adWon) return null
  const src = AD_ICONS[adWon]
  if (!src) return null
  return (
    <div className="pixel-scene__ad" title={`${adWon} campaign won`}>
      <img src={src} alt="" aria-hidden="true" />
      <span className="pixel-scene__ad-label">{adWon}</span>
    </div>
  )
}
