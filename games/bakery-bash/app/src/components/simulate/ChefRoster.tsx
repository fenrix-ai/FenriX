import type { StaffCounts } from '../../types/game'

interface Props {
  staffCounts: StaffCounts
}

// Nationality-per-station convention comes from CHEF_ROSTER.md — each station
// has a canonical "home" nationality. Used as the fallback rendering when the
// individual chef identities aren't threaded through (MVP scope).
const STATIONS = [
  { station: 'bakery',  xPct: 22, sprite: '/assets/chefs/french-f.svg'   },
  { station: 'deli',    xPct: 46, sprite: '/assets/chefs/italian-m.svg'  },
  { station: 'barista', xPct: 70, sprite: '/assets/chefs/japanese-f.svg' },
] as const

export function ChefRoster({ staffCounts }: Props) {
  return (
    <div className="pixel-scene__chef-layer">
      {STATIONS.map(({ station, xPct, sprite }) => {
        const count =
          station === 'bakery'
            ? staffCounts.bakerySousChefs
            : station === 'deli'
              ? staffCounts.deliSousChefs
              : staffCounts.baristaSousChefs
        if (count <= 0) return null
        return (
          <div
            key={station}
            className="pixel-chef"
            style={{ left: `calc(${xPct}% - 18px)`, bottom: '38%' }}
            data-station={station}
          >
            <img src={sprite} alt="" aria-hidden="true" />
          </div>
        )
      })}
    </div>
  )
}
