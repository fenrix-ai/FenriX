# Salary Showdown — Class-Day Runbook

Panel (your laptop): **https://salary-showdown.web.app/professor**
Students join at: **https://salary-showdown.web.app/** (the projector shows this with the code)
Projector: never type its URL — open it from the panel's "Open projector" button.

## Pre-class setup (10 minutes before)

1. On the laptop, open the panel URL above.
2. Under **New session**, press **Create game**. The game starts with ZERO
   franchises: students create and name their own from the join screen
   (franchise name + role, one tap), and the panel's Franchises card fills
   in live. Names stay editable from their lobby until you press Start
   season. Hard cap: **21 franchises** — beyond that the per-round data
   document approaches Firestore's 1 MiB limit. The SERVER now blocks
   franchise #22; students see: "The league is full — 21 franchises is the
   cap." **Start season** stays locked until at least 2 franchises exist.
3. Write down the **join code** (the large code at the top of the panel) and the
   **game id** (press F12, then Application > Local Storage > `ss.profGameId`).
   The game id resumes the panel in THIS browser and is required for the
   emergency recovery below — it cannot, by itself, move the panel to a
   different browser.
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
| Star Auction | Scout places one sealed star bid | 2:00 | Lights fill as bids land |
| Lineup | Coach drags 8 players into slots, presses "Submit lineup" | 1:30 | Lights fill as lineups lock |
| Simulate | Watch the wall — scores flood in and the standings re-rank live; laptops show each team its own results | 1:00 | Nothing; advance when "Round complete." shows |
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
| Panel tab closed or laptop rebooted | Reopen `/professor` in the same browser — the session resumes by itself. Same browser only: a different browser cannot resume the panel (professor identity lives in the browser that created the game). If that browser is gone, see **Lost laptop (emergency recovery)** below. |
| Projector window died | Press **Open projector** on the panel again. The game state is on the server; nothing is lost. |
| Header stuck on "advancing…" for more than 10 seconds | Press **Resolve stuck advance** (appears in the phase control after 10 seconds). |
| Wrong game loaded / dead session on the panel | Press **Clear session** in the session header, then Resume with the correct game id. |
| A player left and their empty seat blocks the team | Release the seat from the panel's **Seats** card — teammates can then act for that role. (Teammates can already act for any seat that was never claimed.) The released student's screen goes blank — have them reopen the join link and reclaim a seat. |
| A stray or mistaken franchise sits in the lobby | Leave it or have its creator rename it — there is no delete. An unstaffed franchise plays on server defaults (hardship signings + auto-filled lineups) and hurts nobody; don't press Start season until the room looks right. If the lobby is genuinely messed up (someone spammed franchises), just press **Clear session**, then **Create game** and share the new code — 30 seconds. Students who already claimed seats in the bad lobby should reopen the site in a private window to join the new game — their old tab stays pinned to the dead lobby. |
| Everything else | The join code stays in the panel header. Students' phones keep working; the game never moves on its own unless Auto-advance is checked. Wait, then advance manually. |

### Lost laptop (emergency recovery)

The panel's identity is an anonymous login stored in the browser that created
the game. If that browser is gone (dead laptop, wiped profile), no in-app
button can move control — rebinding takes the Firebase console (owner access):

1. On the new machine, open `/professor`, paste the game id into **Existing
   game id**, press **Resume** once, and leave it on "Connecting to session…"
   An error line saying this browser can't open the game appears under it —
   that is EXPECTED at this step; do not press Clear session. (Opening the
   page is what created the new browser's identity.)
2. In the Firebase console (console.firebase.google.com) → project
   `salary-showdown` → **Authentication → Users**, sort by Created date and
   copy the **User UID** of the newest anonymous user — its Created time
   matches the minute you opened the panel in step 1. During a live class,
   students create anonymous users too: if two rows are that fresh, a wrong
   pick is recoverable — the panel just stays on "Connecting to session…";
   repeat step 3 with the next-newest UID.
3. **Firestore Database → data → `games` → your game id**: edit the
   `professorUid` field to that UID.
4. Reload the panel page — the hung connection attempt never retries on its
   own.

Meanwhile the class is safe: with the old panel dead nothing advances the
game (auto-advance fires from a live panel, and timers are advisory), so
students keep working in the current phase and nothing is lost.

## 30-second drag check (day before class, on the classroom machine)

1. On the panel, press **Clear session** first if a session is loaded, then press
   **Create game** for a throwaway session. Never claim a seat in the panel's own
   browser profile — a claimed seat there hijacks later `/professor` and `/bigscreen` loads in
   this profile to the throwaway game. Open the join URL in a **private/incognito
   window**, press **Find game**, and create franchise "QA 1", claiming the Coach seat.
   Open the join URL again in a **genuinely different browser** (or a second OS-level
   browser profile) — incognito windows in the SAME browser share one session, so a
   second incognito window would inherit QA 1's identity instead of creating a new
   franchise — press **Find game**, and create franchise "QA 2" with any role. Back on
   the panel, press **Start season** (it unlocks once both franchises exist).
2. Press Advance twice (confirm "Advance anyway" — this is a throwaway) to reach Lineup.
3. In the QA 1 window (the private window where you claimed Coach) at `/game/lineup`:
   drag one player card from the bench area into a **GUARD** slot — it must land in the
   slot. Drag it onto a filled slot — the two players must swap. Fill all 8 slots and
   press **Submit lineup**.
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
