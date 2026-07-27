// Default Role Player (spec §2, Dylan-adjudicated 2026-07-26): hardship no longer
// drafts real FA players — every stranded slot gets one of these synthetic, $0,
// replacement-level entries instead, IDENTICAL for every team. Pids live in a
// reserved 9000+ range so they can never collide with datagen pids (players.json
// tops out at 1175 — verified). NEVER add these to players.json or hidden.json
// (both datagen-owned, both regenerated with a hard 175-row assertion in
// datagen/export_runtime_bundle.py), nor to FA_POOL, market draws, auction waves,
// awards, or the reveal. They are also never signable through any callable —
// validateSigning rejects the whole pid range and expiringPids filters them out,
// so hardship is the ONLY way one ever reaches a roster.
export const SYNTHETIC_MIN_PID = 9000;

// --- hidden (engine-side) truth ---------------------------------------------
//
// The public card below is NOT what the engine reads. engine.js/sim.js resolve
// every strength and box-score input from hidden.json (`hidden[pid].comps` /
// `.attrs` / `.exp` / `.ti`), a parallel datagen bundle keyed by pid — so a
// synthetic with no entry there crashes teamStrength/teamBox the moment it takes
// the floor, which for a hardship team is immediate (a stranded team's only B is
// a synthetic, and validateLineup's 2G/2W/1B template forces it into the five).
// engine.js therefore merges this block as an ADDITIVE overlay (see engine.js).
//
// Values are EMPIRICALLY DERIVED, not invented: each is the 25th percentile of
// that field across the real 175 hidden entries (linear-interpolated percentile,
// rounded to hidden.json's own shipped precision — ti/comps 6dp, attrs 3dp,
// exp 4dp / 5dp for the rate fields). Provenance and the audit table live in the
// task-2 report (session ledger, not in repo).
// Sanity checks that fixed these as "replacement level, weak":
//   - attrs.three_pt 39.648 < synergy.shooter_3pt_skill (42) -> never counts as a
//     shooter, so a DRP can only ever push a lineup toward the spacing penalty.
//   - attrs.defense 46.227 < synergy.rim_block_skill (48) -> as the rim anchor it
//     trips rim_penalty; it can never supply the rim bonus.
//     (Both inequalities are pinned against engine_params.json in synthetics.test.js.)
//   - drift multiplier d = ti/ti_raw = 0.990225, between the real p25 (0.955) and
//     median (1.0) — non-degenerate and slightly below neutral, so ti_raw is kept
//     at its own empirical p25 rather than being flattened to ti.
//   - per-starter strength contribution 7.838 vs a real-player mean of 9.961 —
//     the 12th percentile of the real distribution. Genuinely weak.
// NOTE on comps.tov: engine.js SUBTRACTS the turnover channel, so a low p25 tov
// is nominally favorable. It is kept at p25 for consistency of method (every
// field derived the same way, no per-field cherry-picking); the end-to-end
// contribution check above confirms the block still lands in the bottom eighth.
const HIDDEN_STATS = {
  ti: 8.814669, ti_raw: 8.901687,
  attrs: { three_pt: 39.648, defense: 46.227 },
  comps: {
    sv_interior: 0.913733, sv_three: -0.772996, play: 1.156972, defense: 2.1823,
    tov: 1.708386, reb_only: 0.469043, sec_value: -0.019527, shooting: 1.585917,
    stocks: 1.575726,
  },
  // All 12 fields a real hidden.json entry carries, same p25 derivation. Only nine
  // are read by sim.js's teamBox (fga, fga3_share, fg_pct, three_pt_pct, rebounds,
  // assists, steals, blocks, turnovers) — pts/mins/ft_pct are carried because the
  // PUBLIC CARD below is generated from them, which is what keeps the card honest
  // about what this player actually does on the floor.
  exp: {
    fga: 9.5854, fga3_share: 0.21516, fg_pct: 0.37106, three_pt_pct: 0.24492,
    ft_pct: 0.6736, pts: 9.7843, mins: 22.2065,
    rebounds: 1.8762, assists: 2.1036, steals: 0.9844, blocks: 0.1643,
    turnovers: 1.1389,
  },
};

// --- public catalog card -----------------------------------------------------
//
// GENERATED FROM HIDDEN_STATS.exp above — deliberately not hand-typed. A real
// player's card is a noisy observation of the same underlying expectation the
// engine simulates from, so card/expected ratios across the real 175 sit tight
// around 1.0 (fg_attempts spans [0.753, 1.174], median 1.008). Hand-written card
// numbers put the DRP at 0.417 on that ratio — a card claiming 3.8 pts in 12.0
// minutes while the engine had it posting ~11 pts per 36 — so the card lied about
// the player in the one direction that matters: it made a scout reading the card
// underrate what the sim would actually produce. Deriving the card from `exp` at
// card precision (1dp per-game, 3dp rates) pins every ratio at ~1.00 and makes the
// DRP DESCRIBE its weakness honestly instead of understating it. The player is
// exactly as weak as before — only the card changed.
const f1 = (x) => x.toFixed(1);      // per-game counting stats
const f3 = (x) => x.toFixed(3);      // rate stats
const E = HIDDEN_STATS.exp;
const STAT_BLOCK = {
  // Replacement level: bottom-quartile minutes-earner. Identical for all three
  // positions by ruling ("they all have the same stats").
  age: '27', years_pro: '4', hype: '1.0', salary_per_round: '0.0', auction_round: '',
  personality: 'Steady', scout_grade: 'C', social_media_followers: '10000',
  games_played: '60',
  mins_per_game: f1(E.mins), pts_per_game: f1(E.pts),
  fg_attempts_per_game: f1(E.fga), fg_pct: f3(E.fg_pct),
  three_pt_pct: f3(E.three_pt_pct), ft_pct: f3(E.ft_pct),
  rebounds_per_game: f1(E.rebounds), assists_per_game: f1(E.assists),
  steals_per_game: f1(E.steals), blocks_per_game: f1(E.blocks),
  turnovers_per_game: f1(E.turnovers),
  // last season mirrors this season: a DRP has no arc, and the reveal's
  // improvement/decline story is only ever told about the real 175.
  prev_pts_per_game: f1(E.pts), prev_fg_pct: f3(E.fg_pct), prev_mins_per_game: f1(E.mins),
};

// Eight rows cover the worst case (an empty roster filled to the 8-man floor)
// with DISTINCT pids: 3 G + 3 W + 2 B satisfies 2G/2W/1B + three flex slots.
export const SYNTHETICS = [
  ...[9001, 9002, 9003].map((pid) => ({ pid, position: 'G' })),
  ...[9011, 9012, 9013].map((pid) => ({ pid, position: 'W' })),
  ...[9021, 9022].map((pid) => ({ pid, position: 'B' })),
].map(({ pid, position }) => ({
  pid, player_id: String(pid), name: 'Default Role Player', position, ...STAT_BLOCK,
}));

// Keyed by pid, shaped exactly like a hidden.json entry. Every pid shares ONE
// stat block (Dylan's ruling: "they all have the same stats"); only `position`
// varies, and it MIRRORS the catalog label on purpose — engine.js reads
// hidden[pid].position for rimScore and the big/guard scoring channels, so a
// hidden label that disagreed with the catalog label would desync the strength
// engine from the box rows sim.js stamps from catalogById. Position is an
// identity field here, not a stat.
export const SYNTHETIC_HIDDEN = Object.fromEntries(
  SYNTHETICS.map((p) => [p.pid, { position: p.position, ...HIDDEN_STATS }]));
