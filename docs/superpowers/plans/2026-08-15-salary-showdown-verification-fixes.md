# Salary Showdown — Verification-Run Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 2026-07-27 verification run's confirmed findings — F1/F2 (seed script), F3 (RUNBOOK Scout), F4 docs+copy half, F5b (prod-smoke step), F6 (stranded second tab), F7 (stale lineup), F8 (zero-spend W/$), F9a/b/c (hype-rule scope, HypeStars comment, join-code copy) — plus punch items P2-2 ("We're done" acknowledgment) and P2-3 (professor connecting copy), with tests, without regressing anything in the report's §3 verified-working inventory.

**Architecture:** Docs and comments land first (zero risk), then dev tooling, then behavior fixes smallest-to-largest, each with its own test and commit on branch `salary-showdown-verification-fixes`. No new files except tests; every change follows an existing in-repo pattern (AuctionPage live-subscription, errors TABLE, professor listener error callbacks).

**Tech Stack:** Firebase Cloud Functions + Firestore (emulators), React 19 + TS + Vite, vitest (backend / unit / integration-with-live-emulators), firebase-admin test harness.

**Source findings:** `docs/superpowers/playtests/2026-07-27-verification-run.md` §1–2 + §4 items 2–3. Adjudications for this batch (Dylan, 2026-08-15): F4 = docs+copy now, real recovery mechanism deferred to its own spec; F5 = checklist reword only (no product escape); seedprof email identity NOT ported (separate discussion); report already committed at `69b4b56`.

## Global Constraints

- **HANDOFF §6 hard rules are law** (`docs/superpowers/salary-showdown-HANDOFF.md`). The ones this plan touches or skirts: markDone is a STATUS FLAG, never a lock (button never disabled); no emojis in product UI (★ ▲ ▼ ½ ‹ › are sanctioned glyphs; ✓ is NOT sanctioned — do not add it); hype renders visually as ★ glyphs only; `submitBids` always sends a plain object; `advancePhase` callers always send `expectedPhase`+`expectedRound`; **HARD INVARIANT: `joinGame` must RESOLVE before `setGameId(...)`**.
- **NEVER remove or "simplify" the browser-transport alias in `games/salary-showdown/app/vitest.integration.config.ts`.**
- **Verify HEAD before any git op:** `git rev-parse HEAD` (sibling worktrees can transiently race refs; retry once if it errors).
- **No push. No prod deploy. No prod writes.** Emulators only.
- **Emulator flake protocol:** `Transaction lock timeout` or listener stalls after long uptime → restart emulators + rerun before investigating. One red run immediately after editing backend source = functions hot-reload; rerun once before investigating.
- **Working directories:** backend tests from `games/salary-showdown/backend/functions`; app commands from `games/salary-showdown/app`. Emulators: from `games/salary-showdown/backend/functions`, `PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run emu` (Functions 5101 · Firestore 8180 · Auth 9199 · UI 4100, project `salary-showdown-dev`).
- **Suite baselines (must hold at Task 0):** backend 24 files/168 · app unit 14/69 · integration 18/30 · `npx tsc -b` clean · `npm run audit:ui` clean 64 files. Expected finals (Task 9): backend 24/168 · unit 14/**71** · integration 18/**33** · audit 64.
- **Ledger:** append one-liners to `.superpowers/sdd/progress.md` at milestones. NEVER `git add` it (gitignored by design).
- Pre-existing dirty files (`quant_finance/README.md`, untracked bakery-bash/quant_finance/`image (2).png` files, `_playtest-cli.mjs`, `_seed-demo-patched.mjs`, `backend/functions/scripts/`) are NOT yours — never stage them.

---

### Task 0: Baseline gate + branch

**Files:** none modified.

- [ ] **Step 1: Verify HEAD and create the branch**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD
```

Expected: HEAD is the plan's own docs commit — `git log -1 --pretty=%s` prints `docs(salary-showdown): verification-fixes implementation plan (F1-F9c + P2 items)`, with the findings report `69b4b56` one below it. If rev-parse errors, retry once (worktree ref race). If the subject differs, STOP and report — do not branch.

```bash
git checkout -b salary-showdown-verification-fixes
```

- [ ] **Step 2: Boot fresh emulators** (kill any stale ones first; a fresh instance is required for trustworthy baselines)

```bash
lsof -ti:5101,8180,9199,4100 | xargs kill 2>/dev/null; cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run emu
```

Run in background; wait until `curl -s http://127.0.0.1:4100 >/dev/null` succeeds (~20-40s).

- [ ] **Step 3: Baseline suites (sequenced, not parallel)**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run
```

Expected: **24 files / 168 tests** green.

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run
```

Expected: **14 files / 69 tests** green.

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts
```

Expected: **18 files / 30 tests** green (needs the live emulators from Step 2).

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx tsc -b && npm run audit:ui
```

Expected: tsc silent; audit "clean" over 64 files. Any red → apply the flake protocol before proceeding; a persistent red is a STOP-and-report.

---

### Task 1: Docs + comments (F3, F4-docs, F5b, F9a, F9b)

**Files:**
- Modify: `docs/superpowers/salary-showdown-RUNBOOK.md` (3 edits + 1 new section)
- Modify: `docs/superpowers/salary-showdown-prod-smoke.md` (1 step)
- Modify: `docs/superpowers/salary-showdown-HANDOFF.md` (§6 hype bullet — this scope note is finding F9a, assigned by Dylan; it documents existing adjudicated reality, it does not change a rule)
- Modify: `games/salary-showdown/app/src/components/ui/HypeStars.tsx` (comment only)

- [ ] **Step 1: RUNBOOK — Scout row (F3).** Replace exactly:

Old:
```
| Star Auction | GM places one sealed star bid | 2:00 | Lights fill as bids land |
```
New:
```
| Star Auction | Scout places one sealed star bid | 2:00 | Lights fill as bids land |
```

- [ ] **Step 2: RUNBOOK — recovery-kit line (F4).** Replace exactly:

Old:
```
3. Write down the **join code** (the large code at the top of the panel) and the
   **game id** (press F12, then Application > Local Storage > `ss.profGameId`).
   These two lines are your whole disaster-recovery kit.
```
New:
```
3. Write down the **join code** (the large code at the top of the panel) and the
   **game id** (press F12, then Application > Local Storage > `ss.profGameId`).
   The game id resumes the panel in THIS browser and is required for the
   emergency recovery below — it cannot, by itself, move the panel to a
   different browser.
```

- [ ] **Step 3: RUNBOOK — recovery row (F4).** Replace exactly:

Old:
```
| Panel tab closed or laptop rebooted | Reopen `/professor` in the same browser — the session resumes by itself. On a different browser: paste the game id from your recovery note into **Existing game id**, press **Resume**. |
```
New:
```
| Panel tab closed or laptop rebooted | Reopen `/professor` in the same browser — the session resumes by itself. Same browser only: a different browser cannot resume the panel (professor identity lives in the browser that created the game). If that browser is gone, see **Lost laptop (emergency recovery)** below. |
```

- [ ] **Step 4: RUNBOOK — new emergency section (F4).** Insert between the "If something breaks" table and the "## 30-second drag check" heading:

```markdown
### Lost laptop (emergency recovery)

The panel's identity is an anonymous login stored in the browser that created
the game. If that browser is gone (dead laptop, wiped profile), no in-app
button can move control — rebinding takes the Firebase console (owner access):

1. On the new machine, open `/professor`, paste the game id into **Existing
   game id**, press **Resume** once, and leave it on "Connecting to session…"
   (this creates the new browser's identity).
2. In the Firebase console (console.firebase.google.com) → project
   `salary-showdown` → **Authentication → Users**, copy the **User UID** of
   the newest anonymous user — the one created just now (sort by Created
   date).
3. **Firestore Database → data → `games` → your game id**: edit the
   `professorUid` field to that UID.
4. Reload the panel page — the hung connection attempt never retries on its
   own.

Meanwhile the class is safe: with the old panel dead nothing advances the
game (auto-advance fires from a live panel, and timers are advisory), so
students keep working in the current phase and nothing is lost.
```

- [ ] **Step 5: prod-smoke — re-admit step (F5b).** In `docs/superpowers/salary-showdown-prod-smoke.md`, replace exactly:

Old:
```
- [ ] **Crashed-laptop rejoin (the taken-seat path this pairs with).** Fully
      QUIT the browser on a joined device (not just the tab) and reopen
      `<hosting-url>`. SEE it land straight back in the game at the current
      phase: in prod the anonymous uid persists in the browser (default auth
      persistence) and `ss.gameId` now persists with it. Then, in that SAME
      browser, open the join page again, pick the same team and tap your OWN
      seat — it renders with "· taken" and is still tappable. SEE the server
      re-admit you and the game screen restore: `joinGame` rejects a claimed
      seat only when the uid DIFFERS.
```
New:
```
- [ ] **Crashed-laptop rejoin (the taken-seat path this pairs with).** Fully
      QUIT the browser on a joined device (not just the tab) and reopen
      `<hosting-url>`. SEE it land straight back in the game at the current
      phase: in prod the anonymous uid persists in the browser (default auth
      persistence) and `ss.gameId` now persists with it.
      Re-admit half — needs DevTools, because while a membership exists the
      app always routes past the join form (that routing is correct; this
      simulates a device that lost its saved game but kept its identity):
      F12 → Application → Local Storage → delete the `ss.gameId` key ONLY
      (do NOT "Clear site data" — that wipes the identity too), then reload.
      The join form is back: enter the code, pick the same team and tap your
      OWN seat — it renders with "· taken" and is still tappable. SEE the
      server re-admit you and the game screen restore: `joinGame` rejects a
      claimed seat only when the uid DIFFERS.
```

(The "Negative half, worth seeing once:" sentences that follow are unchanged.)

- [ ] **Step 6: HANDOFF §6 — hype-rule scope note (F9a).** Replace exactly:

Old:
```
- **No emojis anywhere in product UI.** `★ ▲ ▼ ½ ‹ ›` are glyphs and are fine. **Hype renders only as ★ glyphs, never numerically.**
```
New:
```
- **No emojis anywhere in product UI.** `★ ▲ ▼ ½ ‹ ›` are glyphs and are fine. **Hype renders only as ★ glyphs, never numerically.** Scope (2026-08-15, F9a): the never-numerically rule governs what sighted students see IN-GAME. Two spec-internal carve-outs are sanctioned: the finale reveal's Hype-vs-TrueImpact scatter is numeric hype by design (spec §11 mandates the numeric reveal scatter — axis and per-point tooltips ship as reviewed in Plan 3a), and `HypeStars`'s aria-label carries the numeric value (lossless for assistive tech, correct a11y practice).
```

- [ ] **Step 7: HypeStars comment (F9b).** In `games/salary-showdown/app/src/components/ui/HypeStars.tsx`, replace exactly:

Old:
```tsx
// Hype renders ONLY as ★ glyphs (halves as ½) — never numerically (spec §11).
// ★ and ½ are glyphs, not emojis; the no-emoji rule is untouched.
```
New:
```tsx
// Hype renders VISUALLY only as ★ glyphs (halves as ½) — never numerically
// on-screen (spec §11). The aria-label DELIBERATELY carries the numeric value:
// assistive tech gets the same information losslessly, which is correct a11y
// practice and in-scope per the handoff §6 note (2026-08-15, F9b).
// ★ and ½ are glyphs, not emojis; the no-emoji rule is untouched.
```

- [ ] **Step 8: Verify**

```bash
cd /Users/dylanmassaro/FenriX && grep -c "Scout places one sealed star bid" docs/superpowers/salary-showdown-RUNBOOK.md && grep -c "Lost laptop (emergency recovery)" docs/superpowers/salary-showdown-RUNBOOK.md && grep -c "delete the \`ss.gameId\` key ONLY" docs/superpowers/salary-showdown-prod-smoke.md && grep -c "Scope (2026-08-15, F9a)" docs/superpowers/salary-showdown-HANDOFF.md && grep -c "GM places one sealed star bid" docs/superpowers/salary-showdown-RUNBOOK.md; true
```

Expected: `1`, `1` (plus the row's pointer makes ≥1), `1`, `1`, then `0` (grep -c prints 0 and exits 1 for the removed GM row — hence the trailing `; true`).

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npm run audit:ui && npx vitest run src/lib/errors.test.ts
```

Expected: audit clean 64 files (comment-only code change); the spot unit file green (sanity that the app still builds under vitest).

- [ ] **Step 9: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add docs/superpowers/salary-showdown-RUNBOOK.md docs/superpowers/salary-showdown-prod-smoke.md docs/superpowers/salary-showdown-HANDOFF.md games/salary-showdown/app/src/components/ui/HypeStars.tsx && git commit -m "docs(salary-showdown): honest recovery row + emergency path, Scout auction row, reachable smoke step, hype-rule scope (F3/F4-docs/F5b/F9a/F9b)"
```

---

### Task 2: seed-demo.mjs — region pin + synthetic-pid fallback (F1+F2)

**Files:**
- Modify: `games/salary-showdown/app/scripts/seed-demo.mjs`

Reference (do NOT copy wholesale — it contains scratch-only path edits and a prof-email experiment that are explicitly excluded): `games/salary-showdown/app/scripts/_seed-demo-patched.mjs`.

**Interfaces:** Produces a working `npm run seed -- --to <target> [--fill all]` for every documented target including those crossing bot-hardship boundaries.

- [ ] **Step 1: Reproduce both failures (red).** Emulators must be up (Task 0).

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npm run seed -- --to R1:FREE_AGENCY
```

Expected: FAILS with `functions/not-found` (missing region pin — F1).

- [ ] **Step 2: Add the region pin (F1).** In `seed-demo.mjs`, replace exactly:

Old:
```js
  const fns = getFunctions(app);
```
New:
```js
  // us-west1 matches the backend's setGlobalOptions pin: the functions
  // emulator registers callables under their declared region, and the
  // callable URL's /{project}/{region}/{fn} path must agree (same pin as
  // the itest harness and _playtest-cli; missed here by plan-3b T3 — F1).
  const fns = getFunctions(app, 'us-west1');
```

- [ ] **Step 3: Reproduce the synthetic-pid crash (red for F2)**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npm run seed -- --to FINALE --fill all
```

Expected: region fix lets it run, then it CRASHES with a `TypeError` (reading `mins_per_game`/`position` of `undefined`) at the first LINEUP past a bot-hardship boundary.

- [ ] **Step 4: Add the pidInfo fallback (F2).** Replace exactly:

Old:
```js
const byPid = Object.fromEntries(CATALOG.map((p) => [p.pid, p]));
```
New:
```js
const byPid = Object.fromEntries(CATALOG.map((p) => [p.pid, p]));
// Synthetic Default Role Players are not in players.json — they exist only in
// the per-game catalog (SCHEMA.md HARDSHIP note; synthetics.js pids 9001-3 G,
// 9011-3 W, 9021-2 B). Position derives from the reserved pid block; mins 0
// sorts them last, same spirit as replacement level. Only lineup arrangement
// needs the fallback: market pools never contain synthetics (F2).
const pidInfo = (pid) => byPid[pid]
  ?? { position: pid >= 9020 ? 'B' : pid >= 9010 ? 'W' : 'G', mins_per_game: 0 };
```

Then in `arrangeLineup`, replace exactly:

Old:
```js
  const sorted = [...pids].sort(
    (a, b) => Number(byPid[b].mins_per_game) - Number(byPid[a].mins_per_game));
  const need = { G: 2, W: 2, B: 1 };
  const starters = [];
  for (const pid of sorted) {
    const pos = byPid[pid].position;
```
New:
```js
  const sorted = [...pids].sort(
    (a, b) => Number(pidInfo(b).mins_per_game) - Number(pidInfo(a).mins_per_game));
  const need = { G: 2, W: 2, B: 1 };
  const starters = [];
  for (const pid of sorted) {
    const pos = pidInfo(pid).position;
```

Do NOT touch `actFreeAgency` — its `byPid` uses are over `market.available`, which never contains synthetics.

- [ ] **Step 5: Verify (green ×2)**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npm run seed -- --to R1:FREE_AGENCY
```

Expected: prints `Seeded game at R1:FREE_AGENCY` with gameId + joinCode.

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npm run seed -- --to FINALE --fill all
```

Expected: walks `-> R1:AUCTION` … through all rounds, prints `Seeded game at R5:FINALE`, `open seats: none`. (Both runs leave inert games on the dev emulator — fine.)

- [ ] **Step 6: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/app/scripts/seed-demo.mjs && git commit -m "fix(salary-showdown): seed-demo — us-west1 region pin + synthetic-pid lineup fallback (F1/F2)"
```

---

### Task 3: 'bad join code' student copy (F9c)

**Files:**
- Modify: `games/salary-showdown/app/src/lib/errors.ts`
- Test: `games/salary-showdown/app/src/lib/errors.test.ts`

The server throws the prose message `bad join code` from both `getLobby` and `joinGame` (backend `game.js`); today it falls through to the generic "That did not go through — try again." — affirmatively wrong advice on the most-trafficked pre-game error path. Ledger precedent: PHASE_MISMATCH promotion.

- [ ] **Step 1: Write the failing test.** Append to `errors.test.ts`:

```ts
test('bad join code maps to the projector-check copy', () => {
  expect(errorCopy(new Error('bad join code')).headline)
    .toBe('No game found with that code — check the projector.');
});
```

- [ ] **Step 2: Run it — expect FAIL**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run src/lib/errors.test.ts
```

Expected: the new test fails (headline is the generic fallback).

- [ ] **Step 3: Implement.** In `errors.ts`, replace exactly:

Old:
```ts
  PHASE_MISMATCH: 'The phase just closed.',
  'market is closed': 'Free agency is closed.',
```
New:
```ts
  PHASE_MISMATCH: 'The phase just closed.',
  'bad join code': 'No game found with that code — check the projector.',
  'market is closed': 'Free agency is closed.',
```

- [ ] **Step 4: Run the unit suite**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run
```

Expected: **14 files / 70 tests** green.

- [ ] **Step 5: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/app/src/lib/errors.ts games/salary-showdown/app/src/lib/errors.test.ts && git commit -m "fix(salary-showdown): map 'bad join code' to student copy (F9c)"
```

---

### Task 4: Zero-spend wins-per-dollar emits null → renders "—" (F8)

**Files:**
- Modify: `games/salary-showdown/backend/functions/src/game.js` (the enter:FINALE winsPerDollar writer)
- Test: `games/salary-showdown/backend/functions/test/reveal.test.js` (update existing assertions — the passive-team test IS the zero-spend fixture)
- Modify: `games/salary-showdown/app/src/types/models.ts` (RevealDoc.winsPerDollar ratio type)
- Modify: `games/salary-showdown/app/src/lib/revealCharts.ts` (`winsPerDollarGeometry`, `WpdBar`)
- Modify: `games/salary-showdown/app/src/components/charts/WinsPerDollar.tsx` (skip the bar rect for null)
- Test: `games/salary-showdown/app/src/lib/revealCharts.test.ts` (new test)

**Interfaces:** Produces wire field `winsPerDollar[].ratio: number | null` (null iff totalSpend is 0) consumed by `winsPerDollarGeometry(rows, names, frame): WpdBar[]` where `WpdBar.ratio: number | null` and `WpdBar.ratioLabel` is `'—'` for null. Both the laptop FinalePage and the projector FinaleWall render through the same `WinsPerDollar` component — one fix covers both.

- [ ] **Step 1: Update the backend test's expectations (red first).** In `reveal.test.js`, three edits.

Edit A — in the first test (`does not exist before finale…`), replace exactly:

Old:
```js
    expect(after.winsPerDollar[0].ratio).toBeGreaterThanOrEqual(0);
```
New:
```js
    // Both teams here are fully passive: every contract is a $0 hardship
    // synthetic, so totalSpend is 0 and wins-per-dollar is meaningless — the
    // writer emits null (F8; the old Math.max(1, spend) clamp fabricated
    // "wins per $1M" and ranked a zero-spend winner #1).
    for (const w of after.winsPerDollar) {
      expect(w.totalSpend).toBe(0);
      expect(w.ratio).toBeNull();
    }
```

Edit B — in the same test's winsPerDollar shape loop, replace exactly:

Old:
```js
      expect(typeof w.totalSpend).toBe('number');
      expect(typeof w.ratio).toBe('number');
```
New:
```js
      expect(typeof w.totalSpend).toBe('number');
      expect(w.ratio).toBeNull(); // zero-spend passive teams (asserted above)
```

Edit C — in the cut test (`totalSpend (from spendLog) still counts…`), immediately after the line `expect(wpd.totalSpend).toBeGreaterThanOrEqual(Math.round(contract.rate * contract.years * 10) / 10);` insert:

```js
    // Non-zero spend keeps a REAL ratio — null is reserved for zero-spend (F8):
    expect(wpd.ratio).toBe(Math.round((wpd.wins / Math.max(1, expectedSpend)) * 1000) / 1000);
    // …and the passive rival (teamB, zero-spend hardship-only) gets null even
    // if it stole wins:
    const wpdB = reveal.winsPerDollar.find((w) => w.teamId !== teamA);
    expect(wpdB.ratio).toBeNull();
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run test/reveal.test.js
```

Expected: both tests fail (ratio is currently a number everywhere).

- [ ] **Step 3: Implement the backend change.** In `backend/functions/src/game.js`, replace exactly:

Old:
```js
    const spend = spendAll.reduce((s, c) => s + c.rate * c.years, 0);
    winsPerDollar.push({ teamId: t.id, wins: team.wins, totalSpend: Math.round(spend * 10) / 10,
      ratio: Math.round((team.wins / Math.max(1, spend)) * 1000) / 1000 });
```
New:
```js
    const spend = spendAll.reduce((s, c) => s + c.rate * c.years, 0);
    // Zero-spend seasons have no meaningful wins-per-dollar: the Math.max
    // clamp used to fabricate "wins per $1M" here, ranking a zero-spend
    // ≥1-win team #1 as "1.000" beside "$0.0M committed" (F8). Emit null;
    // the client renders "—" and sorts these rows last, matching its
    // sibling best/worst table's "No signings on record." treatment.
    winsPerDollar.push({ teamId: t.id, wins: team.wins, totalSpend: Math.round(spend * 10) / 10,
      ratio: spend === 0 ? null : Math.round((team.wins / Math.max(1, spend)) * 1000) / 1000 });
```

- [ ] **Step 4: Backend suite green**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run
```

Expected: **24 files / 168 tests** green (assertions changed, no test added). Remember the hot-reload flake rule: one immediate red after the source edit → rerun once.

- [ ] **Step 5: Write the failing app unit test.** Append to `revealCharts.test.ts`:

```ts
test('winsPerDollarGeometry: null ratio (zero-spend) sorts last, labels "—", zero width', () => {
  const names = new Map([['t1', 'Alpha'], ['t2', 'Beta'], ['t3', 'Gamma']]);
  const rows: RevealDoc['winsPerDollar'] = [
    { teamId: 't1', wins: 1, totalSpend: 0, ratio: null },
    { teamId: 't3', wins: 9, totalSpend: 100, ratio: 0.09 },
    { teamId: 't2', wins: 0, totalSpend: 0, ratio: null },
  ];
  const f: Frame = { w: 700, h: 300, padL: 10, padR: 10, padT: 10, padB: 10 };
  const bars = winsPerDollarGeometry(rows, names, f);
  expect(bars.map((b) => b.name)).toEqual(['Gamma', 'Alpha', 'Beta']); // nulls last, name tiebreak
  expect(bars[0].ratioLabel).toBe('0.090');                            // real ratios untouched
  expect(bars[1].ratioLabel).toBe('—');
  expect(bars[1].w).toBe(0);
  expect(bars[2].ratioLabel).toBe('—');
  expect(bars[2].detail).toBe('0 W · $0.0M committed');
});
```

- [ ] **Step 6: Run — expect FAIL**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run src/lib/revealCharts.test.ts
```

Expected: new test fails at runtime (`toFixed` on null / NaN sort).

- [ ] **Step 7: Implement the app half.**

`src/types/models.ts` — replace exactly:

Old:
```ts
  winsPerDollar: { teamId: string; wins: number; totalSpend: number; ratio: number }[];
```
New:
```ts
  // ratio is null for a zero-spend season (F8): the server emits null below
  // the clamp instead of fabricating "wins per $1M"; renders as "—".
  winsPerDollar: { teamId: string; wins: number; totalSpend: number; ratio: number | null }[];
```

`src/lib/revealCharts.ts` — replace exactly:

Old:
```ts
export interface WpdBar {
  teamId: string; name: string; ratio: number; ratioLabel: string; detail: string;
  x: number; y: number; w: number; h: number;
}
```
New:
```ts
export interface WpdBar {
  teamId: string; name: string; ratio: number | null; ratioLabel: string; detail: string;
  x: number; y: number; w: number; h: number;
}
```

Old:
```ts
  const nameOf = (id: string) => names.get(id) ?? id;
  const sorted = [...rows].sort((a, b) =>
    b.ratio - a.ratio || nameOf(a.teamId).localeCompare(nameOf(b.teamId)));
  const span = f.w - f.padL - f.padR - WPD_LABEL_W;
  const maxRatio = Math.max(...sorted.map((r) => r.ratio), 1e-9);
```
New:
```ts
  const nameOf = (id: string) => names.get(id) ?? id;
  // null ratio = zero-spend season (F8): sorts below every real ratio (a
  // number-vs-null comparison would NaN-poison the comparator, so nulls are
  // handled explicitly), labels "—", and draws no bar.
  const sorted = [...rows].sort((a, b) => {
    if ((a.ratio == null) !== (b.ratio == null)) return a.ratio == null ? 1 : -1;
    return (b.ratio ?? 0) - (a.ratio ?? 0)
      || nameOf(a.teamId).localeCompare(nameOf(b.teamId));
  });
  const span = f.w - f.padL - f.padR - WPD_LABEL_W;
  const maxRatio = Math.max(...sorted.map((r) => r.ratio ?? 0), 1e-9);
```

Old:
```ts
    teamId: r.teamId, name: nameOf(r.teamId), ratio: r.ratio,
    ratioLabel: r.ratio.toFixed(3),
```
New:
```ts
    teamId: r.teamId, name: nameOf(r.teamId), ratio: r.ratio,
    ratioLabel: r.ratio == null ? '—' : r.ratio.toFixed(3),
```

Old:
```ts
    w: (r.ratio / maxRatio) * span,
```
New:
```ts
    w: ((r.ratio ?? 0) / maxRatio) * span,
```

`src/components/charts/WinsPerDollar.tsx` — replace exactly (skip the bar entirely for null; the 0.5px minimum sliver would imply a measured bar):

Old:
```tsx
          <rect x={b.x} y={b.y} width={Math.max(b.w, 0.5)} height={b.h} rx={2}
            fill="var(--gold)" opacity={0.85} />
```
New:
```tsx
          {b.ratio != null && (
            <rect x={b.x} y={b.y} width={Math.max(b.w, 0.5)} height={b.h} rx={2}
              fill="var(--gold)" opacity={0.85} />
          )}
```

- [ ] **Step 8: App suites green**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run && npx tsc -b
```

Expected: **14 files / 71 tests** green; tsc clean (the `number | null` type must compile at every consumer — if tsc flags any other consumer of `.ratio`, STOP and report rather than casting).

- [ ] **Step 9: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/backend/functions/src/game.js games/salary-showdown/backend/functions/test/reveal.test.js games/salary-showdown/app/src/types/models.ts games/salary-showdown/app/src/lib/revealCharts.ts games/salary-showdown/app/src/lib/revealCharts.test.ts games/salary-showdown/app/src/components/charts/WinsPerDollar.tsx && git commit -m "fix(salary-showdown): zero-spend wins-per-dollar emits null, renders em-dash, sorts last (F8)"
```

---

### Task 5: Lineup screen — non-Coach live view + locked badge (F7)

**Files:**
- Modify: `games/salary-showdown/app/src/pages/LineupPage.tsx` (full-file replacement below)
- Test: `games/salary-showdown/app/src/itest/lineup.itest.tsx` (new second test)

Report finding 1.6: a GM/Scout tab already on `/game/lineup` keeps its mount-time auto-arranged draft after the Coach locks a different lineup (the live team doc streams in but the `|| slots` seed guard discards it), and no role can see that the lineup locked. Fix: non-Coach roles render straight off the live team doc (AuctionPage's teammate-visibility pattern); the Coach's local drag state is never touched; a public `lineupLockedRound === round` badge renders for every role.

- [ ] **Step 1: Write the failing itest.** Append to `lineup.itest.tsx` (imports already present cover everything except `newClient` — extend the harness import):

Replace exactly:
```tsx
import { adminDb, seedToPhase } from './harness';
```
with:
```tsx
import { adminDb, newClient, seedToPhase } from './harness';
```

Append:

```tsx
test('lineup (F7): a GM tab follows the Coach\'s submit live and shows the locked badge', async () => {
  localStorage.removeItem('ss.gameId'); // isolation from the prior test's claim
  const seeded = await seedToPhase({ to: 'R1:LINEUP' });
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/game/lineup']}><App /></MemoryRouter>);

  const lineupStatus = () =>
    screen.getAllByRole('status').find((el) => el.textContent?.startsWith('Lineup:'))!;

  // Alpha holds 8 hardship players (nobody signed for it) → auto-arranged
  // preview, Balanced, and NO badge: nothing is locked yet.
  await waitFor(() => expect(lineupStatus())
    .toHaveTextContent('Lineup: 2 G · 2 W · 1 B — Legal · Playstyle: Balanced'), { timeout: 20000 });
  expect(screen.queryByTestId('lineup-locked-badge')).toBeNull();

  // The Coach (a DIFFERENT client) submits Lockdown with a legal arrangement
  // built from the admin-read roster + catalog positions.
  const teamDoc = (await adminDb().doc(
    `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
  const active: number[] = teamDoc.roster
    .filter((c: { startRound: number; years: number }) => c.startRound + c.years - 1 >= 1)
    .map((c: { pid: number }) => c.pid);
  const cat = await adminDb().collection(`games/${seeded.gameId}/catalog`).get();
  const posOf = Object.fromEntries(cat.docs.map((d) => [Number(d.id), d.data().position]));
  const g = active.filter((p) => posOf[p] === 'G');
  const w = active.filter((p) => posOf[p] === 'W');
  const b = active.filter((p) => posOf[p] === 'B');
  const starters = [g[0], g[1], w[0], w[1], b[0]];
  const rest = active.filter((p) => !starters.includes(p));
  const coach = await newClient('f7-coach');
  await coach.call('joinGame', {
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Coach', displayName: 'F7 C' });
  await coach.call('submitLineup', { gameId: seeded.gameId, lineup: {
    starters, sixth: rest[0], bench: rest.slice(1), playstyle: 'Lockdown' } });

  // The GM tab follows WITHOUT any remount/reload: live playstyle + badge.
  await waitFor(() => expect(lineupStatus())
    .toHaveTextContent('Playstyle: Lockdown'), { timeout: 15000 });
  expect(screen.getByTestId('lineup-locked-badge'))
    .toHaveTextContent('Lineup locked for round 1 — the Coach can revise until the phase closes.');
}, 120000);
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/lineup.itest.tsx
```

Expected: first test green, new test FAILS (playstyle stays Balanced — the stale-seed bug — and the badge testid doesn't exist).

- [ ] **Step 3: Replace `LineupPage.tsx` with this full content:**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { useGame } from '../contexts/GameContext';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { PositionBadge } from '../components/ui/PositionBadge';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { activePids } from '../lib/contracts';
import { arrangeLineup } from '../lib/arrange';
import { fromLineup, isComplete, place, toLineup, type SlotId, type Slots } from '../lib/slots';
import { PLAYSTYLES, PLAYSTYLE_BLURBS, type Playstyle } from '../types/models';

function Card({ pid }: { pid: number }) {
  const { catalog } = useGame();
  const p = catalog.get(pid)!;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: pid });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="inset"
      style={{ cursor: 'grab', padding: '6px 8px', fontSize: 13, touchAction: 'none',
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined }}>
      <strong>{p.name}</strong> <PositionBadge pos={p.position} />
      <div className="mono dim">{Number(p.pts_per_game).toFixed(1)} ppg · {Number(p.rebounds_per_game).toFixed(1)} reb</div>
    </div>
  );
}

function Slot({ id, pid, label, cls = '' }: {
  id: SlotId; pid: number | null; label: string; cls?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`slot ${pid != null ? 'filled' : ''} ${cls}`}
      style={{ outline: isOver ? '2px solid var(--gold)' : 'none', minWidth: 110, padding: 4 }}>
      {pid != null ? <Card pid={pid} /> : <span className="dim" style={{ fontSize: 12 }}>{label}</span>}
    </div>
  );
}

export default function LineupPage() {
  const { game, team, catalog, membership, call, gameId } = useGame();
  // The COACH's local draft: seeded once at mount, then owned by the drag
  // handlers — a live snapshot must never clobber an in-progress arrangement.
  const [slots, setSlots] = useState<Slots | null>(null);
  const [style, setStyle] = useState<Playstyle>('Balanced');
  const [err, setErr] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const round = game?.round ?? 1;
  const isCoach = membership?.role === 'Coach';
  const active = useMemo(
    () => (team ? activePids(team, round) : []), [team, round]);

  useEffect(() => { // pre-arrange EVERY active pid (server requires all assigned)
    if (!team || catalog.size === 0 || active.length === 0 || slots) return;
    const arranged = arrangeLineup(active, catalog, team.lineup);
    setSlots(fromLineup(arranged, catalog));
    setStyle((arranged.playstyle as Playstyle) ?? 'Balanced');
  }, [team, catalog, active, slots]);

  // Non-Coach roles render the LIVE team doc instead (F7): the team doc
  // already streams into context, and a GM/Scout tab sitting on this screen
  // must follow the Coach's submitted lineup without a reload — the same
  // teammate-visibility pattern AuctionPage uses for the Scout's stored bids.
  // arrangeLineup(prev = team.lineup) preserves the stored arrangement and
  // absorbs roster drift exactly like the mount-time seed does.
  const liveSlots = useMemo(() => {
    if (!team || catalog.size === 0 || active.length === 0) return null;
    return fromLineup(arrangeLineup(active, catalog, team.lineup), catalog);
  }, [team, catalog, active]);
  const shown = isCoach ? slots : liveSlots;
  const shownStyle = isCoach
    ? style
    : ((team?.lineup?.playstyle as Playstyle) ?? 'Balanced');

  if (!game || !team || !shown || catalog.size === 0) return null;

  const counts = { G: 0, W: 0, B: 0 };
  for (const pid of [shown.g1, shown.g2, shown.w1, shown.w2, shown.b1]) {
    if (pid != null) counts[catalog.get(pid)!.position] += 1;
  }
  const legal = isComplete(shown) && counts.G === 2 && counts.W === 2 && counts.B === 1;

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || !isCoach || !slots) return;
    const next = place(slots, Number(e.active.id), e.over.id as SlotId, catalog);
    if (next) setSlots(next); // illegal drops are silently ignored (validation, not evaluation)
  };

  const submit = async () => {
    if (!slots) return;
    setBusy(true); setErr(null); setNote('');
    try {
      await call('submitLineup', { gameId, lineup: toLineup(slots, style) });
      setNote(`Lineup locked for round ${round} — you can revise until the phase closes.`);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <main className="page">
      <PhaseHeader title="Set Lineup" round={round} timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
      {/* Team-visible locked indicator (F7): lineupLockedRound is public team
          state, so every role can see the Coach's submit registered. A badge,
          not a lock — resubmission stays open until the phase closes. */}
      {team.lineupLockedRound === round && (
        <p className="ok" data-testid="lineup-locked-badge">
          Lineup locked for round {round} — the Coach can revise until the phase closes.
        </p>
      )}
      <ErrorNotice error={err} />
      {note && <p className="ok" role="status">{note}</p>}
      <DndContext onDragEnd={onDragEnd}>
        <div className="court">
          <div className="arc" />
          <div style={{ position: 'absolute', top: '8%', left: 0, right: 0, display: 'flex',
            justifyContent: 'center', gap: 24 }}>
            <Slot id="g1" pid={shown.g1} label="GUARD" />
            <Slot id="g2" pid={shown.g2} label="GUARD" />
          </div>
          <div style={{ position: 'absolute', top: '48%', left: '3%' }}>
            <Slot id="w1" pid={shown.w1} label="WING" />
          </div>
          <div style={{ position: 'absolute', top: '48%', right: '3%' }}>
            <Slot id="w2" pid={shown.w2} label="WING" />
          </div>
          <div style={{ position: 'absolute', bottom: '6%', left: 0, right: 0,
            display: 'flex', justifyContent: 'center' }}>
            <Slot id="b1" pid={shown.b1} label="BIG" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <div><div className="dim" style={{ fontSize: 12 }}>SIXTH MAN</div>
            <Slot id="sixth" pid={shown.sixth} label="SIXTH" cls="sixth" /></div>
          <div><div className="dim" style={{ fontSize: 12 }}>ACTIVE BENCH — these two play</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Slot id="bench1" pid={shown.bench1} label="BENCH 1" />
              <Slot id="bench2" pid={shown.bench2} label="BENCH 2" />
            </div></div>
          <div style={{ flex: 1 }}>
            <div className="dim" style={{ fontSize: 12 }}>INACTIVE DEPTH — no minutes tonight</div>
            <DepthZone pids={shown.depth} />
          </div>
        </div>
      </DndContext>

      <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>
        {PLAYSTYLES.map((s) => (
          <button key={s} className="card" disabled={!isCoach}
            style={{ flex: '1 0 120px', textAlign: 'left', cursor: 'pointer',
              border: shownStyle === s ? '1.5px solid var(--gold)' : '1px solid var(--border)' }}
            onClick={() => setStyle(s)}>
            <strong>{s}</strong>
            <div className="muted" style={{ fontSize: 12 }}>{PLAYSTYLE_BLURBS[s]}</div>
          </button>
        ))}
      </div>

      <p className="mono" role="status">
        Lineup: {counts.G} G · {counts.W} W · {counts.B} B — {legal ? 'Legal' : 'Incomplete'} · Playstyle: {shownStyle}
      </p>
      {isCoach
        ? <button className="btn green" style={{ width: '100%' }} disabled={!legal || busy}
            onClick={() => void submit()}>Submit lineup</button>
        : <p className="dim">The Coach submits this phase.</p>}
    </main>
  );
}

function DepthZone({ pids }: { pids: number[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'depth' });
  return (
    <div ref={setNodeRef} className="slot"
      style={{ outline: isOver ? '2px solid var(--gold)' : 'none', minHeight: 56,
        display: 'flex', gap: 8, justifyContent: 'flex-start', padding: 4, flexWrap: 'wrap' }}>
      {pids.length === 0 ? <span className="dim" style={{ fontSize: 12 }}>empty</span>
        : pids.map((pid) => <Card key={pid} pid={pid} />)}
    </div>
  );
}
```

Verbatim-string guard: the five playstyle names/blurbs render from `PLAYSTYLES`/`PLAYSTYLE_BLURBS` untouched; no synergy meters added; ★/½ untouched.

- [ ] **Step 4: Run the lineup itests**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/lineup.itest.tsx
```

Expected: **2 tests green** (the original Coach test proves the local-draft path still works — no clobbering).

- [ ] **Step 5: Unit + tsc sanity**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run && npx tsc -b && npm run audit:ui
```

Expected: 14/71 green, tsc clean, audit clean 64.

- [ ] **Step 6: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/app/src/pages/LineupPage.tsx games/salary-showdown/app/src/itest/lineup.itest.tsx && git commit -m "fix(salary-showdown): lineup — non-Coach roles follow the live team doc + locked badge (F7)"
```

---

### Task 6: GameContext — epoch resubscribe after join (F6)

**Files:**
- Modify: `games/salary-showdown/app/src/contexts/GameContext.tsx` (3 hunks)
- Test: `games/salary-showdown/app/src/itest/contexts.itest.tsx` (new second test)

Report finding 1.8: a second dev tab boots with the shared `ss.gameId` but a fresh per-tab uid → the game-doc and membership listeners die terminally on permission-denied; after `joinGame` succeeds, `setGameId(sameValue)` bails in React and nothing resubscribes — stranded on the seat picker until manual reload. Fix: `setGameId` bumps an epoch on EVERY call; the two pre-membership listener effects key on it. The HARD INVARIANT (joinGame resolves before setGameId) is untouched — LandingPage's call order does not change. The rare prod cousin (auth lost while `ss.gameId` persists) heals by the same path.

- [ ] **Step 1: Write the failing itest.** In `contexts.itest.tsx`, replace exactly:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
```
with:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

Append:

```tsx
test('second-tab strand (F6): a pre-membership boot recovers after join, no reload', async () => {
  localStorage.removeItem('ss.gameId'); // isolation from the prior test's claim
  const seeded = await seedToPhase({ to: 'LOBBY' });
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  // The dev second-tab boot: ss.gameId is ALREADY set (shared localStorage)
  // while this tab's fresh uid has no membership — the game-doc and
  // membership listeners attach at mount and die terminally on
  // permission-denied (Firestore never retries a denied listen).
  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

  // Landing renders (membership null → PhaseRouter never bounces); drive the
  // REAL claim flow: joinGame resolves, THEN setGameId(same id) — the epoch
  // bump must tear down the dead listeners and resubscribe. Pre-fix, this
  // stranded on the picker (seat claimed server-side, UI stuck) until reload.
  await user.type(await screen.findByLabelText('join code', {}, { timeout: 15000 }),
    seeded.joinCode);
  await user.type(screen.getByLabelText('display name'), 'Tab Two');
  await user.click(screen.getByRole('button', { name: 'Find game' }));
  await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument(), { timeout: 15000 });
  const alphaCard = screen.getByText('Alpha').closest('.card')!;
  await user.click(Array.from(alphaCard.querySelectorAll('button'))
    .find((b) => b.textContent === 'GM')!);

  await waitFor(() => expect(screen.getByRole('heading', { name: /Lobby/ })).toBeInTheDocument(),
    { timeout: 15000 });
}, 120000);
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/contexts.itest.tsx
```

Expected: first test green; new test FAILS at the final waitFor (stuck on the seat picker — the deterministic strand).

- [ ] **Step 3: Implement.** Three hunks in `GameContext.tsx`.

Hunk A — comment truth (F6's "at minimum") + epoch state. Replace exactly:

Old:
```tsx
  // 'ss.gameId' lives in localStorage (spec §10.4): a student's crashed or
  // closed laptop must recover its game in one click after reopening the
  // browser, and sessionStorage dies with the tab. Multi-tab dev playtesting
  // still works: sharing one gameId across tabs is CORRECT (same game), and
  // per-tab IDENTITY still comes from session-persisted anonymous auth
  // (browserSessionPersistence in lib/firebase.ts), which stays per-tab.
  const [gameId, setGameIdState] = useState<string | null>(
    () => localStorage.getItem('ss.gameId'));
```
New:
```tsx
  // 'ss.gameId' lives in localStorage (spec §10.4): a student's crashed or
  // closed laptop must recover its game in one click after reopening the
  // browser, and sessionStorage dies with the tab. Multi-tab dev playtesting:
  // sharing one gameId across tabs is CORRECT (same game), and per-tab
  // IDENTITY comes from session-persisted anonymous auth (DEV-gated
  // browserSessionPersistence in lib/firebase.ts). A tab that boots with the
  // shared gameId but no membership yet gets terminal permission-denied
  // listeners; the epoch below resubscribes them once its own join lands
  // (F6 — pre-fix such a tab stayed stranded until a manual reload).
  const [gameId, setGameIdState] = useState<string | null>(
    () => localStorage.getItem('ss.gameId'));
  // Bumped on EVERY setGameId call, including id-unchanged ones: after
  // joinGame resolves, setGameId(sameId) must still force the game-doc and
  // membership effects to tear down dead (permission-denied) listeners and
  // resubscribe. HARD INVARIANT unchanged: callers await joinGame FIRST.
  const [epoch, setEpoch] = useState(0);
```

Hunk B — setGameId. Replace exactly:

Old:
```tsx
  const setGameId = useCallback((id: string | null) => {
    if (id) localStorage.setItem('ss.gameId', id);
    else localStorage.removeItem('ss.gameId');
    setGameIdState(id);
  }, []);
```
New:
```tsx
  const setGameId = useCallback((id: string | null) => {
    if (id) localStorage.setItem('ss.gameId', id);
    else localStorage.removeItem('ss.gameId');
    setEpoch((e) => e + 1); // resubscribe even when id is unchanged (F6)
    setGameIdState(id);
  }, []);
```

Hunk C — the two pre-membership listener effects. Replace exactly:

Old:
```tsx
      () => setGame(null)); // permission error pre-membership: stay null, Landing owns the flow
  }, [gameId]);

  useEffect(() => { // own membership doc
    if (!gameId || !uid) { setMembership(null); return; }
    return onSnapshot(doc(db, 'games', gameId, 'players', uid),
      (s) => setMembership(s.exists() ? (s.data() as Membership) : null),
      () => setMembership(null));
  }, [gameId, uid]);
```
New:
```tsx
      () => setGame(null)); // permission error pre-membership: stay null, Landing owns the flow
  }, [gameId, epoch]); // eslint-disable-line react-hooks/exhaustive-deps -- epoch forces resubscribe after join (F6)

  useEffect(() => { // own membership doc
    if (!gameId || !uid) { setMembership(null); return; }
    return onSnapshot(doc(db, 'games', gameId, 'players', uid),
      (s) => setMembership(s.exists() ? (s.data() as Membership) : null),
      () => setMembership(null));
  }, [gameId, uid, epoch]); // eslint-disable-line react-hooks/exhaustive-deps -- epoch forces resubscribe after join (F6)
```

(The teams/catalog/market effects need no epoch: they key on `membership?.teamId`, which flips once the membership listener resubscribes and reads the doc.)

- [ ] **Step 4: Run the contexts itests**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/contexts.itest.tsx
```

Expected: **2 tests green.**

- [ ] **Step 5: Full integration suite (listener lifecycle touched — check for collateral)**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts
```

Expected: **18 files / 32 tests** green. A `Transaction lock timeout`-style red → emulator restart + rerun before investigating.

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx tsc -b
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/app/src/contexts/GameContext.tsx games/salary-showdown/app/src/itest/contexts.itest.tsx && git commit -m "fix(salary-showdown): GameContext epoch — resubscribe dead listeners after same-id join (F6)"
```

---

### Task 7: "We're done" acknowledgment from the server flag (P2-2)

**Files:**
- Modify: `games/salary-showdown/app/src/pages/FreeAgencyPage.tsx`
- Modify: `games/salary-showdown/app/src/pages/FrontOfficePage.tsx`
- Test: `games/salary-showdown/app/src/itest/frontoffice.itest.tsx` (update the existing "we're done" test)
- Test: `games/salary-showdown/app/src/itest/market.itest.tsx` (new remount-persistence test)

Both pages already show a click-local `doneNote` — but it dies on reload and never renders in a tab that didn't click. Derive the acknowledged state from the live team doc instead: `markDone` stamps `{doneRound, donePhase}` server-side (public team fields, the same predicate the panel's submission lights use). Button label flips to **"Done noted"** and stays ENABLED (markDone is a STATUS FLAG, NEVER a lock — hard rule; no disable, no ✓ glyph).

- [ ] **Step 1: Update the existing FO itest (red first).** In `frontoffice.itest.tsx`, in the test `"we're done: GM sees the button, click stamps {doneRound, donePhase}"`, replace exactly:

Old:
```tsx
  await waitFor(() => expect(screen.getByTestId('done-note')).toHaveTextContent(
    'Marked done — you can still make changes until the phase closes.'), { timeout: 15000 });
  // Status flag, NEVER a lock: the button must still be pressable after success.
  expect(screen.getByRole('button', { name: "We're done" })).toBeEnabled();
```
New:
```tsx
  await waitFor(() => expect(screen.getByTestId('done-note')).toHaveTextContent(
    'Marked done — you can still make changes until the phase closes.'), { timeout: 15000 });
  // The acknowledgment derives from the LIVE team doc (P2-2): the label flips
  // to 'Done noted' — and stays ENABLED (status flag, NEVER a lock).
  expect(screen.getByRole('button', { name: 'Done noted' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: "We're done" })).toBeNull();
```

- [ ] **Step 2: Write the new FA itest.** Append to `market.itest.tsx`:

```tsx
test("we're done (P2-2): acknowledgment derives from the server flag and survives a remount", async () => {
  localStorage.removeItem('ss.gameId'); // isolation from the prior test's claim
  const seeded = await seedToPhase({ to: 'R1:FREE_AGENCY' });
  await signInAnonymously(auth);
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'IT GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  const first = render(<MemoryRouter initialEntries={['/game/market']}><App /></MemoryRouter>);

  const btn = await screen.findByRole('button', { name: "We're done" }, { timeout: 20000 });
  expect(screen.queryByTestId('done-note')).toBeNull(); // nothing acknowledged yet
  await user.click(btn);

  // Label + note flip from the LIVE team doc (server stamped doneRound/donePhase).
  await screen.findByRole('button', { name: 'Done noted' }, { timeout: 15000 });
  expect(screen.getByTestId('done-note')).toHaveTextContent(
    'Marked done — you can still make changes until the phase closes.');
  expect(screen.getByRole('button', { name: 'Done noted' })).toBeEnabled(); // NEVER a lock

  // Remount (reload stand-in): the acknowledgment persists — it derives from
  // the team doc, not click-local state (the pre-fix behavior lost it here).
  first.unmount();
  render(<MemoryRouter initialEntries={['/game/market']}><App /></MemoryRouter>);
  await screen.findByRole('button', { name: 'Done noted' }, { timeout: 20000 });
  expect(screen.getByTestId('done-note')).toBeInTheDocument();
}, 120000);
```

- [ ] **Step 3: Run both — expect FAIL**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/frontoffice.itest.tsx src/itest/market.itest.tsx
```

Expected: the updated FO test and the new FA test FAIL ('Done noted' never renders); the other tests in both files stay green.

- [ ] **Step 4: Implement — FreeAgencyPage.** Three edits.

Edit A — remove the click-local state. Replace exactly:
```tsx
  const [busy, setBusy] = useState(false);
  const [doneNote, setDoneNote] = useState('');
```
with:
```tsx
  const [busy, setBusy] = useState(false);
```

Edit B — simplify markDone (drop setDoneNote). Replace exactly:

Old:
```tsx
  // markDone is a status flag, never a lock (spec §4.2): signing stays open
  // after pressing it and re-pressing is idempotent.
  const markDone = async () => {
    setBusy(true); setErr(null);
    try {
      await call('markDone', { gameId });
      setDoneNote('Marked done — you can still make changes until the phase closes.');
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
```
New:
```tsx
  // markDone is a status flag, never a lock (spec §4.2): signing stays open
  // after pressing it and re-pressing is idempotent. The acknowledged state
  // derives from the LIVE team doc (P2-2, 2026-08-15) — the server stamps
  // {doneRound, donePhase}, so it survives reloads and renders in every GM
  // tab, not just the one that clicked.
  const isDone = team != null && game != null
    && team.doneRound === game.round && team.donePhase === game.phase;
  const markDone = async () => {
    setBusy(true); setErr(null);
    try {
      await call('markDone', { gameId });
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
```

Edit C — the button block. Replace exactly:

Old:
```tsx
      {isGM && (
        <div style={{ margin: '10px 0' }}>
          <button className="btn gold" disabled={busy} onClick={() => void markDone()}>
            {"We're done"}
          </button>
          {doneNote && (
            <p className="ok" data-testid="done-note" style={{ margin: '6px 0 0' }}>{doneNote}</p>
          )}
        </div>
      )}
```
New:
```tsx
      {isGM && (
        <div style={{ margin: '10px 0' }}>
          <button className="btn gold" disabled={busy} onClick={() => void markDone()}>
            {isDone ? 'Done noted' : "We're done"}
          </button>
          {isDone && (
            <p className="ok" data-testid="done-note" style={{ margin: '6px 0 0' }}>
              Marked done — you can still make changes until the phase closes.
            </p>
          )}
        </div>
      )}
```

- [ ] **Step 5: Implement — FrontOfficePage.** Three edits.

Edit A — remove the click-local state. Replace exactly:
```tsx
  const [busy, setBusy] = useState(false);
  const [doneNote, setDoneNote] = useState('');
```
with:
```tsx
  const [busy, setBusy] = useState(false);
```

Edit B — derive isDone. Immediately after the line `if (!game || !team || catalog.size === 0) return null;` and before `const act = async (fn: () => Promise<unknown>) => {`, insert:

```tsx
  // Acknowledged state derives from the LIVE team doc (P2-2, 2026-08-15):
  // the server stamps {doneRound, donePhase}, so it survives reloads and
  // renders in every GM tab, not just the one that clicked.
  const isDone = team.doneRound === game.round && team.donePhase === game.phase;
```

Edit C — the button block. Replace exactly:

Old:
```tsx
      {isGM && (
        <div style={{ margin: '10px 0' }}>
          {/* markDone is a status flag, NEVER a lock (spec §4.2): the GM keeps
              acting after pressing it, and re-pressing is idempotent — so the
              button stays enabled after success. Non-GM sees nothing here. */}
          <button className="btn gold" disabled={busy}
            onClick={() => void act(async () => {
              await call('markDone', { gameId });
              setDoneNote('Marked done — you can still make changes until the phase closes.');
            })}>
            {"We're done"}
          </button>
          {doneNote && (
            <p className="ok" data-testid="done-note" style={{ margin: '6px 0 0' }}>{doneNote}</p>
          )}
        </div>
      )}
```
New:
```tsx
      {isGM && (
        <div style={{ margin: '10px 0' }}>
          {/* markDone is a status flag, NEVER a lock (spec §4.2): the GM keeps
              acting after pressing it, re-pressing is idempotent, and the
              button stays ENABLED once acknowledged. Non-GM sees nothing here. */}
          <button className="btn gold" disabled={busy}
            onClick={() => void act(async () => { await call('markDone', { gameId }); })}>
            {isDone ? 'Done noted' : "We're done"}
          </button>
          {isDone && (
            <p className="ok" data-testid="done-note" style={{ margin: '6px 0 0' }}>
              Marked done — you can still make changes until the phase closes.
            </p>
          )}
        </div>
      )}
```

- [ ] **Step 6: Run — expect PASS**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/frontoffice.itest.tsx src/itest/market.itest.tsx
```

Expected: all tests in both files green (FO file: its full original scenario must stay green — its premise is protected by cf594b1; do NOT restructure it).

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run && npx tsc -b && npm run audit:ui
```

Expected: 14/71 green, tsc clean, audit clean 64.

- [ ] **Step 7: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/app/src/pages/FreeAgencyPage.tsx games/salary-showdown/app/src/pages/FrontOfficePage.tsx games/salary-showdown/app/src/itest/frontoffice.itest.tsx games/salary-showdown/app/src/itest/market.itest.tsx && git commit -m "feat(salary-showdown): 'We're done' acknowledgment derives from the server flag (P2-2)"
```

---

### Task 8: Professor panel explains the connecting dead end (P2-3, F4's UX half)

**Files:**
- Modify: `games/salary-showdown/app/src/contexts/ProfessorContext.tsx`
- Modify: `games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx`
- Test: `games/salary-showdown/app/src/itest/professor-fixes.itest.tsx` (extend the existing "clear session" test)

The game-doc listener's error callback fires with permission-denied for BOTH a mistyped gameId and a browser that is not the game's professor (rules can only grant the read to `professorUid`) — and the listen is terminal. Surface that as a `gameError` flag and one line of copy under "Connecting to session…".

**Interfaces:** Produces `gameError: boolean` on `ProfessorCtx` (true after a game-doc listener error; reset on success/clear). Consumed only by ProfessorPage.

- [ ] **Step 1: Extend the itest (red first).** In `professor-fixes.itest.tsx`, test `'clear session: a bad gameId is no longer a dead end'`, replace exactly:

Old:
```tsx
  await screen.findByText('Connecting to session…', {}, { timeout: 20000 });
  await user.click(screen.getByRole('button', { name: 'Clear session' }));
```
New:
```tsx
  await screen.findByText('Connecting to session…', {}, { timeout: 20000 });
  // The dead end explains itself now (P2-3 / F4's UX half): the listener's
  // permission-denied sets gameError and this copy renders under the spinner
  // line. Same copy for a mistyped id and a not-the-professor browser — the
  // rules deny both identically.
  await screen.findByTestId('connect-error', {}, { timeout: 15000 });
  expect(screen.getByTestId('connect-error').textContent)
    .toContain("This browser can't open that game");
  await user.click(screen.getByRole('button', { name: 'Clear session' }));
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/professor-fixes.itest.tsx
```

Expected: that test FAILS at `findByTestId('connect-error')`; the other two tests stay green.

- [ ] **Step 3: Implement — ProfessorContext.** Four edits.

Edit A — interface. Replace exactly:
```tsx
  game: GameDoc | null;                    // transition-GATED (see game-doc effect)
  settling: boolean;                       // raw doc has transition != null
```
with:
```tsx
  game: GameDoc | null;                    // transition-GATED (see game-doc effect)
  settling: boolean;                       // raw doc has transition != null
  gameError: boolean;                      // game-doc listener errored (permission-denied
                                           // = mistyped id OR not this game's professor);
                                           // terminal until setGameId changes (P2-3)
```

Edit B — state. Replace exactly:
```tsx
  const [game, setGame] = useState<GameDoc | null>(null);
  const [settling, setSettling] = useState(false);
```
with:
```tsx
  const [game, setGame] = useState<GameDoc | null>(null);
  const [settling, setSettling] = useState(false);
  const [gameError, setGameError] = useState(false);
```

Edit C — the game-doc effect. Replace exactly:

Old:
```tsx
  useEffect(() => { // game doc: gated view + raw settling flag
    if (!gameId || !uid) { setGame(null); setSettling(false); setRaw(null); return; }
    return onSnapshot(doc(db, 'games', gameId),
      (s) => {
        if (!s.exists()) { setGame(null); setSettling(false); setRaw(null); return; }
```
New:
```tsx
  useEffect(() => { // game doc: gated view + raw settling flag
    if (!gameId || !uid) { setGame(null); setSettling(false); setRaw(null); setGameError(false); return; }
    setGameError(false); // new subscription, clean slate
    return onSnapshot(doc(db, 'games', gameId),
      (s) => {
        setGameError(false);
        if (!s.exists()) { setGame(null); setSettling(false); setRaw(null); return; }
```

and replace exactly:

Old:
```tsx
      (e) => console.error('[professor] games/{id} listener', e));
  }, [gameId, uid]);
```
New:
```tsx
      (e) => {
        // permission-denied lands here for BOTH a mistyped id and a browser
        // that isn't this game's professor (rules grant the read only to
        // games/{id}.professorUid) — and a denied listen is TERMINAL, so this
        // flag is what lets the panel explain the dead end instead of showing
        // "Connecting to session…" forever (P2-3; still logged loudly, §3a rule).
        setGameError(true);
        console.error('[professor] games/{id} listener', e);
      });
  }, [gameId, uid]);
```

Edit D — context value. Replace exactly:

Old:
```tsx
  const value = useMemo(() => ({
    gameId, setGameId, game, settling, raw, contextRound, teams, players,
    round, auctionWave, bidsSubmitted, reveal, call,
  }), [gameId, setGameId, game, settling, raw, contextRound, teams, players,
    round, auctionWave, bidsSubmitted, reveal, call]);
```
New:
```tsx
  const value = useMemo(() => ({
    gameId, setGameId, game, settling, gameError, raw, contextRound, teams, players,
    round, auctionWave, bidsSubmitted, reveal, call,
  }), [gameId, setGameId, game, settling, gameError, raw, contextRound, teams, players,
    round, auctionWave, bidsSubmitted, reveal, call]);
```

- [ ] **Step 4: Implement — ProfessorPage.** Two edits.

Edit A — destructure. Replace exactly:
```tsx
  const { gameId, game, settling, setGameId } = useProfessor();
```
with:
```tsx
  const { gameId, game, settling, gameError, setGameId } = useProfessor();
```

Edit B — the connecting branch. Replace exactly:

Old:
```tsx
        <section className="card" style={{ marginTop: 10 }} aria-label="Session">
          <p className="muted" style={{ margin: 0 }}>Connecting to session…</p>
          {/* Bad-gameId dead-end fix (3b T1): a mistyped or foreign gameId
              never produces a game doc (rules deny the read), so without
              this button the panel sits on "Connecting" forever. Clearing
              drops ss.profGameId + state and SessionSetup's create/resume
              view returns. */}
```
New:
```tsx
        <section className="card" style={{ marginTop: 10 }} aria-label="Session">
          <p className="muted" style={{ margin: 0 }}>Connecting to session…</p>
          {gameError && (
            <p className="muted" data-testid="connect-error" style={{ margin: '6px 0 0' }}>
              This browser can't open that game — either the game id is mistyped, or
              this isn't the browser that created it (professor identity stays in the
              creating browser). If that browser is gone, see the runbook's Lost
              laptop recovery.
            </p>
          )}
          {/* Bad-gameId dead-end fix (3b T1): a mistyped or foreign gameId
              never produces a game doc (rules deny the read), so without
              this button the panel sits on "Connecting" forever. Clearing
              drops ss.profGameId + state and SessionSetup's create/resume
              view returns. */}
```

- [ ] **Step 5: Run the professor itests (fixes + main file — the panel's happy path must not show the copy)**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/professor-fixes.itest.tsx src/itest/professor.itest.tsx
```

Expected: all green.

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx tsc -b && npm run audit:ui
```

Expected: clean / clean 64.

- [ ] **Step 6: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/app/src/contexts/ProfessorContext.tsx games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx games/salary-showdown/app/src/itest/professor-fixes.itest.tsx && git commit -m "feat(salary-showdown): professor panel explains the connecting dead end (P2-3)"
```

---

### Task 9: Exit battery + browser re-checks + ledger

**Files:** none modified (verification only; ledger is gitignored).

- [ ] **Step 1: Restart emulators fresh** (battery on a fresh instance, per handoff §8) — same commands as Task 0 Step 2.

- [ ] **Step 2: Full battery, sequenced with a cool-down between suites**

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run
```
Expected: **24 files / 168 tests** green.

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run
```
Expected: **14 files / 71 tests** green.

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts
```
Expected: **18 files / 33 tests** green. (Flake protocol applies; a red that survives an emulator restart + rerun is a STOP-and-report.)

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx tsc -b && npm run audit:ui
```
Expected: clean / clean 64 files.

- [ ] **Step 3: Browser re-checks (controller does these in the preview pane — not a subagent).** Dev server via the `salary-showdown-app` launch.json entry (port 5176), preview tools only:
  1. **LND-02 (F9c):** landing page → enter code `ZZZZZZ` → Find game → the alert reads "No game found with that code — check the projector." (not the generic fallback).
  2. **FA-06 (P2-2):** `npm run seed -- --to R1:FREE_AGENCY`, join Alpha as GM via `?code=`, press "We're done" → button flips to "Done noted" + note renders; hard-reload → still "Done noted".
  3. **F7:** advance the same game to LINEUP via `_playtest-cli.mjs` or the professor panel; GM tab on `/game/lineup`; submit a Lockdown lineup as Alpha's Coach via CLI → GM tab flips to Lockdown + badge with no reload.
  4. **FIN-01 (F8):** `npm run seed -- --to FINALE` (Alpha unclaimed → hardship-only → zero-spend), join Alpha as GM → conclusion page W/$ chart shows Alpha as "—" with no bar, ranked last.
  5. **PRF-02-adjacent (P2-3):** `/professor` → Resume with gameId `no-such-game` → "Connecting to session…" + the connect-error copy; Clear session recovers.
- [ ] **Step 4: Ledger.** Append (NEVER `git add`):

```bash
cd /Users/dylanmassaro/FenriX && printf '%s\n' "VERIFICATION FIXES (2026-08-15, branch salary-showdown-verification-fixes): plan docs/superpowers/plans/2026-08-15-salary-showdown-verification-fixes.md executed — F1/F2 seed port, F3 RUNBOOK Scout, F4 docs+emergency-path+connect-copy (mechanism deferred to own spec), F5b smoke reword, F6 GameContext epoch resubscribe, F7 lineup live view+badge, F8 W/\$ null→em-dash, F9a/b/c hype scope+comment+join-code copy, P2-2 done-ack from server flag. Battery: backend 24/168 · unit 14/71 · integration 18/33 · tsc · audit 64. Report committed 69b4b56. No push, no deploy (prod still pre-polish BVmfmjWa)." >> .superpowers/sdd/progress.md
```

- [ ] **Step 5: Hand back to the controller** for `superpowers:finishing-a-development-branch` — merge/push/deploy are Dylan's calls (prod redeploy would also pick up the entire playtest-polish wave; batch and ask).

---

## Out of scope (explicitly)

- F4 real recovery mechanism (recovery-code callable + rules + panel UI) — separate brainstorm/spec/plan after this batch.
- F5 product escape ("join a different game" affordance) — Dylan chose accept + checklist reword only.
- seedprof stable email identity for the seed script — excluded from the F1/F2 port; discuss separately.
- Any prod deploy, push, or hard-rule change.
- P1 FinaleWall chart scale and the rest of the §4 punch list (Dylan's human pass).

## Self-review notes (already applied)

- FO itest "we're done" test is UPDATED in place (Task 7 Step 1) — its post-click "We're done"-still-enabled assertion would contradict the new label; the updated assertions preserve the never-a-lock check via the enabled 'Done noted' button.
- reveal.test.js's passive teams are zero-spend by construction (hardship-only) — the existing tests are the F8 fixture; backend count stays 24/168.
- `winsPerDollarGeometry`'s null-aware comparator avoids `null`-arithmetic NaN poisoning; the all-zero-ratio guard test (existing) still passes because `ratio: 0` is a number, not null.
- LineupPage keeps the Coach's `slots`/`style` local state untouched; only the render source switches by role. The original lineup itest (Coach path) is the no-clobber regression guard.
- Task 6's eslint-disable-line matches the repo's existing pattern (PhaseRouter.tsx) for intentionally-extra deps.
- All new user-facing copy is emoji-free and judgment-free; no numeric hype introduced anywhere in-game.
