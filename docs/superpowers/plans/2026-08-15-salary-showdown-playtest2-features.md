# Salary Showdown — Playtest-2 Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Dylan's 2026-08-15 playtest notes: (1) students name their own franchises (count-first create + lobby rename), (2) a live "Your roster" panel on Draft Night/Free Agency, (3) absent-seat role fallback + professor seat release, (4) the Simulate projector shows standings re-ranking live as scores flood in. (Item 5's laptop half — players seeing their own game results during Simulate — already exists in SimulatePage and is untouched.)

**Architecture:** Backend first (createGame count path, renameTeam, memberWithRole fallback, releaseSeat — all in `game.js`, registered in `index.js`), then client surfaces (SessionSetup count input, LobbyPage rename row, FreeAgencyPage roster card, GameContext `actsAs` + four page gates, professor SeatPanel), then the projector (pure `liveStandings` lib + SimulateFlood split layout), then docs + battery. One commit per task on branch `salary-showdown-playtest2`.

**Adjudications (Dylan, 2026-08-15):** count-first + lobby rename (any member, until season start); fallback = unclaimed-seat rule + professor Release; RESULTS Standings Shuffle stays unchanged (the live simulate ticker previews it by design).

**Tech Stack:** Firebase Cloud Functions + Firestore (emulators), React 19 + TS + Vite, vitest ×3 suites.

## Global Constraints

- **HANDOFF §6 hard rules are law.** Touched by this plan: no emojis (▲ ▼ — ● ○ ★ ½ glyphs sanctioned); facts-never-conclusions (the live standings panel shows rank/name/record/movement ONLY — no W/$, no perDollar, no judgment words); playstyle strings/blurbs untouched; `submitBids` plain-object; `advancePhase` expectations; sealed bids — the wall/panel must NEVER render bid contents; the 21-franchise cap is enforced IN THE PANEL with the exact `CAP_COPY` string, NOT server-side; timers advisory; HARD INVARIANT `joinGame` resolves before `setGameId`.
- **Back-compat is load-bearing:** `createGame({teamNames})` must keep working verbatim — the seed script, itest harness, playtest CLI, prod-smoke, and every existing test drive it. `{teamCount}` is additive.
- **NEVER touch `vitest.integration.config.ts`.**
- **`git rev-parse HEAD` before any git op** (sibling worktrees race refs; retry once on transient error).
- **No push, no deploy, no prod writes.** Emulators only.
- **Emulator flake protocol:** `Transaction lock timeout`/listener stalls → restart emulators + rerun; one red immediately after a backend source edit = functions hot-reload, rerun once.
- **CONFLICT WATCH:** two chip sessions may land on `main` mid-execution — one edits `StandingsTable/StandingsPage/ResultsPage` (zero-spend W/$), one edits `LineupPage.tsx` + `lineup.itest.tsx` (Coach remount). Task 6 touches `LineupPage.tsx` (one-line gate swap + one notice): the implementer must apply edits against the CURRENT file state, not assume this plan's quoted context is byte-exact there. If Task 0's baseline counts differ from the figures below (chips merged), the controller adjusts every expected count by the same delta before dispatching.
- **Suite baselines at plan time (Task 0 re-verifies):** backend 24 files/168 · app unit 14/71 · integration 18/33 · `npx tsc -b` clean · `npm run audit:ui` clean 64 files. Expected finals: backend **26/~179** (T1 +5, T5 +6 — exact counts asserted per task) · unit **15/78** (T1 +2, T8 +5) · integration **20/36** (T3 +1, T6 +1, T7 +1) · audit **66** (2 new tsx files).
- **Working dirs:** backend tests from `games/salary-showdown/backend/functions`; app from `games/salary-showdown/app`; emulators `PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run emu` from backend/functions (ports 5101/8180/9199/4100).
- **Ledger:** append one-liners to `.superpowers/sdd/progress.md`; NEVER `git add` it. Pre-existing dirty/untracked files are not yours to stage.

---

### Task 0: Baseline gate + branch

- [ ] **Step 1:** `cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git log -1 --pretty=%s` — expect main at (or past) `72cea90`. If a chip branch merged since, note the new baseline; do not stop.
- [ ] **Step 2:** `git checkout -b salary-showdown-playtest2`
- [ ] **Step 3:** Emulators fresh (kill 5101/8180/9199/4100, `npm run emu` from backend/functions, wait for 4100), then sequenced: backend suite, app unit, integration, `tsc -b`, `audit:ui`. Record the actual counts as THE baseline; every later task's expectation shifts by the same delta if these differ from the plan-time figures above.

---

### Task 1: Backend — count-first createGame + renameTeam + error copy

**Files:**
- Modify: `games/salary-showdown/backend/functions/src/game.js`
- Modify: `games/salary-showdown/backend/functions/index.js`
- Modify: `games/salary-showdown/app/src/lib/errors.ts`
- Test: `games/salary-showdown/backend/functions/test/rename.test.js` (new)
- Test: `games/salary-showdown/app/src/lib/errors.test.ts`

**Interfaces (Produces):** `createGame({teamCount: number})` → teams named `Franchise 1..N` (min 2 server-side; 21-cap stays panel-side). `renameTeam({gameId, name})` → renames the CALLER's own team; lobby-only; name trimmed + sliced to 24; errors `BAD_NAME` (empty) / `naming is closed` (post-start) / `not in this game`. Later tasks rely on these exact names.

- [ ] **Step 1: Write the failing backend tests.** Create `test/rename.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, joinGame, startSeason, renameTeam } = await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

describe('count-first createGame', () => {
  it('teamCount creates placeholder-named franchises', async () => {
    const res = await call(createGame, { teamCount: 3 }, 'prof');
    const teams = await db.collection(`games/${res.gameId}/teams`).get();
    expect(teams.docs.map((d) => d.data().name).sort())
      .toEqual(['Franchise 1', 'Franchise 2', 'Franchise 3']);
  });
  it('teamCount below 2 rejects like a short teamNames list', async () => {
    await expect(call(createGame, { teamCount: 1 }, 'prof'))
      .rejects.toThrow('need at least 2 teams');
  });
});

describe('renameTeam', () => {
  async function lobbyGame() {
    const res = await call(createGame, { teamCount: 2 }, 'prof');
    const teams = await db.collection(`games/${res.gameId}/teams`).get();
    const teamIds = teams.docs.map((d) => d.id);
    await call(joinGame, {
      joinCode: res.joinCode, teamId: teamIds[0], role: 'GM', displayName: 'A',
    }, 'gmA');
    return { ...res, teamIds };
  }
  it('a member renames THEIR OWN team in the lobby (trimmed, 24-char cap)', async () => {
    const g = await lobbyGame();
    await call(renameTeam, { gameId: g.gameId, name: '  The Cap Crunchers of Silicon Valley  ' }, 'gmA');
    const mine = (await db.doc(`games/${g.gameId}/teams/${g.teamIds[0]}`).get()).data();
    expect(mine.name).toBe('The Cap Crunchers of Sil'); // trim + slice(0, 24)
    // the rival team keeps its placeholder — renameTeam has no teamId input
    const rival = (await db.doc(`games/${g.gameId}/teams/${g.teamIds[1]}`).get()).data();
    expect(rival.name).toMatch(/^Franchise /);
  });
  it('empty and non-member renames reject', async () => {
    const g = await lobbyGame();
    await expect(call(renameTeam, { gameId: g.gameId, name: '   ' }, 'gmA'))
      .rejects.toThrow('BAD_NAME');
    await expect(call(renameTeam, { gameId: g.gameId, name: 'Sneaky' }, 'stranger'))
      .rejects.toThrow('not in this game');
  });
  it('naming closes at startSeason', async () => {
    const g = await lobbyGame();
    await call(startSeason, { gameId: g.gameId }, 'prof');
    await expect(call(renameTeam, { gameId: g.gameId, name: 'Too Late FC' }, 'gmA'))
      .rejects.toThrow('naming is closed');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`renameTeam` not exported; teamCount ignored):

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run test/rename.test.js
```

- [ ] **Step 3: Implement createGame.** In `src/game.js`, replace exactly:

Old:
```js
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
  const teamNames = req.data.teamNames ?? [];
  if (teamNames.length < 2) throw new HttpsError('invalid-argument', 'need at least 2 teams');
```
New:
```js
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
  // Count-first create (playtest-2 item 1): the panel sends { teamCount } and
  // students name their own franchises from the lobby (renameTeam below).
  // { teamNames } stays supported VERBATIM — the seed script, itest harness,
  // playtest CLI, prod-smoke, and every existing test drive it. The
  // 21-franchise cap stays panel-enforced (standing hard rule); the server
  // keeps only the minimum.
  const teamCount = Number.isInteger(req.data.teamCount) ? req.data.teamCount : null;
  const teamNames = teamCount != null
    ? Array.from({ length: teamCount }, (_, i) => `Franchise ${i + 1}`)
    : (req.data.teamNames ?? []);
  if (teamNames.length < 2) throw new HttpsError('invalid-argument', 'need at least 2 teams');
```

- [ ] **Step 4: Implement renameTeam.** In `src/game.js`, immediately after the `getLobby` callable's closing `});`, insert:

```js
// Lobby-only franchise naming (playtest-2 item 1, adjudicated): any member of
// a team may rename THEIR OWN team until the season starts — the callable
// derives teamId from the caller's membership, so rivals are untargetable.
// Server-authoritative write like every mutation; 24-char cap mirrors
// displayName's. Names are not required to be unique (professor-typed names
// never were either).
export const renameTeam = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'sign in first');
  const { gameId } = req.data;
  const name = String(req.data.name ?? '').trim().slice(0, 24);
  if (name.length === 0) throw new HttpsError('invalid-argument', 'BAD_NAME');
  const m = await db().doc(`games/${gameId}/players/${req.auth.uid}`).get();
  if (!m.exists) throw new HttpsError('permission-denied', 'not in this game');
  const g = (await db().doc(`games/${gameId}`).get()).data();
  if (g.status !== 'lobby') throw new HttpsError('failed-precondition', 'naming is closed');
  await db().doc(`games/${gameId}/teams/${m.data().teamId}`).update({ name });
  return { name };
});
```

- [ ] **Step 5: Register the export.** In `index.js`, replace exactly:

Old:
```js
export { createGame, joinGame, startSeason, advancePhase, signPlayer, cutRosterPlayer, submitBids, submitLineup, getLobby, setTimer, markDone, setRevealStep } from './src/game.js';
```
New:
```js
export { createGame, joinGame, startSeason, advancePhase, signPlayer, cutRosterPlayer, submitBids, submitLineup, getLobby, setTimer, markDone, setRevealStep, renameTeam } from './src/game.js';
```

- [ ] **Step 6: Student copy.** In `app/src/lib/errors.ts`, replace exactly:

Old:
```ts
  BAD_SHAPE: 'The lineup did not submit cleanly — rearrange and resubmit.',
```
New:
```ts
  BAD_SHAPE: 'The lineup did not submit cleanly — rearrange and resubmit.',
  BAD_NAME: 'Enter a team name.',
```
and replace exactly:

Old:
```ts
  'bad join code': 'No game found with that code — check the projector.',
```
New:
```ts
  'bad join code': 'No game found with that code — check the projector.',
  'naming is closed': 'Team names lock when the season starts.',
```

Append to `app/src/lib/errors.test.ts`:

```ts
test('rename errors map to student copy', () => {
  expect(errorCopy(new Error('BAD_NAME')).headline).toBe('Enter a team name.');
  expect(errorCopy(new Error('naming is closed')).headline)
    .toBe('Team names lock when the season starts.');
});
```

- [ ] **Step 7: Green.** Backend: `npx vitest run test/rename.test.js` (5 pass), then full `npx vitest run` → **25 files / 173 tests** (baseline 24/168 +1 file +5). Hot-reload flake rule applies. App: `npx vitest run src/lib/errors.test.ts` (8 pass), full unit → **14 files / 72**.
- [ ] **Step 8: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/backend/functions/src/game.js games/salary-showdown/backend/functions/index.js games/salary-showdown/backend/functions/test/rename.test.js games/salary-showdown/app/src/lib/errors.ts games/salary-showdown/app/src/lib/errors.test.ts && git commit -m "feat(salary-showdown): count-first createGame + lobby renameTeam (playtest-2 item 1 backend)"
```

---

### Task 2: Panel — count-first create UI

**Files:**
- Modify: `games/salary-showdown/app/src/components/professor/SessionSetup.tsx`
- Test: `games/salary-showdown/app/src/itest/professor.itest.tsx` (update the create test)

**Interfaces (Consumes):** `createGame({teamCount})` from Task 1. **The `CAP_COPY` string must stay byte-identical** (hard-rule note in the file + itest assertion).

- [ ] **Step 1: Update the itest first (red).** In `professor.itest.tsx`, test `'panel: create enforces the 21-franchise cap, lists franchises, starts the season'`, replace exactly:

Old:
```tsx
  const box = await screen.findByLabelText('team names', {}, { timeout: 20000 });
  await user.click(box);
  await user.paste(Array.from({ length: 22 }, (_, i) => `Team ${i + 1}`).join('\n'));
  await user.click(screen.getByRole('button', { name: 'Create game' }));
```
New:
```tsx
  const box = await screen.findByLabelText('franchise count', {}, { timeout: 20000 });
  await user.type(box, '22');
  await user.click(screen.getByRole('button', { name: 'Create game' }));
```
and replace exactly:

Old:
```tsx
  await user.clear(box);
  await user.click(box);
  await user.paste('Alpha\nBeta\nGamma');
  await user.click(screen.getByRole('button', { name: 'Create game' }));
  await waitFor(() => expect(screen.getByLabelText('Join code')).toBeInTheDocument(),
    { timeout: 30000 });
  for (const nm of ['Alpha', 'Beta', 'Gamma']) {
    await waitFor(() => expect(screen.getByText(nm)).toBeInTheDocument(), { timeout: 20000 });
  }
```
New:
```tsx
  await user.clear(box);
  await user.type(box, '3');
  await user.click(screen.getByRole('button', { name: 'Create game' }));
  await waitFor(() => expect(screen.getByLabelText('Join code')).toBeInTheDocument(),
    { timeout: 30000 });
  // Count-first create: teams arrive as placeholders students will rename.
  for (const nm of ['Franchise 1', 'Franchise 2', 'Franchise 3']) {
    await waitFor(() => expect(screen.getByText(nm)).toBeInTheDocument(), { timeout: 20000 });
  }
```

- [ ] **Step 2: Run that file — the create test FAILS** (`franchise count` label missing), the other tests stay green:

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/professor.itest.tsx
```

- [ ] **Step 3: Implement.** In `SessionSetup.tsx`, replace exactly:

Old:
```tsx
const MIN_COPY = 'Enter at least 2 team names — one per line.';
```
New:
```tsx
const MIN_COPY = 'Enter how many franchises are playing — at least 2.';
```
Replace exactly:

Old:
```tsx
  const { gameId, setGameId, game, teams, call } = useProfessor();
  const [namesText, setNamesText] = useState('');
```
New:
```tsx
  const { gameId, setGameId, game, teams, call } = useProfessor();
  const [countText, setCountText] = useState('');
```
Replace exactly:

Old:
```tsx
    const create = async () => {
      const names = namesText.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
      if (names.length < 2) { setInlineError(MIN_COPY); return; }
      if (names.length > 21) { setInlineError(CAP_COPY); return; }
      setInlineError(null);
      setBusy(true);
      setError(null);
      try {
        const res = await call<{ gameId: string; joinCode: string }>(
          'createGame', { teamNames: names });
        setGameId(res.gameId); // persists localStorage 'ss.profGameId' (ProfessorContext)
      } catch (e) {
        setError(e);
      } finally {
        setBusy(false);
      }
    };
```
New:
```tsx
    const create = async () => {
      // Count-first create (playtest-2 item 1): students name their own
      // franchises from the lobby. The 21-franchise cap stays enforced HERE
      // with the exact CAP_COPY string — standing hard rule, not server-side.
      const n = Number(countText);
      if (!Number.isInteger(n) || n < 2) { setInlineError(MIN_COPY); return; }
      if (n > 21) { setInlineError(CAP_COPY); return; }
      setInlineError(null);
      setBusy(true);
      setError(null);
      try {
        const res = await call<{ gameId: string; joinCode: string }>(
          'createGame', { teamCount: n });
        setGameId(res.gameId); // persists localStorage 'ss.profGameId' (ProfessorContext)
      } catch (e) {
        setError(e);
      } finally {
        setBusy(false);
      }
    };
```
Replace exactly:

Old:
```tsx
        <textarea aria-label="team names" rows={8} value={namesText}
          onChange={(e) => setNamesText(e.target.value)}
          placeholder="One team name per line (2 to 21 teams)"
          style={{ width: '100%', boxSizing: 'border-box' }} />
```
New:
```tsx
        <input aria-label="franchise count" className="mono" inputMode="numeric"
          value={countText}
          onChange={(e) => setCountText(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="How many franchises? (2 to 21)"
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 16 }} />
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
          Teams arrive as Franchise 1..N — students name their own from the
          lobby before you press Start season.
        </p>
```

- [ ] **Step 4: Green + collateral.** `npx vitest run -c vitest.integration.config.ts src/itest/professor.itest.tsx src/itest/professor-fixes.itest.tsx src/itest/bigscreen.itest.tsx` (bigscreen/others create via harness `teamNames` — unaffected, prove it). Then `npx tsc -b && npm run audit:ui` (64 files).
- [ ] **Step 5: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/app/src/components/professor/SessionSetup.tsx games/salary-showdown/app/src/itest/professor.itest.tsx && git commit -m "feat(salary-showdown): panel count-first create — franchise count input (playtest-2 item 1)"
```

---

### Task 3: Lobby rename UI

**Files:**
- Modify: `games/salary-showdown/app/src/pages/LobbyPage.tsx`
- Test: `games/salary-showdown/app/src/itest/lobby.itest.tsx` (new second test)

**Interfaces (Consumes):** `renameTeam({gameId, name})` from Task 1.

- [ ] **Step 1: Failing itest.** Read `lobby.itest.tsx` first and mirror its harness idioms (seedToPhase LOBBY + join + `localStorage.setItem('ss.gameId', …)` + render). Append:

```tsx
test('lobby rename (playtest-2): a member names their own franchise, live for the room', async () => {
  localStorage.removeItem('ss.gameId'); // isolation from the prior test's claim
  const seeded = await seedToPhase({ to: 'LOBBY' });
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'Namer',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/lobby']}><App /></MemoryRouter>);

  const input = await screen.findByLabelText('team name', {}, { timeout: 20000 });
  await user.clear(input);
  await user.type(input, 'Cap Crunchers');
  await user.click(screen.getByRole('button', { name: 'Rename' }));

  // The card follows the live team doc; the server owns the write.
  await waitFor(() => expect(screen.getByText('Cap Crunchers')).toBeInTheDocument(),
    { timeout: 15000 });
  await waitFor(async () => {
    const t = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
    expect(t.name).toBe('Cap Crunchers');
  }, { timeout: 15000 });
  // Rival teams keep their names — rename can only target the caller's team.
  expect(screen.getByText('Beta')).toBeInTheDocument();
}, 120000);
```

Add any missing imports to match the file's existing ones (`userEvent`, `adminDb`, `httpsCallable`, `functions` — check what the file already imports and extend only as needed).

- [ ] **Step 2: Run — new test FAILS** (`team name` input absent), first test green:

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/lobby.itest.tsx
```

- [ ] **Step 3: Implement.** In `LobbyPage.tsx`:

(a) extend the imports line `import { useEffect, useState } from 'react';` — unchanged (already has both) — and add:
```tsx
import { ErrorNotice } from '../components/ui/ErrorNotice';
```

(b) inside the team-cards map, after the roles row's closing `</div>` and before the card's closing `</div>`, insert:

```tsx
          {tid === membership.teamId && game.status === 'lobby' && (
            <RenameRow current={t.name} />
          )}
```

(c) after the `LobbyPage` component's closing brace, append:

```tsx
// Franchise naming (playtest-2 item 1, adjudicated): any member of the team,
// until the season starts. The input tracks the LIVE name until the user
// edits, so a teammate's rename doesn't get clobbered by a stale prefill.
function RenameRow({ current }: { current: string }) {
  const { gameId, call } = useGame();
  const [name, setName] = useState(current);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (!dirty) setName(current); }, [current, dirty]);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await call('renameTeam', { gameId, name });
      setDirty(false);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input aria-label="team name" className="inset" maxLength={24}
        style={{ color: 'inherit', flex: 1, minWidth: 140 }} value={name}
        onChange={(e) => { setDirty(true); setName(e.target.value); }} />
      <button type="button" className="btn" disabled={busy || name.trim().length === 0}
        onClick={() => void save()}>Rename</button>
      <ErrorNotice error={err} />
    </div>
  );
}
```

- [ ] **Step 4: Green.** Lobby itests 2/2; `npx tsc -b && npm run audit:ui` (64). Integration count now baseline+1 (**19/34** at plan-time figures).
- [ ] **Step 5: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/app/src/pages/LobbyPage.tsx games/salary-showdown/app/src/itest/lobby.itest.tsx && git commit -m "feat(salary-showdown): lobby franchise rename — any member, until season start (playtest-2 item 1)"
```

---

### Task 4: Draft Night "Your roster" panel

**Files:**
- Modify: `games/salary-showdown/app/src/pages/FreeAgencyPage.tsx`
- Test: `games/salary-showdown/app/src/itest/market.itest.tsx` (extend the FIRST test — do NOT touch the "we're done" test)

- [ ] **Step 1: Extend the itest (red).** In `market.itest.tsx`'s first test, immediately after the `All players (150)` chip assertions block (`expect(screen.queryByText('Default Role Player')).toBeNull();`), insert:

```tsx
  // Playtest-2 item 2: the roster panel exists and starts empty.
  const roster = () => screen.getByTestId('my-roster');
  expect(roster().textContent).toContain('0 of 10');
  expect(roster().textContent).toContain('No players under contract yet.');
```

and immediately after the `sign-note` assertion (`He remains available to every team.`), insert:

```tsx
  // …and reflects the signing live from the team doc.
  await waitFor(() => expect(roster().textContent).toContain(target.name), { timeout: 15000 });
  expect(roster().textContent).toContain('1 of 10');
```

- [ ] **Step 2: Run — first test FAILS** at `getByTestId('my-roster')`:

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/market.itest.tsx
```

- [ ] **Step 3: Implement.** In `FreeAgencyPage.tsx`, immediately after the `{isGM && (…)}` markDone block's closing `)}` and before `<div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>`, insert:

```tsx
      {/* Playtest-2 item 2: who you've signed, live from the team doc. Facts
          only — name, position, committed rate × rounds. Renders every FA
          round (not just Draft Night); DRP hardship rows show like any
          contract because they ARE contracts. */}
      <section className="card" data-testid="my-roster" style={{ margin: '10px 0' }}>
        <strong>Your roster</strong>
        <span className="mono muted" style={{ marginLeft: 8, fontSize: 13 }}>
          {actives.length} of 10
        </span>
        {actives.length === 0 && (
          <p className="dim" style={{ margin: '6px 0 0' }}>No players under contract yet.</p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {actives.map((c) => {
            const p = catalog.get(c.pid)!;
            return (
              <span key={c.pid} className="chip" data-testid={`roster-${c.pid}`}>
                {p.name} <PositionBadge pos={p.position} />{' '}
                <span className="mono muted">{fmtM(c.rate)}/rd × {c.years}</span>
              </span>
            );
          })}
        </div>
      </section>
```

(`actives`, `catalog`, `PositionBadge`, `fmtM` are already in scope/imported.)

- [ ] **Step 4: Green.** market itests all green; `npx tsc -b && npm run audit:ui` (64).
- [ ] **Step 5: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/app/src/pages/FreeAgencyPage.tsx games/salary-showdown/app/src/itest/market.itest.tsx && git commit -m "feat(salary-showdown): live 'Your roster' panel on the FA screen (playtest-2 item 2)"
```

---

### Task 5: Backend — absent-seat role fallback + releaseSeat

**Files:**
- Modify: `games/salary-showdown/backend/functions/src/game.js`
- Modify: `games/salary-showdown/backend/functions/index.js`
- Modify: `games/salary-showdown/app/src/lib/errors.ts` (+1 prose entry) and `errors.test.ts`
- Test: `games/salary-showdown/backend/functions/test/roles.test.js` (new)

**Interfaces (Produces):** `memberWithRole` allows any team member iff NO member of that team holds the required role (claimed seat stays authoritative). `releaseSeat({gameId, teamId, role})` — professor-only, deletes the claimed membership doc, errors `bad role` / `seat is not claimed` / `professor only`. Client tasks rely on: rules already let members read the players collection (LobbyPage does), and a released client's listeners fail → `GameContext` drops to Landing; rejoin heals via the F6 epoch.

- [ ] **Step 1: Failing tests.** Create `test/roles.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
process.env.GCLOUD_PROJECT = 'salary-showdown-dev';
const t = fft({ projectId: 'salary-showdown-dev' });
initializeApp({ projectId: 'salary-showdown-dev' });
const db = getFirestore();

const { createGame, joinGame, startSeason, advancePhase, submitBids, submitLineup, releaseSeat } =
  await import('../src/game.js');
const call = (fn, data, uid) => t.wrap(fn)({ data, auth: { uid, token: {} } });

// Two teams; team A gets a GM (+ optionally a Scout); team B stays empty and
// rides hardship autofill + lineup auto-repair, like reveal.test.js's passive
// teams. Drive with expectations — standing hard rule.
async function gameAt(phase, { withScout = false } = {}) {
  const res = await call(createGame, { teamNames: ['Alpha', 'Beta'] }, 'prof');
  const teams = await db.collection(`games/${res.gameId}/teams`).get();
  const teamA = teams.docs.find((d) => d.data().name === 'Alpha').id;
  await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'GM', displayName: 'G' }, 'gmA');
  if (withScout) {
    await call(joinGame, { joinCode: res.joinCode, teamId: teamA, role: 'Scout', displayName: 'S' }, 'scoutA');
  }
  await call(startSeason, { gameId: res.gameId }, 'prof');
  let g = (await db.doc(`games/${res.gameId}`).get()).data();
  let guard = 0;
  while (g.phase !== phase) {
    await call(advancePhase,
      { gameId: res.gameId, expectedPhase: g.phase, expectedRound: g.round }, 'prof');
    g = (await db.doc(`games/${res.gameId}`).get()).data();
    if (++guard > 10) throw new Error(`never reached ${phase}`);
  }
  return { gameId: res.gameId, teamA, round: g.round };
}

describe('absent-seat role fallback', () => {
  it('a GM may bid when the team has NO Scout', async () => {
    const { gameId, teamA } = await gameAt('AUCTION');
    const wave = (await db.doc(`games/${gameId}/auctions/1`).get()).data();
    await call(submitBids, { gameId, bids: { [wave.stars[0]]: { rate: 2.0, years: 1 } } }, 'gmA');
    const priv = (await db.doc(`games/${gameId}/teams/${teamA}/private/auction`).get()).data();
    expect(priv.round).toBe(1);
  });
  it('a claimed Scout seat stays authoritative — the GM is rejected', async () => {
    const { gameId } = await gameAt('AUCTION', { withScout: true });
    const wave = (await db.doc(`games/${gameId}/auctions/1`).get()).data();
    await expect(call(submitBids,
      { gameId, bids: { [wave.stars[0]]: { rate: 2.0, years: 1 } } }, 'gmA'))
      .rejects.toThrow('Scout only');
  });
  it('a GM may submit the lineup when the team has NO Coach', async () => {
    const { gameId, teamA } = await gameAt('LINEUP');
    const team = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    const active = team.roster
      .filter((c) => c.startRound + c.years - 1 >= 1).map((c) => c.pid);
    // synthetics.js pid blocks: 9001-3 G, 9011-3 W, 9021-2 B
    const pos = (pid) => (pid >= 9020 ? 'B' : pid >= 9010 ? 'W' : 'G');
    const g = active.filter((p) => pos(p) === 'G');
    const w = active.filter((p) => pos(p) === 'W');
    const b = active.filter((p) => pos(p) === 'B');
    const starters = [g[0], g[1], w[0], w[1], b[0]];
    const rest = active.filter((p) => !starters.includes(p));
    await call(submitLineup, { gameId, lineup: {
      starters, sixth: rest[0], bench: rest.slice(1), playstyle: 'Balanced' } }, 'gmA');
    const after = (await db.doc(`games/${gameId}/teams/${teamA}`).get()).data();
    expect(after.lineupLockedRound).toBe(1);
  });
});

describe('releaseSeat', () => {
  it('professor frees a claimed seat; the fallback then covers it', async () => {
    const { gameId, teamA } = await gameAt('AUCTION', { withScout: true });
    const wave = (await db.doc(`games/${gameId}/auctions/1`).get()).data();
    const bids = { [wave.stars[0]]: { rate: 2.0, years: 1 } };
    await expect(call(submitBids, { gameId, bids }, 'gmA')).rejects.toThrow('Scout only');
    await call(releaseSeat, { gameId, teamId: teamA, role: 'Scout' }, 'prof');
    expect((await db.doc(`games/${gameId}/players/scoutA`).get()).exists).toBe(false);
    await call(submitBids, { gameId, bids }, 'gmA'); // fallback now applies
    const priv = (await db.doc(`games/${gameId}/teams/${teamA}/private/auction`).get()).data();
    expect(priv.round).toBe(1);
  });
  it('non-professor and unclaimed-seat calls reject', async () => {
    const { gameId, teamA } = await gameAt('AUCTION');
    await expect(call(releaseSeat, { gameId, teamId: teamA, role: 'GM' }, 'gmA'))
      .rejects.toThrow('professor only');
    await expect(call(releaseSeat, { gameId, teamId: teamA, role: 'Coach' }, 'prof'))
      .rejects.toThrow('seat is not claimed');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`releaseSeat` not exported; fallback rejections):

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/backend/functions && npx vitest run test/roles.test.js
```

- [ ] **Step 3: Implement the fallback.** In `src/game.js`, replace exactly:

Old:
```js
async function memberWithRole(gameId, uid, role) {
  if (!uid) throw new HttpsError('unauthenticated', 'sign in first');
  const m = await db().doc(`games/${gameId}/players/${uid}`).get();
  if (!m.exists) throw new HttpsError('permission-denied', 'not in this game');
  if (m.data().role !== role) throw new HttpsError('permission-denied', `${role} only`);
  return m.data();
}
```
New:
```js
// Role gate with ABSENT-SEAT fallback (playtest-2 item 3, adjudicated): a
// CLAIMED seat stays authoritative — its holder is the only one who may act.
// When no member of the caller's team holds the role (two-player teams, or a
// seat the professor released), any team member may act instead. The check
// runs per call, so claiming a seat mid-phase reasserts the role immediately.
async function memberWithRole(gameId, uid, role) {
  if (!uid) throw new HttpsError('unauthenticated', 'sign in first');
  const m = await db().doc(`games/${gameId}/players/${uid}`).get();
  if (!m.exists) throw new HttpsError('permission-denied', 'not in this game');
  if (m.data().role !== role) {
    const holder = await db().collection(`games/${gameId}/players`)
      .where('teamId', '==', m.data().teamId).where('role', '==', role).limit(1).get();
    if (!holder.empty) throw new HttpsError('permission-denied', `${role} only`);
  }
  return m.data();
}
```

- [ ] **Step 4: Implement releaseSeat.** In `src/game.js`, immediately after the `renameTeam` callable's closing `});` (Task 1), insert:

```js
// Professor-only seat release (playtest-2 item 3): frees a claimed seat so
// the absent-seat fallback covers a player who left mid-session. Deleting the
// membership doc signs that browser out of the team — its listeners lose read
// access and the client falls back to the join screen — and the seat reopens
// for a fresh claim (re-claiming re-asserts the role from the next call on).
export const releaseSeat = onCall(async (req) => {
  const { gameId, teamId, role } = req.data;
  await assertProfessor(gameId, req.auth?.uid);
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'bad role');
  const seat = await db().collection(`games/${gameId}/players`)
    .where('teamId', '==', teamId).where('role', '==', role).limit(1).get();
  if (seat.empty) throw new HttpsError('not-found', 'seat is not claimed');
  await seat.docs[0].ref.delete();
  return { released: role };
});
```

- [ ] **Step 5: Register + copy.** `index.js` export list: append `, releaseSeat` after `renameTeam` (replace the Task-1 line, adding it before ` } from`). In `app/src/lib/errors.ts`, replace exactly:

Old:
```ts
  'naming is closed': 'Team names lock when the season starts.',
```
New:
```ts
  'naming is closed': 'Team names lock when the season starts.',
  'seat is not claimed': 'That seat is already open.',
```
Append to `errors.test.ts`:

```ts
test('releaseSeat unclaimed maps to the already-open copy', () => {
  expect(errorCopy(new Error('seat is not claimed')).headline).toBe('That seat is already open.');
});
```

- [ ] **Step 6: Green.** `npx vitest run test/roles.test.js` (5 pass), full backend → **26 files / 178** (25/173 +1 file +5). App unit → **14/73**.
- [ ] **Step 7: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/backend/functions/src/game.js games/salary-showdown/backend/functions/index.js games/salary-showdown/backend/functions/test/roles.test.js games/salary-showdown/app/src/lib/errors.ts games/salary-showdown/app/src/lib/errors.test.ts && git commit -m "feat(salary-showdown): absent-seat role fallback + professor releaseSeat (playtest-2 item 3 backend)"
```

---

### Task 6: Client — effective roles (`actsAs`) on all four gated screens

**Files:**
- Modify: `games/salary-showdown/app/src/contexts/GameContext.tsx`
- Modify: `games/salary-showdown/app/src/pages/FreeAgencyPage.tsx`, `FrontOfficePage.tsx`, `AuctionPage.tsx`, `LineupPage.tsx` (**CONFLICT WATCH** — apply against current file state)
- Modify: `games/salary-showdown/app/src/pages/LobbyPage.tsx` (RULES line)
- Test: `games/salary-showdown/app/src/itest/roles.itest.tsx` (new)

**Interfaces (Produces):** `useGame().actsAs(role: string): boolean` — true when the caller holds the role OR their team has no claimed member with it. Mirrors the server's `memberWithRole` rule exactly.

- [ ] **Step 1: Failing itest.** Create `src/itest/roles.itest.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

test('absent-seat fallback (playtest-2): a GM on a Coach-less team submits the lineup', async () => {
  localStorage.removeItem('ss.gameId');
  const seeded = await seedToPhase({ to: 'R1:LINEUP' });
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  // Alpha's ONLY member is this GM — no Coach claimed anywhere on the team.
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'GM', displayName: 'Solo GM',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/game/lineup']}><App /></MemoryRouter>);

  // The fallback is visible and the submit affordance is LIVE for the GM.
  await screen.findByTestId('role-fallback', {}, { timeout: 20000 });
  expect(screen.getByTestId('role-fallback').textContent)
    .toContain('No Coach on your team');
  const submit = await screen.findByRole('button', { name: 'Submit lineup' }, { timeout: 20000 });
  await waitFor(() => expect(submit).toBeEnabled(), { timeout: 20000 });
  await user.click(submit);

  await waitFor(async () => {
    const t = (await adminDb().doc(
      `games/${seeded.gameId}/teams/${seeded.teamIds[0]}`).get()).data()!;
    expect(t.lineupLockedRound).toBe(1);
  }, { timeout: 15000 });
}, 120000);
```

- [ ] **Step 2: Run — FAILS** (no `role-fallback` testid; submit replaced by "The Coach submits this phase."):

```bash
cd /Users/dylanmassaro/FenriX/games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/roles.itest.tsx
```

- [ ] **Step 3: GameContext.** Four edits:

(a) Replace exactly:
```tsx
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore';
```
with:
```tsx
import { collection, doc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
```

(b) In the `GameCtx` interface, replace exactly:
```tsx
  game: GameDoc | null; membership: Membership | null; team: TeamDoc | null;
```
with:
```tsx
  game: GameDoc | null; membership: Membership | null; team: TeamDoc | null;
  // Effective-role check (playtest-2 item 3): true when the caller holds the
  // role, or their team has no claimed member with it — the exact mirror of
  // the server's memberWithRole absent-seat fallback.
  actsAs(role: string): boolean;
```

(c) After the membership effect (the one keyed `[gameId, uid, epoch]`), insert:

```tsx
  const [myTeamRoles, setMyTeamRoles] = useState<Set<string>>(new Set());
  useEffect(() => { // which roles are CLAIMED on my team (absent-seat fallback)
    if (!gameId || !membership?.teamId) { setMyTeamRoles(new Set()); return; }
    return onSnapshot(
      query(collection(db, 'games', gameId, 'players'),
        where('teamId', '==', membership.teamId)),
      (snap) => {
        const s = new Set<string>();
        snap.forEach((d) => s.add((d.data() as { role: string }).role));
        setMyTeamRoles(s);
      },
      () => {});
  }, [gameId, membership?.teamId]);

  const actsAs = useCallback((role: string) =>
    membership != null && (membership.role === role || !myTeamRoles.has(role)),
  [membership, myTeamRoles]);
```

(d) Replace exactly:
```tsx
  const value = useMemo(() => ({
    gameId, setGameId, game, membership, team, teams, catalog, market, call,
  }), [gameId, setGameId, game, membership, team, teams, catalog, market, call]);
```
with:
```tsx
  const value = useMemo(() => ({
    gameId, setGameId, game, membership, team, teams, catalog, market, call, actsAs,
  }), [gameId, setGameId, game, membership, team, teams, catalog, market, call, actsAs]);
```

- [ ] **Step 4: The four page gates.** In each file, swap the role constant to `actsAs`, add `actsAs` to the `useGame()` destructure, and add a fallback notice with `data-testid="role-fallback"`. Apply against CURRENT file state (chip sessions may have edited LineupPage):

FreeAgencyPage — replace `const isGM = membership?.role === 'GM';` with:
```tsx
  const isGM = actsAs('GM');
  const gmFallback = isGM && membership?.role !== 'GM';
```
and immediately before the `{isGM && (` markDone block, insert:
```tsx
      {gmFallback && (
        <p className="dim" data-testid="role-fallback">No GM on your team — any member may sign.</p>
      )}
```

FrontOfficePage — same two-line swap (`isGM`/`gmFallback`), and insert the identical notice immediately before its `{isGM && (` block (keep the existing `{!isGM && …read-only…}` line as-is — it only renders when a GM exists elsewhere on the team).

AuctionPage — replace `const isScout = membership?.role === 'Scout';` with:
```tsx
  const isScout = actsAs('Scout');
  const scoutFallback = isScout && membership?.role !== 'Scout';
```
and immediately after the `<ErrorNotice …/>` element (or the page's equivalent top notice position), insert:
```tsx
      {scoutFallback && (
        <p className="dim" data-testid="role-fallback">No Scout on your team — any member may bid.</p>
      )}
```

LineupPage — replace `const isCoach = membership?.role === 'Coach';` with:
```tsx
  const isCoach = actsAs('Coach');
  const coachFallback = isCoach && membership?.role !== 'Coach';
```
and immediately after the locked-badge block (before `<ErrorNotice error={err} />`), insert:
```tsx
      {coachFallback && (
        <p className="dim" data-testid="role-fallback">No Coach on your team — any member may set the lineup.</p>
      )}
```

LobbyPage — replace exactly:
```tsx
  'One submit per phase: GM signs, Scout bids, Coach sets the lineup.',
```
with:
```tsx
  'One submit per phase: GM signs, Scout bids, Coach sets the lineup.',
  'Missing a seat? Any teammate covers that role.',
```

- [ ] **Step 5: Green + collateral.** `npx vitest run -c vitest.integration.config.ts src/itest/roles.itest.tsx src/itest/lineup.itest.tsx src/itest/auction.itest.tsx src/itest/market.itest.tsx src/itest/frontoffice.itest.tsx` — the existing role-copy tests must stay green (their teams have full seats, so `actsAs` ≡ old behavior). Then full integration (**20/35** plan-time), `npx tsc -b`, `npm run audit:ui` (**65** — roles.itest is not in app/src page scan; confirm actual count and record it).
- [ ] **Step 6: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/app/src/contexts/GameContext.tsx games/salary-showdown/app/src/pages/FreeAgencyPage.tsx games/salary-showdown/app/src/pages/FrontOfficePage.tsx games/salary-showdown/app/src/pages/AuctionPage.tsx games/salary-showdown/app/src/pages/LineupPage.tsx games/salary-showdown/app/src/pages/LobbyPage.tsx games/salary-showdown/app/src/itest/roles.itest.tsx && git commit -m "feat(salary-showdown): actsAs effective-role gates + fallback notices on all four screens (playtest-2 item 3)"
```

---

### Task 7: Professor SeatPanel (release UI)

**Files:**
- Create: `games/salary-showdown/app/src/components/professor/SeatPanel.tsx`
- Modify: `games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx`
- Test: `games/salary-showdown/app/src/itest/professor-seats.itest.tsx` (new)

**Interfaces (Consumes):** `releaseSeat` (Task 5); `useProfessor().players` map.

- [ ] **Step 1: Failing itest.** Create `src/itest/professor-seats.itest.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { adminDb, newClient } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

beforeEach(() => localStorage.clear());

test('seat panel (playtest-2): two-click release frees a claimed seat', async () => {
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  const { gameId, joinCode } = await httpsCallable(functions, 'createGame')({
    teamNames: ['Alpha', 'Beta'] })
    .then((r) => r.data as { gameId: string; joinCode: string });
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  const teamA = teamsSnap.docs.find((d) => d.data().name === 'Alpha')!.id;
  const scout = await newClient('seat-scout');
  await scout.call('joinGame', { joinCode, teamId: teamA, role: 'Scout', displayName: 'Leaver' });

  localStorage.setItem('ss.profGameId', gameId);
  localStorage.setItem('ss.profAutoArm', '0');
  localStorage.setItem('ss.profAutoAdvance', '0');
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/professor']}><App /></MemoryRouter>);

  const panel = await screen.findByTestId('seat-panel', {}, { timeout: 20000 });
  await waitFor(() => expect(panel.textContent).toContain('Scout: Leaver'), { timeout: 15000 });

  // Two-click confirm: Release arms, Confirm release fires.
  await user.click(screen.getByRole('button', { name: 'Release' }));
  await user.click(screen.getByRole('button', { name: 'Confirm release' }));

  await waitFor(async () => {
    expect((await adminDb().doc(`games/${gameId}/players/${scout.uid}`).get()).exists).toBe(false);
  }, { timeout: 15000 });
  await waitFor(() => expect(panel.textContent).toContain('Scout: open'), { timeout: 15000 });
}, 120000);
```

- [ ] **Step 2: Run — FAILS** at `findByTestId('seat-panel')`.
- [ ] **Step 3: Implement the component.** Create `SeatPanel.tsx`:

```tsx
import { useState } from 'react';
import { useProfessor } from '../../contexts/ProfessorContext';
import { ErrorNotice } from '../ui/ErrorNotice';

const ROLES = ['GM', 'Scout', 'Coach'] as const;

// Seats card (playtest-2 item 3): per-team claimed seats with a professor-only
// two-click release. Releasing deletes the membership server-side: the
// absent-seat fallback then lets teammates cover the role, and the seat
// reopens for a fresh claim. Names are public lobby facts — never bid
// contents or any private submission data.
export function SeatPanel() {
  const { gameId, game, teams, players, call } = useProfessor();
  const [arm, setArm] = useState<string | null>(null); // `${teamId}:${role}` awaiting confirm
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!gameId || !game) return null;
  const rows = [...teams.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  const seatHolder = (teamId: string, role: string) =>
    [...players.values()].find((p) => p.teamId === teamId && p.role === role) ?? null;
  const release = async (teamId: string, role: string) => {
    setBusy(true); setError(null);
    try {
      await call('releaseSeat', { gameId, teamId, role });
      setArm(null);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <section className="card" data-testid="seat-panel" style={{ marginTop: 12 }}>
      <strong>Seats</strong>
      <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
        Releasing a seat signs that player out. Teammates can act for any
        role with no claimed seat.
      </p>
      {rows.map(([teamId, t]) => (
        <div key={teamId} data-testid={`seats-${teamId}`}
          style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{ minWidth: 120 }}>{t.name}</span>
          {ROLES.map((role) => {
            const holder = seatHolder(teamId, role);
            const key = `${teamId}:${role}`;
            if (!holder) return <span key={role} className="dim">{role}: open</span>;
            return (
              <span key={role} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <span className="ok">{role}: {holder.displayName}</span>
                <button type="button" className="btn" disabled={busy}
                  onClick={() => (arm === key ? void release(teamId, role) : setArm(key))}>
                  {arm === key ? 'Confirm release' : 'Release'}
                </button>
              </span>
            );
          })}
        </div>
      ))}
      <ErrorNotice error={error} />
    </section>
  );
}
```

- [ ] **Step 4: Mount it.** In `ProfessorPage.tsx`: add `import { SeatPanel } from '../../components/professor/SeatPanel';` beside the other professor component imports, and insert `<SeatPanel />` on its own line immediately after `<SubmissionGrid />`.
- [ ] **Step 5: Green.** New itest passes; `npx vitest run -c vitest.integration.config.ts src/itest/professor.itest.tsx src/itest/professor-seats.itest.tsx` (SeatPanel must not break existing panel tests); `npx tsc -b`; `npm run audit:ui` (**66** plan-time — new tsx file; record actual).
- [ ] **Step 6: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/app/src/components/professor/SeatPanel.tsx games/salary-showdown/app/src/pages/professor/ProfessorPage.tsx games/salary-showdown/app/src/itest/professor-seats.itest.tsx && git commit -m "feat(salary-showdown): professor Seats card — two-click seat release (playtest-2 item 3)"
```

---

### Task 8: `liveStandings` lib (pure) + unit tests

**Files:**
- Create: `games/salary-showdown/app/src/lib/liveStandings.ts`
- Test: `games/salary-showdown/app/src/lib/liveStandings.test.ts` (new)

**Interfaces (Produces):** `liveStandings(final: StandingsRow[], games: GameResult[], applied: number, round: number): LiveRow[]` where `LiveRow = { teamId, name, wins, losses, pointDiff, pointsFor, rank, delta, movedNow }`; `delta` = baseRank − rank (positive = climbed since the round started), `null` in round 1; `movedNow` = rank changed when game `applied` landed. Task 9 consumes this plus `deltaGlyph`/`deltaClass` re-exported from `shuffle.ts`.

- [ ] **Step 1: Failing tests.** Create `liveStandings.test.ts`:

```ts
import { liveStandings } from './liveStandings';
import type { GameResult, StandingsRow } from '../types/models';

// Hand-built round: 3 teams, 2 games this round.
//   base (start of round): A 2-0 (+10, 100pf) · B 1-1 (+2, 90pf) · C 0-2 (-12, 80pf)
//   g1: B beats A 60-50  → A 2-1 (0, 150pf) · B 2-1 (+12, 150pf)
//   g2: C beats A 55-40  → A 2-2 (-15, 190pf) · C 1-2 (+3, 135pf)
// final: B 2-1 (+12) rank 1 · A 2-2 (-15) rank 2 · C 1-2 (+3) rank 3
//   (A over C on wins; B over A on pointDiff)
const FINAL: StandingsRow[] = [
  { teamId: 'B', name: 'Beta', wins: 2, losses: 1, pointDiff: 12, pointsFor: 150,
    tiebreakCoin: 0.2, rank: 1, previousRank: 2 },
  { teamId: 'A', name: 'Alpha', wins: 2, losses: 2, pointDiff: -15, pointsFor: 190,
    tiebreakCoin: 0.5, rank: 2, previousRank: 1 },
  { teamId: 'C', name: 'Gamma', wins: 1, losses: 2, pointDiff: 3, pointsFor: 135,
    tiebreakCoin: 0.9, rank: 3, previousRank: 3 },
];
const GAMES: GameResult[] = [
  { game_id: 'g1', home: 'B', away: 'A', homeScore: 60, awayScore: 50 },
  { game_id: 'g2', home: 'C', away: 'A', homeScore: 55, awayScore: 40 },
];

test('applied=0 reconstructs the round-start base by subtracting every game', () => {
  const rows = liveStandings(FINAL, GAMES, 0, 3);
  const a = rows.find((r) => r.teamId === 'A')!;
  expect([a.wins, a.losses, a.pointDiff, a.pointsFor]).toEqual([2, 0, 10, 100]);
  expect(rows.map((r) => r.teamId)).toEqual(['A', 'B', 'C']); // base ranks
  expect(rows.every((r) => r.delta === 0)).toBe(true);        // nothing moved yet
});

test('mid-flood: one applied game re-ranks live', () => {
  const rows = liveStandings(FINAL, GAMES, 1, 3);
  // after g1: A 2-1 (0) · B 2-1 (+12) · C 0-2 (-12) → B, A, C
  expect(rows.map((r) => r.teamId)).toEqual(['B', 'A', 'C']);
  const b = rows.find((r) => r.teamId === 'B')!;
  expect(b.delta).toBe(1);        // climbed from base rank 2 to 1
  expect(b.movedNow).toBe(true);  // moved on THIS game
});

test('fully applied matches the stored final ranks exactly (comparator parity)', () => {
  const rows = liveStandings(FINAL, GAMES, GAMES.length, 3);
  for (const r of rows) {
    expect(r.rank).toBe(FINAL.find((f) => f.teamId === r.teamId)!.rank);
  }
  expect(rows.map((r) => r.teamId)).toEqual(['B', 'A', 'C']);
});

test('round 1 has no meaningful base rank — delta is null', () => {
  const rows = liveStandings(FINAL, GAMES, 1, 1);
  expect(rows.every((r) => r.delta === null)).toBe(true);
});

test('ties fall through the full chain to tiebreakCoin ascending', () => {
  // Two teams identical on wins/pointDiff/pointsFor — coin decides, ASC.
  const final: StandingsRow[] = [
    { teamId: 'X', name: 'X', wins: 1, losses: 1, pointDiff: 0, pointsFor: 100,
      tiebreakCoin: 0.1, rank: 1, previousRank: null },
    { teamId: 'Y', name: 'Y', wins: 1, losses: 1, pointDiff: 0, pointsFor: 100,
      tiebreakCoin: 0.7, rank: 2, previousRank: null },
  ];
  const rows = liveStandings(final, [], 0, 2);
  expect(rows.map((r) => r.teamId)).toEqual(['X', 'Y']);
});
```

- [ ] **Step 2: Run — FAILS** (module missing): `npx vitest run src/lib/liveStandings.test.ts`
- [ ] **Step 3: Implement.** Create `liveStandings.ts`:

```ts
import type { GameResult, StandingsRow } from '../types/models';

// Live standings for the Simulate wall (playtest-2 item 4): rounds/{r} is
// server-final before the wall mounts (§3a gate), so this is pure client
// playback — reconstruct the ROUND-START base by subtracting every game's
// contribution from the stored final rows, then re-apply games one at a time
// in flood order. Facts only: rank, record, movement.
export interface LiveRow {
  teamId: string; name: string; wins: number; losses: number;
  pointDiff: number; pointsFor: number; tiebreakCoin: number; rank: number;
  delta: number | null;   // baseRank - rank (positive = climbed since round start); null in round 1
  movedNow: boolean;      // rank changed when the latest applied game landed
}

// Rank chain copied from backend sim.js — wins desc, pointDiff desc,
// pointsFor desc, then tiebreakCoin ASCENDING (the seeded per-round coin).
// Matching it exactly makes the fully-applied table agree with the stored
// standings the RESULTS shuffle later replays (unit-pinned below, and
// property-pinned against a real round doc in bigscreen.itest).
type Tally = Omit<LiveRow, 'rank' | 'delta' | 'movedNow'>;
const byRank = (a: Tally, b: Tally) =>
  b.wins - a.wins || b.pointDiff - a.pointDiff
  || b.pointsFor - a.pointsFor || a.tiebreakCoin - b.tiebreakCoin;

function rankOf(rows: Tally[]): Map<string, number> {
  return new Map([...rows].sort(byRank).map((r, i) => [r.teamId, i + 1]));
}

function apply(rows: Map<string, Tally>, g: GameResult, sign: 1 | -1): void {
  const home = rows.get(g.home); const away = rows.get(g.away);
  if (!home || !away) return; // defensive: unknown teamId contributes nothing
  const homeWon = g.homeScore > g.awayScore;
  home.wins += sign * (homeWon ? 1 : 0);
  home.losses += sign * (homeWon ? 0 : 1);
  home.pointDiff += sign * (g.homeScore - g.awayScore);
  home.pointsFor += sign * g.homeScore;
  away.wins += sign * (homeWon ? 0 : 1);
  away.losses += sign * (homeWon ? 1 : 0);
  away.pointDiff += sign * (g.awayScore - g.homeScore);
  away.pointsFor += sign * g.awayScore;
}

export function liveStandings(
  final: StandingsRow[], games: GameResult[], applied: number, round: number,
): LiveRow[] {
  const tally = new Map<string, Tally>(final.map((r) => [r.teamId, {
    teamId: r.teamId, name: r.name, wins: r.wins, losses: r.losses,
    pointDiff: r.pointDiff, pointsFor: r.pointsFor, tiebreakCoin: r.tiebreakCoin,
  }]));
  for (const g of games) apply(tally, g, -1);          // final -> round-start base
  const baseRank = rankOf([...tally.values()]);
  const n = Math.max(0, Math.min(applied, games.length));
  for (const g of games.slice(0, n - 1)) apply(tally, g, 1);
  const prevRank = rankOf([...tally.values()]);        // state before the latest game
  if (n > 0) apply(tally, games[n - 1], 1);
  const rows = [...tally.values()].sort(byRank);
  return rows.map((r, i) => ({
    ...r,
    rank: i + 1,
    delta: round === 1 ? null : (baseRank.get(r.teamId) ?? i + 1) - (i + 1),
    movedNow: n > 0 && (prevRank.get(r.teamId) ?? i + 1) !== i + 1,
  }));
}
```

- [ ] **Step 4: Green.** `npx vitest run src/lib/liveStandings.test.ts` (5 pass), full unit → **15 files / 78** (plan-time). `npx tsc -b` clean. (If `GameResult` in `types/models.ts` lacks exact field names used here, align to the model — it is `{ game_id, home, away, homeScore, awayScore }` per SCHEMA.)
- [ ] **Step 5: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/app/src/lib/liveStandings.ts games/salary-showdown/app/src/lib/liveStandings.test.ts && git commit -m "feat(salary-showdown): liveStandings — pure round-start reconstruction + progressive re-rank (playtest-2 item 4)"
```

---

### Task 9: Simulate wall — flood + live standings panel

**Files:**
- Modify: `games/salary-showdown/app/src/lib/shuffle.ts` (export the glyph helpers)
- Modify: `games/salary-showdown/app/src/components/bigscreen/StandingsShuffle.tsx` (import them)
- Modify: `games/salary-showdown/app/src/components/bigscreen/SimulateFlood.tsx`
- Modify: `games/salary-showdown/app/src/styles/bigscreen.css`
- Test: `games/salary-showdown/app/src/itest/bigscreen.itest.tsx` (extend the SIMULATE test)

**Interfaces (Consumes):** `liveStandings` (Task 8). The RESULTS `StandingsShuffle` behavior is UNCHANGED (adjudicated: the shuffle stays).

- [ ] **Step 1: Move the glyph helpers.** In `shuffle.ts`, append (exported, same bodies):

```ts
// Movement markers are GLYPHS + plain text, never emojis: ▲ climbed, ▼ fell,
// — held, NEW when there is no prior rank. Shared by the RESULTS shuffle and
// the SIMULATE live panel (playtest-2 item 4).
export function deltaGlyph(delta: number | null): string {
  if (delta === null) return 'NEW';
  if (delta > 0) return `▲ ${delta}`;
  if (delta < 0) return `▼ ${-delta}`;
  return '—';
}
export function deltaClass(delta: number | null): string {
  if (delta === null) return 'bs-delta mono';
  if (delta > 0) return 'bs-delta mono ok';
  if (delta < 0) return 'bs-delta mono neg';
  return 'bs-delta mono dim';
}
```

In `StandingsShuffle.tsx`: delete its local `deltaGlyph`/`deltaClass` function definitions (and their comment block) and extend the import:
```tsx
import { computeShuffleSteps, deltaClass, deltaGlyph, type ShuffleStep } from '../../lib/shuffle';
```
Run `npx vitest run src/lib/shuffle.test.ts` + `npx tsc -b` — no behavior change.

- [ ] **Step 2: Extend the bigscreen itest (red).** In `bigscreen.itest.tsx`, in the test that asserts `getAllByTestId('bs-scorecard')).toHaveLength(6)`, immediately after that assertion insert:

```tsx
    // Playtest-2 item 4: the live standings panel re-ranks with the flood and,
    // once every game has landed, agrees with the stored final standings
    // exactly (comparator parity with backend sim.js — the property pin).
    const stored = (await adminDb().doc(
      `games/${seeded.gameId}/rounds/1`).get()).data()!;
    const finalOrder = [...stored.standings]
      .sort((a: { rank: number }, b: { rank: number }) => a.rank - b.rank)
      .map((r: { name: string }) => r.name);
    await waitFor(() => {
      const rows = screen.getAllByTestId('bs-live-row');
      expect(rows.map((r) => r.querySelector('.bs-live-name')!.textContent)).toEqual(finalOrder);
    }, { timeout: 20000 });
```

(Adapt the seeded-game variable name to what that test actually uses — read the test first; if it reads the round doc already, reuse its variable.)

- [ ] **Step 3: Run — FAILS** at `getAllByTestId('bs-live-row')`.
- [ ] **Step 4: Implement SimulateFlood.** Replace the component's return block (keep the header + pacing effect intact) so the body becomes:

```tsx
  if (!game) return null;
  const done = total > 0 && shown >= total;
  const live = liveStandings(round?.standings ?? [], games, shown, game.round);
  return (
    <main className="bigscreen">
      <header>
        <div className="brand bs-brand">Salary Showdown</div>
        <h1 className="bs-phase-title">{PHASE_NAMES.SIMULATE}</h1>
        <p className="bs-sub">Round {game.round}</p>
      </header>
      {total === 0 && <p className="bs-sub">Crunching the round…</p>}
      <div className="bs-sim-split">
        <div className="bs-flood">
          {games.slice(0, shown).map((g) => (
            <div key={g.game_id} className="bs-scorecard mono" data-testid="bs-scorecard">
              <span className="bs-score-team">{teams.get(g.home)?.name ?? '—'}</span>
              <span className={g.homeScore > g.awayScore ? 'bs-score-num ok' : 'bs-score-num'}>
                {g.homeScore}
              </span>
              <span className="dim">–</span>
              <span className={g.awayScore > g.homeScore ? 'bs-score-num ok' : 'bs-score-num'}>
                {g.awayScore}
              </span>
              <span className="bs-score-team away">{teams.get(g.away)?.name ?? '—'}</span>
            </div>
          ))}
        </div>
        {/* Playtest-2 item 4: standings re-rank live as each score lands —
            same shown counter as the flood, so a card and its table movement
            arrive together. Facts only: rank, name, record, movement vs the
            round start. The RESULTS shuffle is unchanged; this previews it. */}
        {total > 0 && (
          <aside className="bs-live-standings" data-testid="bs-live-standings">
            <div className="bs-sub" style={{ marginBottom: 6 }}>Standings</div>
            {live.map((r) => (
              <div key={r.teamId} data-testid="bs-live-row"
                className={`bs-live-row mono${r.movedNow ? ' bs-live-moved' : ''}`}>
                <span className="bs-live-rank">{r.rank}</span>
                <span className="bs-live-name">{r.name}</span>
                <span className="bs-live-rec">{r.wins}-{r.losses}</span>
                <span className={deltaClass(r.delta)}>{deltaGlyph(r.delta)}</span>
              </div>
            ))}
          </aside>
        )}
      </div>
      {done && <p className="bs-sub ok" role="status">Round complete.</p>}
    </main>
  );
```

with the imports line extended to:
```tsx
import { useEffect, useState } from 'react';
import { useProfessor } from '../../contexts/ProfessorContext';
import { PHASE_NAMES } from '../../lib/phaseNames';
import { liveStandings } from '../../lib/liveStandings';
import { deltaClass, deltaGlyph } from '../../lib/shuffle';
```

- [ ] **Step 5: CSS.** Append to `styles/bigscreen.css`:

```css
/* Simulate wall split: score flood left, live standings right (playtest-2). */
.bs-sim-split { display: flex; gap: 28px; align-items: flex-start; }
.bs-sim-split .bs-flood { flex: 1; }
.bs-live-standings { width: 360px; flex-shrink: 0; }
.bs-live-row {
  display: flex; gap: 12px; align-items: baseline;
  padding: 4px 10px; border-radius: 6px; font-size: 22px;
  transition: background 0.6s ease;
}
.bs-live-moved { background: rgba(212, 175, 55, 0.18); }
.bs-live-rank { width: 30px; text-align: right; }
.bs-live-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bs-live-rec { width: 56px; text-align: right; }
```

- [ ] **Step 6: Green.** `npx vitest run -c vitest.integration.config.ts src/itest/bigscreen.itest.tsx` (all green incl. the parity pin); `npx vitest run` (unit unchanged); `npx tsc -b`; `npm run audit:ui`.
- [ ] **Step 7: Commit**

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add games/salary-showdown/app/src/lib/shuffle.ts games/salary-showdown/app/src/components/bigscreen/StandingsShuffle.tsx games/salary-showdown/app/src/components/bigscreen/SimulateFlood.tsx games/salary-showdown/app/src/styles/bigscreen.css games/salary-showdown/app/src/itest/bigscreen.itest.tsx && git commit -m "feat(salary-showdown): Simulate wall — live standings re-rank beside the score flood (playtest-2 item 4)"
```

---

### Task 10: Docs + exit battery + browser checks + finish

**Files:**
- Modify: `docs/superpowers/salary-showdown-RUNBOOK.md`
- Modify: `docs/superpowers/salary-showdown-HANDOFF.md` (§10 frozen contracts)
- Modify: `games/salary-showdown/backend/SCHEMA.md` (players note)

- [ ] **Step 1: RUNBOOK.** Three edits:

(a) Replace exactly:
```
2. Under **New session**, enter team names, one per line, then press **Create game**.
   Hard cap: **21 franchises** — beyond that the per-round data document approaches
   Firestore's 1 MiB limit. The panel blocks 22+ with: "Cap sessions at 21 franchises —
   the round document approaches Firestore's 1 MiB limit beyond that."
```
with:
```
2. Under **New session**, enter HOW MANY franchises are playing, then press
   **Create game**. Teams arrive as Franchise 1..N — students name their own
   franchises from their lobby screens; names lock when you press Start
   season. Hard cap: **21 franchises** — beyond that the per-round data
   document approaches Firestore's 1 MiB limit. The panel blocks 22+ with:
   "Cap sessions at 21 franchises — the round document approaches Firestore's
   1 MiB limit beyond that."
```

(b) Replace exactly:
```
| Simulate | Watch the wall — scoreboard flood plays out | 1:00 | Nothing; advance when "Round complete." shows |
```
with:
```
| Simulate | Watch the wall — scores flood in and the standings re-rank live; laptops show each team its own results | 1:00 | Nothing; advance when "Round complete." shows |
```

(c) In the "If something breaks" table, insert a new row immediately after the "Wrong game loaded / dead session on the panel" row:
```
| A player left and their empty seat blocks the team | Release the seat from the panel's **Seats** card — teammates can then act for that role. (Teammates can already act for any seat that was never claimed.) |
```

- [ ] **Step 2: HANDOFF §10.** Replace exactly:
```
`createGame({teamNames})` · `getLobby({joinCode})` · `joinGame({joinCode, teamId, role, displayName})` ·
```
with:
```
`createGame({teamNames} | {teamCount})` · `getLobby({joinCode})` · `joinGame({joinCode, teamId, role, displayName})` ·
`renameTeam({gameId, name})` (member, lobby-only, own team) · `releaseSeat({gameId, teamId, role})` (professor-only) ·
```
and immediately after the error-codes paragraph in §10, add one line:
```
**Role gates (2026-08-15, adjudicated):** `signPlayer`/`cutRosterPlayer`/`markDone` (GM), `submitBids` (Scout), `submitLineup` (Coach) now fall back to ANY member of the team when no member holds the required role — a CLAIMED seat stays authoritative. `releaseSeat` frees a claimed seat.
```

- [ ] **Step 3: SCHEMA.md.** Replace exactly:
```
games/{gameId}/players/{uid}          # membership: { teamId, role: GM|Scout|Coach, displayName }
```
with:
```
games/{gameId}/players/{uid}          # membership: { teamId, role: GM|Scout|Coach, displayName }
                                      # releaseSeat (professor-only callable) may DELETE a claimed
                                      # seat; role-gated callables fall back to any team member
                                      # when no member holds the required role (2026-08-15).
```

- [ ] **Step 4: Exit battery** (fresh emulators): backend **26/178** · unit **15/78** · integration **21/37** (19/34 +T6 +T7 — plan-time figures; use Task 0's recorded baseline deltas) · `tsc -b` clean · `audit:ui` (record count). Commit the docs:

```bash
cd /Users/dylanmassaro/FenriX && git rev-parse HEAD && git add docs/superpowers/salary-showdown-RUNBOOK.md docs/superpowers/salary-showdown-HANDOFF.md games/salary-showdown/backend/SCHEMA.md && git commit -m "docs(salary-showdown): count-first create, seat release, live simulate standings (playtest-2)"
```

- [ ] **Step 5: Browser checks (controller, preview pane, dev server 5176):**
  1. Panel count-first: create with `3` → Franchise 1..3 chips; `22` → exact CAP_COPY.
  2. Lobby rename: join a franchise → rename → panel chips + lobby cards follow live.
  3. Roster panel: seed R1:FREE_AGENCY, join Alpha GM, sign someone → chip appears with rate × yrs.
  4. Fallback: same game, GM opens /game/auction (after advance) or /game/lineup → fallback notice + working submit.
  5. Seats: panel Release on a claimed seat → released browser falls to the join screen; seat re-claimable; re-claim re-asserts the role.
  6. Simulate wall: drive a panel-created game to SIMULATE → flood left, standings re-ranking right, "Round complete.", RESULTS shuffle unchanged after advance.
- [ ] **Step 6:** Ledger one-liner to `.superpowers/sdd/progress.md` (battery figures + browser checks), then `superpowers:finishing-a-development-branch` (merge is Dylan's call; if the chip branches landed on main mid-run, rebase/merge main into the branch and re-run the battery before presenting the menu).

---

## Out of scope

- Item 5 laptop half (own results during Simulate) — already shipped in SimulatePage; untouched.
- Any RESULTS StandingsShuffle change — adjudicated: stays as-is.
- Uniqueness enforcement or profanity filtering on team names (24-char cap only, same trust level as display names — classroom setting).
- The two running chip fixes (Standings W/$ '—', Coach remount) — separate sessions own them.

## Self-review notes (applied)

- `createGame({teamNames})` path byte-unchanged → seed/harness/CLI/prod-smoke/tests unaffected; count path reuses the same validation line so `teamCount: 1` throws the existing message.
- `renameTeam` derives teamId from the caller's membership — rivals untargetable by construction; test pins it.
- `memberWithRole` fallback: claimed-seat check runs only on role mismatch → zero extra reads on the happy path; `releaseSeat` + fallback arc tested in one test to pin the interaction.
- `actsAs` ≡ old behavior for fully-seated teams (all existing role-copy itests are the regression guard).
- `liveStandings` comparator copied from sim.js verbatim (tiebreakCoin ASC) and property-pinned against a real round doc in bigscreen.itest; base reconstruction is sign-symmetric (`apply(…, -1)`/`(…, +1)`), so base+all games ≡ final by construction.
- SeatPanel reads names only — sealed-bid privacy untouched; SubmissionGrid untouched.
- All new copy emoji-free; movement markers reuse the sanctioned ▲▼— glyphs; live panel shows no derived metrics.
