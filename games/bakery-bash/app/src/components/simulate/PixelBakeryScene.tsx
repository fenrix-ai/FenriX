import { useGame } from '../../contexts/GameContext'
import { useSceneAnimation } from '../../hooks/useSceneAnimation'
import type { ProductKey } from '../../types/game'

import { InteriorBackdrop } from './InteriorBackdrop'
import { TeamSign } from './TeamSign'
import { ShelfStock } from './ShelfStock'
import { ChefRoster } from './ChefRoster'
import { AdDisplay } from './AdDisplay'
import { CustomerLayer } from './CustomerLayer'
import { DollarLayer } from './DollarLayer'
import { DayNightOverlay } from './DayNightOverlay'

const TOTAL_DAYS = 30
const DAY_DURATION_MS = 4000
const SIM_DURATION_MS = TOTAL_DAYS * DAY_DURATION_MS

interface Props {
  isNight: boolean
  soldOut: Set<ProductKey>
  reducedMotion: boolean
}

export function PixelBakeryScene({ isNight, soldOut, reducedMotion }: Props) {
  const { teamName, player, pendingDecision, roundResults } = useGame()
  const latest = roundResults[roundResults.length - 1]
  const customerCount =
    typeof latest?.customerCount === 'number' ? latest.customerCount : 0
  const adWon = latest?.auctionResults?.adWon ?? null
  const displayName = teamName ?? player?.bakeryName ?? 'My Bakery'

  const { customers, dollars } = useSceneAnimation({
    customerCount,
    simDurationMs: SIM_DURATION_MS,
    isNight,
    reducedMotion,
  })

  return (
    <div
      className={`pixel-scene${isNight ? ' pixel-scene--night' : ''}`}
      role="img"
      aria-label={`${displayName} bakery interior with customers making purchases`}
    >
      <InteriorBackdrop />
      <ShelfStock soldOut={soldOut} menu={pendingDecision.menu} />
      <AdDisplay adWon={adWon} />
      <TeamSign teamName={displayName} />
      <ChefRoster staffCounts={pendingDecision.staffCounts} />
      <CustomerLayer customers={customers} />
      <DollarLayer dollars={dollars} />
      <DayNightOverlay />
      {reducedMotion && (
        <div className="pixel-scene__rm-text">Simulating round…</div>
      )}
    </div>
  )
}
