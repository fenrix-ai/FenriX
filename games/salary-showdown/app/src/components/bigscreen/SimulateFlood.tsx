import { useProfessor } from '../../contexts/ProfessorContext';
import { PHASE_NAMES } from '../../lib/phaseNames';
import { liveStandings } from '../../lib/liveStandings';
import { deltaClass, deltaGlyph } from '../../lib/shuffle';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { FranchiseMark } from '../franchise/FranchiseMark';
import { useBroadcastProgress } from './useBroadcastProgress';
import { useWallPage, WallPageStatus } from './useWallPage';

const SCORE_PAGE_SIZE = 8;
const STANDINGS_PAGE_SIZE = 7;

// SIMULATE wall: staggered reveal of ALL of this round's games as score cards.
// rounds/{r} is written by the enter:SIMULATE hook inside the advance and the
// provider's §3a transition gate holds this phase back until it exists, so the
// data is server-final before this ever mounts — the stagger is pure cosmetic
// playback (same elapsed-time pacing contract as RoundPresentation, over every
// game instead of one team's three). Background returns reconcile from elapsed
// time, and the session-local high-water mark never moves backward.
export function SimulateFlood() {
  const { gameId, game, round, teams } = useProfessor();
  const games = round?.games ?? [];
  const total = games.length;
  const reduced = useReducedMotion();
  const scope = `${gameId ?? 'no-game'}/${game?.round ?? 0}`;
  const shown = useBroadcastProgress(`${scope}/${total}`, total, reduced);
  const scorePager = useWallPage(total, SCORE_PAGE_SIZE, `${scope}/scores`, shown >= total);
  const live = liveStandings(round?.standings ?? [], games, shown, game?.round ?? 0);
  const livePager = useWallPage(live.length, STANDINGS_PAGE_SIZE, `${scope}/standings`, !reduced);

  if (!game) return null;
  const done = total > 0 && shown >= total;
  const scorePage = done
    ? scorePager.page
    : Math.floor(Math.max(0, shown - 1) / SCORE_PAGE_SIZE);
  const scoreStart = scorePage * SCORE_PAGE_SIZE;
  const scoreEnd = Math.min(total, (scorePage + 1) * SCORE_PAGE_SIZE);
  const visibleLive = reduced ? live : live.slice(livePager.start, livePager.end);
  const denseReduced = reduced && live.length > 12;
  return (
    <main className={`bigscreen${denseReduced ? ' bs-sim-reduced-dense' : ''}`}>
      <header className="bs-broadcast-head">
        <div className="brand bs-brand">Salary Showdown</div>
        <h1 className="bs-phase-title">{PHASE_NAMES.SIMULATE}</h1>
        <p className="bs-sub">Round {game.round}</p>
      </header>
      {total === 0 && <p className="bs-sub">Crunching the round…</p>}
      {total > 0 && shown === 0 && (
        <div className="bs-matchup-intro" role="status">
          <span className="mono">League slate locked</span>
          <span className="dim">Final scores begin after the broadcast intro.</span>
        </div>
      )}
      <div className="bs-sim-split">
        <section className="bs-scoreboard-page" aria-label="Completed game scores">
          <div className="bs-flood">
          {games.slice(scoreStart, Math.min(shown, scoreEnd)).map((g, index) => {
            const home = teams.get(g.home);
            const away = teams.get(g.away);
            return (
            <div key={g.game_id}
              className={`bs-scorecard mono${scoreStart + index === shown - 1 ? ' latest' : ''}`}
              data-testid="bs-scorecard">
              <FranchiseMark teamId={g.home} name={home?.name ?? '—'}
                identity={home?.identity} size={30} />
              <span className="bs-score-team">{home?.name ?? '—'}</span>
              <span className={g.homeScore > g.awayScore ? 'bs-score-num ok' : 'bs-score-num'}>
                {g.homeScore}
              </span>
              <span className="dim">–</span>
              <span className={g.awayScore > g.homeScore ? 'bs-score-num ok' : 'bs-score-num'}>
                {g.awayScore}
              </span>
              <span className="bs-score-team away">{away?.name ?? '—'}</span>
              <FranchiseMark teamId={g.away} name={away?.name ?? '—'}
                identity={away?.identity} size={30} />
            </div>
          ); })}
          </div>
          <WallPageStatus page={scorePage} pageCount={Math.max(1, Math.ceil(total / SCORE_PAGE_SIZE))}
            start={scoreStart} end={scoreEnd} noun="games" />
        </section>
        {/* Playtest-2 item 4: standings re-rank live as each score lands —
            same shown counter as the flood, so a card and its table movement
            arrive together. Facts only: rank, name, record, movement vs the
            round start. The RESULTS shuffle is unchanged; this previews it. */}
        {total > 0 && (
          <aside className={`bs-live-standings${denseReduced ? ' is-classroom-grid' : ''}`}
            data-testid="bs-live-standings">
            <div className="bs-live-title">Standings</div>
            {visibleLive.map((r) => {
              const visual = teams.get(r.teamId);
              return (
              <div key={r.teamId} data-testid="bs-live-row"
                className={`bs-live-row mono${r.movedNow ? ' bs-live-moved' : ''}`}>
                <span className="bs-live-rank">{r.rank}</span>
                <FranchiseMark teamId={r.teamId} name={r.name}
                  identity={visual?.identity} size={24} />
                <span className="bs-live-name">{r.name}</span>
                <span className="bs-live-rec" data-testid={`bs-live-record-${r.teamId}`}>
                  {r.wins}–{r.losses}
                </span>
                {/* round 1 has no prior rank — an empty cell, not a NEW wall (T8 review) */}
                <span className={deltaClass(r.delta)}>{r.delta == null ? '' : deltaGlyph(r.delta)}</span>
              </div>
            ); })}
            {!reduced && (
              <WallPageStatus {...livePager} noun="ranks" testId="bs-live-page-status" />
            )}
          </aside>
        )}
      </div>
      {done && <p className="bs-sub ok" role="status">Round complete.</p>}
    </main>
  );
}
