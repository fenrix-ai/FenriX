# Salary Showdown — Class-Day Runbook

Panel (your laptop): **https://salary-showdown.web.app/professor**
Students join at: **https://salary-showdown.web.app/** (the projector shows this with the code)
Projector: never type its URL — open it from the panel's "Open projector" button.

## Pre-class setup (10 minutes before)

1. On the laptop, open the panel URL above.
2. Under **New session**, enter team names, one per line, then press **Create game**.
   Hard cap: **21 franchises** — beyond that the per-round data document approaches
   Firestore's 1 MiB limit. The panel blocks 22+ with: "Cap sessions at 21 franchises —
   the round document approaches Firestore's 1 MiB limit beyond that."
3. Write down the **join code** (the large code at the top of the panel) and the
   **game id** (press F12, then Application > Local Storage > `ss.profGameId`).
   These two lines are your whole disaster-recovery kit.
4. Press **Open projector**. Drag the new window to the projector display (extended
   display, not mirrored) and make it fullscreen. The wall shows the giant join code,
   the line "join at https://salary-showdown.web.app/?code=XXXXXX", and a live
   "X of N seats filled" counter.
5. Fallback if the projector is down: read the join code aloud from the panel header
   and tell students to enter it on the site's front page ("Find game").
6. When seats are filled (3 per team: GM, Scout, Coach — partial teams are fine),
   press **Start season**. Round 1 begins at Draft Night; Front Office first appears
   in Round 2.

## Per-phase script

Timers are advisory pacing only — expiry never blocks a student submission. The
server auto-starts nothing: you advance, or the timer does if **Auto-advance** is
checked. Advance with the gold button labelled like "Advance → Star Auction · R2".

| Phase (wall name) | What students do | Timer default | What you do |
|---|---|---|---|
| Front Office (R2-5) | GM decides expiring deals, may cut players | 3:00 | Watch the submission lights; GMs press "We're done" |
| Draft Night | GM signs free agents from tonight's market | 2:30 | Same — lights + "We're done" |
| Star Auction | GM places one sealed star bid | 2:00 | Lights fill as bids land |
| Lineup | Coach drags 8 players into slots, presses "Submit lineup" | 1:30 | Lights fill as lineups lock |
| Simulate | Watch the wall — scoreboard flood plays out | 1:00 | Nothing; advance when "Round complete." shows |
| Results | Watch the standings shuffle on the wall | 1:30 | Narrate the movement; advance when ready |
| Finale (after R5) | Watch the reveal | none | Step charts with the ‹ › **Finale reveal** control: Podium, Hype vs Reality, What the engine paid for, Wins per dollar, Best & worst signings |

Timer buttons: **Start m:ss**, **Pause**, **Resume**, **+30s**, **Clear**. **Auto-arm**
starts each phase's default automatically; edit defaults under **Timer settings**.
All of that is remembered in this browser: your edited defaults, the **Auto-arm** and
**Auto-advance** checkboxes, and which phase has already auto-armed are stored locally,
so reloading or reopening the panel keeps your settings and does not re-arm a timer you
cleared mid-phase.

## Force-advancing

Advancing early is always safe: the server applies neutral defaults for anything not
submitted (unsubmitted lineups are auto-filled, missing decisions take the default).
If any team's light is off, the panel first shows a modal naming exactly who is
missing: "N teams haven't submitted: ... Advance anyway? Server defaults will apply."
Press **Advance anyway** to proceed or **Cancel** to give them another minute.
The final advance (Results, Round 5) asks separately: "End the season and reveal? This cannot be undone."

## If something breaks

| Symptom | Fix |
|---|---|
| Panel tab closed or laptop rebooted | Reopen `/professor` in the same browser — the session resumes by itself. On a different browser: paste the game id from your recovery note into **Existing game id**, press **Resume**. |
| Projector window died | Press **Open projector** on the panel again. The game state is on the server; nothing is lost. |
| Header stuck on "advancing…" for more than 10 seconds | Press **Resolve stuck advance** (appears in the phase control after 10 seconds). |
| Wrong game loaded / dead session on the panel | Press **Clear session** in the session header, then Resume with the correct game id. |
| Everything else | The join code stays in the panel header. Students' phones keep working; the game never moves on its own unless Auto-advance is checked. Wait, then advance manually. |

## 30-second drag check (day before class, on the classroom machine)

1. Create a throwaway 2-team game, open the join page in a second tab, **Find game**,
   claim a Coach seat, then **Start season**.
2. Press Advance twice (confirm "Advance anyway" — this is a throwaway) to reach Lineup.
3. In the Coach tab at `/game/lineup`: drag one player card from the bench area into a
   **GUARD** slot — it must land in the slot. Drag it onto a filled slot — the two
   players must swap. Fill all 8 slots and press **Submit lineup**.
4. If dragging fails on this machine/browser, students must use their own devices for
   the Coach role. (Everything else is tap/click only.)

## Billing

The project runs on Firebase's Blaze plan. A full class session costs under $1;
idle days cost $0. A $10 budget email alert is armed — if that email ever arrives
outside a class day, tell Dylan.

## Class-day checklist

- [ ] Panel loads; game created; join code + game id written down
- [ ] Projector shows the lobby wall via **Open projector**
- [ ] Drag check passed on the classroom machine (section above)
- [ ] Budget alert confirmed armed ($10, email) — once per term is enough
- [ ] If the app was redeployed since last class: `games/salary-showdown/app/.env.production` existed at build time (deployer's item, not yours)
- [ ] After class: **Download season CSV** from the panel before closing the laptop
