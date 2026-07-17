import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useRoundDoc } from '../hooks/useRoundDoc';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { StandingsTable } from '../components/ui/StandingsTable';
import { parseBoxCsv, teamRows } from '../lib/boxfeed';
import { spendThroughRound } from '../lib/contracts';
import { fmtM } from '../lib/money';

// ALL 23 feed columns (spec §11.14: own box lines show the complete feed schema);
// the table is wide and lives inside an overflow-x scroll container.
const BOX_COLS = ['round', 'game_id', 'team', 'opponent', 'team_score', 'opp_score',
  'win', 'player_id', 'player_name', 'position', 'tier', 'mins', 'pts', 'fgm', 'fga',
  'three_pm', 'three_pa', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers',
  'playstyle'] as const;

export default function ResultsPage() {
  const { game, team, teams, membership, catalog } = useGame();
  const round = game?.round ?? 1;
  const rd = useRoundDoc(round);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % 3), 5000);
    return () => clearInterval(id);
  }, []);

  const allRows = useMemo(() => (rd ? parseBoxCsv(rd.boxCsv) : []), [rd]);

  const my = useMemo(() => {
    if (!rd || !membership || !team) return null;
    const games = rd.games
      .filter((g) => g.home === membership.teamId || g.away === membership.teamId)
      .map((g) => {
        const home = g.home === membership.teamId;
        return { opponent: teams.get(home ? g.away : g.home)?.name ?? '—',
          us: home ? g.homeScore : g.awayScore, them: home ? g.awayScore : g.homeScore };
      });
    const wins = games.filter((g) => g.us > g.them);
    const losses = games.filter((g) => g.us < g.them);
    const best = wins.sort((a, b) => (b.us - b.them) - (a.us - a.them))[0] ?? null;
    const worst = losses.sort((a, b) => (b.them - b.us) - (a.them - a.us))[0] ?? null;
    return { record: `${wins.length}–${losses.length}`, best, worst,
      box: teamRows(allRows, team.name) };
  }, [rd, membership, team, teams, allRows]);

  const wpd = useMemo(() => {
    const m = new Map<string, number>();
    for (const [tid, t] of teams) {
      const spend = spendThroughRound(t.spendLog ?? [], round);
      m.set(tid, spend > 0 ? t.wins / spend : 0);
    }
    return m;
  }, [teams, round]);

  if (!game || !team || !rd || !my || !membership) return null;

  const download = () => {
    // Verbatim server string — never re-serialize; students get byte-identical data.
    const url = URL.createObjectURL(new Blob([rd.boxCsv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'),
      { href: url, download: `boxscores_round_${round}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const awardTeam = (tid: string) => teams.get(tid)?.name ?? '—';
  const bargain = rd.awards.bargain;
  const bargainContract = bargain
    ? teams.get(bargain.teamId)?.roster.find((c) => c.pid === bargain.pid)
      ?? teams.get(bargain.teamId)?.spendLog.slice().reverse().find((c) => c.pid === bargain.pid)
    : null;
  const bargainRows = bargain
    ? teamRows(allRows, awardTeam(bargain.teamId))
        .filter((r) => r.player_id === bargain.pid)
    : [];
  const bargainLine = bargainRows.length
    ? `${(bargainRows.reduce((s, r) => s + r.pts, 0) / bargainRows.length).toFixed(1)} pts · ${
       (bargainRows.reduce((s, r) => s + r.rebounds, 0) / bargainRows.length).toFixed(1)} reb · ${
       (bargainRows.reduce((s, r) => s + r.steals + r.blocks, 0) / bargainRows.length).toFixed(1)} stocks per game`
    : '';

  const slides = [
    <div key="mvp"><strong>Round MVP</strong> — {catalog.get(rd.awards.roundMvp.pid)?.name}{' '}
      ({awardTeam(rd.awards.roundMvp.teamId)}) · <span className="mono">{rd.awards.roundMvp.line}</span></div>,
    <div key="top"><strong>Top Scorer</strong> — {catalog.get(rd.awards.topScorer.pid)?.name}{' '}
      ({awardTeam(rd.awards.topScorer.teamId)}) · <span className="mono">{rd.awards.topScorer.pts} pts</span></div>,
    <div key="bargain"><strong>Bargain of the Round</strong> — {bargain
      ? <>{catalog.get(bargain.pid)?.name} ({awardTeam(bargain.teamId)}) ·{' '}
          {/* Raw line + salary ONLY — perDollar is on the wire but is never rendered. */}
          <span className="mono">{bargainLine}{bargainContract ? ` · ${fmtM(bargainContract.rate)}/rd` : ''}</span></>
      : '—'}</div>,
  ];

  return (
    <main className="page">
      <PhaseHeader title="Results" round={round} timerEndsAt={game.timerEndsAt} />
      <h2 className="mono" style={{ fontSize: 34, margin: '4px 0' }}>{my.record}</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {my.best && <div className="card" style={{ flex: 1, minWidth: 180 }}>
          <div className="dim">BEST WIN</div>
          <span className="ok mono">{my.best.us}–{my.best.them}</span> vs {my.best.opponent}</div>}
        {my.worst && <div className="card" style={{ flex: 1, minWidth: 180 }}>
          <div className="dim">WORST LOSS</div>
          <span className="neg mono">{my.worst.us}–{my.worst.them}</span> vs {my.worst.opponent}</div>}
      </div>

      <div className="card" style={{ margin: '12px 0' }} data-testid="awards">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="chip" aria-label="previous award"
            onClick={() => setSlide((s) => (s + 2) % 3)}>‹</button>
          <div style={{ flex: 1 }}>{slides[slide]}</div>
          <button className="chip" aria-label="next award"
            onClick={() => setSlide((s) => (s + 1) % 3)}>›</button>
        </div>
      </div>

      <details open>
        <summary className="muted" style={{ cursor: 'pointer' }}>Your box lines</summary>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr>{BOX_COLS.map((c) => <th key={c} className={c === 'player_name' ? 'name' : ''}>{c}</th>)}</tr></thead>
            <tbody>
              {my.box.map((r, i) => (
                <tr key={`${r.player_id}-${i}`}>
                  {BOX_COLS.map((c) => (
                    <td key={c} className={c === 'player_name' ? 'name' : ''}>
                      {String(r[c as keyof typeof r])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <button className="btn gold" onClick={download} style={{ margin: '10px 0' }}>
        Download boxscores_round_{round}.csv — whole league, every line
      </button>

      <StandingsTable rows={rd.standings} highlightTeamId={membership.teamId} wpd={wpd} />
    </main>
  );
}
