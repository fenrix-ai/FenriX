# Firestore contract (server-authoritative; clients write ONLY via callables + displayName)

games/{gameId}
  joinCode, status: lobby|active|finished, phase: LOBBY|FRONT_OFFICE|FREE_AGENCY|AUCTION|LINEUP|SIMULATE|RESULTS|FINALE,
  round: 0-5, timerEndsAt: ts|null, timerPausedMs: number|null, teamCount, standingsSeed, config: {cap, totalRounds},
                                      # timerEndsAt/timerPausedMs — the setTimer state machine (professor-only callable):
                                      #   running: timerEndsAt = ts,   timerPausedMs = null
                                      #   paused:  timerEndsAt = null, timerPausedMs = remaining ms (number)
                                      #   off:     both null
                                      # Every advancePhase flip nulls BOTH fields — a timer never survives a phase change.
                                      # CLIENT CONTRACT: timers are ADVISORY pacing only (spec §13). Expiry never blocks a
                                      # submission server-side; advancing is what closes a phase. Clients render these
                                      # fields, nothing enforces them. There is NO config.timers — per-phase defaults live
                                      # in the professor panel's localStorage, not in the game doc.
  revealStep: number                  # FINALE projector step (integer 0..8). ABSENT until the first setRevealStep
                                      # call: the RESULTS(5)->FINALE flip does NOT write it (spec §4.3 — setRevealStep
                                      # is its only writer; walls/steppers default a missing value via `?? 0`).
                                      # setRevealStep is professor-only, FINALE-only. Member-readable like the rest of the doc.
  transition: {fromRound, fromPhase, toRound, toPhase}  # OPTIONAL — present only while an advancePhase's
                                      # phase hooks are resolving: the flip-first transaction writes it alongside
                                      # the new round/phase, and the same call deletes it once both hooks land.
                                      # A leftover marker means a crashed advance; the next advancePhase call
                                      # adopts and finishes that transition instead of advancing again.
                                      # Member-readable like the rest of the game doc — it names rounds/phases
                                      # only and leaks nothing.
                                      # CLIENT CONTRACT: while present, the destination phase's data
                                      # (auctions/{r}, market/{r}, rounds/{r}) may not exist yet — clients
                                      # must present fromRound/fromPhase until the marker clears (the app's
                                      # GameContext does; new surfaces must follow suit).
games/{gameId}/players/{uid}          # membership: { teamId, role: GM|Scout|Coach, displayName }
games/{gameId}/teams/{teamId}         # PUBLIC team state (rosters are public like real NBA):
  name, wins, losses, pointDiff, pointsFor,
  roster: [{pid, rate, startRound, years, viaAuction, hardship}],
  deadMoney: [{pid, rate, startRound, endRound}],
  spendLog: [{pid, rate, years, startRound, viaAuction, hardship}]  # append-only ledger: every
                                      # contract ever acquired (signPlayer incl. re-signs, auction
                                      # wins, hardship signings) gets pushed here and NEVER removed —
                                      # cutting a contract removes it from `roster` but not from
                                      # spendLog, because committed money is never recovered. FINALE's
                                      # reveal (winsPerDollar.totalSpend = Σ rate×years, and perTeam
                                      # best/worst signing) reads spendLog, not the live roster, so a
                                      # cut or expired contract still counts and stays eligible for
                                      # "worst signing".
  lineup: {starters[5], sixth, bench[], playstyle} | null,
  lineupLockedRound, hardshipUsed: [round],
  doneRound: 0-5, donePhase: ''|FRONT_OFFICE|FREE_AGENCY   # "We're done" STATUS FLAG, NEVER a lock:
                                      # markDone (GM-only callable, valid only in FRONT_OFFICE/FREE_AGENCY)
                                      # stamps the game's current {round, phase} here. Professor-panel
                                      # submission lights read doneRound === round && donePhase === phase.
                                      # Initialized 0 / '' at createGame. Gates NOTHING — signing/cutting
                                      # stays open until the professor closes the phase, and no callable
                                      # may ever read these fields as a precondition.
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
                                      # market/{round}.available with `price` as its list price. Unlike ordinary FAs, unsold
                                      # stars stay EXCLUSIVE: this doc is the claim token — signPlayer tx.gets + tx.deletes
                                      # it inside the signing transaction (doc missing => STAR_TAKEN), so exactly one team
                                      # ever signs the star and later draws no longer include him.
                                      # server-only: never client-accessible, explicit deny-all in rules.
games/{gameId}/rounds/{r}             # { games: [{home, away, homeScore, awayScore}], awards: {...}, boxCsv: string,
                                      #   standings: [{teamId, name, wins, losses, pointDiff, pointsFor, tiebreakCoin, rank,
                                      #                previousRank}] }
                                      # previousRank: number|null — this team's rank in rounds/{r-1}.standings, null for
                                      # r=1 (no prior round exists). Stamped by enter:SIMULATE inside the same single
                                      # batch that writes the round doc; consumed by the bigscreen standings shuffle
                                      # (delta glyphs: up/down/flat, NEW when null).
                                      # tiebreakCoin is the seeded per-round coin-flip value used as the LAST link in the
                                      # tiebreak chain (wins > pointDiff > pointsFor > tiebreakCoin) — kept on the stored
                                      # row (not stripped) so the tiebreak is auditable from the round doc itself; team
                                      # docs (games/{gameId}/teams/{teamId}) are unaffected — only wins/losses/pointDiff/
                                      # pointsFor roll forward there.
games/{gameId}/reveal/latest          # written ONLY after round 5 RESULTS (finale payload):
                                      # { scatter, perTeam, winsPerDollar, trueWeights }
                                      # trueWeights: { narrative, defenseVisible, turnoverWeight (kept for compat),
                                      #   engine: {base, scoring, playmaking, steal, block, rebound, turnover},
                                      #   regression: {winsR2, turnoverCoef, turnoverP, payrollT, hypeT} }
                                      # turnoverP is the STRING '<0.001'. engine/regression are merged verbatim from
                                      # functions/src/data/reveal_weights.json, GENERATED by datagen/generate.py
                                      # (engine = ti_weights; regression = the harness's own check-1 OLS on
                                      # league_history.csv) — regenerate via `python3 generate.py`, never hand-edit.
games/{gameId}/hooklog/{key}          # phase-hook idempotency log; key "{round}-{phase}" (exit) or "enter-{round}-{phase}" (entry): { at: ts }
                                      # server-only: makes advancePhase retries safe (a resolved hook is never re-fired); explicit deny-all in rules

RULES POLICY
- authenticated members of a game may READ everything under their game EXCEPT teams/*/private/* of other teams, reveal/* before status=finished, and hooklog/*, unsold/* (server-only, always denied).
- the game's professor (games/{gameId}.professorUid == request.auth.uid) may additionally READ
  everything under their own game — including OTHER teams' private bid docs (they run the room; the
  professor panel shows submission status per spec) and reveal/* even before status=finished (they're
  the one who triggers the finale). hooklog/* and unsold/* stay denied to everyone, professor
  included — those are pure server-internal scratch data. The professor gets no extra WRITE access:
  every mutation remains callable-only regardless of role.
- players/{uid}: membership CREATE is server-only (joinGame callable via Admin SDK); the only client write is updating one's own displayName.
- ALL other writes: server only (callables use Admin SDK, which bypasses rules).
- hidden.json / engine_params.json are NOT in Firestore at all.
