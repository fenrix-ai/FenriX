import { useGame } from '../../contexts/GameContext'
import { useSceneAnimation } from '../../hooks/useSceneAnimation'
import type { AdType, ProductKey } from '../../types/game'

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

/**
 * Dev-only query-param overrides — lets us QA the scene without playing a
 * full round. Active only when `import.meta.env.DEV && ?devSim=1` is present.
 *   ?customers=N      — override latest.customerCount
 *   ?night=1          — force isNight on
 *   ?adWon=TV|Radio|Newspaper|Billboard
 *   ?chefs=B,D,R      — counts per station (comma-separated, bakery/deli/barista)
 *   ?team=NAME        — override the team-sign label
 *   ?soldOut=a,b,c    — sold-out product keys
 */
interface DevOverrides {
  active: boolean
  customerCount?: number
  forceNight?: boolean
  adWon?: AdType
  chefCounts?: { bakery: number; deli: number; barista: number }
  teamName?: string
  soldOut?: ProductKey[]
}

function readDevOverrides(): DevOverrides {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return { active: false }
  }
  // URL params take priority; persist to localStorage so they survive a route
  // change inside the SPA (the DevNav <Link> drops the query string).
  const params = new URLSearchParams(window.location.search)
  const urlFlag = params.get('devSim')
  let source: URLSearchParams | null = null
  try {
    if (urlFlag === '1') {
      window.localStorage.setItem('devSim', params.toString())
      source = params
    } else if (urlFlag === '0') {
      window.localStorage.removeItem('devSim')
      return { active: false }
    } else {
      const stored = window.localStorage.getItem('devSim')
      if (stored) source = new URLSearchParams(stored)
    }
  } catch {
    // localStorage may be unavailable; fall through.
  }
  if (!source || source.get('devSim') !== '1') return { active: false }
  const out: DevOverrides = { active: true }
  const c = source.get('customers')
  if (c && !Number.isNaN(Number(c))) out.customerCount = Number(c)
  if (source.get('night') === '1') out.forceNight = true
  const ad = source.get('adWon')
  if (ad && ['TV', 'Radio', 'Newspaper', 'Billboard'].includes(ad)) {
    out.adWon = ad as AdType
  }
  const chefs = source.get('chefs')
  if (chefs) {
    const [b, d, r] = chefs.split(',').map((n) => Number(n) || 0)
    out.chefCounts = { bakery: b, deli: d, barista: r }
  }
  const t = source.get('team')
  if (t) out.teamName = t
  const so = source.get('soldOut')
  if (so) out.soldOut = so.split(',') as ProductKey[]
  return out
}

export function PixelBakeryScene({ isNight, soldOut, reducedMotion }: Props) {
  const { teamName, player, pendingDecision, roundResults } = useGame()
  const overrides = readDevOverrides()

  const latest = roundResults[roundResults.length - 1]
  const customerCount =
    overrides.customerCount ??
    (typeof latest?.customerCount === 'number' ? latest.customerCount : 0)
  const adWon = overrides.adWon ?? latest?.auctionResults?.adWon ?? null
  const displayName =
    overrides.teamName ?? teamName ?? player?.bakeryName ?? 'My Bakery'
  const effectiveNight = overrides.forceNight ?? isNight

  const staffCounts = overrides.chefCounts
    ? {
        bakerySousChefs: overrides.chefCounts.bakery,
        deliSousChefs: overrides.chefCounts.deli,
        baristaSousChefs: overrides.chefCounts.barista,
      }
    : pendingDecision.staffCounts

  const effectiveSoldOut = overrides.soldOut
    ? new Set<ProductKey>(overrides.soldOut)
    : soldOut

  const menuOverride: Partial<Record<ProductKey, boolean>> = overrides.active
    ? {
        croissant: true,
        cookie: true,
        bagel: true,
        sandwich: true,
        coffee: true,
        matcha: true,
      }
    : pendingDecision.menu

  const { customers, dollars } = useSceneAnimation({
    customerCount,
    simDurationMs: SIM_DURATION_MS,
    isNight: effectiveNight,
    reducedMotion,
  })

  return (
    <div
      className={`pixel-scene${effectiveNight ? ' pixel-scene--night' : ''}`}
      role="img"
      aria-label={`${displayName} bakery interior with customers making purchases`}
    >
      <InteriorBackdrop />
      <ShelfStock soldOut={effectiveSoldOut} menu={menuOverride} />
      <AdDisplay adWon={adWon} />
      <TeamSign teamName={displayName} />
      <ChefRoster staffCounts={staffCounts} />
      <CustomerLayer customers={customers} />
      <DollarLayer dollars={dollars} />
      <DayNightOverlay />
      {reducedMotion && (
        <div className="pixel-scene__rm-text">Simulating round…</div>
      )}
    </div>
  )
}
