import { useProfessor } from '../../contexts/ProfessorContext';
import { BestWorst } from '../charts/BestWorst';
import { ScatterTI } from '../charts/ScatterTI';
import { WeightsCompare } from '../charts/WeightsCompare';
import { WinsPerDollar } from '../charts/WinsPerDollar';
import type { StandingsRow } from '../../types/models';

// FINALE wall (design spec §6.5): the projector face of the sanctioned reveal
// (parent spec §11.14) — value-per-dollar, wins-per-dollar, trap labels and the
// weights comparison are exactly what this surface exists to show. Read-only:
// the professor's RevealStepper is the only control; this wall just follows
// games/{id}.revealStep. No interactivity, no emojis, big type on the dark
// global theme.
//
// Step titles are contract-fixed, verbatim — shared with RevealStepper. Never
// re-word them.
const STEP_TITLES = [
  'Podium',
  'Hype vs Reality',
  'What the engine paid for',
  'Wins per dollar',
  'Best & worst signings',
] as const;

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
    <div data-testid="finale-wall" style={{ textAlign: 'center', padding: '24px 0' }}>
      <div className="dim"
        style={{ fontSize: 26, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
        Finale
      </div>
      <h1 data-testid="finale-step-title" style={{ fontSize: 52, margin: '8px 0 28px' }}>
        {STEP_TITLES[step]}
      </h1>
      {step === 0 && (
        <div data-testid="finale-podium" style={{ display: 'flex',
          justifyContent: 'center', alignItems: 'flex-end', gap: 28 }}>
          {podiumOrder.map((r) => (
            <div key={r.teamId} className="card"
              style={{ padding: r.rank === 1 ? '40px 44px' : '26px 32px', minWidth: 220 }}>
              <div className="mono"
                style={{ fontSize: r.rank === 1 ? 64 : 44, color: 'var(--gold)' }}>
                #{r.rank}
              </div>
              <div style={{ fontSize: r.rank === 1 ? 40 : 30, fontWeight: 800 }}>
                {r.name}
              </div>
              <div className="muted" style={{ fontSize: 24 }}>{r.wins}–{r.losses}</div>
            </div>
          ))}
        </div>
      )}
      {step > 0 && !reveal && (
        <p className="dim" style={{ fontSize: 28 }}>Loading the reveal…</p>
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
    </div>
  );
}
