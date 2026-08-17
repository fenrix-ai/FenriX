import { useEffect, useState } from 'react';
import { useProfessor } from '../../contexts/ProfessorContext';
import { PHASE_NAMES } from '../../lib/phaseNames';
import { liveStandings } from '../../lib/liveStandings';
import { deltaClass, deltaGlyph } from '../../lib/shuffle';

// SIMULATE wall: staggered reveal of ALL of this round's games as score cards.
// rounds/{r} is written by the enter:SIMULATE hook inside the advance and the
// provider's §3a transition gate holds this phase back until it exists, so the
// data is server-final before this ever mounts — the stagger is pure cosmetic
// playback (same pacing pattern as SimulatePage, over every game instead of
// one team's three). interval = min(3000, 45000/games.length) keeps the whole
// flood inside ~45s at any class size. Display-only; facts only; no emojis.
export function SimulateFlood() {
  const { game, round, teams } = useProfessor();
  const games = round?.games ?? [];
  const total = games.length;
  const [shown, setShown] = useState(0);

  useEffect(() => { // cosmetic client pacing — the data is already server-final
    setShown(0);
    if (total === 0) return;
    const interval = Math.min(3000, 45000 / total);
    const id = setInterval(() => setShown((n) => {
      if (n + 1 >= total) clearInterval(id);
      return n + 1;
    }), interval);
    return () => clearInterval(id);
  }, [total, game?.round]);

  if (!game) return null;
  const done = total > 0 && shown >= total;
  const live = liveStandings(round?.standings ?? [], games, shown, game.round);
  return (
    <main className="bigscreen">
      <header>
        <div className="brand bs-brand">Salary Showdown</div>
        <h1 className="bs-phase-title">{PHASE_NAMES.SIMULATE}</h1>
        <p className="bs-sub">Round {game.round}</p>
      </header>
      {total === 0 && <p className="bs-sub">Crunching the round…</p>}
      <div className="bs-sim-split">
        <div className="bs-flood">
          {games.slice(0, shown).map((g) => (
            <div key={g.game_id} className="bs-scorecard mono" data-testid="bs-scorecard">
              <span className="bs-score-team">{teams.get(g.home)?.name ?? '—'}</span>
              <span className={g.homeScore > g.awayScore ? 'bs-score-num ok' : 'bs-score-num'}>
                {g.homeScore}
              </span>
              <span className="dim">–</span>
              <span className={g.awayScore > g.homeScore ? 'bs-score-num ok' : 'bs-score-num'}>
                {g.awayScore}
              </span>
              <span className="bs-score-team away">{teams.get(g.away)?.name ?? '—'}</span>
            </div>
          ))}
        </div>
        {/* Playtest-2 item 4: standings re-rank live as each score lands —
            same shown counter as the flood, so a card and its table movement
            arrive together. Facts only: rank, name, record, movement vs the
            round start. The RESULTS shuffle is unchanged; this previews it. */}
        {total > 0 && (
          <aside className="bs-live-standings" data-testid="bs-live-standings">
            <div className="bs-live-title">Standings</div>
            {live.map((r) => (
              <div key={r.teamId} data-testid="bs-live-row"
                className={`bs-live-row mono${r.movedNow ? ' bs-live-moved' : ''}`}>
                <span className="bs-live-rank">{r.rank}</span>
                <span className="bs-live-name">{r.name}</span>
                <span className="bs-live-rec">{r.wins}-{r.losses}</span>
                {/* round 1 has no prior rank — an empty cell, not a NEW wall (T8 review) */}
                <span className={deltaClass(r.delta)}>{r.delta == null ? '' : deltaGlyph(r.delta)}</span>
              </div>
            ))}
          </aside>
        )}
      </div>
      {done && <p className="bs-sub ok" role="status">Round complete.</p>}
    </main>
  );
}
