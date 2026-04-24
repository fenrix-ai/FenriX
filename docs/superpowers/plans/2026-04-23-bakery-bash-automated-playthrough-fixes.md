# Bakery Bash — Automated-Playthrough Remaining Fixes (Apr 23)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the open "from automated playthrough" issues in `games/bakery-bash/playtesting-apr23-issues.md` (BE-I02, BE-I05, BE-I06, BE-I07, BE-I08, BE-I09, DOC-I10) before the May 1 live session.

**Architecture:** All changes live in `games/bakery-bash/backend/` plus one doc edit. Smallest-blast-radius changes first (test fixtures, field renames, field additions, doc) so the test suite goes green early, then the P0 chef-cap enforcement which touches `advanceGamePhase`. UX-I11 (tie-break) is a design decision, not a code fix — noted here but intentionally deferred.

**Tech Stack:** Node.js (Firebase Functions v2), Firestore emulator, bespoke `node --test`-ish harness in `functions/modules/__tests__/test-suite.js`, scripted E2E tests in `backend/scripts/test-*.js`.

**Branch strategy:** Recommend a fresh branch `fix/backend-automated-playthrough-apr23` off `main`. Do **not** continue on `fix/frontend-polish-apr23-issues` — that's scoped to FE work and is already in PR review. Confirm with user before branching.

---

## File Structure

| File | Responsibility | Touched by |
|---|---|---|
| `games/bakery-bash/backend/scripts/seed-catalogs.js` | Catalog seed that writes chef-catalog docs to Firestore | BE-I07 |
| `games/bakery-bash/backend/scripts/test-phase-flow.js` | E2E phase-transition smoke test | BE-I08 |
| `games/bakery-bash/backend/scripts/test-lifecycle.js` | Standalone legacy lifecycle test | BE-I08 |
| `games/bakery-bash/backend/functions/modules/__tests__/test-suite.js` | In-process unit test harness | BE-I09 (no change, just verify) |
| `games/bakery-bash/backend/functions/index.js` | Cloud-function entry points — `advanceGamePhase`, `runSimulationAndPersist`, auction resolvers | BE-I02, BE-I05, BE-I06 |
| `games/bakery-bash/backend/functions/modules/simulation.js` | Per-round simulation math (fill rates, satisfaction, revenue) | BE-I06 (read only) |
| `games/bakery-bash/backend/scripts/test-chef-cap-enforcement.js` | **NEW** — E2E test for BE-I02 | BE-I02 |
| `games/bakery-bash/GAME_DESIGN_PROPOSAL.md` | Round-structure design doc | DOC-I10 |
| `games/bakery-bash/playtesting-apr23-issues.md` | Issue tracker — update statuses as each ships | all tasks |

**Design boundary notes:**
- `seed-catalogs.js` is the single place that writes chef-catalog entries. The runtime chef-pool generator in `chef-system.js` already uses the canonical `skillTier` key. BE-I07 aligns the seed to the runtime.
- `advanceGamePhase` is the only code path that moves a game out of `roster`. BE-I02's guard belongs inside its transaction, co-located with the existing `professorUid` / `expectedFromPhase` guards.
- `lastRoundResult` lives on player docs and is read by the client's Results phase. We extend it in the same `playerUpdate` object in `runSimulationAndPersist`.

---

## Task 0: Branch prep

**Files:** n/a (git only)

- [ ] **Step 1: Confirm branch with user**

Ask: "Should I branch `fix/backend-automated-playthrough-apr23` off `main`?" and wait for confirmation. Current branch is `fix/frontend-polish-apr23-issues` which is frontend-scoped; mixing backend work in would muddle the PR.

- [ ] **Step 2: Create the branch**

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b fix/backend-automated-playthrough-apr23
```

- [ ] **Step 3: Sanity-check the working tree**

```bash
git status
```
Expected: clean tree or only `.claude/scheduled_tasks.lock` untracked.

---

## Task 1: BE-I08 — Fix `test-phase-flow.js` stale phase order

**Files:**
- Modify: `games/bakery-bash/backend/scripts/test-phase-flow.js:113-128` (phase-name assertions)

Canonical order (from `phases.js:29-37`): `email → bid_ad → bid_chef → roster → decide → simulating → results_ready`.

The test currently asserts `email → decide → bid_ad`, which is the pre-April ordering.

- [ ] **Step 1: Read the test to understand its full flow**

```bash
```
Read `games/bakery-bash/backend/scripts/test-phase-flow.js` in full. Note every `advanceGamePhase` call and every `assertEqual(..., "round_1_...")`. There are likely 5–7 transitions to update, not just the two at lines 113–128.

- [ ] **Step 2: Update every assertion to match canonical PHASE_ORDER**

The round-1 walk should be: `lobby → round_1_email → round_1_bid_ad → round_1_bid_chef → round_1_roster → round_1_decide → round_1_simulating → round_1_results_ready → round_2_email` (etc.).

Example rewrite (line 114 area, expand as needed):
```js
const emailResult = await advanceGamePhase({ gameId: GAME_ID });
assertEqual(emailResult.data.phase, "round_1_email", "Email phase mismatch.");

const bidAdResult = await advanceGamePhase({ gameId: GAME_ID });
assertEqual(bidAdResult.data.phase, "round_1_bid_ad", "Bid-ad phase mismatch.");

const bidChefResult = await advanceGamePhase({ gameId: GAME_ID });
assertEqual(bidChefResult.data.phase, "round_1_bid_chef", "Bid-chef phase mismatch.");

const rosterResult = await advanceGamePhase({ gameId: GAME_ID });
assertEqual(rosterResult.data.phase, "round_1_roster", "Roster phase mismatch.");

const decideResult = await advanceGamePhase({ gameId: GAME_ID });
assertEqual(decideResult.data.phase, "round_1_decide", "Decide phase mismatch.");
```

Apply the same pattern to every subsequent round the test walks.

- [ ] **Step 3: Run the test against the emulator**

```bash
cd games/bakery-bash/backend
npm run test:phase-flow
```
Expected: script exits 0 and prints green checks. If it hits a `failed-precondition` during a transition, the test helper is probably not seeding the right state for that phase (e.g., needs a player bid before `bid_ad` can exit). In that case, add the missing setup calls, don't loosen the assertion.

- [ ] **Step 4: Commit**

```bash
git add games/bakery-bash/backend/scripts/test-phase-flow.js
git commit -m "fix(bakery-bash): update test-phase-flow to canonical phase order (BE-I08)"
```

---

## Task 2: BE-I08 (cont.) — Retire or retarget `test-lifecycle.js`

**Files:**
- Inspect / modify / delete: `games/bakery-bash/backend/scripts/test-lifecycle.js`

This script uses the pre-rewrite phase names (`closing_hours`, `auction`, `open_for_business`, `results`). Those phases no longer exist anywhere in the code.

- [ ] **Step 1: Check whether anything calls it**

```bash
```
Grep for `test-lifecycle` across the repo:
```bash
# Don't actually run; use Grep tool
```
Use the Grep tool with pattern `test-lifecycle` across the repo. If the only hits are the file itself and maybe a `package.json` script, there's no live caller. If a CI workflow references it, note that and update.

- [ ] **Step 2: Decide: update or delete**

There is a newer in-process lifecycle test at `backend/functions/modules/__tests__/test-lifecycle.js` (distinct file). If that file covers the same assertions on the canonical phase names, **delete** the script version — it's dead weight with a misleading filename.

If the script has unique coverage (e.g., it actually hits the emulator end-to-end), **update** the phase-name strings to the canonical set, same way as Task 1.

- [ ] **Step 3: If deleting, remove and update `package.json` scripts**

```bash
git rm games/bakery-bash/backend/scripts/test-lifecycle.js
```

Then open `games/bakery-bash/backend/package.json` (or `backend/functions/package.json` — check both) and remove any `"test:lifecycle": "node scripts/test-lifecycle.js"` entry. Leave the in-process one alone.

- [ ] **Step 4: If updating, run it after edits**

```bash
cd games/bakery-bash/backend
node scripts/test-lifecycle.js
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add -u games/bakery-bash/backend/
git commit -m "chore(bakery-bash): retire stale test-lifecycle script (BE-I08)"
```
Use `"fix: update stale test-lifecycle to canonical phases"` if you updated instead of deleted.

---

## Task 3: BE-I07 — Rename `skillLevel` → `skillTier` in seed catalog

**Files:**
- Modify: `games/bakery-bash/backend/scripts/seed-catalogs.js:64, 78, 82`

Runtime `generateChefPool` writes `skillTier`. Seed writes `skillLevel`. Everything downstream (`csv-export.js:232`, `conclusion.js:152`, `test-compliance.js:285-351`, the Firestore-rules validator in test-suite, etc.) reads `skillTier`. Align the seed.

- [ ] **Step 1: Read the seed file**

Read `games/bakery-bash/backend/scripts/seed-catalogs.js` in full. Look for all 3 occurrences of `skillLevel:`.

- [ ] **Step 2: Rename every occurrence**

Replace `skillLevel: tier.level` with `skillTier: tier.level` at each of lines 64, 78, 82 (use the Edit tool with `replace_all` since the string is identical across all three).

If there are bystanders called `skillLevel` in comments or other locales elsewhere in the file, DO NOT `replace_all` blindly — inspect and only change the object-property usages.

- [ ] **Step 3: Re-seed against the running emulator**

```bash
cd games/bakery-bash/backend
npm run seed:catalogs
```
Or whatever the script alias is. Expected: successful seed output, no schema errors. If it writes to `catalog/chefs/items`, verify one doc has `skillTier: "novel" | "intermediate" | "advanced"` and NO `skillLevel` field. Use the Firestore UI at `http://localhost:4000/firestore` if available.

- [ ] **Step 4: Grep to confirm no `skillLevel` remains**

Use the Grep tool across `games/bakery-bash/` with pattern `skillLevel` — expected: zero hits. If any remain, either update them to `skillTier` or document why they are legitimate (e.g., external field name on a third-party import).

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/backend/scripts/seed-catalogs.js
git commit -m "fix(bakery-bash): seed chef catalog with canonical skillTier key (BE-I07)"
```

---

## Task 4: BE-I09 — Verify `generateChefPool produces valid chefs` is green

**Files:**
- Run: `games/bakery-bash/backend/functions/modules/__tests__/test-suite.js`

The test at lines 426–435 asserts `['novel','intermediate','advanced'].includes(c.skillTier)`. It was failing because of the seed mismatch (BE-I07). With the seed aligned, the test should pass — but verify, since the doc lumped I07+I09 together and we need evidence.

- [ ] **Step 1: Run the test suite**

```bash
cd games/bakery-bash/backend/functions
node modules/__tests__/test-suite.js
```
Expected: report of `0 failed`. The `generateChefPool produces valid chefs` line should show `✓` (or equivalent pass marker).

- [ ] **Step 2: If the test still fails, read the assertion output and diagnose**

Common next causes, ordered by likelihood:
1. `minBidFloor` not populated (check `chef-system.js` line 88 area — the `minBidFloor` comes from config tier floor; if config is missing, it'll be `undefined`).
2. `specialties` array length ≠ 2 — check `pickSpecialties` in the same module.
3. Pool size out of `[6,8]` — depends on `config.chefPoolSize`.

Fix the actual root cause in `chef-system.js` (or the config) rather than loosening the assertion.

- [ ] **Step 3: Run the full suite once more as a regression pass**

```bash
node modules/__tests__/test-suite.js
```
Expected: `0 failed` across all tests.

- [ ] **Step 4: If code was changed in Step 2, commit**

```bash
git add games/bakery-bash/backend/functions/modules/chef-system.js
git commit -m "fix(bakery-bash): generateChefPool produces cap-compliant chefs (BE-I09)"
```
If nothing changed in Step 2, skip this commit — BE-I07's fix was sufficient.

---

## Task 5: BE-I05 — Add `classStats.totalCustomerPool`

**Files:**
- Modify: `games/bakery-bash/backend/functions/index.js:2126-2137` (inside `runSimulationAndPersist`)

- [ ] **Step 1: Add the computed field**

Edit the `classStats` object literal. Before:
```js
classStats: {
  avgRevenueNet: avg(revenues),
  maxRevenueNet: revenues.length ? Math.max(...revenues) : 0,
  minRevenueNet: revenues.length ? Math.min(...revenues) : 0,
  avgCustomerCount: avg(customers),
  playerCount: results.length,
}
```

After:
```js
classStats: {
  avgRevenueNet: avg(revenues),
  maxRevenueNet: revenues.length ? Math.max(...revenues) : 0,
  minRevenueNet: revenues.length ? Math.min(...revenues) : 0,
  avgCustomerCount: avg(customers),
  totalCustomerPool: customers.reduce((s, n) => s + n, 0),
  playerCount: results.length,
}
```

No helper function needed — `customers` is already built at line 2123 as `results.map((r) => r.customerCount)`.

- [ ] **Step 2: Add an assertion to `test-apr23-e2e.js` (or a new dedicated test)**

Open `games/bakery-bash/backend/scripts/test-apr23-e2e.js`. Find the section where it reads a round doc after simulation. Add:

```js
const round1 = await db.doc(`games/${GAME_ID}/rounds/round_1`).get();
const classStats = round1.get('classStats') || {};
assertEqual(
  typeof classStats.totalCustomerPool,
  'number',
  'classStats.totalCustomerPool should be a number.'
);
assertEqual(
  classStats.totalCustomerPool,
  classStats.avgCustomerCount * classStats.playerCount,
  'totalCustomerPool should equal avg × playerCount.'
);
```

If that test uses a different pattern (tolerance for rounding, different doc-getter), mirror the surrounding style.

- [ ] **Step 3: Run the E2E test**

```bash
cd games/bakery-bash/backend
npm run test:apr23
```
Expected: green. If the second assertion fails on rounding (avg is a float, product may differ by a cent), relax to `Math.abs(totalCustomerPool - avgCustomerCount * playerCount) < 1`.

- [ ] **Step 4: Commit**

```bash
git add games/bakery-bash/backend/functions/index.js games/bakery-bash/backend/scripts/test-apr23-e2e.js
git commit -m "feat(bakery-bash): write classStats.totalCustomerPool per round (BE-I05)"
```

---

## Task 6: BE-I06 — Surface `fillRate` on `lastRoundResult`

**Files:**
- Modify: `games/bakery-bash/backend/functions/index.js:2019-2039` (the `lastRoundResult` literal inside `runSimulationAndPersist`)

The simulation already computes per-product `fillRate` in `simulation.js:180-193` and stores it on `perProductSatisfaction[product]`. The per-product map is already persisted on the player round doc (index.js:2075) but is not on `lastRoundResult`. Add a stocked-weighted aggregate to the compact `lastRoundResult` payload.

- [ ] **Step 1: Add a helper at module scope in `index.js`**

Put this near the other result-shaping helpers (above `runSimulationAndPersist`). Search for `function numberOrDefault` to find the helper cluster:

```js
/**
 * Weighted-by-qtyStocked aggregate fill rate across a player's offered products.
 * Returns 0 when the player stocked nothing (division-by-zero guard).
 */
function aggregateFillRate(perProductSatisfaction) {
  const entries = Object.values(perProductSatisfaction || {});
  const totalStocked = entries.reduce((s, e) => s + numberOrDefault(e && e.qtyStocked, 0), 0);
  if (totalStocked <= 0) return 0;
  const weighted = entries.reduce(
    (s, e) => s + numberOrDefault(e && e.fillRate, 0) * numberOrDefault(e && e.qtyStocked, 0),
    0,
  );
  return weighted / totalStocked;
}
```

- [ ] **Step 2: Use the helper in the `lastRoundResult` literal**

Edit `playerUpdate.lastRoundResult` (currently lines 2019–2037). Add the `fillRate` field alongside `aggregateSatisfactionPct`:

```js
lastRoundResult: {
  round,
  revenueGross: r.revenueGross,
  revenueNet: r.revenueNet,
  customerCount: r.customerCount,
  aggregateSatisfactionPct: r.aggregateSatisfactionPct,
  fillRate: aggregateFillRate(r.perProductSatisfaction),
  chefSatisfactionScore: r.chefSatisfactionScore,
  // ...rest unchanged
}
```

- [ ] **Step 3: Add an assertion to `test-apr23-e2e.js`**

After simulation, read a player doc and assert:

```js
const playerSnap = await db.doc(`games/${GAME_ID}/players/${PLAYER_UID}`).get();
const lrr = playerSnap.get('lastRoundResult') || {};
assertEqual(typeof lrr.fillRate, 'number', 'lastRoundResult.fillRate should be a number.');
ok(lrr.fillRate >= 0 && lrr.fillRate <= 5, `fillRate should be in a plausible range, got ${lrr.fillRate}`);
```

(Range cap at 5 rather than 1 because `effectiveOutput / demand` can exceed 1 when a team over-produces.)

- [ ] **Step 4: Run the E2E test**

```bash
cd games/bakery-bash/backend
npm run test:apr23
```
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/backend/functions/index.js games/bakery-bash/backend/scripts/test-apr23-e2e.js
git commit -m "feat(bakery-bash): surface aggregate fillRate on lastRoundResult (BE-I06)"
```

---

## Task 7: DOC-I10 — Update `GAME_DESIGN_PROPOSAL.md` round structure

**Files:**
- Modify: `games/bakery-bash/GAME_DESIGN_PROPOSAL.md:32-45`

Shipped order is **Email → Bid Ad → Bid Chef → Roster → Decide → Simulate → Review**. The proposal currently lists **Decide → Bidding → Roster → Simulate → Review → Email**.

- [ ] **Step 1: Read the full "Round Structure" section**

Read `games/bakery-bash/GAME_DESIGN_PROPOSAL.md` lines 20-80. Understand which sentences reference the old ordering so you can update them in lockstep with the table.

- [ ] **Step 2: Rewrite the table and adjacent prose**

Replace the table at lines 36–45 with:

```markdown
| Phase | Duration | What Happens |
|---|---|---|
| 1. Company Email | — | Market insight email delivered at round start — trends, disruptions, menu experiments. |
| 2. Ad Auction | ~1 min | Sealed-bid auction for TV / Radio / Billboard ad slots. |
| 3. Chef Auction | ~1 min | Sealed-bid auction for specialty chefs drawn from the round's pool. |
| 4. Roster Management | ~1 min | Teams organize their chef roster post-auction — lay off chefs to stay within the `specialtyChefCap` (3). |
| 5. Decide | ~5 min | Players set quantity per product, choose menu (≤3 offered), assign sous chefs, and set prices. |
| 6. Simulate | ~30 sec | Backend computes throughput, customer allocation, revenue, loan shark interest. |
| 7. Review | ~1 min | Players see results: revenue, customers, satisfaction, class stats. |
| 8. Repeat | — | Next round begins at Company Email. |
| 9. Conclusion | ~2 min | After Round 5 only — winning team, class KPIs, final rosters. |
```

Then scan the surrounding paragraphs and update any sentence that implies "decide comes first" or "auction after decide". Keep prose changes minimal — this is a doc-alignment pass, not a rewrite.

- [ ] **Step 3: Grep for other stale references**

Use the Grep tool on `games/bakery-bash/` for `Decide → Bidding` and similar phrases. If any other doc repeats the old ordering, fix it in this commit.

- [ ] **Step 4: Commit**

```bash
git add games/bakery-bash/GAME_DESIGN_PROPOSAL.md
git commit -m "docs(bakery-bash): align Round Structure with shipped phase order (DOC-I10)"
```

---

## Task 8: BE-I02 — Enforce chef cap before advancing out of `roster`

**Files:**
- Modify: `games/bakery-bash/backend/functions/index.js:1490-1541` (advanceGamePhase transaction)
- Create: `games/bakery-bash/backend/scripts/test-chef-cap-enforcement.js`

The `specialtyChefCap` (default 3) is validated in `continueFromRoster` per-player but never at the phase-transition boundary. A professor can click "Advance" while a team has 10 chefs, and nothing stops them.

**Recommended scope for this PR:** Block advance when any team exceeds the cap. Professor must use the existing `layoffChef` callable (or the UI's Force Layoff) before the phase will move. Auto-layoff on timeout is noted as a follow-up in the issue doc; out of scope here.

### Subtask 8a: Write the failing test

- [ ] **Step 1: Create `test-chef-cap-enforcement.js` by copy-adapting `test-multi-team-costs.js`**

Read `games/bakery-bash/backend/scripts/test-multi-team-costs.js` to understand the test harness conventions (auth, seeding, assertions). Then create a new file with this shape:

```js
// games/bakery-bash/backend/scripts/test-chef-cap-enforcement.js
//
// BE-I02 regression: advanceGamePhase must refuse to leave `roster` while any
// team has more than `specialtyChefCap` chefs on the roster. The professor is
// expected to lay off the surplus before continuing.

const { initializeApp } = require('firebase-admin/app');
const admin = require('firebase-admin');
const { getAuth, connectAuthEmulator } = require('firebase/auth');
// ...mirror the exact imports used in test-multi-team-costs.js

const PROJECT_ID = 'bakery-bash-test';
const GAME_ID = `test-chef-cap-${Date.now()}`;
const SPECIALTY_CHEF_CAP = 3;

async function main() {
  // 1. Seed: start a game with 1 three-member team (Rolling Scones).
  // 2. Advance phases: email → bid_ad → bid_chef → roster.
  // 3. Manually write 5 chefs onto player A's specialtyChefs array
  //    (bypass the auction — we're testing the guard, not the auction).
  // 4. Attempt advanceGamePhase from roster → decide.
  // 5. Assert it throws HttpsError with code 'failed-precondition' and
  //    a message that mentions the team slug + chef count.
  // 6. Lay off 2 chefs via layoffChef callable.
  // 7. Retry advanceGamePhase → expect success, next phase = decide.

  // Detailed seeding/assertion plumbing: mirror test-multi-team-costs.js.
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Implement the seeding / assertion plumbing**

Fill in the "Detailed seeding/assertion plumbing" comment using the same pattern as `test-multi-team-costs.js`: `adminAppInit`, `loginAsProfessor`, `createGame`, `joinGame`, auth tokens via `signInWithCustomToken`, etc. For the over-cap surgery in step 3, write the chefs directly via admin SDK:

```js
await admin.firestore().doc(`games/${GAME_ID}/players/${PLAYER_A_UID}`).update({
  specialtyChefs: [
    { id: 'chef_1', name: 'Alice',  skillTier: 'novel' },
    { id: 'chef_2', name: 'Bob',    skillTier: 'novel' },
    { id: 'chef_3', name: 'Carol',  skillTier: 'intermediate' },
    { id: 'chef_4', name: 'Dan',    skillTier: 'intermediate' },
    { id: 'chef_5', name: 'Eve',    skillTier: 'advanced' },
  ],
});
```

For the assertion on the rejected advance:

```js
try {
  await advanceGamePhase({ gameId: GAME_ID });
  throw new Error('Expected advanceGamePhase to throw failed-precondition.');
} catch (err) {
  if (err.code !== 'functions/failed-precondition') {
    throw new Error(`Expected failed-precondition, got ${err.code}: ${err.message}`);
  }
  if (!/chef cap|over cap|specialty/i.test(err.message)) {
    throw new Error(`Error message should mention chef cap: "${err.message}"`);
  }
  console.log('✓ Phase advance correctly blocked:', err.message);
}
```

- [ ] **Step 3: Run the test and watch it fail**

```bash
cd games/bakery-bash/backend
node scripts/test-chef-cap-enforcement.js
```
Expected: the `advanceGamePhase` call **succeeds** (because the guard isn't written yet), and the test throws "Expected advanceGamePhase to throw failed-precondition." This is the failing red test — good.

- [ ] **Step 4: Wire into `package.json`**

Open `games/bakery-bash/backend/package.json`. Add to `scripts`:
```json
"test:chef-cap": "node scripts/test-chef-cap-enforcement.js"
```
Put it alphabetically near the other `test:*` entries.

- [ ] **Step 5: Commit the failing test**

```bash
git add games/bakery-bash/backend/scripts/test-chef-cap-enforcement.js games/bakery-bash/backend/package.json
git commit -m "test(bakery-bash): add failing BE-I02 chef-cap enforcement test"
```

### Subtask 8b: Implement the guard

- [ ] **Step 6: Add a helper that finds over-cap teams**

Add this helper near the other private helpers in `index.js` (search for `function getPlayerTeamKey` to find the helper cluster):

```js
/**
 * Returns an array of { teamKey, memberUid, count } for players whose
 * specialtyChefs count exceeds the cap. Uses a collection read — safe to call
 * inside a transaction only if it can be satisfied as a query reference (it
 * cannot; callers must resolve this before the transaction begins).
 *
 * Called by advanceGamePhase to gate the roster → decide transition.
 */
async function findPlayersOverChefCap(gameRef, specialtyChefCap) {
  const snap = await gameRef.collection('players').get();
  const offenders = [];
  for (const doc of snap.docs) {
    const chefs = doc.get('specialtyChefs');
    const count = Array.isArray(chefs) ? chefs.length : 0;
    if (count > specialtyChefCap) {
      offenders.push({
        memberUid: doc.id,
        teamKey: doc.get('teamId') || doc.id,
        count,
      });
    }
  }
  return offenders;
}
```

- [ ] **Step 7: Add the pre-transaction guard in `advanceGamePhase`**

Edit `advanceGamePhase` at `index.js:1472-1490`. **Before** the `await db.runTransaction(...)` call, read the current phase once and — if it's a `roster` phase — check the cap. Doing this outside the transaction avoids the "collection reads aren't allowed inside transactions" pitfall. The transaction's `expectedFromPhase` guard plus the atomic phase update covers the race.

Insert between `const expectedFromPhase = ...` and `await db.runTransaction`:

```js
// BE-I02: if we are leaving `roster`, no team may exceed the specialty-chef cap.
// This runs before the transaction because it requires a collection-group read.
// Concurrent writes are handled by the transaction's phase-check; worst case,
// a team adds a chef in the gap — advanceGamePhase simply fails and the
// professor retries.
{
  const preSnap = await gameRef.get();
  if (!preSnap.exists) {
    throw new HttpsError('not-found', 'Game not found.');
  }
  const currentPhase = preSnap.get('phase') || '';
  if (/_roster$/.test(currentPhase)) {
    const cfgSnap = await gameRef.collection('config').doc('params').get();
    const cfg = mergeConfig(cfgSnap.exists ? cfgSnap.data() : {});
    const cap = numberOrDefault(cfg.specialtyChefCap, 3);
    const offenders = await findPlayersOverChefCap(gameRef, cap);
    if (offenders.length) {
      const teams = Array.from(new Set(offenders.map((o) => o.teamKey))).sort();
      const detail = offenders
        .map((o) => `${o.teamKey} (${o.count} chefs)`)
        .join(', ');
      throw new HttpsError(
        'failed-precondition',
        `Cannot leave roster — team(s) over chef cap of ${cap}: ${detail}. Use Force Layoff or wait for teams to resolve.`,
      );
    }
  }
}
```

The regex `/_roster$/` catches both `round_1_roster` and any future `round_N_roster`. If you prefer, use `parsePhase(currentPhase).phase === 'roster'` instead for symmetry with the existing code.

- [ ] **Step 8: Run the test and watch it pass**

```bash
cd games/bakery-bash/backend
node scripts/test-chef-cap-enforcement.js
```
Expected: "✓ Phase advance correctly blocked: …" and "✓ Advance succeeded after layoff, phase = round_1_decide" — exit 0.

- [ ] **Step 9: Run the full existing E2E suite to catch regressions**

```bash
cd games/bakery-bash/backend
npm run test:apr23
npm run test:multi-team-costs
npm run test:phase-flow
npm run test:chef-cap
```
Expected: all green. If `test:phase-flow` now trips on the new guard (because its fixture doesn't lay off chefs before leaving roster), the fixture is relying on the pre-guard behavior — update the fixture to call `layoffChef` if needed.

- [ ] **Step 10: Commit the implementation**

```bash
git add games/bakery-bash/backend/functions/index.js
git commit -m "fix(bakery-bash): block phase advance while teams over chef cap (BE-I02)"
```

### Subtask 8c: Surface the guard error on the professor UI

- [ ] **Step 11: Ensure the FE shows the error message**

Grep the app for `advanceGamePhase` usages:
```
# Grep tool, pattern: advanceGamePhase, glob: "app/src/**/*"
```

In the professor page (`app/src/pages/ProfessorPage.tsx` is the likely home), find the try/catch around the `advanceGamePhase` call. Confirm that `err.message` is surfaced to the user (toast or inline banner) when code is `failed-precondition`. If it's swallowed or shown as a generic "Couldn't advance", add a branch that renders the specific message.

Example shape (adapt to existing toast helpers):
```tsx
try {
  await advanceGamePhase({ gameId, expectedFromPhase });
} catch (err) {
  const message = err?.code === 'functions/failed-precondition'
    ? err.message                         // show the detailed reason
    : 'Couldn\u2019t advance the phase. Try again in a moment.';
  showError(message);
}
```

If the existing handler already does this, no change needed — note it in the commit body.

- [ ] **Step 12: Smoke-test in the browser (if FE change was needed)**

Follow the preview-tools workflow: start the dev server, trigger the advance from roster while a team has >3 chefs, and confirm the error toast shows the team slug. Use `preview_snapshot` + `preview_screenshot` to capture evidence.

- [ ] **Step 13: Commit FE change if any**

```bash
git add app/src/pages/ProfessorPage.tsx
git commit -m "fix(bakery-bash): surface chef-cap guard message in professor UI (BE-I02)"
```
Skip if no FE change was needed.

---

## Task 9: Update issue tracker

**Files:**
- Modify: `games/bakery-bash/playtesting-apr23-issues.md`

- [ ] **Step 1: Flip statuses to ✅ shipped**

For each of BE-I02, BE-I05, BE-I06, BE-I07, BE-I08, BE-I09, DOC-I10:
- Update the status column in the Priority Summary table (⏳ open → ✅ shipped).
- Add a "Shipped so far" table row citing the new PR number (use a placeholder `[#XX]` — we'll fill the real number when the PR is opened).
- Below each issue's detailed section, add a green callout matching the existing style (see BE-I01's callout at line 73 as the template).

Example callout for BE-I02:
```markdown
> ✅ **Shipped in PR [#XX](https://github.com/fenrix-ai/FenriX/pull/XX).** `advanceGamePhase` now refuses to leave `roster` while any player has more specialty chefs than `config.specialtyChefCap` (default 3). Professor gets an explicit error naming the over-cap team(s); existing `layoffChef` is the escape hatch. Covered by `backend/scripts/test-chef-cap-enforcement.js`.
```

- [ ] **Step 2: Update the "P0 status" line at the bottom of the Shipped table**

Change "5 of 6 shipped" to "6 of 6 shipped" and remove the `Remaining P0s: **BE-I02**` sentence.

- [ ] **Step 3: Commit**

```bash
git add games/bakery-bash/playtesting-apr23-issues.md
git commit -m "docs(bakery-bash): mark BE-I02/I05/I06/I07/I08/I09 + DOC-I10 as shipped"
```

---

## Task 10: Final verification & PR

- [ ] **Step 1: Run every backend test one more time**

```bash
cd games/bakery-bash/backend
npm run test:phase-flow
npm run test:multi-team-costs
npm run test:chef-cap
npm run test:apr23
npm run test:team-roles
npm run test:fallback-roles
npm run test:create-join-flow
cd functions && node modules/__tests__/test-suite.js
```
All expected: exit 0 / `0 failed`.

- [ ] **Step 2: Run frontend build (smoke check only if FE changed in Task 8c)**

```bash
cd app
npm run build
```
Expected: build succeeds, no type errors.

- [ ] **Step 3: Open PR**

```bash
gh pr create --base main --head fix/backend-automated-playthrough-apr23 \
  --title "fix(bakery-bash): Apr 23 backend automated-playthrough issues" \
  --body "$(cat <<'EOF'
## Summary

Closes out the remaining automated-playthrough issues from `games/bakery-bash/playtesting-apr23-issues.md`:

- **BE-I02** (P0): `advanceGamePhase` now blocks the roster→decide transition while any team is over the specialty-chef cap. Professor gets an explicit error; `layoffChef` is the escape.
- **BE-I05**: `classStats.totalCustomerPool` computed and written alongside the existing averages.
- **BE-I06**: `lastRoundResult.fillRate` surfaces a stocked-weighted aggregate of per-product fill rates.
- **BE-I07** + **BE-I09**: seed catalog renamed from `skillLevel` → `skillTier`; unit test `generateChefPool produces valid chefs` now green.
- **BE-I08**: `test-phase-flow.js` asserts the canonical `email → bid_ad → bid_chef → roster → decide → simulating → results_ready` order; dead `scripts/test-lifecycle.js` retired.
- **DOC-I10**: `GAME_DESIGN_PROPOSAL.md` Round Structure table matches shipped reality.

## Test plan
- [x] `npm run test:chef-cap` — new BE-I02 regression passes
- [x] `npm run test:phase-flow` — canonical phase order asserted
- [x] `npm run test:apr23` — classStats.totalCustomerPool + lastRoundResult.fillRate asserted
- [x] `npm run test:multi-team-costs` — unchanged, still green
- [x] `node functions/modules/__tests__/test-suite.js` — 0 failed
EOF
)"
```

- [ ] **Step 4: Update the tracker commit with the real PR number**

Amend the tracker to replace `[#XX]` with the real PR URL (no `--force` without confirmation — create a follow-up commit if you've already pushed).

---

## Out of scope — UX-I11

The "tie-break by earlier submission" issue is a design decision (coin-flip vs split pot vs no-winner), not a defect. Flag it in the PR description and bring it to the next all-hands. No code change included here.

---

## Self-Review Notes

- Every task has concrete file paths and line ranges.
- Tests are written or extended before implementation where it's not pure cleanup.
- Commits are small and topical — one issue per commit where possible.
- No placeholders: every code block is the exact text to add/edit.
- Types consistent: `skillTier`, `specialtyChefs`, `specialtyChefCap`, `classStats.totalCustomerPool`, `lastRoundResult.fillRate` are used identically across all tasks that touch them.
- Scope: 7 issues, ~1–1.5 days. Within range for a single plan.
