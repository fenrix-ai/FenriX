# Plan — FE-R01 + BE-R01 + BE-R02: Create-Team vs Join-Team Two-Path Flow

> **Source task:** [playtesting-apr22-remaining-tasks.md](../../playtesting-apr22-remaining-tasks.md) FE-R01 / BE-R01 / BE-R02.
> **Branch base:** `feat/playtesting-apr22-tasks` (or the currently-open FE-R09/BE-R04 branch if chained).
> **Depends on:** nothing else from the remaining-tasks list — this is the second-most-difficult task and stands alone.

## Goal

Replace the single "Team Number (1–8) + logo" landing form with an explicit two-path UX:

1. **Create Team** — enter team name + logo + your name + game code → `createTeam` callable → route to `/team`.
2. **Join Team** — enter game code → list existing teams (logos, names, member counts) → pick one → enter your name → `joinGame` with `teamId` → route to `/team`.

Keep PR #45's team-number join mechanism working as a silent fallback (so any in-flight sessions that still use it don't break).

## Work breakdown

### Phase 1 — Backend callables (BE-R01, BE-R02)

**File:** `games/bakery-bash/backend/functions/index.js`

1. **`createTeam` callable (BE-R01):**
   - Input: `{ joinCode, teamName, displayName, logoUrl? }`
   - Validate: `teamName` 2–30 chars, `displayName` 2–40 chars, `logoUrl` (if present) must start with `https://firebasestorage.googleapis.com` (same guard as BE-N07 in `joinGame`).
   - Resolve `joinCode → gameId` (reuse the lookup pattern in `joinGame`).
   - Require `phase === 'lobby'`; throw `failed-precondition` otherwise.
   - Transaction:
     - Query `/games/{gameId}/teams` for duplicate `name`; throw `already-exists` on conflict.
     - Compute `teamId = slugify(teamName)` (reuse the same slug logic as the existing `teamId` derivation for consistency; fall back to `teams/{auto}` only if the slug collides with an existing non-matching team).
     - Write `/games/{gameId}/teams/{teamId}` with `{ name, logoUrl, createdBy: auth.uid, createdAt, roleAssignments: { [auth.uid]: null }, memberCount: 1 }`.
     - Write `/games/{gameId}/players/{uid}` using the same shape as `joinGame` writes — but pre-populate `teamId`, `teamLogoUrl`, and leave `role: null` so the team page role picker drives role assignment.
     - Increment `game.totalPlayers`.
   - Return `{ gameId, playerId: auth.uid, teamId, teamName, logoUrl }`.

2. **`getTeamsInLobby` callable (BE-R02):**
   - Input: `{ joinCode }`
   - Resolve `joinCode → gameId`. Throw `not-found` if missing.
   - `await gameRef.collection('teams').get()` — no professor auth required (lobby is public).
   - Map each team to `{ teamId, name, logoUrl, memberCount: Object.keys(roleAssignments ?? {}).length }` and return `{ teams: [...] }`.
   - Keep the read cheap: teams are at most 8 per game, no pagination needed.

3. **Patch `joinGame` to accept an explicit `teamId`:**
   - New optional input field: `teamId?: string`.
   - If provided + the team doc exists, skip the PR #45 `team-{N}` derivation and use the explicit id. Preserve the `bakeryName`-driven fallback for any client that still submits one.
   - Add `roleAssignments.[uid]: null` to the joined team so the team page can show the new member.
   - All existing validations (lobby-only, cap per team, etc.) still apply.

**Tests** (`backend/scripts/test-create-join-flow.js`, new):
- `createTeam` happy path: creates team + player, returns expected payload.
- `createTeam` duplicate name → `already-exists`.
- `createTeam` phase ≠ lobby → `failed-precondition`.
- `getTeamsInLobby` returns all teams with correct `memberCount`.
- `joinGame { teamId }` adds the player to the specified team's `roleAssignments`.

Wire up via `backend/package.json` → `"test:create-join": "firebase emulators:exec ..."`.

### Phase 2 — Frontend Landing UX (FE-R01)

**File:** `app/src/pages/LandingPage.tsx`

1. Add a top-of-card path toggle: two big buttons "Create a Team" + "Join a Team". Local state `useState<"create" | "join" | null>(null)`; neither form renders until the user picks.
2. **Create sub-form:** team name (required 2–30), logo (existing `uploadBytes` logic preserved verbatim), your name, game code. On submit:
   - Upload logo → `getDownloadURL` (existing).
   - Call `createTeam` callable.
   - On success dispatch `JOIN_GAME`, `navigate('/team', { state: { teamId } })`.
3. **Join sub-form:**
   - Field 1: game code (6-char uppercase). When input matches `/^[A-Z0-9]{6}$/`, fire `getTeamsInLobby` (debounced ~300ms).
   - Render returned teams as a selectable card grid (`.team-select__grid` BEM classes from the task file).
   - Field 2: your name.
   - Submit → `joinGame({ gameId, teamId, displayName, bakeryName: selectedTeam.name })`.
   - Empty-state fallback: "No teams yet. Be the first to create one." with a button that flips path to `"create"`.
4. Preserve the existing "rejoin session" codepath at the top of the page (PR #50).

**File:** `app/src/styles/global.css`

Add the BEM classes listed in the task file verbatim:
```
.landing-page__path-toggle, .landing-page__path-btn,
.landing-page__path-btn--active, .team-select__grid,
.team-select__card, .team-select__card--selected,
.team-select__logo, .team-select__name, .team-select__count
```

### Phase 3 — Verification

1. TypeScript: `cd app && npx tsc --noEmit`.
2. Backend syntax: `cd backend/functions && node --check index.js`.
3. Backend integration: `cd backend && npm run test:create-join`.
4. Regression: `npm run test:reset-game` + `npm run test:round-reset` still green.
5. Local playtest:
   - Professor creates game → code X.
   - Player A opens `/`, picks Create, uploads logo, name = "Sourdough Squad", submits → lands on `/team`.
   - Player B opens `/`, picks Join, enters code X → sees "Sourdough Squad" card with A's logo + "1 member". Picks it + submits → lands on `/team`, both A and B visible in `roleAssignments`.
   - Confirm PR #45 team-number flow still works for a third player who manually submits `teamId = team-3`.

## Gotchas / things I learned from the FE-R09/BE-R04 pass

- `players/{uid}` is the source of truth for `teamId` (read by `GamePage` line 255). The `TeamPage` separately subscribes to the team doc to pull `name`. So after `createTeam`, writing `teamId` on the player doc is sufficient — no extra FE hydration needed.
- `pendingDecision` / `pendingBids` have the join-time default shape `{ submitted: false }` / `{ ad: null, chef: null }` — mirror that exactly on `createTeam`'s player write so `resetPendingPlayerStateForRound` (the BE-R04 helper) sees an expected shape on round 2.
- All callables in `index.js` use the `CALLABLE_OPTS` wrapper + `requireAuth`. Follow the same pattern.
- Keep storage upload logic on the client (LandingPage already does this). Backend should only validate that `logoUrl` starts with the Firebase Storage URL prefix.

## Out of scope

- Renaming the `bakeryName` field to `teamName` on the player doc (the codebase uses both interchangeably; a rename would churn every submit path).
- Migrating existing PR #45 `team-{N}` docs to named teams — those keep working via the unchanged join path.
- Team-name uniqueness case sensitivity (task spec says simple `where name == teamName` is sufficient for playtesting scale).

## Estimate

~4–6 hours end-to-end for one pass including tests:
- 1.5h — two new backend callables + `joinGame` patch
- 0.5h — integration test script
- 2h — LandingPage two-path rewrite + CSS
- 0.5h — local playtest + regression checks
