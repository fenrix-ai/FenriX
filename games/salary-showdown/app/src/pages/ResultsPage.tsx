import { useEffect, useMemo, useState, type FocusEvent } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { AuctionResolution } from '../components/results/AuctionResolution';
import { BoxscoreExplorer } from '../components/results/BoxscoreExplorer';
import { ResultsHero } from '../components/results/ResultsHero';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { StandingsTable } from '../components/ui/StandingsTable';
import { useGame } from '../contexts/GameContext';
import { parseBoxCsv } from '../lib/boxfeed';
import { spendThroughRound } from '../lib/contracts';
import { db } from '../lib/firebase';
import { fmtM } from '../lib/money';
import { useRoundDoc } from '../hooks/useRoundDoc';
import type { AuctionDoc, PrivateAuctionDoc } from '../types/models';
import styles from './ResultsPage.module.css';

export default function ResultsPage() {
  const { gameId, game, team, teams, membership, catalog } = useGame();
  const round = game?.round ?? 1;
  const rd = useRoundDoc(round);
  const [slide, setSlide] = useState(0);
  const [awardHovered, setAwardHovered] = useState(false);
  const [awardFocused, setAwardFocused] = useState(false);
  const [auction, setAuction] = useState<AuctionDoc | null>(null);
  const [privAuction, setPrivAuction] = useState<PrivateAuctionDoc | null>(null);

  useEffect(() => {
    if (!gameId || !membership) { setAuction(null); return; }
    return onSnapshot(doc(db, 'games', gameId, 'auctions', String(round)),
      (snapshot) => setAuction(snapshot.exists() ? snapshot.data() as AuctionDoc : null),
      (error) => console.error('[results] auction listener', error));
  }, [gameId, membership, round]);

  useEffect(() => {
    if (!gameId || !membership) { setPrivAuction(null); return; }
    return onSnapshot(doc(db, 'games', gameId, 'teams', membership.teamId, 'private', 'auction'),
      (snapshot) => setPrivAuction(snapshot.exists() ? snapshot.data() as PrivateAuctionDoc : null),
      (error) => console.error('[results] private auction listener', error));
  }, [gameId, membership, round]);

  useEffect(() => { setSlide(0); }, [round]);
  useEffect(() => {
    if (awardHovered || awardFocused) return undefined;
    const id = window.setInterval(() => setSlide((value) => (value + 1) % 3), 5000);
    return () => window.clearInterval(id);
  }, [awardFocused, awardHovered]);

  const allRows = useMemo(() => rd ? parseBoxCsv(rd.boxCsv) : [], [rd]);
  const summary = useMemo(() => {
    if (!rd || !membership || !team) return null;
    const games = rd.games
      .filter((result) => result.home === membership.teamId || result.away === membership.teamId)
      .map((result) => {
        const home = result.home === membership.teamId;
        return {
          gameId: result.game_id,
          opponent: teams.get(home ? result.away : result.home)?.name ?? '—',
          us: home ? result.homeScore : result.awayScore,
          them: home ? result.awayScore : result.homeScore,
        };
      });
    const wins = games.filter((result) => result.us > result.them);
    const losses = games.filter((result) => result.us < result.them);
    const best = [...wins].sort((a, b) => (b.us - b.them) - (a.us - a.them))[0] ?? null;
    const worst = [...losses].sort((a, b) => (b.them - b.us) - (a.them - a.us))[0] ?? null;
    const duplicateName = [...teams.values()].filter((candidate) => candidate.name === team.name).length > 1;
    const gameIds = new Set(games.map((result) => result.gameId));
    const box = allRows.filter((row) => gameIds.has(row.game_id)
      && (duplicateName || row.team === team.name));
    return { wins: wins.length, losses: losses.length, best, worst, box, duplicateName };
  }, [allRows, membership, rd, team, teams]);

  const wpd = useMemo(() => new Map((rd?.standings ?? []).map((row) => {
    const spend = spendThroughRound(teams.get(row.teamId)?.spendLog ?? [], round);
    return [row.teamId, spend > 0 ? row.wins / spend : null] as const;
  })), [rd?.standings, round, teams]);

  if (!game || !team || !rd || !summary || !membership) return null;

  const standing = rd.standings.find((row) => row.teamId === membership.teamId);
  const awardTeam = (teamId: string) => teams.get(teamId)?.name ?? '—';
  const bargain = rd.awards.bargain;
  const bargainContract = bargain
    ? teams.get(bargain.teamId)?.roster.find((contract) => contract.pid === bargain.pid)
      ?? teams.get(bargain.teamId)?.spendLog.slice().reverse()
        .find((contract) => contract.pid === bargain.pid)
    : null;
  const bargainGameIds = bargain
    ? new Set(rd.games
      .filter((result) => result.home === bargain.teamId || result.away === bargain.teamId)
      .map((result) => result.game_id))
    : new Set<string>();
  const bargainRows = bargain
    ? allRows.filter((row) => bargainGameIds.has(row.game_id)
      && row.team === awardTeam(bargain.teamId)
      && row.player_id === bargain.pid)
    : [];
  const bargainLine = bargainRows.length
    ? `${(bargainRows.reduce((sum, row) => sum + row.pts, 0) / bargainRows.length).toFixed(1)} pts · ${
      (bargainRows.reduce((sum, row) => sum + row.rebounds, 0) / bargainRows.length).toFixed(1)} reb · ${
      (bargainRows.reduce((sum, row) => sum + row.steals + row.blocks, 0) / bargainRows.length).toFixed(1)} stocks per game`
    : '';
  const slides = [
    <div key="mvp"><strong>Round MVP</strong><span>{catalog.get(rd.awards.roundMvp.pid)?.name}{' '}
      ({awardTeam(rd.awards.roundMvp.teamId)})</span>
      <span className="mono">{rd.awards.roundMvp.line}</span></div>,
    <div key="top"><strong>Top Scorer</strong><span>{catalog.get(rd.awards.topScorer.pid)?.name}{' '}
      ({awardTeam(rd.awards.topScorer.teamId)})</span>
      <span className="mono">{rd.awards.topScorer.pts} pts</span></div>,
    <div key="bargain"><strong>Bargain of the Round</strong><span>{bargain
      ? `${catalog.get(bargain.pid)?.name} (${awardTeam(bargain.teamId)})`
      : '—'}</span>
      {bargain ? <span className="mono">{bargainLine}{bargainContract
        ? ` · ${fmtM(bargainContract.rate)}/rd`
        : ''}</span> : null}</div>,
  ];

  const leaveAwards = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setAwardFocused(false);
  };

  return (
    <main className="page">
      <PhaseHeader title="Results" round={round} timerEndsAt={game.timerEndsAt}
        timerPausedMs={game.timerPausedMs} />

      <div className={styles.overviewGrid}>
        <div className={styles.summaryColumn}>
          <ResultsHero wins={summary.wins} losses={summary.losses}
            rank={standing?.rank ?? 0} previousRank={standing?.previousRank ?? null} />

          <div className={styles.highlights} aria-label="Round highlights">
            <article className={styles.highlight}>
              <span>Best win</span>
              {summary.best ? <strong><b>{summary.best.us}–{summary.best.them}</b> vs {summary.best.opponent}</strong>
                : <strong>No wins this round</strong>}
            </article>
            <article className={styles.highlight}>
              <span>Worst loss</span>
              {summary.worst ? <strong><b>{summary.worst.us}–{summary.worst.them}</b> vs {summary.worst.opponent}</strong>
                : <strong>No losses this round</strong>}
            </article>
          </div>

          <section className={styles.awards} data-testid="awards" aria-label="Round awards"
            onMouseEnter={() => setAwardHovered(true)} onMouseLeave={() => setAwardHovered(false)}
            onFocusCapture={() => setAwardFocused(true)} onBlurCapture={leaveAwards}>
            <button className="chip" type="button" aria-label="previous award"
              onClick={() => setSlide((value) => (value + 2) % 3)}>‹</button>
            <div className={styles.awardSlide}>{slides[slide]}</div>
            <button className="chip" type="button" aria-label="next award"
              onClick={() => setSlide((value) => (value + 1) % 3)}>›</button>
          </section>
        </div>

        <section className={styles.standingsPanel} aria-labelledby="snapshot-title">
          <div className={styles.panelHeading}>
            <div>
              <h2 id="snapshot-title">League snapshot</h2>
              <span>Through round {round}</span>
            </div>
          </div>
          <div className={styles.standingsScroll} tabIndex={0} role="region"
            aria-label="League standings, scrollable">
            <StandingsTable rows={rd.standings} highlightTeamId={membership.teamId}
              wpd={wpd} round={round} showMovement />
          </div>
        </section>
      </div>

      <BoxscoreExplorer rows={summary.box} round={round} csv={rd.boxCsv}
        ambiguityNote={summary.duplicateName
          ? 'Two franchises share this name. Full matchup lines are shown so no row is assigned to the wrong team.'
          : null} />
      <AuctionResolution auction={auction} privateAuction={privAuction} round={round}
        catalog={catalog} teams={teams} />
    </main>
  );
}
