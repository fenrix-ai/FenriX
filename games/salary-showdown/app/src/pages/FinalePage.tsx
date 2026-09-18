import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useGame } from '../contexts/GameContext';
import { useRoundDoc } from '../hooks/useRoundDoc';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { Podium } from '../components/finale/Podium';
import { RevealExplorer } from '../components/finale/RevealExplorer';
import { SigningStory } from '../components/finale/SigningStory';
import { WeightsCompare } from '../components/charts/WeightsCompare';
import { WinsPerDollar } from '../components/charts/WinsPerDollar';
import { BestWorst } from '../components/charts/BestWorst';
import type { RevealDoc } from '../types/models';
import styles from './FinalePage.module.css';

// The laptop debrief intentionally ignores revealStep, which controls only
// the projector wall. Students may browse the full server-published reveal.
export default function FinalePage() {
  const { uid } = useAuth();
  const { gameId, game, membership, team, teams } = useGame();
  const round = game?.round ?? 0;
  const rd = useRoundDoc(round);
  const [reveal, setReveal] = useState<RevealDoc | null>(null);

  useEffect(() => {
    if (!gameId || game?.phase !== 'FINALE') { setReveal(null); return undefined; }
    return onSnapshot(doc(db, 'games', gameId, 'reveal', 'latest'),
      (snapshot) => setReveal(snapshot.exists() ? snapshot.data() as RevealDoc : null),
      (error) => console.error('reveal/latest listener', error));
  }, [gameId, game?.phase]);

  const playerNames = useMemo(() => new Map(
    (reveal?.scatter ?? []).map((player) => [player.pid, player.name] as const)), [reveal]);
  const teamNames = useMemo(() => new Map(
    [...teams].map(([teamId, value]) => [teamId, value.name] as const)), [teams]);

  if (!game || !membership) return null;

  if (!rd || !reveal) {
    return (
      <main className={`${styles.page} page`}>
        <PhaseHeader title="Finale" round={round} timerEndsAt={game.timerEndsAt} />
        <section className={styles.loading} aria-live="polite">
          <span className={styles.loadingLine} />
          <h1>Preparing the season debrief</h1>
          <p>The final standings and reveal are still arriving from the server.</p>
        </section>
      </main>
    );
  }

  const ranked = [...rd.standings].sort((a, b) => a.rank - b.rank);
  const rankOrder = ranked.map((row) => row.teamId);
  const mine = reveal.perTeam.find((entry) => entry.teamId === membership.teamId) ?? null;

  return (
    <main className={`${styles.page} page`}>
      <PhaseHeader title="Finale" round={round} timerEndsAt={game.timerEndsAt} />
      <Podium rows={ranked} teams={teams}
        celebrationKey={`${gameId ?? 'game'}/${uid ?? membership.teamId}`} />
      <SigningStory teamName={team?.name ?? teamNames.get(membership.teamId) ?? 'Your franchise'}
        story={mine} playerNames={playerNames} />

      <section className={styles.chartPanel} aria-labelledby="scatter-title">
        <header className={styles.chartHeader}>
          <div>
            <p className={styles.sectionLabel}>Market reputation versus results</p>
            <h2 id="scatter-title">Hype and TrueImpact</h2>
          </div>
          <p>Inspect the full player pool, then isolate the server-defined traps and bargains.</p>
        </header>
        <RevealExplorer rows={reveal.scatter} teams={teams} />
      </section>

      <div className={styles.chartGrid}>
        <section className={styles.chartPanel} aria-labelledby="weights-title">
          <header className={styles.chartHeader}>
            <div>
              <p className={styles.sectionLabel}>The model behind the season</p>
              <h2 id="weights-title">What the engine paid for</h2>
            </div>
          </header>
          <WeightsCompare trueWeights={reveal.trueWeights} />
          <p className={styles.narrative} data-testid="narrative">
            {reveal.trueWeights.narrative}
          </p>
        </section>

        <section className={styles.chartPanel} aria-labelledby="efficiency-title">
          <header className={styles.chartHeader}>
            <div>
              <p className={styles.sectionLabel}>Committed payroll efficiency</p>
              <h2 id="efficiency-title">Wins per dollar</h2>
            </div>
          </header>
          <WinsPerDollar rows={reveal.winsPerDollar} teamNames={teamNames} />
        </section>
      </div>

      <section className={styles.chartPanel} aria-labelledby="league-signings-title">
        <header className={styles.chartHeader}>
          <div>
            <p className={styles.sectionLabel}>League signing ledger</p>
            <h2 id="league-signings-title">Best and worst signings</h2>
          </div>
          <p>TrueImpact return per $1M committed, in final standings order.</p>
        </header>
        <BestWorst perTeam={reveal.perTeam} teamNames={teamNames}
          playerNames={playerNames} order={rankOrder}
          highlightTeamId={membership.teamId} />
      </section>
    </main>
  );
}
