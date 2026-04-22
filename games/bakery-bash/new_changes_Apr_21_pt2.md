# Pull Request: new_changes_Apr_21_pt2

**Branch:** `new_changes_Apr_21_pt2`
**Base:** `main`
**Date:** 2026-04-21

---

## What changed

This PR introduces all front-end and back-end changes identified during the April 21 playtesting session. It is a **UI/UX and game-flow layer** on top of the infrastructure work already captured in `frontend-new-tasks-Apr-21.md` and `backend-new-tasks-Apr-21.md` (FE-0–9, BE-0–9). Those tasks must be merged before this branch is deployed.

### Front-End (16 tasks)

| ID | File(s) | Change |
|----|---------|--------|
| FE-P01 | `src/pages/HowToPlayPage.tsx` *(new)*, `src/App.tsx` | Create "How to Play" screen with 4 stage cards (Decisions, Ad Auction, Chef Auction, Results) |
| FE-P02 | `src/components/game/RoundHeader.tsx` | Add large full-width phase banner using `PHASE_LABELS` mapping |
| FE-P03 | `src/pages/phases/DecidePhase.tsx` + any other display strings | Rename "Decide Round" → "Decisions Round" in all UI labels (display strings only, not types) |
| FE-P04 | Any component with "Advertisements" role label | Rename role "Advertisements" → "Bidder" in all display strings |
| FE-P05 | `src/pages/GamePage.tsx` or `src/components/game/GameSidebar.tsx` | Increase size of the active-role button to be large and prominent |
| FE-P06 | `src/pages/LandingPage.tsx` | Replace single join form with Create Team (name + logo upload) and Join Team (select from lobby) flows |
| FE-P07 | `src/pages/ProfessorPage.tsx` | Collapse create-game section after start; split-column layout; friendly phase labels; green/red submission status dots per team |
| FE-P08 | `src/pages/GamePage.tsx`, `src/components/game/tabs/AuctionTab.tsx` | Auction phase now renders before Decisions; "Chef Hiring" displayed as a notification badge, not a tab |
| FE-P09 | `src/components/game/tabs/AuctionTab.tsx` | Thematic ad taglines + ownership description; `$` prefix label outside input; wider bid input field |
| FE-P10 | `src/components/game/tabs/AuctionTab.tsx` | Chef cards: numbered labels, nationality + flag, Minimum Ask, skill multiplier table, stacking note, friendly error messages |
| FE-P11 | `src/components/game/tabs/AuctionTab.tsx` | Per-chef Submit Bid button; Submit All Bids button; allow bid re-submission until timer; timer-expired popup; disable all inputs after timer |
| FE-P12 | `src/pages/phases/AuctionResultsPhase.tsx` *(new)*, `src/pages/GamePage.tsx` | Post-auction results screen: ad and chef winners with team logos; random ad reveal animation |
| FE-P13 | `src/pages/phases/KitchenRosterPhase.tsx` *(new or existing)* | Kitchen Roster redesigned as card-style slots; Lay Off button per chef; new hires staging section |
| FE-P14 | Any component rendering chef emoji | Replace emoji chef with pixel-art SVG from `assets/svg/characters/chef-walk-spritesheet.svg` |
| FE-P15 | `src/pages/phases/ResultsPhase.tsx` | Add leaderboard panel; replace stat rows with large metric cards; remove duplicate CSV download button |
| FE-P16 | `src/hooks/useGameListener.ts`, `src/pages/phases/ResultsPhase.tsx` | Fix Round 2 showing Round 1 data — ensure useGameListener re-subscribes when `currentRound` changes |

### Back-End (10 tasks)

| ID | File(s) | Change |
|----|---------|--------|
| BE-P01 | `backend/functions/index.js` | Fix chef name generation — deduplicate using a `Set` within each round's generation call |
| BE-P02 | `backend/functions/index.js` | Assign nationality + `flagEmoji` + `nationalityCode` to each chef at generation; write to Firestore |
| BE-P03 | `backend/functions/index.js` | Standardize to exactly 9 chefs per auction round (`CHEFS_PER_ROUND = 9`) |
| BE-P04 | `backend/functions/index.js` | Change bid submission to overwrite `pendingBids` rather than lock; allow re-submission until timer |
| BE-P05 | `backend/functions/index.js` | Enforce timer server-side in `submitBids` — reject with `failed-precondition` if `Timestamp.now() > phaseEndTime` |
| BE-P06 | `backend/functions/index.js` | Add `minimumAsk` to chef data (low=$5k, medium=$15k, high=$25k); validate in `submitBids` with user-friendly error message |
| BE-P07 | `backend/functions/index.js`, `backend/firestore-schema.js`, `app/src/types/game.ts` | Reorder phases: `email → bid → auction_results → decide → simulating → results_ready`; add `resolveAuctions()` helper; add `"auction_results"` to `GamePhase` type and config `phaseDurations` |
| BE-P08 | `backend/functions/index.js` | New `createTeam` callable — accepts `teamName` + `logoUrl`, writes to `/games/{gameId}/teams/` |
| BE-P09 | `backend/functions/index.js` | New `getTeamsInLobby` callable — returns team list for Join Team UI |
| BE-P10 | `backend/functions/index.js` | Fix Round 2 data bleed — re-fetch `currentRound` at start of `simulateRound`; reset `pendingDecision.submitted` and `pendingBids` on all player docs when advancing to next round |

---

## Why

These changes come directly from the April 21 playtesting session with real players. Key problems surfaced:

- Players could not tell which phase they were in
- The auction UI confused players (Chef Hiring looked like a clickable tab; no Minimum Ask shown; raw code in error messages)
- Bids could only be submitted once and could be submitted after the timer expired
- No team identity (name + logo) on login
- Round 2 was displaying Round 1 data
- Kitchen Roster had no way to assign or remove chefs
- Results screen lacked a leaderboard and used plain text for all metrics
- The professor dashboard was a single stacked column with unreadable internal phase names

---

## Testing

### Front-End

- [ ] Start the dev server: `cd games/bakery-bash/app && npm run dev`
- [ ] Navigate to `/how-to-play` — verify all 4 stage cards render with correct copy
- [ ] Join game → confirm phase banner updates correctly as the professor advances phases
- [ ] On login, test Create Team: upload a logo image, submit, verify logo preview and team creation
- [ ] On login, test Join Team: enter a valid game code, verify team list populates, select a team and join
- [ ] Open Auction tab during `"bid"` phase — verify ad taglines match spec, `$` prefix is outside the input, bid input is wide enough for 6-digit numbers
- [ ] Submit a chef bid, verify individual Submit Bid works; then change the bid and re-submit — confirm second submission is accepted
- [ ] Let the auction timer run out — attempt to submit a bid and confirm the "Auction timer is up!" popup appears and inputs are disabled
- [ ] Advance to Round 2 — confirm no Round 1 data appears on the results or auction screens
- [ ] Professor dashboard: verify split-column layout, phase label shows "Decisions Round" not "decide", submission dots are green/red per team

### Back-End

- [ ] Deploy to emulator: `cd games/bakery-bash/backend && firebase emulators:start`
- [ ] Call `joinGame` → verify chef names generated are unique within the round and include `nationality`, `flagEmoji`, `minimumAsk`
- [ ] Verify exactly 9 chefs appear in the round document
- [ ] Call `submitBids` twice with different amounts — confirm second call overwrites, not errors
- [ ] Call `submitBids` after manually setting `phaseEndTime` to a past timestamp — confirm `failed-precondition` error is returned
- [ ] Call `submitBids` with amount below `minimumAsk` — confirm error message reads "Minimum Ask" not "minBidFloor"
- [ ] Call `advancePhase` and verify new phase order: `bid → auction_results → decide → simulating → results_ready`
- [ ] Call `createTeam` — verify team document written to `/games/{gameId}/teams/`
- [ ] Call `getTeamsInLobby` — verify team list returned with name, logoUrl, memberCount
- [ ] Complete Round 1, advance to Round 2 — verify all player `pendingDecision.submitted` fields reset to `false` and `pendingBids` cleared

---

## Screenshots

> Add before/after screenshots for the following once implemented:
> - Login screen (Create Team / Join Team flows)
> - Auction tab (ad taglines, chef cards with nationality + multiplier table)
> - Phase banner
> - Professor dashboard (split-column)
> - Kitchen Roster (card-style slots)
> - Round Results (metric cards + leaderboard)

---

## Dependencies

This PR **requires** the following to be merged first:
- `frontend-new-tasks-Apr-21.md` (FE-0 through FE-9) — Firestore wiring, real-time listeners, professor login, phase locking
- `backend-new-tasks-Apr-21.md` (BE-0 through BE-9) — all core Cloud Functions

**Type dependency within this PR:** `BE-P07` (phase order change + `"auction_results"` type) must be merged before `FE-P08` and `FE-P12` are tested end-to-end.

---

## Checklist

- [ ] Code has been reviewed by AI and manually
- [ ] No console errors or warnings
- [ ] Tested on desktop and mobile browsers
- [ ] Commit messages follow conventions (present tense, imperative)
- [ ] `"auction_results"` added to `GamePhase` type in `src/types/game.ts`
- [ ] `PHASE_LABELS` mapping covers all 7 `GamePhase` values including new `"auction_results"`
- [ ] No display strings use internal state names (e.g. `"decide"`, `"bid"`, `"minBidFloor"`)
- [ ] All new BEM class names added to `global.css`, no inline styles introduced
- [ ] Firebase Storage rules updated to allow team logo uploads if not already covered
- [ ] `phaseDurations.auction_results` added to `GameConfigDocument` defaults in `firestore-schema.js`
