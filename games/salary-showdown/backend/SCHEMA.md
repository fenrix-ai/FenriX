# Firestore contract (server-authoritative; clients write ONLY via callables + displayName)

games/{gameId}
  joinCode, status: lobby|active|finished, phase: LOBBY|FRONT_OFFICE|FREE_AGENCY|AUCTION|LINEUP|SIMULATE|RESULTS|FINALE,
  round: 0-5, timerEndsAt: ts|null, teamCount, standingsSeed, config: {cap, totalRounds, timers{...}}
games/{gameId}/players/{uid}          # membership: { teamId, role: GM|Scout|Coach, displayName }
games/{gameId}/teams/{teamId}         # PUBLIC team state (rosters are public like real NBA):
  name, wins, losses, pointDiff, pointsFor,
  roster: [{pid, rate, startRound, years, viaAuction, hardship}],
  deadMoney: [{rate, startRound, endRound}],
  lineup: {starters[5], sixth, bench[], playstyle} | null,
  lineupLockedRound, hardshipUsed: [round]
games/{gameId}/teams/{teamId}/private/auction    # { bids: { [pid]: {rate, years} } } — Scout writes via callable
games/{gameId}/catalog/{pid}          # public player card (26 CSV cols), seeded at createGame
games/{gameId}/market/{round}         # { available: [pid], resignExempt: true }  (public, server-written)
games/{gameId}/auctions/{round}       # { stars: [pid], results: [{pid, teamId|null, rate, years, guaranteed}] } — results field added at resolution
games/{gameId}/rounds/{r}             # { games: [{home, away, homeScore, awayScore}], awards: {...}, boxCsv: string, standings: [...] }
games/{gameId}/reveal/latest          # written ONLY after round 5 RESULTS (finale payload)

RULES POLICY
- authenticated members of a game may READ everything under their game EXCEPT teams/*/private/* of other teams and reveal/* before status=finished.
- players/{uid}: user may create own membership (via joinGame callable in practice) and update displayName only.
- ALL other writes: server only (callables use Admin SDK, which bypasses rules).
- hidden.json / engine_params.json are NOT in Firestore at all.
