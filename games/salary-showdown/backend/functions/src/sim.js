// Round-robin simulation: box scores, awards, standings, and the frozen 23-column
// student data feed (§7.2). Determinism per game: seed `${gameId}|sim|${round}|${A}|${B}`.
import { makeRng } from './rng.js';
import { teamStrength, winProb, loadEngine } from './engine.js';

const { hidden, params } = loadEngine();
const TIER_MINS = { starter: 33, sixth: 24, bench: 15 };

// Only the 8 who play: 5 starters + sixth + bench[0..1]. autoRepair/validateLineup
// assign every active roster pid across starters/sixth/bench (bench can exceed 2 on a
// >8-man roster), but engine.teamStrength's own `slots()` also caps at bench.slice(0,2)
// — this MUST mirror that cap so the box generator and the strength engine agree on
// who actually took the floor.
function playerSlots(lineup) {
  const out = lineup.starters.map((pid) => [pid, 'starter']);
  out.push([lineup.sixth, 'sixth']);
  lineup.bench.slice(0, 2).forEach((pid) => out.push([pid, 'bench']));
  return out;
}

function teamBox(rng, lineup, pace) {
  const slots = playerSlots(lineup);
  const rawMins = slots.map(([, tier]) => TIER_MINS[tier]);
  const scale = 240 / rawMins.reduce((a, b) => a + b, 0);
  return slots.map(([pid, tier], i) => {
    const e = hidden[pid].exp;
    const mins = Math.round(rawMins[i] * scale);
    const mf = Math.min(1.6, Math.max(0.5, mins / e.mins));
    const fga = Math.max(1, Math.round(e.fga * pace * mf + rng.normal(0, 1.1)));
    const fga3 = Math.min(fga, Math.round(fga * e.fga3_share));
    const fga2 = fga - fga3;
    const binom = (n, p) => { let k = 0; for (let t = 0; t < n; t++) if (rng.next() < p) k++; return k; };
    // split expected fg% into 2P/3P using the same shares the generator used
    const p3 = e.three_pt_pct;
    const p2 = fga2 > 0 ? Math.min(0.72, Math.max(0.3, (e.fg_pct * fga - p3 * fga3) / fga2)) : 0.5;
    const fgm3 = binom(fga3, p3);
    const fgm2 = binom(fga2, p2);
    const ftm = Math.max(0, Math.round(rng.normal(0.14 * fga, 1)));
    const stat = (x) => Math.max(0, Math.round(rng.normal(x * pace * mf, 0.35 * Math.sqrt(x + 0.2))));
    return { pid, tier, mins, fga, three_pa: fga3, fgm: fgm2 + fgm3, three_pm: fgm3,
             pts: 2 * fgm2 + 3 * fgm3 + ftm,
             rebounds: stat(e.rebounds), assists: stat(e.assists), steals: stat(e.steals),
             blocks: stat(e.blocks), turnovers: stat(e.turnovers) };
  });
}

export function simulateRound({ gameId, round, teams, catalogById }) {
  const games = [], boxRows = [];
  const totals = Object.fromEntries(teams.map((t) => [t.teamId,
    { wins: t.wins, losses: t.losses, pointDiff: t.pointDiff, pointsFor: t.pointsFor }]));
  const strength = {}, style = {};
  for (const t of teams) {
    style[t.teamId] = t.lineup.playstyle;
    strength[t.teamId] = teamStrength(t.lineup.starters, t.lineup.sixth, t.lineup.bench,
                                      t.lineup.playstyle, true);
  }
  let gnum = 0;
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
    const A = teams[i], B = teams[j];
    gnum += 1;
    const gameId2 = `R${round}-G${String(gnum).padStart(3, '0')}`;
    const rng = makeRng(`${gameId}|sim|${round}|${A.teamId}|${B.teamId}`);
    const p = winProb(strength[A.teamId], strength[B.teamId], style[A.teamId], style[B.teamId]);
    const aWins = rng.next() < p;
    const paceA = params.pace[style[A.teamId]], paceB = params.pace[style[B.teamId]];
    const paceAvg = (paceA + paceB) / 2;
    const boxA = teamBox(rng, A.lineup, paceAvg);
    const boxB = teamBox(rng, B.lineup, paceAvg);
    const sum = (b) => b.reduce((s, r) => s + r.pts, 0);
    const [winBox, loseBox] = aWins ? [boxA, boxB] : [boxB, boxA];
    // Enforce the Bernoulli-decided winner by adding made 2pt baskets to the winning
    // box's current top scorer until the summed score strictly exceeds the loser's.
    // Terminates: each iteration adds +2 to winBox's total while loseBox is untouched,
    // so sum(winBox) is strictly increasing and the loop condition is a fixed,
    // finite gap — bounded by ceil((sum(loseBox) - sum(winBox) + 1) / 2) iterations.
    while (sum(winBox) <= sum(loseBox)) {
      const top = winBox.reduce((a, b) => (a.pts >= b.pts ? a : b));
      top.pts += 2; top.fgm += 1; top.fga += 1;
    }
    const [as, bs] = [sum(boxA), sum(boxB)];
    games.push({ game_id: gameId2, home: A.teamId, away: B.teamId, homeScore: as, awayScore: bs });
    totals[A.teamId][as > bs ? 'wins' : 'losses'] += 1;
    totals[B.teamId][bs > as ? 'wins' : 'losses'] += 1;
    totals[A.teamId].pointDiff += as - bs; totals[A.teamId].pointsFor += as;
    totals[B.teamId].pointDiff += bs - as; totals[B.teamId].pointsFor += bs;
    const emit = (box, team, opp, ts, os) => {
      for (const r of box) boxRows.push({
        round, game_id: gameId2, team: team.name, opponent: opp.name,
        team_score: ts, opp_score: os, win: ts > os ? 1 : 0,
        player_id: r.pid, player_name: catalogById[r.pid].name,
        position: catalogById[r.pid].position, tier: r.tier, mins: r.mins, pts: r.pts,
        fgm: r.fgm, fga: r.fga, three_pm: r.three_pm, three_pa: r.three_pa,
        rebounds: r.rebounds, assists: r.assists, steals: r.steals, blocks: r.blocks,
        turnovers: r.turnovers, playstyle: team.lineup.playstyle,
        // internal-only: NOT part of FEED_COLS, so toCsv (which projects onto
        // FEED_COLS explicitly) never emits it. Carried so award attribution below
        // can resolve teamId directly instead of reverse-looking-up by team NAME —
        // createGame never enforces name uniqueness, so two same-named teams in one
        // game would otherwise collide in a name->teamId map and misattribute awards.
        teamId: team.teamId });
    };
    emit(boxA, A, B, as, bs); emit(boxB, B, A, bs, as);
  }
  // awards
  const gamescore = (r) => r.pts + 1.2 * r.rebounds + 1.5 * r.assists + 3 * r.steals
                          + 3 * r.blocks - 2.5 * r.turnovers;
  const best = boxRows.reduce((a, b) => (gamescore(a) >= gamescore(b) ? a : b));
  const topScorerRow = boxRows.reduce((a, b) => (a.pts >= b.pts ? a : b));
  const byPlayer = {};
  for (const r of boxRows) (byPlayer[r.player_id] ??= []).push(r);
  let bargain = null;
  for (const t of teams) for (const c of t.roster) {
    const rows = byPlayer[c.pid]; if (!rows) continue;
    const perDollar = rows.reduce((s, r) => s + gamescore(r), 0) / Math.max(2, c.rate);
    if (!bargain || perDollar > bargain.perDollar)
      bargain = { pid: c.pid, teamId: t.teamId, perDollar: Math.round(perDollar * 100) / 100 };
  }
  const awards = {
    roundMvp: { pid: best.player_id, teamId: best.teamId,
                line: `${best.pts} pts, ${best.rebounds} reb, ${best.assists} ast` },
    topScorer: { pid: topScorerRow.player_id, teamId: topScorerRow.teamId, pts: topScorerRow.pts },
    bargain,
  };
  // standings with full tiebreak chain
  const coin = makeRng(`${gameId}|standings|${round}`);
  const standings = teams.map((t) => ({ teamId: t.teamId, name: t.name, ...totals[t.teamId],
                                        coin: coin.next() }))
    .sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff
                 || b.pointsFor - a.pointsFor || a.coin - b.coin)
    .map((t, i) => { const { coin: _c, ...rest } = t; return { ...rest, rank: i + 1 }; });
  return { games, boxRows, awards, standings };
}

const FEED_COLS = ['round', 'game_id', 'team', 'opponent', 'team_score', 'opp_score', 'win',
  'player_id', 'player_name', 'position', 'tier', 'mins', 'pts', 'fgm', 'fga', 'three_pm',
  'three_pa', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'playstyle'];

export function toCsv(rows) {
  const esc = (v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [FEED_COLS.join(','),
          ...rows.map((r) => FEED_COLS.map((c) => esc(r[c])).join(','))].join('\n');
}
