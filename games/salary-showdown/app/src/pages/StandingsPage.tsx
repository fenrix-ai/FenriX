import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { StandingsTable } from '../components/ui/StandingsTable';
import { useGame } from '../contexts/GameContext';
import { useRoundPresentation } from '../contexts/RoundPresentationContext';
import { spendThroughRound } from '../lib/contracts';
import type { RoundDoc, StandingsRow } from '../types/models';
import styles from './StandingsPage.module.css';

type LoadedRound = { key: string; round: number; rd: RoundDoc | null };

export default function StandingsPage() {
  const { game, gameId, teams, membership } = useGame();
  const presentation = useRoundPresentation();
  const isLiveRound = game?.phase === 'SIMULATE';
  const latestCompleted = game
    ? game.phase === 'RESULTS' || game.phase === 'FINALE' ? game.round : game.round - 1
    : 0;
  const defaultRound = isLiveRound ? game?.round ?? 0 : Math.max(0, latestCompleted);
  const [selectedRound, setSelectedRound] = useState(defaultRound);
  const [loaded, setLoaded] = useState<LoadedRound>({ key: '', round: 0, rd: null });
  const [interacting, setInteracting] = useState(false);

  useEffect(() => {
    setSelectedRound((current) => {
      const validCompleted = current >= 1 && current <= latestCompleted;
      const validLive = Boolean(isLiveRound && game && current === game.round);
      return validCompleted || validLive ? current : defaultRound;
    });
  }, [defaultRound, game, isLiveRound, latestCompleted]);

  const liveSelection = Boolean(isLiveRound && game && selectedRound === game.round);
  const loadKey = gameId && selectedRound > 0 && !liveSelection
    ? `${gameId}/${selectedRound}`
    : '';
  useEffect(() => {
    if (!loadKey) return undefined;
    let active = true;
    void presentation.getRound(selectedRound).then((rd) => {
      if (active) setLoaded({ key: loadKey, round: selectedRound, rd });
    });
    return () => { active = false; };
  }, [loadKey, presentation.getRound, selectedRound]);

  const rows: StandingsRow[] = liveSelection
    ? presentation.rows
    : loaded.key === loadKey && loaded.round === selectedRound
      ? loaded.rd?.standings ?? []
      : [];
  const loading = selectedRound > 0 && !liveSelection && loaded.key !== loadKey;
  const options = useMemo(() => {
    const completed = Array.from({ length: Math.max(0, latestCompleted) }, (_, index) => index + 1);
    if (isLiveRound && game && !completed.includes(game.round)) completed.push(game.round);
    return completed;
  }, [game, isLiveRound, latestCompleted]);
  const wpd = useMemo(() => new Map(rows.map((row) => {
    const spend = spendThroughRound(teams.get(row.teamId)?.spendLog ?? [], selectedRound);
    return [row.teamId, spend > 0 ? row.wins / spend : null] as const;
  })), [rows, selectedRound, teams]);

  if (!game || !membership) return null;

  return (
    <main className="page">
      <PhaseHeader title="Standings" round={selectedRound || game.round}
        timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />

      <section className={styles.headerCard} aria-labelledby="standings-title">
        <div>
          <h2 id="standings-title">League table</h2>
          <p>Server ranking and the sanctioned wins-per-payroll-dollar view.</p>
        </div>
        {options.length > 0 ? (
          <label className={styles.roundPicker}>
            Standings round
            <select value={selectedRound}
              onFocus={() => setInteracting(true)} onBlur={() => setInteracting(false)}
              onChange={(event) => setSelectedRound(Number(event.target.value))}>
              {options.map((round) => (
                <option key={round} value={round}>
                  {isLiveRound && round === game.round ? `Round ${round} live` : `Round ${round} complete`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      {selectedRound < 1 ? <p className={styles.empty}>No games in the books yet.</p> : null}
      {loading ? <p className={styles.empty}>Loading round {selectedRound} standings…</p> : null}
      {!loading && selectedRound > 0 && rows.length === 0
        ? <p className={styles.empty}>Round {selectedRound} standings are unavailable.</p>
        : null}
      {rows.length > 0 ? (
        <div className={styles.tableFrame} tabIndex={0} role="region"
          aria-label={`Round ${selectedRound} standings, scrollable`}>
          <StandingsTable rows={rows} highlightTeamId={membership.teamId} wpd={wpd}
            round={selectedRound} showMovement animateRows={!interacting} />
        </div>
      ) : null}

      <p className={styles.backLink}><Link to="/game/office" className="chip">Back to the game</Link></p>
    </main>
  );
}
