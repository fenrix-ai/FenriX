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
games/{gameId}/market/{round}         # { available: [pid], absentCounts: {pid: n}, unsoldPrices: {pid: rate} }  (public, server-written)
                                      # FA is NON-EXCLUSIVE (spec §4.2): available is a shared catalog of signable COPIES —
                                      # signing never removes a pid, and any number of teams may sign the same player;
                                      # only auction stars are exclusive. Draws run over the full FA catalog regardless
                                      # of contract status (a team re-upping its own active copy trips ALREADY_SIGNED).
                                      # absentCounts tracks consecutive rounds each FA pid was NOT drawn (drawMarket forces
                                      # a pid back in once absent >=2 rounds running); unsoldPrices carries list prices for
                                      # unsold auction stars pulled in from games/{gameId}/unsold (see below).
games/{gameId}/auctions/{round}       # { stars: [pid], results: [{pid, teamId|null, rate, years, guaranteed}] } — results field added at resolution
games/{gameId}/unsold/{pid}           # { price } — auction-class player that went unsold at auction; written by auction
                                      # resolution (Task 10). Read by the enter:FREE_AGENCY hook to force the star back into
                                      # market/{round}.available with `price` as its list price until a team signs it.
                                      # server-only: never client-accessible, explicit deny-all in rules.
games/{gameId}/rounds/{r}             # { games: [{home, away, homeScore, awayScore}], awards: {...}, boxCsv: string, standings: [...] }
games/{gameId}/reveal/latest          # written ONLY after round 5 RESULTS (finale payload)
games/{gameId}/hooklog/{key}          # phase-hook idempotency log; key "{round}-{phase}" (exit) or "enter-{round}-{phase}" (entry): { at: ts }
                                      # server-only: makes advancePhase retries safe (a resolved hook is never re-fired); explicit deny-all in rules

RULES POLICY
- authenticated members of a game may READ everything under their game EXCEPT teams/*/private/* of other teams, reveal/* before status=finished, and hooklog/*, unsold/* (server-only, always denied).
- players/{uid}: membership CREATE is server-only (joinGame callable via Admin SDK); the only client write is updating one's own displayName.
- ALL other writes: server only (callables use Admin SDK, which bypasses rules).
- hidden.json / engine_params.json are NOT in Firestore at all.
