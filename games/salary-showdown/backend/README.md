# Salary Showdown — Backend

Firebase (Cloud Functions v2 + Firestore) backend for the MGSC 310 NBA front-office
game. Server-authoritative: every state mutation goes through a callable; clients
read Firestore directly (subject to `firestore.rules`) but write almost nothing on
their own.

## Quickstart (emulators)

Start the full local stack (Auth + Functions + Firestore, project
`salary-showdown-dev`):

```bash
cd games/salary-showdown/backend/functions && npm run emu
```

This boots the Emulator UI at `http://127.0.0.1:4100`, Functions at
`127.0.0.1:5101`, Firestore at `127.0.0.1:8180`, Auth at `127.0.0.1:9199`. Leave it
running for manual poking; `Ctrl-C` to stop.

Run the test suite headless against a fresh Firestore emulator (this is what CI /
you should run before every commit — 16 files, 102 tests):

```bash
cd games/salary-showdown/backend && firebase emulators:exec --project salary-showdown-dev --only firestore "cd functions && npx vitest run"
```

`npm test` inside `functions/` runs the same Vitest suite but assumes an emulator
is already reachable (use the `emulators:exec` form above unless one is already
running from `npm run emu`).

## Callable API

All callables live in `functions/src/game.js` and are exported from
`functions/index.js`. Auth is required for all of them; role checks (GM / Scout /
Coach / professor) are enforced server-side per callable, not by the client.

| Callable | One-liner |
| --- | --- |
| `createGame({ teamNames })` | Professor creates a game, seeds teams + the full player catalog, returns `{ gameId, joinCode }`. |
| `joinGame({ joinCode, teamId, role, displayName })` | Claims a GM/Scout/Coach seat on a team by join code; one uid per role per team. |
| `getLobby({ joinCode })` | Lobby discovery for non-members: team list + claimed roles, by join code. |
| `startSeason({ gameId })` | Professor-only: locks the lobby, draws the round-1 free-agency market, moves `LOBBY → FREE_AGENCY`. |
| `advancePhase({ gameId })` | Professor-only: resolves the exit hook for the current phase, the entry hook for the next, and advances `phase`/`round` (idempotent via `hooklog`). |
| `signPlayer({ gameId, pid, years })` | GM-only: signs a free agent (or re-signs an expiring contract in `FRONT_OFFICE`); claims unsold auction stars exclusively. |
| `cutRosterPlayer({ gameId, pid })` | GM-only: cuts a rostered player in `FRONT_OFFICE`/`FREE_AGENCY`, adding dead money per the payroll rules. |
| `submitBids({ gameId, bids })` | Scout-only: overwrites this team's sealed bids for the round's auction stars (private subcollection, freely revisable until auction close). |
| `submitLineup({ gameId, lineup })` | Coach-only: validates and locks `{starters, sixth, bench, playstyle}` against the team's currently-active roster. |

Error handling is via `HttpsError` (`unauthenticated`, `permission-denied`,
`failed-precondition`, `invalid-argument`, `not-found`) with a short message; see
`functions/src/game.js` for the exact codes each callable can throw.

## Firestore schema

The full document contract (collections, fields, rules policy) is documented in
[`SCHEMA.md`](./SCHEMA.md) — read that before touching `firestore.rules` or any
callable that writes a new field.

## Data bundle regeneration

`functions/src/data/{players.json,hidden.json,engine_params.json}` and
`functions/test/fixtures/engine_parity.json` are generated artifacts, not
hand-edited. Regenerate them from the Python reference implementation with:

```bash
cd games/salary-showdown/datagen && python3 export_runtime_bundle.py
```

This is deterministic and idempotent — re-running it twice in a row produces
byte-identical output — and only *reads* `games/salary-showdown/data/players.csv`;
it never writes to `data/`.

**Parity rule:** if `datagen/engine.py` or `datagen/private/engine_params.json`
(the calibrated playstyle constants) changes, re-run the exporter above and the
engine parity suite (`functions/test/engine.test.js`) MUST pass before deploy.
That suite reproduces
200 Python-computed team strengths, win probabilities, and greedy lineup picks
inside the JS engine port (`functions/src/engine.js`) to `1e-9`/`1e-12` tolerance —
a silent divergence between the Python and JS engines is a game-breaking bug, not
a cosmetic one.

## Deploy checklist (documentation only — not run as part of this task)

Deploying requires a real Firebase project, not the `salary-showdown-dev` emulator
project used above:

1. Create a Firebase project on the **Blaze** (pay-as-you-go) plan — Cloud
   Functions v2 requires it even at zero traffic.
2. Enable **Anonymous** sign-in under Authentication → Sign-in method (this app
   authenticates players anonymously, no email/password).
3. Point `.firebaserc` at the real project (or pass `--project <id>` explicitly).
4. Deploy rules and functions:
   ```bash
   firebase deploy --only firestore:rules,functions
   ```
5. Re-run the emulator test suite against the deployed `engine_params.json` /
   `hidden.json` bundle before trusting production numbers — the parity rule
   above still applies.
