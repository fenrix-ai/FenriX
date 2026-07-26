import type { StandingsRow } from '../types/models';

// The Standings Shuffle step list (design spec §6.4). Pure data -> playback
// plan: rows in REVEAL order — rank N first … rank 1 last (bottom-up drama,
// first place lands last). The playback component is a dumb consumer of this
// list; every branchy decision lives here where it is unit-testable.
export interface ShuffleStep {
  teamId: string; name: string; rank: number;
  previousRank: number | null;   // last round's rank; null in round 1
  delta: number | null;          // previousRank - rank (positive = climbed); null round 1
  wins: number; losses: number;
  shroud: boolean;               // rank <= 3: masked as '#<rank> — ?' until its own reveal
}

export function computeShuffleSteps(standings: StandingsRow[]): ShuffleStep[] {
  return [...standings]
    .sort((a, b) => b.rank - a.rank) // reveal order: rank N first … rank 1 last
    .map((r) => {
      // previousRank is absent (not null) on round docs simulated before the
      // backend stamped it — treat exactly like round 1's explicit null.
      const previousRank = r.previousRank ?? null;
      return {
        teamId: r.teamId, name: r.name, rank: r.rank,
        previousRank,
        delta: previousRank === null ? null : previousRank - r.rank,
        wins: r.wins, losses: r.losses,
        shroud: r.rank <= 3,
      };
    });
}
