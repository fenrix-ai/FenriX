import { useProfessor } from '../../contexts/ProfessorContext';
import { BestWorst } from '../charts/BestWorst';
import { ScatterTI } from '../charts/ScatterTI';
import { WeightsCompare } from '../charts/WeightsCompare';
import { WinsPerDollar } from '../charts/WinsPerDollar';
import { STEP_TITLES } from '../../lib/stepTitles';
import type { StandingsRow } from '../../types/models';

// FINALE wall (design spec §6.5): the projector face of the sanctioned reveal
// (parent spec §11.14) — value-per-dollar, wins-per-dollar, trap labels and the
// weights comparison are exactly what this surface exists to show. Read-only:
// the professor's RevealStepper is the only control; this wall just follows
// games/{id}.revealStep. No interactivity, no emojis. Wrapped in the same
// <main className="bigscreen bs-center"> shell as every other wall so it sits
// on the bs-* clamp() type scale (720p projector ↔ 4K panel).
//
// Step titles come from the ONE shared module (src/lib/stepTitles.ts) — the
// same array RevealStepper renders. Never re-word them.
export function FinaleWall() {
  const { game, round, reveal, teams } = useProfessor();
  if (!game) return null;
  // Clamp incoming revealStep to this wall's 5 steps (0..4). setRevealStep
  // accepts 0..8 server-side; anything past the last chart parks on
  // "Best & worst signings" instead of blanking the projector. revealStep is
  // absent until the first setRevealStep call (T3) — `?? 0` opens on the Podium.
  const step = Math.min(STEP_TITLES.length - 1, Math.max(0, game.revealStep ?? 0));
  const teamNames = new Map([...teams.entries()].map(([id, t]) => [id, t.name] as const));
  // BestWorst requires pid→name; reveal.scatter carries pid + name for EVERY
  // player, so it doubles as the roster lookup (same trick as FinalePage).
  const playerNames = new Map(
    (reveal?.scatter ?? []).map((p) => [p.pid, p.name] as const));
  // At FINALE game.round is 5, so ProfessorContext's round doc IS the final
  // round: its standings are the season-final table the podium reads.
  const podium = (round?.standings ?? [])
    .filter((r) => r.rank <= 3)
    .sort((a, b) => a.rank - b.rank);
  // Visual order 2nd · 1st · 3rd (champion center); tolerate < 3 teams.
  const podiumOrder = [podium[1], podium[0], podium[2]]
    .filter((r): r is StandingsRow => r !== undefined);
  return (
    <main className="bigscreen bs-center" data-testid="finale-wall">
      <div className="brand bs-brand">Salary Showdown</div>
      <div className="dim bs-finale-kicker">Finale</div>
      <h1 className="bs-step-title" data-testid="finale-step-title">
        {STEP_TITLES[step]}
      </h1>
      {step === 0 && (
        <div data-testid="finale-podium" className="bs-podium">
          {podiumOrder.map((r) => (
            <div key={r.teamId}
              className={r.rank === 1 ? 'card bs-podium-card champ' : 'card bs-podium-card'}>
              <div className="mono bs-podium-rank">#{r.rank}</div>
              <div className="bs-podium-name">{r.name}</div>
              <div className="muted bs-podium-record">{r.wins}–{r.losses}</div>
            </div>
          ))}
        </div>
      )}
      {step > 0 && !reveal && (
        <p className="dim bs-finale-loading">Loading the reveal…</p>
      )}
      {step === 1 && reveal && (
        <div data-testid="finale-scatter">
          <ScatterTI rows={reveal.scatter} />
        </div>
      )}
      {step === 2 && reveal && (
        <div data-testid="finale-weights">
          <WeightsCompare trueWeights={reveal.trueWeights} />
        </div>
      )}
      {step === 3 && reveal && (
        <div data-testid="finale-wpd">
          <WinsPerDollar rows={reveal.winsPerDollar} teamNames={teamNames} />
        </div>
      )}
      {step === 4 && reveal && (
        <div data-testid="finale-bestworst">
          <BestWorst perTeam={reveal.perTeam} teamNames={teamNames}
            playerNames={playerNames} />
        </div>
      )}
    </main>
  );
}
