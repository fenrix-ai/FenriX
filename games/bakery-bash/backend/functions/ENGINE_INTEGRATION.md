# Engine integration — scaffolding

This branch adds the wiring for routing round simulation to an external engine (huginX) running on Cloud Run. **Not yet active** — the live `runSimulationAndPersist` in `index.js` still calls the in-process `runMonthlySimulation`. Switching is one line, after the mapping TODOs are filled in.

The team-facing integration contract for the engine is in [`docs/engine-api.md`](../../../../docs/engine-api.md) at the repo root.

## What this branch adds

| File | What it is |
|---|---|
| `modules/engine-client.js` | Pure HTTP wrapper. `simulateRound()`, `generateDataset()`, `health()`. Auth via `google-auth-library`. Retry-once-on-5xx for simulate. No Firebase deps. |
| `process-round-engine-stub.js` | Bridge: builds the engine request from BB Firestore docs, calls the engine, maps the response back to BB's round-result shape. Same call signature and return shape as `runMonthlySimulation` for a one-line swap at the integration site. **Contains TODOs** where Firestore field names need to be confirmed. |
| `package.json` | Adds `google-auth-library ^9.15.1` as an explicit dep (was already transitive via `firebase-admin`; pinning keeps the dep tree minimal). |

## Required configuration

The Cloud Function needs `HUGINX_URL` set:

```bash
gcloud functions deploy advanceGamePhase \
  --gen2 --region=us-central1 --project=bakery-bash-54d12 \
  --set-env-vars HUGINX_URL=https://huginx-mock-aaerm3z5oq-uc.a.run.app \
  ... # rest of your deploy flags
```

For local emulator runs, set `HUGINX_URL` in your shell or in `.runtimeconfig.json` before `firebase emulators:start`.

The Cloud Function service account (`465520904977-compute@developer.gserviceaccount.com`) is **already** granted `roles/run.invoker` on the engine — no additional IAM work needed.

Optional knobs:
- `HUGINX_TIMEOUT_MS` (default 8000ms — engine commits to <5s, this is transport headroom)

## How to switch a round flow over to the engine

In `index.js > runSimulationAndPersist`, find the call to `runMonthlySimulation` and replace it:

```diff
- const { results } = await runMonthlySimulation(players, roundPreferences, config, { gameId, round });
+ const { results } = await processRoundViaEngine(players, roundPreferences, config, { gameId, round });
```

Add the import at the top of `index.js`:

```js
const { processRoundViaEngine } = require("./process-round-engine-stub");
```

The surrounding read/write code in `runSimulationAndPersist` doesn't change — same input, same output.

## What you have to fill in before that swap is safe

The bridge has explicit `TODO(team)` markers in two functions:

### `buildSimulateRoundRequest`

The engine schema uses snake_case and slightly different field names than BB Firestore. Each TODO marks a place where you need to confirm the BB-side field name and supply the right value. Concretely:

- `state.budget` ← `player.budgetCurrent`
- `state.cumulative_revenue` ← `player.cumulativeRevenue`
- `state.staff[]` ← derived from `player.specialtyChefs[]` + base staff
- `state.menu` ← `pendingDecision.menu` (verify product name strings match engine PRODUCTS list)
- `state.team_name` / `state.course` — confirm BB field names
- `decisions.prices` ← needs to be plumbed in from the separate `submitPrices` callable's output
- `decisions.staffing_change` is a **delta** from current staff count, not the absolute target
- `decisions.chef_bids` / `decisions.ad_bids` ← from `roundPreferences`

### `mapEngineResponseToBBResults`

The engine returns one shape; BB's `rounds/{roundId}` doc has another. Each TODO marks a field BB downstream code reads that needs a mapping decision:

- `revenueGross` / `revenueNet` — engine returns one `revenue`. If BB still owns loan-shark, compute `revenueNet` BB-side.
- `amountBorrowed` — engine doesn't have this concept. Either move loan-shark into the engine, or compute BB-side from the (engine) debt model.
- `perProductSatisfaction` — not in engine response. Engine emits per-player `customer_satisfaction` and per-product `units_sold`; per-product satisfaction is a BB-side derivation.
- `aggregateSatisfactionPct` — confirm scale (engine returns 0–10; BB seems to want 0–100).

Grep `index.js` and `modules/` for `data().revenue`, `data().budgetAfter`, etc. to enumerate every field BB reads downstream. Each one needs a mapped value.

## Idempotency

The engine is idempotent on `(payload, config.seed)`. The `hashSeed(gameId, round)` helper in the stub gives you a stable seed per round, so a Cloud Function retry produces the same engine response.

The existing `simulationStatus === 'complete'` guard in `runSimulationAndPersist` still applies and runs **before** the engine call, so a fully-completed round won't re-call the engine on retry.

## Testing locally

You can exercise the engine client without the Firebase emulator. The engine accepts authenticated requests from any account with invoker on the service:

```bash
# from games/bakery-bash/backend/functions/
HUGINX_URL=https://huginx-mock-aaerm3z5oq-uc.a.run.app node -e "
  const e = require('./modules/engine-client');
  e.health({requestId: 'local-smoketest'}).then(r => console.log(r.body));
"
```

For the bridge layer, the unit test stub (not yet written) should mock `engine-client` with a fixture response and verify mapping output. Use `__tests__/test-lifecycle.js` as the style reference for new tests.

## Debugging in production

The engine returns `request_id` in every response (header + error body). For any 5xx surfaced through this path:

```bash
# the request_id pattern is `${gameId}-r${round}` per the stub
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="huginx-mock" AND jsonPayload.request_id="game_xyz-r3"' \
  --project=bakery-bash-54d12 --limit=20
```

Full engine-side debugging runbook (private) lives in the engine repo. The only thing you need from BB-side is the `request_id`.

## When to merge

Merge this PR when:
1. The TODO mapping in both functions is filled in.
2. A unit test in `modules/__tests__/` covers `buildSimulateRoundRequest` with a known BB player snapshot, asserting the engine payload is well-formed.
3. An emulator-based integration test calls `processRoundViaEngine` against the deployed engine for a 4-player round and asserts the round result writes to Firestore correctly.
4. `index.js` is updated to call `processRoundViaEngine` (the one-liner above).

Don't merge with the swap line still pointing at the in-process simulator — at that point this is dead code. Either flip the swap or hold the PR.
