import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGame } from '../contexts/GameContext';
import { useRoundDoc } from '../hooks/useRoundDoc';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { ScatterTI } from '../components/charts/ScatterTI';
import { WeightsCompare } from '../components/charts/WeightsCompare';
import { WinsPerDollar } from '../components/charts/WinsPerDollar';
import { BestWorst } from '../components/charts/BestWorst';
import type { RevealDoc, StandingsRow } from '../types/models';

// THE FINALE IS THE SANCTIONED REVEAL (parent spec section 11.14):
// value-per-dollar, wins-per-dollar, trap/bargain labels, and the weights
// comparison are exactly what this page exists to show — do not hide them
// here. The "facts, never conclusions" rule and the perDollar-never-renders
// rule govern IN-GAME team screens (the Results bargain award), not this page.
//
// This is the TEAM-CLIENT laptop debrief: one scrollable page that IGNORES the
// game doc's revealStep entirely (revealStep drives the projector wall only).
export default function FinalePage() {
  const { gameId, game, membership, teams } = useGame();
  const round = game?.round ?? 0;
  const rd = useRoundDoc(round); // final standings live on rounds/{round} (round 5 at FINALE)
  const [reveal, setReveal] = useState<RevealDoc | null>(null);

  // Own listener on games/{id}/reveal/latest — member-readable once
  // status == 'finished' (firestore.rules), which the RESULTS·R5 flip sets
  // before the transition-gated phase ever presents FINALE. Error callback
  // logs via console.error — never a silent no-op (the §3a lesson).
  useEffect(() => {
    if (!gameId || game?.phase !== 'FINALE') { setReveal(null); return; }
    return onSnapshot(doc(db, 'games', gameId, 'reveal', 'latest'),
      (s) => setReveal(s.exists() ? (s.data() as RevealDoc) : null),
      (e) => console.error('reveal/latest listener', e));
  }, [gameId, game?.phase]);

  const playerNames = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of reveal?.scatter ?? []) m.set(p.pid, p.name);
    return m;
  }, [reveal]);
  const teamNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const [tid, t] of teams) m.set(tid, t.name);
    return m;
  }, [teams]);

  if (!game || !membership || !rd || !reveal) return null;

  const ranked = [...rd.standings].sort((a, b) => a.rank - b.rank);
  const podium = ranked.slice(0, 3);
  // 2nd - 1st - 3rd visual order; small games may have fewer than three teams.
  const podiumOrder = [podium[1], podium[0], podium[2]]
    .filter((s): s is StandingsRow => s !== undefined);
  const rankOrder = ranked.map((s) => s.teamId);
  const mine = reveal.perTeam.find((t) => t.teamId === membership.teamId) ?? null;

  return (
    <main className="page">
      <PhaseHeader title="Finale" round={round} timerEndsAt={game.timerEndsAt} />

      <section className="card" data-testid="podium">
        <h2 style={{ margin: '0 0 10px' }}>Final Podium</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
          {podiumOrder.map((s) => (
            <div key={s.teamId} className="inset"
              style={{
                flex: s.rank === 1 ? 1.3 : 1, textAlign: 'center',
                paddingTop: s.rank === 1 ? 26 : 12,
                borderColor: s.rank === 1 ? 'var(--gold)' : undefined,
              }}>
              <div className="mono" style={{ fontSize: s.rank === 1 ? 36 : 24, color: 'var(--gold)' }}>
                {`#${s.rank}`}</div>
              <div style={{ fontWeight: 700 }}>{s.name}</div>
              <div className="muted mono">{s.wins}-{s.losses}</div>
            </div>
          ))}
        </div>
      </section>

      {mine && (
        <section className="card" data-testid="your-signings"
          style={{ margin: '12px 0', border: '1px solid var(--gold)' }}>
          <h3 style={{ margin: '0 0 8px' }}>Your best & worst signing</h3>
          {/* TrueImpact per $M of contract rate — sanctioned here and only here. */}
          {mine.bestSigning ? (
            <div>
              <span className="dim">BEST</span>{' '}
              {playerNames.get(mine.bestSigning.pid) ?? mine.bestSigning.pid} ·{' '}
              <span className="ok mono">
                {mine.bestSigning.valuePerDollar.toFixed(2)} TI per $M</span>
            </div>
          ) : <div className="muted">No signings on record.</div>}
          {mine.worstSigning && (
            <div style={{ marginTop: 4 }}>
              <span className="dim">WORST</span>{' '}
              {playerNames.get(mine.worstSigning.pid) ?? mine.worstSigning.pid} ·{' '}
              <span className="neg mono">
                {mine.worstSigning.valuePerDollar.toFixed(2)} TI per $M</span>
            </div>
          )}
        </section>
      )}

      <section className="card" style={{ margin: '12px 0' }}>
        <h3 style={{ margin: '0 0 8px' }}>Hype vs TrueImpact</h3>
        <ScatterTI rows={reveal.scatter} />
      </section>

      <section className="card" style={{ margin: '12px 0' }}>
        <h3 style={{ margin: '0 0 8px' }}>What the engine paid for</h3>
        <WeightsCompare trueWeights={reveal.trueWeights} />
        <p className="muted" data-testid="narrative" style={{ marginBottom: 0 }}>
          {reveal.trueWeights.narrative}</p>
      </section>

      <section className="card" style={{ margin: '12px 0' }}>
        <h3 style={{ margin: '0 0 8px' }}>Wins per dollar</h3>
        <WinsPerDollar rows={reveal.winsPerDollar} teamNames={teamNames} />
      </section>

      <section className="card" style={{ margin: '12px 0' }}>
        <h3 style={{ margin: '0 0 8px' }}>Best & worst signings</h3>
        <BestWorst perTeam={reveal.perTeam} teamNames={teamNames}
          playerNames={playerNames} order={rankOrder}
          highlightTeamId={membership.teamId} />
      </section>
    </main>
  );
}
