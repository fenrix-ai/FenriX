# Bakery Bash — Playtesting Issues Discovered Apr 24

> Found by manual playtest "Testing V2" session on Apr 24. Source list is the note below; each issue was verified against the shipped code (pointers in each entry) before a fix was proposed.

**Date:** 2026-04-24
**Branch base:** `main` (fork off current `main` — which already has all Apr 23 fixes from PRs [#72](https://github.com/fenrix-ai/FenriX/pull/72), [#77](https://github.com/fenrix-ai/FenriX/pull/77), [#79](https://github.com/fenrix-ai/FenriX/pull/79), [#80](https://github.com/fenrix-ai/FenriX/pull/80))
**Target:** May 1, 2026 live session

**Status:** ✅ **All 10 issues shipped in PR [#87](https://github.com/fenrix-ai/FenriX/pull/87)** (merged 2026-04-24, squash `9663c92`). Includes two review follow-ups on top of the original plan: (1) a stable ad-winner Firestore subscription that no longer re-subscribes on every roster snapshot, and (2) a corrected `advertising` role description in TeamPage (drops the stale "chef hiring" clause now that finance owns chef bids).

---

## Raw playtest note (verbatim)

> Testing V2
>
> - When you put in a team photo in the files at the start and then press create team, it takes forever, and then times out. That feature fully does not work. Honestly if it's not an easy fix, then we should just get rid of it.
> - The how to play isn't all correct, instead I want different colored boxes for each role that says what each role does.
> - One big box at the top that explains simply how the game works, like you make data driven decisions and reading what other teams will do to win out and have the top bakery. Something like that
> - I joined the team, it gave me solo, so all the roles, but then when a teammate joins, they become the solo with all the roles. Then when a third person is joining the game and looking at teams to join, the team that has two people only says one member.
> - On the email page, where it just says the round number, there should be a timer, would be nice if there was a timer that the players could see too, and then auto advance to the next page.
> - Ad auction and chef auction should be two separate events, it is possible to press on the chef tab while in the ad auction. Also would be nice to see what you won right after the auction, not sure how to implement that. Need some easy way that won't break any code
> - The timers are off, the last chance to submit timer and the top timer are on different numbers.
> - Need something at the start to tell them, maybe on the round one screen, that they are starting with X amount of dollars.
> - There is a last chance to submit button on the bottom of the round 2 screen, that should not be there.
> - On the results screen, the target variable should be profit, rename it.
> - If someone wins the ads but sets no quantity of items, they still get the bonus revenue for those ads without selling anything

---

## Priority Summary

| ID | Area | Title | Priority | Effort | Status |
|---|---|---|---|---|---|
| A24-I01 | team formation | **Team photo upload hangs + times out** | **P0 — ship-blocker** | XS (~1 hr if we remove) / M (~1 day if we keep) | ✅ shipped ([#87](https://github.com/fenrix-ai/FenriX/pull/87)) |
| A24-I03 | team formation | **"Second joiner also gets solo" UX confusion + lobby member count stale** | **P0** | S (½ day) | ✅ shipped ([#87](https://github.com/fenrix-ai/FenriX/pull/87)) |
| A24-I10 | simulation | **Ad bonus paid to teams that stocked nothing** | **P0** | S (~2 hr) | ✅ shipped ([#87](https://github.com/fenrix-ai/FenriX/pull/87)) |
| A24-I02 | onboarding | **HowToPlayPage is partly wrong; needs intro box + per-role colored cards** | **P1** | S (½ day) | ✅ shipped ([#87](https://github.com/fenrix-ai/FenriX/pull/87)) |
| A24-I04 | email phase | **Email page has no visible timer and no auto-advance** | **P1** | S (~2 hr) | ✅ shipped ([#87](https://github.com/fenrix-ai/FenriX/pull/87)) |
| A24-I05 | auctions | **Ad & chef auctions share a page; no "you won" feedback after each** | **P1** | S–M (½–1 day) | ✅ shipped ([#87](https://github.com/fenrix-ai/FenriX/pull/87)) |
| A24-I06 | timers | **RoundHeader timer ≠ "Last chance to submit" overlay timer** | **P1** | S (~2 hr) | ✅ shipped ([#87](https://github.com/fenrix-ai/FenriX/pull/87)) |
| A24-I08 | timers / overlay | **"Last chance to submit" banner shows on phases it shouldn't (e.g., round 2 email / results)** | **P1** | S (~1 hr) | ✅ shipped ([#87](https://github.com/fenrix-ai/FenriX/pull/87)) |
| A24-I07 | round 1 | **No banner telling players they start with $500,000** | P2 | XS (~½ hr) | ✅ shipped ([#87](https://github.com/fenrix-ai/FenriX/pull/87)) |
| A24-I09 | results | **Results screen "Revenue" card should be labeled "Profit"** | P2 | XS (~½ hr) | ✅ shipped ([#87](https://github.com/fenrix-ai/FenriX/pull/87)) |

**P0 count:** 3. **P1 count:** 5. **P2 count:** 2. Nothing here requires a backend schema migration — all fixes are either label swaps, UI gating, conditional renders, or a one-line guard in `simulation.js`.

---

## P0 — Must-fix before May 1

### A24-I01 — Team photo upload hangs + times out on Create Team

> ✅ **Shipped in PR [#87](https://github.com/fenrix-ai/FenriX/pull/87) — feature removed path.** The team-photo input, client-side `uploadBytes()` call, `logoUrl` parameter on `createTeam`, `logoUrl` field in `getTeamsInLobby`, the logo `<img>` on team cards, and the orphaned Storage comment in `firestore.rules` are all gone. Backend fixture tests (`test-create-join-flow.js`, `test-multi-team-costs.js`) were updated to drop the `logoUrl` argument and pass under `npm test`.

**Severity:** Critical (blocks team creation for anyone who tries the feature). The user explicitly said: *"That feature fully does not work. Honestly if it's not an easy fix, then we should just get rid of it."*

**Symptom.** On the Landing screen, attaching a file to the team-photo input and clicking Create Team shows a spinner for ~60 seconds and then either times out with a Firebase callable error or silently fails. Teams without a photo create instantly.

**Root cause.** The flow is:

1. [LandingPage.tsx:156–173](app/src/pages/LandingPage.tsx:156) uploads the `File` object directly to Firebase Storage at `teams/{joinCode}/{slug}/logo.{ext}` via `uploadBytes()` + `getDownloadURL()`.
2. [LandingPage.tsx:175–184](app/src/pages/LandingPage.tsx:175) calls the `createTeam` callable with `logoUrl` as a string.
3. [createTeam (index.js:1202–1370)](backend/functions/index.js:1202) validates `logoUrl` starts with `https://firebasestorage.googleapis.com` ([index.js:1209–1212](backend/functions/index.js:1209)) and then runs a Firestore transaction that writes team, player, and roster docs.

Three latent failure modes make this flow unreliable:

- **No client-side file-size validation.** Anything above a few MB stalls `uploadBytes()` with no feedback.
- **Firebase Storage rules must allow writes under `teams/**`.** If the deployed `storage.rules` file hasn't been updated to allow authenticated writes to that path, `uploadBytes()` silently hangs until the SDK times out.
- **No UI progress state.** The user sees no indication whether the upload, the download URL fetch, or the callable is the slow step — so the 60-second callable deadline feels like "the whole thing is broken."

**Fix — recommended (remove the feature).** The photo field is optional and has 27 references across app + backend with zero downstream dependencies on game logic, simulation, revenue, or CSV export. Removing it is straightforward:

- **Frontend** ([LandingPage.tsx](app/src/pages/LandingPage.tsx))
  - Delete the file input + preview ([lines 336–362](app/src/pages/LandingPage.tsx:336))
  - Delete upload logic in `handleCreate` ([lines 156–173](app/src/pages/LandingPage.tsx:156))
  - Delete `logoFile` / `logoPreview` state ([lines 70–71](app/src/pages/LandingPage.tsx:70))
  - Delete `logoUrl` from the `CreateTeamResponse` / `LobbyTeam` types ([lines 20, 26](app/src/pages/LandingPage.tsx:20))
  - Delete the logo `<img>` in the team select grid ([lines 452–457](app/src/pages/LandingPage.tsx:452))
- **Backend** ([index.js](backend/functions/index.js))
  - Delete `logoUrl` from `createTeam` signature ([line 1199](backend/functions/index.js:1199)) + validation ([lines 1209–1212](backend/functions/index.js:1209)) + writes ([lines 1306, 1323, 1346](backend/functions/index.js:1306)) + response ([line 1368](backend/functions/index.js:1368))
  - Delete `logoUrl` from `getTeamsInLobby` response ([lines 1381, 1421](backend/functions/index.js:1381))
- **Tests** — strip the `logoUrl` fixture from [test-create-join-flow.js](backend/scripts/test-create-join-flow.js) and [test-multi-team-costs.js](backend/scripts/test-multi-team-costs.js).

**Fix — alternative (keep it, make it work).** If we want to preserve the feature for a later session, the minimal-risk path is:
1. Add client-side size + type validation (reject > 1 MB; accept `image/png|jpeg|webp` only) before `uploadBytes()`.
2. Show a progress bar wired to `uploadBytesResumable()`'s `state_changed` event.
3. Bump the `createTeam` callable timeout from the default 60s to 120s (gives a slow uploader + Firestore transaction breathing room).
4. Verify `storage.rules` grants `request.auth != null` write access under `teams/{joinCode}/**` and deploy the rules update if not.

Pick (remove) for May 1 — the user's own preference, and it gets us a clean demo with zero risk. Revisit the "keep and fix" path after the live session.

**Acceptance.**
- Clicking Create Team without a photo still creates a team in < 2s (unchanged).
- No file input visible on the landing page; no logo placeholder visible on any team card.
- `npm test` from backend passes (updated fixtures).
- The team doc in Firestore has no `logoUrl` field; the player doc has no `teamLogoUrl` field.

---

### A24-I03 — "Second joiner also gets solo" UX confusion + lobby member count stale

> ✅ **Shipped in PR [#87](https://github.com/fenrix-ai/FenriX/pull/87).** Sub-bug A (confusing solo state): `TeamPage` now renders per-member status banners — "You're first on your team…", "Both of you share all three roles…", "Team is full — roles are auto-assigned." Sub-bug B (stale lobby): `LandingPage` replaced the one-shot `getTeamsInLobby` callable with a live Firestore `onSnapshot` on `games/{gameId}/teams`, so the member count updates within ~1s of any join. The cascade logic (`joinGame` → solo for ≤2, split on 3) was untouched; existing `test-create-join-flow.js` + `test-apr23-e2e.js` still pass.

**Severity:** High. Two distinct bugs under one playtest observation:
1. The team-formation UX is confusing because **both the first and second joiner show `role: solo`** — which is the intended design post-BE-I04 ([Apr 23 PR #77](https://github.com/fenrix-ai/FenriX/pull/77)), but the TeamPage never explains that "both of us are solo" means "either of us can submit anything."
2. The lobby team-picker shows **stale member counts** for teams another player is actively joining.

**Symptom (user's words).**
> "I joined the team, it gave me solo, so all the roles, but then when a teammate joins, they become the solo with all the roles. Then when a third person is joining the game and looking at teams to join, the team that has two people only says one member."

**Sub-bug A — Confusing "both solo" state.**

- **Current behavior.** [joinGame (index.js:1056–1057)](backend/functions/index.js:1056) assigns `role: 'solo'` for the first and second joiner (`nextMemberCount <= 2`). On the 2→3 transition [index.js:1058–1082](backend/functions/index.js:1058), the cascade fires and everyone flips to `finance/advertising/operations`. This is the Apr 23 BE-I04 fix behavior — and it is functioning correctly per [test-apr23-e2e.js:273–312](backend/scripts/test-apr23-e2e.js:273) and [test-create-join-flow.js:206–244](backend/scripts/test-create-join-flow.js:206).
- **Why it reads as a bug.** TeamPage shows the first joiner's role badge as "solo" alongside a big "✓ You" checkmark. When the second joiner arrives, their badge also says "solo" — so both people see two solo badges next to each other with no explanation of why they are both "solo" or what will change on the third join.
- **Fix.** Update [TeamPage.tsx (roles section, ~ line 443–520)](app/src/pages/TeamPage.tsx:443) to render a per-team-size status banner above the role cards:
  - 1 member: *"You're the first on your team — you have all three roles until teammates join. Grab the role you want; you'll keep it once teammates arrive."*
  - 2 members: *"Both of you share all three roles right now. When a third teammate joins, the roles will split automatically so each of you has one."*
  - 3 members: current behavior (show the three role cards, each clickable).
- This is copy-only; no backend change needed. Reinforces the FE-I14 rewrite from Apr 23 rather than replacing it.

**Sub-bug B — Stale member count in lobby list.**

- **Current behavior.** [LandingPage.tsx:88–124](app/src/pages/LandingPage.tsx:88) calls `getTeamsInLobby` once per `(path, gameCode)` change, debounced 300 ms. **There is no polling interval and no real-time subscription.** So if the user is sitting on the join screen staring at the team list, and someone else just joined one of those teams, the count they see is frozen at whatever it was when the user typed their last character of the game code.
- **Root cause.** The in-memory `lobbyTeams` state at [LandingPage.tsx:74](app/src/pages/LandingPage.tsx:74) is set once on mount / code change and never refreshed.
- **Fix — recommended.** Replace the one-shot callable with a live Firestore subscription to the `teams` subcollection for this game:
  ```ts
  const teamsRef = collection(db, "games", gameId, "teams");
  const unsubscribe = onSnapshot(teamsRef, (snap) => {
    setLobbyTeams(snap.docs.map((d) => ({
      teamId: d.id,
      teamName: d.data().teamName,
      memberCount: d.data().memberCount ?? Object.keys(d.data().roleAssignments || {}).length,
      // ...
    })));
  });
  ```
  This needs the game's doc id, which `getTeamsInLobby` already returns; cache it in state so a single callable on first load resolves the `joinCode → gameId` mapping, then subscribe to teams directly.
- **Fix — minimum-effort fallback.** If real-time is more surgery than we want on the landing page, add a `setInterval(() => fetch(), 3000)` refresh loop so the list updates every 3 seconds. This is worse UX (visible count flicker) but is a 5-line change.

**Acceptance.**
- 1-member team → banner reads "You're the first…"; 2-member team → banner reads "Both of you share…"; 3-member team → current role cards render unchanged.
- A third user sitting on the landing page with the team picker open sees the member count jump from 1 → 2 within 1 s of the second player joining (live-subscription path) or within 3 s (interval-polling fallback).
- Regression: existing `test-create-join-flow.js` + `test-apr23-e2e.js` still pass — backend cascade logic is untouched.

---

### A24-I10 — Ad bonus paid to teams that stocked zero items

> ✅ **Shipped in PR [#87](https://github.com/fenrix-ai/FenriX/pull/87).** `simulation.js` now gates the ad-winner bonus behind `stockedAnything = offeredProducts.length > 0` — no stock, no bonus. New regression test `backend/scripts/test-ad-bonus-gate.js` constructs two synthetic players (one wins TV and stocks 0 → expects $0 bonus; one wins TV and stocks ≥1 → expects $50k bonus) and runs directly against `runSimulation()` without the emulator. The rule is now documented in `GAME_DESIGN_PROPOSAL.md` under the Ad Type Bonus section.

**Severity:** Critical (game-economy). A team can win TV for $35k, stock literally nothing, and still collect the $50k flat TV bonus. That's a guaranteed $15k profit with zero customer risk. Every auction becomes dominant-strategy-solvable by bidding to win the biggest bonus ad and intentionally stocking nothing.

**Symptom.** In a 6-player repro, a player who won TV but set `quantity = 0` for every product had `revenueGross = $50,000` (the TV bonus) and `revenueNet = $50,000 − adBidPaid − loanShark`. Even with $35k `adBidPaid`, the net is positive.

**Root cause.** [`simulation.js:417–430`](backend/functions/modules/simulation.js:417):
```js
// DEC-03/DEC-04: flat ad-winner bonus added to gross revenue.
const adWinnerBonus = adWins.reduce((sum, adType) => {
  return sum + ((config && config.adBonuses && config.adBonuses[adType]) || 0);
}, 0);
// ...
revenueGross += adWinnerBonus;   // ← unconditional, even with no products stocked
```

The loop that builds `totalProductRevenue` ([simulation.js:366–407](backend/functions/modules/simulation.js:366)) skips products with `quantity === 0`, but the ad bonus is added outside that loop with no "did we stock anything?" guard.

**Fix (one-line guard).** Only award the ad bonus if the team actually offered products this round:

```js
const stockedAnything = offeredProducts.length > 0;  // or: totalProductRevenue > 0
if (stockedAnything) {
  revenueGross += adWinnerBonus;
}
```

**Design question to confirm in the PR description:** Is the right threshold "stocked at least one item" (prevents $0-stock exploit but still rewards a team that stocks just `Coffee × 1`), or "earned at least $N in product revenue" (higher bar but could unfairly penalize a team that stocked but lost customers)? Recommendation: **stocked at least one item** — simpler to reason about, aligned with the game fiction ("an ad only helps if the store is open").

**Alternative fix (more surgical).** Convert the flat ad bonus into a **customer-count multiplier** instead of a flat dollar amount — e.g., TV → `+20% customer demand` for the winner. This naturally zeros out when the team has nothing to sell, but it's a design change that touches `customer-allocation.js` and changes the game's economy enough that we'd want to playtest it before May 1. **Not recommended for this sprint.**

**Acceptance.**
- New test `backend/scripts/test-ad-bonus-gate.js`: a player who wins TV + Billboard but stocks 0 everywhere has `revenueGross === 0` (minus loan shark).
- A player who wins TV and stocks at least 1 item of any product still receives the TV bonus on top of product revenue.
- Regression: existing `test-multi-team-costs.js` still passes.
- Document the rule in `GAME_DESIGN_PROPOSAL.md` under DEC-03/DEC-04: *"Ad bonuses are awarded only when the team has stocked at least one product this round."*

---

## P1 — Noticeable, ship if time

### A24-I02 — HowToPlayPage needs a top intro box + colored per-role cards

> ✅ **Shipped in PR [#87](https://github.com/fenrix-ai/FenriX/pull/87).** `HowToPlayPage` now leads with a hero intro card ("Run a bakery. Read the market. Beat the class."), then 4 role cards in the canonical colors (Operations/sage, Advertising/caramel, Finance/berry, Solo/honey), then the corrected 8-stage flow (Briefing → Ad → Chef → Roster → Decide → Simulate → Results → CSV Inbox), then the chef-tier table. The earlier stale stage comment at the top of the file was refreshed to match the shipped `PHASE_ORDER`.

**Severity:** Moderate. The page is every student's first contact with the game rules; today it leads with a phase sequence and a chef-tier table, with **zero** role explanation. The user wants the structure flipped.

**Symptom.** [HowToPlayPage.tsx (full file ~120 lines)](app/src/pages/HowToPlayPage.tsx) currently renders:
- "How to Play" header + back button
- "Stages" section with 6 cards (Ad Auction, Chef Auction, Decisions, Simulation Round, Results, CSV Inbox)
- "Chef Tiers" table

There are no role cards, no "what's the point of this game" blurb, and the phase-order comment at the top of the file ([HowToPlayPage.tsx:5–8](app/src/pages/HowToPlayPage.tsx:5)) is slightly stale (omits the email + roster phases).

**Fix.** Rewrite [HowToPlayPage.tsx](app/src/pages/HowToPlayPage.tsx) to lead with two new sections, then preserve the stages + chef-tiers content below:

1. **Top intro box** — One-paragraph explainer:
   > You run a bakery. Each round, you make data-driven decisions about what to bake, how to price it, what to advertise, and which chefs to hire. You're competing against the other bakeries in the class — whoever reads the market best and out-strategizes the room wins. The game is 5 rounds; your cumulative net profit decides the champion.

   Style: single wide card, `background: var(--honey-light)` or similar warm hero treatment. One sentence in bold at the top ("Run a bakery. Read the market. Beat the class.") followed by the explainer.

2. **Role boxes** — Four cards, each in the role's canonical color (already defined in [global.css](app/src/styles/global.css)):

   | Role | Color var | What the card says |
   |---|---|---|
   | Operations | `--sage` (#7A9E7E, green) | "Submits the round's **decide** screen: product quantities, menu choices, maintenance, sous chefs. The last call on what your bakery will actually produce." |
   | Advertising | `--caramel` (#C4873B, brown) | "Submits **ad bids** in the ad auction. Wins advertising slots that boost customer demand (and revenue) for the team." |
   | Finance | `--berry` (#B54B6C, pink) | "Submits **chef bids** in the chef auction and handles the **roster** (hiring / lay-offs). Keeps the team's balance sheet alive." |
   | Solo | `--honey` (#F5C96A, yellow) | "Default when your team has 1 or 2 people. You own all three submit buttons — no splitting roles. Once a third teammate joins, roles auto-assign." |

   CSS reference: the existing `.role-badge--operations`, `.role-badge--advertising`, `.role-badge--finance`, `.role-badge--solo` classes in [global.css](app/src/styles/global.css) already use these hex values. Extract a `.how-to-play__role-card--{role}` variant that uses the same variable names.

3. **Keep the existing Stages + Chef Tiers sections** below the roles, but fix the stage list to match the shipped phase order: *Email → Ad Auction → Chef Auction → Roster → Decide → Simulate → Results*.

4. **Cross-reference.** The Apr 23 FE-I14 rewrite of TeamPage's role-picker intro sentence ([TeamPage.tsx:443–455](app/src/pages/TeamPage.tsx:443)) should now say *"See the How to Play page for what each role does"* with a link — keeps TeamPage tight and makes HowToPlayPage the canonical role reference.

**Acceptance.**
- Visual QA: top of page has hero intro box; below it are 4 role cards in sage / caramel / berry / honey; below those are stages (7 cards, correct order) and chef tiers table.
- Navigation: landing-page footer "How to Play" link still opens `/how-to-play`; TeamPage role-picker intro now links here.
- Accessibility: each role card has a visible text label (not color-only) and passes contrast AA against its background color.

---

### A24-I04 — Email page has no visible timer and no auto-advance

> ✅ **Shipped in PR [#87](https://github.com/fenrix-ai/FenriX/pull/87).** A new shared hook `app/src/hooks/usePhaseCountdownSeconds.ts` is consumed by both `RoundHeader` and `EmailPhasePage` (briefing page now displays "Xs until briefing closes"). Auto-advance: `GamePhaseListener` grew a second `useEffect` that, for non-submission phases (`email`, `simulating`, `results_ready`), fires `advanceGamePhase` at `phaseEndsAtMs + 0`, piggybacking on the existing CRIT-02 `expectedFromPhase` guard to absorb duplicates. `ProfessorPage` also auto-advances non-submission phases in parallel; the server-side guard ensures only the first wins.

**Severity:** Moderate. Today the email (round-briefing) page is a static "Round N" hero. Students sit on it indefinitely until the professor clicks advance. The user wants the timer visible and the phase to auto-advance when it expires.

**Symptom.** [EmailPhasePage.tsx](app/src/pages/EmailPhasePage.tsx) renders only the round label ([line 60](app/src/pages/EmailPhasePage.tsx:60)) and decorative floats. No countdown, no progress bar, no auto-advance. The 30-second backend duration ([config.js: `email: 30`](backend/functions/modules/config.js)) ticks down silently.

**Root cause.** The page doesn't import `RoundHeader` (which contains the countdown renderer) or use `phaseEndsAtMs` from `GameContext`. The `useEffect` block at [EmailPhasePage.tsx:29–39](app/src/pages/EmailPhasePage.tsx:29) only navigates when the *phase* changes — it doesn't react to time.

**Fix — two small changes.**

1. **Visible timer.** Add a countdown element to the existing round panel. Reuse the [`usePhaseCountdownSeconds` hook in RoundHeader.tsx:111–122](app/src/components/game/RoundHeader.tsx:111) — extract it to `app/src/hooks/usePhaseCountdownSeconds.ts` so EmailPhasePage can consume it without pulling in the full header:
   ```tsx
   const secondsLeft = usePhaseCountdownSeconds();
   // ...
   <div className="round-briefing__timer">{secondsLeft}s until briefing closes</div>
   ```
   Render it inside the round panel ([EmailPhasePage.tsx:56–65](app/src/pages/EmailPhasePage.tsx:56)), styled similarly to the tagline.

2. **Auto-advance.** Two options:
   - **(A)** Professor-page side: `ProfessorPage.tsx` already has `advanceGamePhase` wired up; add an auto-fire `useEffect` that watches `phase === 'round_N_email'` and `phaseEndsAtMs <= Date.now()` and calls `advanceGamePhase` once. Client-side game-state mutation but guarded by the professor claim, so safe.
   - **(B)** Backend-side: extend [`phases.js`](backend/functions/modules/phases.js) / the existing advance-on-timer mechanism (if any) with an explicit server-scheduled auto-advance. Bigger change.

   Go with (A) — the professor page is already running; piggyback on it. Student clients don't try to advance the game themselves (avoids the failure mode where N clients race the same callable).

**Acceptance.**
- Email page shows a visible "28s" → "27s" → ... countdown in the round panel.
- When the timer reaches 0, the professor page fires `advanceGamePhase` within 1s and every client auto-navigates to `/auction` (bid_ad).
- Regression: the professor's manual "Advance Phase" button still works at any time (auto-advance only fires if the timer expires naturally).

---

### A24-I05 — Ad & chef auctions share a page with a switchable tab; no "you won" feedback

> ✅ **Shipped in PR [#87](https://github.com/fenrix-ai/FenriX/pull/87).** Sub-bug A: `AuctionPage` dropped the tab bar entirely — it now renders *only* the ad block during `bid_ad` and *only* the chef block during `bid_chef`, driven by `parsed.base`. `activeTab` state + the phase-sync `useEffect` are gone. Sub-bug B: `AdWinnerBanner` renders at the top of the chef auction showing the current round's ad winners; a new sibling `ChefWinnerBanner` shows on `RosterPhasePage`. Post-review follow-up: the ad-winner Firestore subscription was refactored to split raw winner IDs from display names (resolved at render time via `useMemo`), so a roster snapshot no longer thrashes the round listener and a round doc that arrives before the roster still renders names once the roster snapshot lands.

**Severity:** Moderate. Two sub-issues under the same area.

**Sub-bug A — shared tab bar lets users click into the non-active auction.**

- [AuctionPage.tsx (lines 209–863)](app/src/pages/AuctionPage.tsx) renders both ad-bidding and chef-bidding UIs, controlled by a local `activeTab` state.
- A `useEffect` at [line 275–278](app/src/pages/AuctionPage.tsx:275) forces the tab to match the backend phase when the phase changes, but the tab buttons at [lines 623–638](app/src/pages/AuctionPage.tsx:623) are **clickable in dev mode** and merely visually disabled in prod (`isDev ? onClick : undefined`).
- Even in prod, the "Chef Hiring" tab is visible during `bid_ad`. Students can see it, hover it, read the wrong-phase content out of the corner of their eye — confusing.
- **Fix.** Replace the tab bar with **conditional rendering** based on the parsed phase. No tab buttons at all — just render the ad-bidding block when phase is `bid_ad`, the chef block when phase is `bid_chef`. Remove the `activeTab` state and the phase-sync `useEffect`. File: [AuctionPage.tsx:230, 266–278, 623–638](app/src/pages/AuctionPage.tsx:230).

**Sub-bug B — no "what you won" feedback between auctions.**

- After `bid_ad` resolves, the phase flips straight to `bid_chef`. Students never see their own ad result until the very end of the round (on the Results screen). So during the chef auction they're guessing whether to compensate for an ad win or loss.
- The backend already writes `adAuctionResults` ([index.js:487–564](backend/functions/index.js:487)) and [`AdWinnerBanner.tsx`](app/src/components/game/AdWinnerBanner.tsx) exists (used on the Decide screen) to read it.
- **Fix — lowest-effort, user-requested "easy way that won't break any code":** Render `AdWinnerBanner` as a **top-of-page banner on AuctionPage when phase === bid_chef**. The banner already consumes the current round's `adAuctionResults` — it just needs to be mounted one phase earlier than today. Add it above the chef-bidding block:
  ```tsx
  {parsed.base === "bid_chef" && <AdWinnerBanner round={currentRound} />}
  ```
  Result: as soon as the phase flips from bid_ad → bid_chef, every student sees "🎉 You won TV — $35,000 paid" (or "No ads won this round") before touching chef bids.
- **Chef auction feedback** (`bid_chef` → `roster`): same pattern. Create a `ChefWinnerBanner` sibling component that consumes `chefAuctionResults` and mount it at the top of `RosterPhasePage`. Two components, ~40 lines each.

**Acceptance.**
- During `bid_ad`, the chef UI is not visible anywhere on AuctionPage.
- During `bid_chef`, a banner at the top of AuctionPage shows ad-auction results.
- On RosterPhasePage, a banner at the top shows chef-auction results.
- Regression: Decide-screen AdWinnerBanner still renders correctly (it continues to read the previous round's ad results).

---

### A24-I06 — "Last chance to submit" timer is on different numbers than the top timer

> ✅ **Shipped in PR [#87](https://github.com/fenrix-ai/FenriX/pull/87).** The grace/freeze banner in `GamePhaseListener` now derives its countdown from absolute `phaseEndsAtMs` on each 250 ms tick (was: decremented from a local counter with 1 s `setInterval`). Both widgets read the same wall-clock anchor, so they converge to 0 together and backgrounded tabs re-sync on refocus.

**Severity:** Moderate. User complaint: *"The timers are off, the last chance to submit timer and the top timer are on different numbers."*

**Symptom.** The top header timer shows e.g. "0:03" while the orange "Last chance to submit — {n}s" banner at the bottom shows e.g. "5s".

**Root cause.** The two widgets read the same `phaseEndsAtMs` value but render from two different clocks.

- **Top timer** ([RoundHeader.tsx:111–122](app/src/components/game/RoundHeader.tsx:111)) uses `usePhaseCountdownSeconds`, which re-computes `Math.ceil((phaseEndsAtMs - Date.now()) / 1000)` on a 500 ms interval. Always synced to absolute server time.
- **"Last chance" banner** ([GamePhaseListener.tsx:154–220](app/src/components/GamePhaseListener.tsx:154)) uses its own `tickRef` interval that starts at `GRACE_SECONDS = 5` and **decrements from 5 → 0 regardless of wall-clock time**. When the grace stage starts, it calls `startTick(5)`, the interval ticks every 1000 ms, and the state counter counts down from 5.

So they can easily disagree: if the browser tab was backgrounded during the last 10 s of the phase, `phaseEndsAtMs` will reflect the real wall-clock, while the `GamePhaseListener` timer is gated by `setTimeout` drift and the interval skew of the backgrounded tab.

**Fix.** Drive the "Last chance" countdown from the same `phaseEndsAtMs` source as the top timer, not from a local setInterval.

1. In [GamePhaseListener.tsx:162–188](app/src/components/GamePhaseListener.tsx:162), replace the `startTick(GRACE_SECONDS)` / `startTick(FREEZE_SECONDS)` pattern with reads from `phaseEndsAtMs`:
   ```tsx
   const rawSeconds = Math.ceil((phaseEndsAtMs + 0 - Date.now()) / 1000);
   // stage === 'grace':   display max(0, rawSeconds) — negative numbers mean we're in freeze
   // stage === 'freeze':  display max(0, FREEZE_SECONDS - (-rawSeconds))
   ```
2. Keep the stage-transition `setTimeout` calls (t1/t2/t3) — they still correctly mark the boundaries — but use them only for *state transitions*, not for *displayed numbers*.
3. Bonus: both widgets now converge to 0 at the exact same moment, because they're reading the same absolute timestamp.

**Acceptance.**
- At any moment during the grace stage, both the top header and the bottom "Last chance" banner show the same integer second count (±1 due to rendering jitter).
- Backgrounded tabs still show a correct countdown when refocused (`phaseEndsAtMs` is absolute; setInterval drift no longer matters).

---

### A24-I08 — "Last chance to submit" banner shows on non-submission phases (email, results, round 2 bottom)

> ✅ **Shipped in PR [#87](https://github.com/fenrix-ai/FenriX/pull/87).** Both the grace-stage `useEffect` and the overlay render are gated by `SUBMISSION_PHASE_BASES` (`bid_ad`, `bid_chef`, `roster`, `decide`) — nothing fires on `email`, `simulating`, `results_ready`, `game_over`, or `lobby`. The Locked / freeze overlay uses the same gate.

**Severity:** Moderate. User reports: *"There is a last chance to submit button on the bottom of the round 2 screen, that should not be there."*

**Symptom.** The orange "Last chance to submit — {n}s" banner from [GamePhaseListener.tsx:192–220](app/src/components/GamePhaseListener.tsx:192) renders globally any time a phase's `phaseEndsAt` is within 5 s — **including non-submission phases** like `email`, `simulating`, `results_ready`, or the transitional moment when the email phase of round 2 is wrapping up. On those phases, there's nothing to submit, and the banner is misleading.

**Root cause.** [GamePhaseListener.tsx:190](app/src/components/GamePhaseListener.tsx:190) returns the banner whenever `stage !== null`, with no check of the current phase's `base`. The grace-stage useEffect at [line 162](app/src/components/GamePhaseListener.tsx:162) fires on any non-null `phaseEndsAtMs`, regardless of phase.

**Fix.** Gate both the state-transition useEffect and the render by phase base. Only fire grace/freeze during phases where a student actually has something to submit:

```tsx
// In the grace-stage useEffect:
if (!["bid_ad", "bid_chef", "roster", "decide"].includes(parsed.base)) return;

// In the render:
if (stage === null) return null;
if (!["bid_ad", "bid_chef", "roster", "decide"].includes(parsed.base)) return null;
```

File: [GamePhaseListener.tsx:162–250](app/src/components/GamePhaseListener.tsx:162). `parsed` comes from `parseGamePhase(phase).base` — already imported at line 7.

**Acceptance.**
- No banner appears on `email`, `simulating`, `results_ready`, `game_over`, or `lobby`.
- Banner still fires correctly on `bid_ad`, `bid_chef`, `roster`, `decide` as the phase timer expires.
- The "Locked — advancing in {n}" freeze overlay is similarly gated (same list of allowed phases).

---

## P2 — Polish

### A24-I07 — Round 1 screen should tell players they start with $500,000

> ✅ **Shipped in PR [#87](https://github.com/fenrix-ai/FenriX/pull/87).** `EmailPhasePage` renders a starter chip on Round 1 only — "Your team starts with $X — spend wisely." — sourced from the game config (`config.startingBudget`), not hard-coded. Rounds 2–5 hide the chip.

**Severity:** Low (onboarding polish). User: *"Need something at the start to tell them, maybe on the round one screen, that they are starting with X amount of dollars."*

**Fix.** On [EmailPhasePage.tsx](app/src/pages/EmailPhasePage.tsx), when `currentRound === 1`, render a small info chip above the tagline:

```tsx
{currentRound === 1 && (
  <div className="round-briefing__starter-chip">
    Your team starts with <strong>${formatMoney(startingBudget)}</strong> — spend wisely.
  </div>
)}
```

The value should come from `GameContext` (add `startingBudget` to context if not already there) seeded from the game doc's `config.startingBudget` (default $500,000 from [config.js:189](backend/functions/modules/config.js:189)). `formatMoney` helper already exists in the codebase (deduplicated in [PR #78](https://github.com/fenrix-ai/FenriX/pull/78)).

**Acceptance.**
- Round 1 email page shows "Your team starts with $500,000 — spend wisely."
- Rounds 2–5: chip is hidden.
- Value reads from game config, not hardcoded.

---

### A24-I09 — Results screen "Revenue" card should be labeled "Profit"

> ✅ **Shipped in PR [#87](https://github.com/fenrix-ai/FenriX/pull/87).** User-facing labels flipped from "Revenue" → "Profit" across `ResultsPhase`, `LeaderboardPage`, `ConclusionPage`, and `SimulatePhase`. Backend field name (`revenueNet`) is unchanged — purely a label swap, no schema impact.

**Severity:** Low (terminology). User: *"On the results screen, the target variable should be profit, rename it."*

**Root cause confirmation.** The underlying field `revenueNet` **is** profit — it's gross revenue minus all costs including loan-shark deductions ([simulation.js:422–450](backend/functions/modules/simulation.js:422)):
```js
const revenueGross = computeGrossRevenue(...) + adWinnerBonus;
const totalSpent = roundCosts.totalSpent;
const revenueNet = revenueGross - loanSharkDeduction;
```
So this is a **label-only change** — no schema work, no simulation changes.

**Fix.**
- [ResultsPhase.tsx:340–343](app/src/pages/phases/ResultsPhase.tsx:340): rename the metric card from `"Revenue"` → `"Profit"` (or `"Net Profit"` for extra clarity).
- [LeaderboardPage.tsx:88–94](app/src/pages/LeaderboardPage.tsx:88): rename the table header `"Revenue (Total)"` → `"Profit (Total)"`.
- [ConclusionPage.tsx:324–326, 409–410, 435–436](app/src/pages/ConclusionPage.tsx:324): replace every `"net revenue"` label with `"profit"` for consistency.
- Grep `Revenue|revenueNet` across UI components one more time — the field reference (`revenueNet`) stays; only user-facing *labels* change.

**Acceptance.**
- Results card header reads "Profit" (not "Revenue" or "Net Revenue").
- Leaderboard and Conclusion pages consistently use "Profit" for the ranked metric.
- Backend responses unchanged (still send `revenueNet`).
- Design review with Mia + AB on the exact wording ("Profit" vs "Net Profit") before the PR merges.

---

## Suggested Sequencing

Three-day plan. All P0s on day 1; P1 UI work parallelizable on days 2–3.

**Day 1 — P0 blockers (backend + two small FE)**

| Track | Issues | PR bundle |
|---|---|---|
| Backend | A24-I10 (ad-bonus gate) | `backend/ad-bonus-no-stock-guard` — one-line simulation.js change + new `test-ad-bonus-gate.js` |
| Frontend | A24-I01 (remove team-photo feature) | `frontend/remove-team-photo` — delete 27 refs, update two backend tests |
| Both | A24-I03 (team-join UX + live lobby count) | `app/team-join-banner-and-live-lobby` — TeamPage copy rewrite + LandingPage onSnapshot swap |

**Day 2 — P1 UX**

| Track | Issues | PR bundle |
|---|---|---|
| Frontend | A24-I02 (HowToPlay rewrite), A24-I04 (email-timer + auto-advance) | `app/how-to-play-role-cards-and-email-timer` |
| Frontend | A24-I06 (timer-sync), A24-I08 (gate last-chance banner) | `app/game-phase-listener-fixes` |

**Day 3 — P1 + P2 polish**

| Track | Issues | PR bundle |
|---|---|---|
| Frontend | A24-I05 (auction separation + winner banners) | `app/auction-phase-separation-and-banners` |
| Frontend | A24-I07 (round-1 starting budget chip), A24-I09 (profit rename) | `app/results-profit-and-round1-chip` — tiny cosmetic PR |

### Cross-track coordination points

- **A24-I01 (remove team-photo)** touches the same `createTeam` callable and tests as A24-I03 (live lobby). Ship I01 first, then I03 rebases on its deletions — avoids merge pain on the `getTeamsInLobby` response shape.
- **A24-I06 (timer sync) + A24-I08 (gate banner)** both modify `GamePhaseListener.tsx`. Ship as one PR to avoid rebase conflicts.
- **A24-I04 (email auto-advance)** piggybacks on ProfessorPage's existing advance loop. Double-check with Scott / Dylan B. that nothing else auto-fires advance, so we don't get duplicate calls.
- **A24-I05 (auction-phase separation)** depends on `AdWinnerBanner` staying mountable from AuctionPage. Confirm the component doesn't have props that assume it only renders from GamePage.

## Testing recommendations

Before merging any P0 fix:

1. **`test-ad-bonus-gate.js`** — 2 teams, 1 wins TV and stocks `{croissant: 1}`, 1 wins TV and stocks `{}`. Assert first team's `revenueGross` includes the TV bonus; second team's doesn't.
2. **Live playthrough** — 3-person playtest on the emulator. Verify: (a) no team-photo input visible, (b) round 1 shows starting budget, (c) email page counts down and auto-advances, (d) ad-winner banner shows during bid_chef, (e) Results card says "Profit", (f) ad-no-stock bug does not reproduce.
3. **`test-create-join-flow.js`** — confirm no `logoUrl` references remain; cascade 1→2→3 transition test still passes after A24-I03's TeamPage banner changes.
4. **Manual QA on tab switching** — during `bid_ad`, confirm there is no visible UI for chef bidding (A24-I05).
5. **Unit-test suite** — `cd backend/functions && npm test`. Should report **0 failed** before any PR ships.

---

## Open follow-ups (not in scope for May 1 but worth tracking)

- **A24-I01 (keep-and-fix variant)** — revisit team-photo uploads after May 1 with progress UI, client-side validation, and storage rules audit. Don't ship for May 1; user explicitly opted to remove rather than wait.
- **A24-I05 (full separation)** — long-term, ad-auction and chef-auction deserve their own route (`/auction/ad`, `/auction/chef`) so the URL reflects the phase. One-page-with-banner is a sprint shortcut; the cleaner design is two pages. Defer.
- **A24-I10 (alt. fix variant)** — convert the flat ad bonus into a customer-count multiplier. This is a game-design change that should go through Mia / design review before coding. Track in `GAME_DESIGN_PROPOSAL.md` under DEC-03/DEC-04 follow-ups.
