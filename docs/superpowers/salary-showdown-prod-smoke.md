# Salary Showdown — prod smoke (scripted + manual)

## Scripted smoke

Run from `games/salary-showdown/app` (uses the app's installed `firebase`
package and `.env.production`; no admin SDK, no extra deps):

    node scripts/prod-smoke.mjs

Takes ~2-4 minutes: it plays a FULL 5-round season through the finale. Exit 0
with all-PASS lines = prod callables, rules, region pin (us-west1), anonymous
auth, the round pipeline (FA -> auction -> lineup -> simulate -> results),
rounds 2-5 carried by server defaults alone, and the finale reveal
(`reveal/latest` readable by a MEMBER once the game is finished, with all 7
engine weights) all work end-to-end. Each run leaves one finished test game
(and 4 anonymous auth users) in prod — deleting requires the console; idle
cost $0.

### Last green transcript (plan 3b task 5)

```
prod-smoke against project salary-showdown
PASS anonymous auth x4 (prof, GM, Scout, Coach) — 4 distinct uids
PASS createGame — gameId=Y0ujIg6qXKLHjfrlBzeN joinCode=Y0UJIG
PASS getLobby (pre-join) — teamAId=eTS9efDSrSxdvnNfWa0E
PASS joinGame x3 (GM/Scout/Coach on Smoke A) — all 3 seats claimed
PASS startSeason -> R1:FREE_AGENCY — game doc active/FREE_AGENCY/1 (prof + member reads)
PASS FA signings x8 (cheapest-fit, harness driveTo algorithm) — Smoke A roster = 8
PASS advancePhase FREE_AGENCY -> AUCTION
PASS submitBids (min bid on wave star) — bid 2 on star 1028
PASS advancePhase AUCTION -> LINEUP
PASS advancePhase LINEUP -> SIMULATE
PASS rounds/1 standings shape + previousRank null — 2 rows, all fields, previousRank null
PASS advancePhase SIMULATE -> RESULTS (full round complete)
PASS setTimer start(60) -> pause -> clear round-trip — paused with 59812ms remaining
PASS round 2 on server defaults (R1:RESULTS -> R2:RESULTS) — rounds/2 written, previousRank carried
PASS round 3 on server defaults (R2:RESULTS -> R3:RESULTS) — rounds/3 written, previousRank carried
PASS round 4 on server defaults (R3:RESULTS -> R4:RESULTS) — rounds/4 written, previousRank carried
PASS round 5 on server defaults (R4:RESULTS -> R5:RESULTS) — rounds/5 written, previousRank carried
PASS advancePhase R5:RESULTS -> FINALE (season over, status finished) — game doc finished/FINALE/5
PASS reveal/latest readable by a MEMBER — trueWeights.engine has 7 keys — engine weights: base, block, playmaking, rebound, scoring, steal, turnover
---
CLEANUP NOTE: test game LEFT IN PLACE (finished, at FINALE) — gameId=Y0ujIg6qXKLHjfrlBzeN joinCode=Y0UJIG.
Deleting it (and the 4 anonymous auth users) requires the Firebase console;
this plan ships no admin credentials. It is inert and costs nothing while idle.
19 passed, 0 failed
```

## Manual checklist (Dylan — real devices, ~10 minutes)

Prereq: the scripted smoke above is green. Use the hosting URL from the T4
deploy. Timers are advisory pacing only; nothing below is blocked by one.

- [ ] **Panel on laptop.** Open `<hosting-url>/professor` in Chrome. Create a
      session with 2 franchises. SEE the join code in the session header.
- [ ] **Phone join 1.** On your phone (cellular, NOT campus wifi — that is the
      point of the test), open `<hosting-url>`, enter the join code, pick a
      team, claim GM, enter a display name. SEE the lobby.
- [ ] **Phone join 2.** Second phone (or a borrowed one / second browser
      profile on the first): same join code, SAME team, claim Scout. SEE both
      display names appear on the bigscreen lobby (next item) — the panel's
      lobby view lists team names only, by design.
- [ ] **Projector.** From the panel, use the Open projector button. SEE the
      bigscreen wall (`/bigscreen`) render the lobby with both joined names.
      Drag the window to the projector/second display if testing in the room.
- [ ] **Phase flip propagates.** Start the season from the panel. WATCH both
      phones and the wall flip to Free Agency within ~3 seconds, no refresh.
- [ ] **Refresh survival.** Hard-refresh a phone mid-phase. SEE it return to
      the same game and phase without re-entering the join code (T3 moved
      gameId persistence to localStorage).
- [ ] **Crashed-laptop rejoin (the taken-seat path this pairs with).** Fully
      QUIT the browser on a joined device (not just the tab) and reopen
      `<hosting-url>`. SEE it land straight back in the game at the current
      phase: in prod the anonymous uid persists in the browser (default auth
      persistence) and `ss.gameId` now persists with it. Then, in that SAME
      browser, open the join page again, pick the same team and tap your OWN
      seat — it renders with "· taken" and is still tappable. SEE the server
      re-admit you and the game screen restore: `joinGame` rejects a claimed
      seat only when the uid DIFFERS.
      Negative half, worth seeing once: do the same tap in a FRESH incognito
      window (a new anonymous uid) and it must FAIL with "GM role already
      taken on that team". That rejection is correct — seats are bound to the
      browser identity that claimed them, so a student on a genuinely new
      device takes an open seat instead.
- [ ] **Timer on the wall.** Start a 2:00 timer from the panel. SEE it count
      down on the wall and phones; pause it; SEE it freeze everywhere.
- [ ] **Lineup drag QA (the un-automatable 30 seconds).** On a phone in the
      LINEUP phase, drag a player between lineup slots with dnd-kit. SEE the
      drop land and save. This is manual forever — no script covers it.
- [ ] Leave the test game in place or note its gameId for console cleanup.

Anything red here after a green scripted smoke is a device/network/UI issue,
not a backend one — start at the failing device's console, not the functions
logs.
