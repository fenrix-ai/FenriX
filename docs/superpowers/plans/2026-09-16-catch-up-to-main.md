# Catch-Up to Main Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land every stranded piece of work so that `main`, production, and the repo are a clean baseline for UI work on Salary Showdown.

**Architecture:** Seven independent tasks, one session each; no task depends on another unless its header says so. Tasks 1–2 are code with tests, Task 3 produces a plan document, Tasks 4–6 are review and repo hygiene, Task 7 lists the actions only Dylan can run (merges, deploys). Appendix A is the UI starting point.

**Tech Stack:** Salary Showdown — React + Vite + vitest (unit and `.itest.tsx` integration suites) + Firebase (Firestore, Functions, Auth emulators; project `salary-showdown-dev` locally, `salary-showdown` in prod). Bakery Bash — React + Vite + vitest + Firebase (`bakery-bash-54d12`). quant_finance — Python notebooks and scripts.

**Spec:** No single spec. Sources of truth: `docs/superpowers/salary-showdown-HANDOFF.md` (state, hard rules §6), `docs/superpowers/salary-showdown-RUNBOOK.md`, the local ledger `.superpowers/sdd/progress.md` (gitignored; entries dated 2026-07-26 → 2026-09-16), and `docs/superpowers/specs/2026-08-16-gcp-games-platform-design.md` (Task 3).

**State at plan time (2026-09-16):** `main` = `origin/main` @ `eeac5cf`. Salary Showdown battery on that tree: backend 27 files / 191 tests, app unit 15 / 81, app integration 20 / 38, `tsc -b` clean, `audit:ui` clean (66 files). Production hosting still serves `index-DK89VFRi.js` built @ `1cd8e8a`; bundle `index-CfTQjkxR.js` (built from `eeac5cf`) is staged in `games/salary-showdown/backend/dist` awaiting Task 7.

## Global Constraints

- Each task runs in its own session and therefore its own git worktree. Build every path from the worktree root. The only path that may point at the main checkout is a `node_modules` symlink or the copies named in a task (`/Users/dylanmassaro/FenriX/...` otherwise hits another session's dirty tree).
- Worktrees start without `node_modules`: run `npm ci` in the package directory, or `ln -s /Users/dylanmassaro/FenriX/games/<game>/app/node_modules <worktree>/games/<game>/app/node_modules` (and the same for `games/salary-showdown/backend/functions/node_modules`).
- Bakery Bash unit tests need the gitignored `games/bakery-bash/app/.env.local`; copy it from the main checkout into the worktree first, or `GameContext.test.ts` and `BakeryView.test.tsx` fail with `auth/invalid-api-key`.
- Never stage pre-existing dirt from the main checkout: `quant_finance/README.md` (Task 5 owns it), the untracked `games/bakery-bash/` scripts, csv and md files, `image (2).png`, `_playtest-cli.mjs`, `_seed-demo-patched.mjs`, `games/salary-showdown/backend/functions/scripts/`.
- Salary Showdown hard rules (HANDOFF §6) apply unchanged: server-authoritative state, rows keep the server's rank order, no emoji in UI copy, no `config.timers`, no judgment language (`npm run audit:ui` enforces the last three).
- Merging to `main`, pushing `main`, and every deploy are Dylan's. A task ends by handing the exact command in a `bash` block, never by running it.
- Commit subjects use `type(scope): subject`. End every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Salary Showdown emulator ports: Functions 5101, Firestore 8180, Auth 9199, UI 4100. Java 21 resolves from `/usr/bin/java`. A long-lived emulator degrades; restart it before any run you intend to trust.

---

### Task 1: Salary Showdown — a released student is routed home

A professor's seat release (`releaseSeat`) deletes `games/{gameId}/players/{uid}`. Firestore rules then revoke that client's reads, every game screen renders `null`, and the student stares at a blank page until they manually reopen the site root (RUNBOOK row "A player left and their empty seat blocks the team"). `PhaseRouter` only routes members, so it does nothing. Fix: when a client goes from member to non-member while `ss.gameId` is still set, forget the game and route to `/`, where `LandingPage` shows the join-code form.

**Files:**
- Modify: `games/salary-showdown/app/src/components/PhaseRouter.tsx` (whole file is 26 lines)
- Create: `games/salary-showdown/app/src/itest/released.itest.tsx`
- Modify: `docs/superpowers/salary-showdown-RUNBOOK.md:73`
- Modify: `games/salary-showdown/backend/functions/src/game.js:228-234` (comment only)

**Interfaces:**
- Consumes: `useGame()` from `../contexts/GameContext` — `gameId: string | null`, `setGameId(id: string | null)` (writes/removes `localStorage['ss.gameId']` and bumps the resubscribe epoch), `game: GameDoc | null`, `membership: Membership | null`.
- Consumes (test): `seedToPhase({ to: 'LOBBY' })` from `./harness` → `{ gameId, joinCode, teamIds }`; `adminDb()` → admin Firestore; `auth`, `functions` from `../lib/firebase`.
- Produces: nothing new; the behaviour is internal to `PhaseRouter`.

- [ ] **Step 1: Boot the emulators**

Run (background, from the worktree): `cd games/salary-showdown/backend/functions && npm run emu`
Wait until `lsof -nP -iTCP:5101 -iTCP:8180 -iTCP:9199 -sTCP:LISTEN | grep -c LISTEN` prints `3`.

- [ ] **Step 2: Write the failing integration test**

Create `games/salary-showdown/app/src/itest/released.itest.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { adminDb, seedToPhase } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

beforeEach(() => localStorage.clear());

// releaseSeat's only write is deleting players/{uid}; rules then revoke the
// client's reads. Before this fix the released student's screen went blank
// (RUNBOOK "player left" row). Now PhaseRouter notices the member→non-member
// flip, forgets ss.gameId and routes home, where the join form is the only
// path forward.
test('released student: the client routes to / and forgets ss.gameId', async () => {
  const seeded = await seedToPhase({ to: 'LOBBY' });
  await signInAnonymously(auth);
  await waitFor(() => expect(auth.currentUser).toBeTruthy(), { timeout: 15000 });
  await httpsCallable(functions, 'joinGame')({
    joinCode: seeded.joinCode, teamId: seeded.teamIds[0], role: 'Scout', displayName: 'Leaver',
  });
  localStorage.setItem('ss.gameId', seeded.gameId);
  render(<MemoryRouter initialEntries={['/lobby']}><App /></MemoryRouter>);
  await screen.findByText(/Scout: Leaver/, {}, { timeout: 20000 }); // member view is up

  // Mirror releaseSeat's single write from the admin side (the callable is
  // professor-gated; the rendered client here is the student).
  await adminDb().doc(`games/${seeded.gameId}/players/${auth.currentUser!.uid}`).delete();

  await waitFor(() => expect(localStorage.getItem('ss.gameId')).toBeNull(), { timeout: 15000 });
  await screen.findByText(/Enter the join code on the projector/, {}, { timeout: 15000 });
}, 120000);
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/released.itest.tsx`
Expected: FAIL — the `waitFor` on `ss.gameId` times out (the key is still set) and the join-code copy never appears; the lobby just renders nothing.

- [ ] **Step 4: Implement the redirect in PhaseRouter**

Replace the contents of `games/salary-showdown/app/src/components/PhaseRouter.tsx` with:

```tsx
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGame } from '../contexts/GameContext';
import type { Phase } from '../types/models';

const ROUTE: Record<Phase, string> = {
  LOBBY: '/lobby', FRONT_OFFICE: '/game/office', FREE_AGENCY: '/game/market',
  AUCTION: '/game/auction', LINEUP: '/game/lineup', SIMULATE: '/game/simulate',
  RESULTS: '/game/results', FINALE: '/game/conclusion',
};

// The professor's advancePhase is the game's only clock; this component makes
// every team screen follow it. /standings is exempt — it is "always accessible"
// (spec §11.9): navigation TO it is manual, and we do not yank the user off it.
export function PhaseRouter() {
  const { gameId, setGameId, game, membership } = useGame();
  const nav = useNavigate();
  const { pathname } = useLocation();

  // A seat release (releaseSeat deletes players/{uid}) turns a member into a
  // non-member while ss.gameId is still set; every game screen then renders
  // null. Send that client home and forget the game — re-joining is the only
  // recovery (RUNBOOK "player left" row). Pre-membership visitors never trip
  // this: the ref only arms once a membership has been seen, and a deliberate
  // setGameId(null) elsewhere clears gameId before membership follows.
  const wasMember = useRef(false);
  useEffect(() => {
    if (membership) { wasMember.current = true; return; }
    if (wasMember.current && gameId) {
      wasMember.current = false;
      setGameId(null);
      nav('/', { replace: true });
    }
  }, [membership, gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!game || !membership) return;
    if (pathname === '/standings') return;
    const want = ROUTE[game.phase];
    if (want && pathname !== want) nav(want, { replace: true });
  }, [game?.phase, membership, pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
```

- [ ] **Step 5: Run the new test again**

Run: `cd games/salary-showdown/app && npx vitest run -c vitest.integration.config.ts src/itest/released.itest.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full battery (restart the emulator first if it has been up more than an hour)**

Run, all from `games/salary-showdown/app`:
- `npx vitest run` → expected `Test Files 15 passed`, `Tests 81 passed`
- `npx vitest run -c vitest.integration.config.ts` → expected `Test Files 21 passed`, `Tests 39 passed`
- `npx tsc -b` → no output, exit 0
- `npm run audit:ui` → `audit:ui clean — 66 files scanned` (`.itest.` files are excluded from the count)

One transient integration failure on a long-uptime emulator is a known fatigue pattern; restart the emulator and re-run before investigating.

- [ ] **Step 7: Update the two places that document the blank screen**

In `docs/superpowers/salary-showdown-RUNBOOK.md` line 73, replace
`The released student's screen goes blank — have them reopen the join link and reclaim a seat.`
with
`The released student is sent back to the join screen automatically — they re-enter the join code and claim a seat again.`

In `games/salary-showdown/backend/functions/src/game.js` replace the comment lines
```
// membership doc revokes the client's reads — their screens go BLANK until
// they reopen the site root and reclaim a seat (PhaseRouter only routes
// members; auto-routing the released client home is a follow-up) — and the
```
with
```
// membership doc revokes the client's reads — PhaseRouter sees the
// member→non-member flip, forgets ss.gameId and routes them to / to rejoin — and the
```
This is comment-only; no functions deploy is needed for it.

- [ ] **Step 8: Commit**

```bash
git add games/salary-showdown/app/src/components/PhaseRouter.tsx games/salary-showdown/app/src/itest/released.itest.tsx docs/superpowers/salary-showdown-RUNBOOK.md games/salary-showdown/backend/functions/src/game.js
git commit -m "fix(salary-showdown): released student routes home — PhaseRouter forgets ss.gameId on the member→non-member flip

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Then hand Dylan: `git push origin <branch>` + a PR, or a fast-forward onto `main`, plus the hosting redeploy from Task 7 step 2 (a new bundle is required for this change to reach students). Add the new integration count (21 / 39) to HANDOFF §2.

---

### Task 2: Bakery Bash — scene-layer position tests follow the 1.5× sprite scale

Two tests have failed since `8be1f9b` (PR #220, "scene sizing") introduced `const scale = 1.5` in `CatLayer.tsx:10` and `ChefLayer.tsx:25`; the wrappers are placed at `x - Math.floor(width * 1.5 / 2)` but the tests still assume scale 1. Nothing is wrong with the components.

**Files:**
- Modify: `games/bakery-bash/app/src/components/bakery-scene/CatLayer.test.tsx:18`
- Modify: `games/bakery-bash/app/src/components/bakery-scene/ChefLayer.test.tsx:21-22`

- [ ] **Step 1: Set up the worktree for Bakery Bash tests**

```bash
cp /Users/dylanmassaro/FenriX/games/bakery-bash/app/.env.local games/bakery-bash/app/.env.local
ln -s /Users/dylanmassaro/FenriX/games/bakery-bash/app/node_modules games/bakery-bash/app/node_modules
```

- [ ] **Step 2: Reproduce the two failures**

Run: `cd games/bakery-bash/app && npx vitest run src/components/bakery-scene/CatLayer.test.tsx src/components/bakery-scene/ChefLayer.test.tsx`
Expected: 2 failures — `expected '85px' to be '90px'` and `expected '72px' to be '78px'`.

- [ ] **Step 3: Fix the expectations**

`CatLayer.test.tsx` line 18, replace
```ts
    expect(wrapper.style.left).toBe('90px') // 100 - halfW(10)
```
with
```ts
    expect(wrapper.style.left).toBe('85px') // 100 - halfW: floor(20 * 1.5 / 2) = 15
```

`ChefLayer.test.tsx` lines 21–22, replace
```ts
    // chef[0] at x=90, sprite width 24 → left = 90 - 12 = 78
    expect(wrappers[0].style.left).toBe('78px')
```
with
```ts
    // chef[0] at x=90, sprite width 24 × scale 1.5 = 36 → halfW 18 → left = 90 - 18 = 72
    expect(wrappers[0].style.left).toBe('72px')
```

- [ ] **Step 4: Run the two tests, then the whole suite**

Run: `cd games/bakery-bash/app && npx vitest run src/components/bakery-scene/CatLayer.test.tsx src/components/bakery-scene/ChefLayer.test.tsx`
Expected: both pass.
Run: `npx vitest run`
Expected: `Test Files 22 passed`, `Tests 100 passed`.

- [ ] **Step 5: Commit**

```bash
git add games/bakery-bash/app/src/components/bakery-scene/CatLayer.test.tsx games/bakery-bash/app/src/components/bakery-scene/ChefLayer.test.tsx
git commit -m "test(bakery-bash): scene layer position tests follow the 1.5x sprite scale from #220

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Hand Dylan the push + PR (or fast-forward) command.

---

### Task 3: GCP games platform — write the Phase 0 + Phase 1 implementation plan

The spec `docs/superpowers/specs/2026-08-16-gcp-games-platform-design.md` is "Approved design, pending implementation plan" (owner: Kavin, infra). This task produces that plan and no code.

**Files:**
- Create: `docs/superpowers/plans/<today>-gcp-platform-baseline.md`

- [ ] **Step 1: Read the spec end to end** (§1–§16, ~420 lines). Note §15 phasing: Phase 0 = provisioning (billing + project + Terraform, blocked on a billing account), Phase 1 = platform baseline (CI/CD workflows, `hub`, `agent-players` heuristic, `cloudrun-game-starter` template, docs), exit criterion = the smoke test plays an agents-only game on staging from a template-generated demo game and promote-to-prod works. Phases 2–3 (first new game, Salary Showdown port) get their own specs and are out of scope here.

- [ ] **Step 2: Resolve the §16 open decisions with Dylan** using `superpowers:brainstorming` and `AskUserQuestion`, one question per decision:
  1. Agent brain for the baseline — heuristic ships regardless; confirm whether the plan should stub an LLM-API adapter now or leave it to Phase 2.
  2. Hub domain — confirm `run.app` URLs for Phase 1.
  3. Monthly budget — spec proposes $50; confirm the figure and the alert email.
  4. Who runs Phase 0 (Kavin owns infra; Dylan provides the billing account) and whether the plan should include the Terraform files or only their layout.

- [ ] **Step 3: Write the plan with `superpowers:writing-plans`** — tasks for Phase 0 and Phase 1 only, each with files, exact commands, tests (the spec's §12 testing strategy), and the §15 exit criterion as the final task. Follow §13 repo layout changes verbatim.

- [ ] **Step 4: Self-review against the spec** (coverage of §4–§13 for Phase 1, no placeholders, consistent names) and commit:

```bash
git add docs/superpowers/plans/<today>-gcp-platform-baseline.md
git commit -m "docs(platform): gcp platform baseline (phase 0-1) implementation plan

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Hand Dylan the push + PR command.

---

### Task 4: quant_finance — review PRs #230 and #231, retire #229

Facts established 2026-09-16: `origin/quant-finance-benchmark` (#229) is an ancestor of `origin/quant-finance-results` (#230), so #230 supersedes #229. `origin/analytics-backtest` (#231) is a separate branch that adds only `quant_finance/notebooks/02_llm_strategy_backtest.ipynb` and a README change. All three are `MERGEABLE`, blocked only on review. All are Kavin's; none has CI (the repo has no `.github/workflows`).

**Files:** none modified in the repo; the deliverables are two reviews and three commands for Dylan.

- [ ] **Step 1: Fetch and diff #230**

```bash
git fetch origin quant-finance-results analytics-backtest
git diff --stat origin/main...origin/quant-finance-results | tail -3
```
Expected: ~61 files, ~5.6k additions, all under `quant_finance/` plus `.gitignore`.

- [ ] **Step 2: Review #230 with the `code-review` skill** at medium effort on `origin/main...origin/quant-finance-results`. In addition, run these checks and record the output:

```bash
git diff origin/main...origin/quant-finance-results --name-only | xargs -I{} sh -c 'git cat-file -s origin/quant-finance-results:{} 2>/dev/null | awk -v f={} "\$1 > 5000000 {print f, \$1}"'
git grep -nE 'sk-[A-Za-z0-9]{20,}|api[_-]?key\s*[:=]|ghp_[A-Za-z0-9]{20,}|BEGIN (RSA|OPENSSH) PRIVATE KEY' origin/quant-finance-results -- quant_finance || echo "no secrets"
```
Expected: no file over 5 MB, `no secrets`.

- [ ] **Step 3: Review #231 the same way** on `origin/main...origin/analytics-backtest`, plus a three-way check that its `quant_finance/README.md` edit does not conflict with #230's (`git merge-tree --write-tree origin/quant-finance-results origin/analytics-backtest` must print a tree hash and no `CONFLICT` line).

- [ ] **Step 4: Report** findings in chat, ranked. If Dylan wants them on GitHub, post with `gh pr review <n> --comment --body-file <file>` (ask first; posting is outward-facing). End with:

```bash
gh pr merge 230 --merge --admin
gh pr merge 231 --merge --admin
gh pr close 229 --comment "Superseded by #230 (this branch is an ancestor of it)."
```

---

### Task 5: quant_finance — commit `local_llm/` as a pull request

Dylan's uncommitted local-LLM filing-QA benchmark (`quant_finance/local_llm/`, files dated 2026-07-01/02) is a different experiment from Kavin's PRs (8 tickers AAPL/FDX/GIS/GM/JNJ/KO/MSFT/WMT on qwen3:4b, gemma3:4b, llama3.2:3b via ollama, vs Kavin's 8 other companies on 7 models). Its own `.gitignore` excludes `data/facts/`, `data/filings/*.txt`, `.venv/`, `__pycache__/`; what remains is 19 files, ~244 KB. `quant_finance/README.md` in the main checkout already carries the one-line pointer (uncommitted).

**Files:**
- Create: everything `git ls-files --others --exclude-standard quant_finance/local_llm` lists (19 files)
- Modify: `quant_finance/README.md` (+3 lines)

- [ ] **Step 1: Copy the work into the worktree** (the worktree does not see the main checkout's untracked files):

```bash
mkdir -p quant_finance/local_llm
rsync -a --exclude .venv --exclude __pycache__ --exclude 'data/facts' --exclude 'data/filings/*.txt' /Users/dylanmassaro/FenriX/quant_finance/local_llm/ quant_finance/local_llm/
git -C /Users/dylanmassaro/FenriX diff quant_finance/README.md | git apply
```

- [ ] **Step 2: Verify exactly the intended set is staged**

```bash
git add quant_finance/local_llm quant_finance/README.md
git diff --cached --stat | tail -1
git diff --cached --name-only | wc -l
git diff --cached | grep -nE 'sk-[A-Za-z0-9]{20,}|api[_-]?key\s*[:=]|ghp_[A-Za-z0-9]{20,}' || echo "no secrets"
```
Expected: 20 files (19 + README), well under 1 MB total, `no secrets`. If `data/facts` or any `.txt` filing appears, the rsync excludes were wrong — unstage and fix.

- [ ] **Step 3: Commit on a branch and hand over the PR**

```bash
git checkout -b quant-finance-local-llm
git commit -m "feat(quant_finance): local-LLM filing-QA benchmark + analytics pipeline (local_llm/)

qwen3:4b 76%, gemma3:4b 73%, llama3.2:3b 69% on 59 XBRL-checked questions
over 8 filings; fetch_filings.py regenerates the ignored data/ inputs.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Then ask Dylan before pushing and opening the PR (`git push -u origin quant-finance-local-llm && gh pr create --fill`). If Task 4's merges land first, rebase onto `main` so the README lines stack.

---

### Task 6: Repo hygiene — prune stale local branches and worktrees

Facts established 2026-09-16: 33 registered worktrees (28 under `.worktrees/` from April Bakery Bash work, 4 under `.claude/worktrees/`), ~130 local branches. Most April `feat/*`, `fix/*`, `perf/*`, `chore/*` branches were squash-merged (git reports them unmerged, GitHub reports their PR `MERGED`). `pr-*` and `pr[0-9]*` branches are review checkouts. `claude/upbeat-almeida-f07a76` is superseded by `756d3db`. `fix/lineup-coach-mount-seed-locked` and `claude/youthful-carson-00f0d5` were cherry-picked onto `main` as `e930761` and `eeac5cf`. Other sessions may be live in `.claude/worktrees/*`.

**Files:** none; this task changes refs and worktrees only. Run it from the main checkout's perspective using `git -C /Users/dylanmassaro/FenriX` for every command (branches live in one repo; the session's own worktree is irrelevant here).

- [ ] **Step 1: Classify every local branch (dry run, prints a table, deletes nothing)**

```bash
cd /Users/dylanmassaro/FenriX && git fetch --prune origin
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/ | grep -v '^main$'); do
  up=$(git rev-parse --abbrev-ref "$b@{upstream}" 2>/dev/null || echo "-")
  gone=$(git branch -vv --list "$b" | grep -c ': gone\]')
  merged=$(git branch --merged origin/main --list "$b" | grep -c .)
  pr=$(gh pr list --head "$b" --state all --json number,state --jq '.[0] | "\(.number):\(.state)"' 2>/dev/null)
  ahead=$(git rev-list --count origin/main.."$b")
  printf '%-50s up=%-40s gone=%s merged=%s ahead=%-3s pr=%s\n' "$b" "$up" "$gone" "$merged" "$ahead" "${pr:-none}"
done | tee /tmp/branch-table.txt
```

Categories: DELETE if `merged=1`, or `gone=1`, or `pr=<n>:MERGED`/`CLOSED`, or the name matches `^pr-?[0-9]`, or it is `claude/upbeat-almeida-f07a76`, `fix/lineup-coach-mount-seed-locked`, `claude/youthful-carson-00f0d5`. KEEP if `pr=<n>:OPEN`. LIST FOR DYLAN (keep) if `ahead>0` with no PR and none of the delete conditions.

- [ ] **Step 2: Classify worktrees (dry run)**

```bash
cd /Users/dylanmassaro/FenriX && git worktree list --porcelain | awk '/^worktree /{print $2}' | grep -v '^/Users/dylanmassaro/FenriX$' | while read -r wt; do
  br=$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null)
  dirty=$(git -C "$wt" status --porcelain 2>/dev/null | grep -c .)
  age_h=$(( ( $(date +%s) - $(stat -f %m "$wt") ) / 3600 ))
  printf '%-75s branch=%-45s dirty=%-3s age_h=%s\n' "$wt" "$br" "$dirty" "$age_h"
done | tee /tmp/worktree-table.txt
```
REMOVE a worktree only if `dirty=0`, `age_h>=24`, and its branch is in the DELETE category (or detached). Anything dirty or touched in the last 24 h may be a live session: skip and list it.

- [ ] **Step 3: Show Dylan both tables and the proposed delete lists, and wait for a yes.** Deleting branches with unique commits is irreversible in practice.

- [ ] **Step 4: Execute**

```bash
# worktrees first (a checked-out branch cannot be deleted)
git -C /Users/dylanmassaro/FenriX worktree remove "<path>"          # per REMOVE row
git -C /Users/dylanmassaro/FenriX worktree prune
git -C /Users/dylanmassaro/FenriX branch -D <branch>                # per DELETE row
```
Never delete remote branches (`origin/*`, `scott-fork/*`) — that is Dylan's call on GitHub.

- [ ] **Step 5: Report** counts before/after (`git worktree list | wc -l`, `git branch | wc -l`) and the LIST FOR DYLAN rows verbatim. Nothing to commit.

---

### Task 7: Dylan-only actions (merges and deploys)

These are classifier-blocked for the assistant. In this order:

- [ ] **Step 1: Bakery Bash PR #228** (Kavin's May routing fix — verified 2026-09-16: builds on current `main`, adds no test failures):

```bash
gh pr merge 228 --merge --admin
```
then, from `games/bakery-bash/app` (the repo has two `firebase.json` files; hosting is the app's, default project `bakery-bash-54d12`):
```bash
cd games/bakery-bash/app && git pull --ff-only && npm run build && firebase deploy --only hosting
```

- [ ] **Step 2: Salary Showdown production to `main`** (bundle `index-CfTQjkxR.js` already staged from `eeac5cf`; the only `functions/src` change since the 2026-08-19 deploy is a comment, so hosting alone is enough):

```bash
cd games/salary-showdown/backend && firebase deploy --only hosting --project salary-showdown
```
Verify, then smoke (plays a full season against prod, 2–4 minutes):
```bash
curl -s https://salary-showdown.web.app/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
```
```bash
cd games/salary-showdown/app && node scripts/prod-smoke.mjs
```
Expected: the curl prints `index-CfTQjkxR.js`; smoke exits 0 with all-PASS lines. Then update HANDOFF §2 "Production" row to "caught up @ eeac5cf".

- [ ] **Step 3: After Task 1 lands:** rebuild (`cd games/salary-showdown/app && npm run build`) and repeat Step 2.

- [ ] **Step 4: After Tasks 4 and 5:** the merge commands each task hands you.

- [ ] **Step 5: Pre-class checklist** — HANDOFF §5 (drag QA at `/game/lineup`, deployed dress rehearsal, budget-alert email check, class-date decision).

---

## Appendix A: UI starting point (Salary Showdown)

**Baseline:** `main` @ `eeac5cf` or later, battery as in the header. Work on a branch; brainstorm + plan first for anything beyond copy tweaks (HANDOFF §9).

**Run it locally**

```bash
cd games/salary-showdown/backend/functions && npm run emu        # Functions 5101 · Firestore 8180 · Auth 9199 · UI 4100
```
```bash
cd games/salary-showdown/app && npm run dev                      # http://localhost:5176 (strict port)
```
```bash
cd games/salary-showdown/app && npm run seed -- --to R1:FREE_AGENCY   # prints gameId + joinCode; team "Alpha" left open for you
```
Join at `http://localhost:5176/?code=<JOINCODE>`; professor panel at `/professor`; projector at `/bigscreen`. Other seed targets: `R2:FRONT_OFFICE`, `R1:AUCTION`, `R1:LINEUP`, `R1:RESULTS`, `FINALE`; add `--fill all` to bot-staff every team.

**Rules that bite UI work:** `npm run audit:ui` must stay clean (no emoji, no `config.timers`, no judgment language); standings rows keep the server's rank order; phase names and blurbs are verbatim-frozen (Dylan-level changes only); the integration suite must stay on the browser Firestore build (`src/itest/transport.itest.ts`).

**UI punch list** (from the 2026-07-26 agent playtest, 2026-07-27 verification run, and playtest-2 deferrals; none started):

P1
- FinaleWall chart scale on the projector (verification run punch list P1).
- Professor panel aside overflow at 21 teams (playtest-2 deferral, sibling of the P1).

Design adjudication candidates (need Dylan's call before code)
- Silent auction cap-skip: no feedback when a bid is skipped for cap reasons.
- Losing bids never see the clearing price.
- Hardship cap-exemption renders as an apparent cap breach (and reads as a farmable exploit).
- Cut-then-re-sign double-pay is unwarned in the front office.
- Front-office one-way-door copy.
- "3PT Barrage" blurb says volume but the mechanic is accuracy (blurbs verbatim-frozen).

Small polish
- Reveal hype tooltip wording; aria label on hype stars; join-code copy on the projector.
- Dev stranded-tab after Clear session.
- RenameRow revert-flicker while a rename is in flight; duplicate team names are ambiguous in pickers.
- Two-tab stale-arm gate on the professor panel (fix shape ledgered under playtest-2 T7).

Bakery Bash has no open UI items beyond Task 2.
