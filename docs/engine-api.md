# Bakery Bash Engine API

The simulation engine that processes one round of player decisions and returns the round outcome (customer allocation, auction results, finance, leaderboard, market update for the next round). Provided by **huginX**. Hosted on Cloud Run inside this project. Called from the Bakery Bash Cloud Functions; not exposed to the React UI directly.

> **Status**: mock release. The API shape, error codes, and headers below are production-binding — integrate against them now and the real engine swaps in without a code change. The mock identifies itself in every response with `engine_name: "huginx-mock"` and `is_mock: true`.

## Service URL

```
https://huginx-mock-aaerm3z5oq-uc.a.run.app
```

Set this as `HUGINX_URL` in your Cloud Function environment variables. When the production engine ships, only this URL changes.

## Authentication

Cloud Run IAM. The Bakery Bash Cloud Function service account (`465520904977-compute@developer.gserviceaccount.com`) is already granted `roles/run.invoker` on the engine — no API keys, no secrets in code, nothing to rotate.

From a Gen 2 Cloud Function:

```js
// games/bakery-bash/backend/functions/lib/engine.js
const {GoogleAuth} = require('google-auth-library');

const HUGINX_URL = process.env.HUGINX_URL;
const auth = new GoogleAuth();
let _client; // cached across warm invocations

async function client() {
  if (!_client) {
    _client = await auth.getIdTokenClient(HUGINX_URL);
  }
  return _client;
}

async function callEngine(path, body, {requestId} = {}) {
  const c = await client();
  const headers = {'Content-Type': 'application/json'};
  if (requestId) headers['X-Request-ID'] = requestId;

  const res = await c.request({
    url: `${HUGINX_URL}${path}`,
    method: 'POST',
    headers,
    data: body,
    timeout: 8000,                // engine's own contract is 5s; pad for transport
    validateStatus: () => true,    // we want to handle 4xx/5xx ourselves
  });
  return {status: res.status, body: res.data, requestId: res.headers['x-request-id']};
}

module.exports = {callEngine};
```

For local testing from your own machine:

```bash
TOKEN=$(gcloud auth print-identity-token)
curl -H "Authorization: Bearer $TOKEN" https://huginx-mock-aaerm3z5oq-uc.a.run.app/v1/health
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/health` | Service liveness + version |
| POST | `/v1/simulate-round` | Process one round of decisions, return outcomes |
| POST | `/v1/generate-dataset` | Produce a CSV of synthetic bakeries for student modelling |
| GET | `/docs` | Swagger UI (interactive OpenAPI spec — auth-gated) |

### GET /v1/health

Response:
```json
{
  "status": "ok",
  "engine_name": "huginx-mock",
  "engine_version": "mock-0.1.0",
  "config_version": "bakery-bash-mock-2026.04",
  "game_name": "bakery_bash",
  "is_mock": true
}
```

Use this on Cloud Function cold start to verify the engine is reachable and pinned to the expected version. Cache for ~1 minute.

### POST /v1/simulate-round

Receives all player decisions for one round, returns the full outcome — per-player results, bot results, the next round's market state, and the leaderboard.

**Request** (abridged):
```json
{
  "game_id": "game_abc123",
  "round_number": 1,
  "config": {
    "total_customers": 2000,
    "bots": {"bot_count": 2, "strategy": "moderate"},
    "seed": 42,
    "course_separated_leaderboard": true
  },
  "market_state": {
    "cost_multipliers": {"croissant": 1.0, "muffin": 1.0, "cookie": 1.0, "coffee": 1.0,
                        "matcha": 1.0, "sandwich": 1.0, "sourdough": 1.0, "banana_bread": 1.0},
    "available_chefs": [
      {"chef_id": "chef_1", "skill": 7, "tradition": "classical_french", "minimum_bid": 5000.0}
    ],
    "available_ad_slots": [
      {"slot_id": "billboard_1", "placement": "billboard", "minimum_bid": 2000.0}
    ],
    "active_events": [],
    "base_staff_cost": 2000.0
  },
  "players": [
    {
      "state": {
        "player_id": "team_1",
        "team_name": "Team 1",
        "course": "MGSC_220",
        "budget": 1000000.0,
        "cumulative_revenue": 0.0,
        "debt": 0.0,
        "staff": [{"role": "cook", "skill": 3, "tradition": null}],
        "menu": ["croissant", "muffin", "cookie", "coffee", "matcha", "sandwich", "sourdough", "banana_bread"],
        "customer_satisfaction": 7.0,
        "cleanliness_score": 7.0
      },
      "decisions": {
        "prices": {"croissant": 4.0, "muffin": 3.5, "cookie": 2.5, "coffee": 3.5,
                   "matcha": 5.0, "sandwich": 6.5, "sourdough": 5.0, "banana_bread": 4.0},
        "quantities": {"croissant": 80, "muffin": 60, "cookie": 100, "coffee": 150,
                       "matcha": 40, "sandwich": 70, "sourdough": 50, "banana_bread": 50},
        "staffing_change": 0,
        "chef_bids": [],
        "ad_bids": [],
        "digital_ad_spend": {"instagram": 0.0, "tiktok": 0.0},
        "new_product_launch": null,
        "data_purchase": false,
        "submitted_at": "2026-05-01T08:30:00Z"
      }
    }
  ]
}
```

**Response** (abridged — see `/docs` for full schema):
```json
{
  "game_id": "game_abc123",
  "round_number": 1,
  "config_version": "bakery-bash-mock-2026.04",
  "engine_version": "mock-0.1.0",
  "processing_time_ms": 12,
  "player_results": [
    {
      "player_id": "team_1",
      "revenue": 2812.45,
      "units_sold": {"croissant": 24, "muffin": 18, "cookie": 30, "coffee": 82, "matcha": 6,
                     "sandwich": 21, "sourdough": 10, "banana_bread": 10},
      "customers_visited": 480,
      "orders_received": 201,
      "walkout_count": 32,
      "customer_satisfaction": 7.0,
      "budget_after": 994820.45,
      "debt_after": 0.0,
      "spending_breakdown": {
        "inventory_cost": 580.0, "staff_cost": 4000.0, "digital_ad_spend": 0.0,
        "auction_spend": 0.0, "data_purchase_cost": 0.0, "interest_charged": 0.0,
        "total_expenses": 4580.0
      },
      "auction_wins": [],
      "auction_losses": [],
      "staff_after": [{"role": "cook", "skill": 3, "tradition": null}],
      "notifications": []
    }
  ],
  "bot_results": [...],
  "market_update": {
    "next_round_cost_multipliers": {...},
    "next_round_available_chefs": [...],
    "next_round_available_ad_slots": [...],
    "new_events": [...],
    "next_round_base_staff_cost": 2060.0,
    "new_products_available": []
  },
  "leaderboard": {
    "mgsc_220": [...],
    "mgsc_310": [...],
    "combined": [{"rank": 1, "player_id": "team_1", "team_name": "Team 1",
                  "course": "MGSC_220", "cumulative_revenue": 2812.45, "round_revenue": 2812.45}]
  }
}
```

**Idempotency.** Same request body + same `config.seed` + same `round_number` → byte-identical response (modulo `processing_time_ms`). Safe to retry. The Cloud Function should retry once after a 3-second timeout, then surface an engine error to the UI.

**Latency budget.** Engine commits to under 5 seconds for 60 players. Set Cloud Function timeout at 8 seconds to allow for transport.

### POST /v1/generate-dataset

Generates a CSV of synthetic bakery records for students to train predictive models on. Two difficulty modes:

- `mgsc_220`: ~22 columns, simpler feature set
- `mgsc_310`: ~38 columns, full feature set including categorical fields

**Request:**
```json
{
  "difficulty": "mgsc_310",
  "seed": 42,
  "row_count": 728
}
```

**Response:**
```json
{
  "config_version": "bakery-bash-mock-2026.04",
  "engine_version": "mock-0.1.0",
  "difficulty": "mgsc_310",
  "row_count": 728,
  "column_count": 38,
  "columns": ["bakery_id", "price_croissant", ...],
  "csv_content": "bakery_id,price_croissant,...\nBKY0000,3.42,...\n..."
}
```

The CSV body is in `csv_content` as a single string. Decode and write to Cloud Storage or hand directly to the student.

> **Mock caveat:** dataset coefficients are placeholder. Students who train on the mock dataset will not learn anything useful about real bakery economics. Use only for plumbing tests until the production engine ships.

## Request ID propagation

Every response carries an `X-Request-ID` header.

- **Outbound (default)**: the engine generates a UUID per request and returns it.
- **Inbound (recommended)**: pass `X-Request-ID: <your-trace-id>` and the engine adopts it. The same ID stamps every server-side log line for that request, so a single ID can trace a player's round through Cloud Function → engine → logs.

```js
const requestId = `${gameId}-r${roundNumber}-${Date.now()}`;
const result = await callEngine('/v1/simulate-round', body, {requestId});
// result.requestId === requestId
// engine logs are queryable by jsonPayload.request_id
```

When something goes wrong, the request_id is also embedded in the error response body (see below) — surface it in your error messages so support can find the exact server-side trace.

## Error responses

All errors follow the same shape:

```json
{
  "error": "<error_code>",
  "message": "<human readable>",
  "details": [...],          // only on 422
  "request_id": "<uuid>",
  "config_version": "...",
  "engine_version": "..."
}
```

| Status | `error` | When |
|---|---|---|
| 400 | string detail | Request structurally valid but semantically rejected (e.g. duplicate `player_id`, zero players) |
| 422 | `validation_error` | Pydantic schema validation failed. `details` lists per-field errors. |
| 500 | `engine_error` | Unhandled engine error. Safe to retry once. |

The engine sets `extra="forbid"` on every request schema — sending extra fields returns a 422. Strict by design; this is what catches your mistakes early.

## Versioning

The engine returns `engine_version` and `config_version` in every successful response and every error.

- `engine_version` (e.g. `"mock-0.1.0"` → `"1.0.0"` at GA): tracks the simulation logic.
- `config_version` (e.g. `"bakery-bash-mock-2026.04"`): tracks the coefficient set / game economy parameters.

If you log these on every Cloud Function call, you'll be able to bisect any "results changed" report by version.

**Breaking-change policy:** any change to a request or response schema (field added/removed/renamed/retyped) is coordinated through this doc and a major version bump. Field additions that have safe defaults are non-breaking and ship under a minor version.

## Quick smoke test

Once your Cloud Function is wired:

```js
// In your processRound function
const {callEngine} = require('./lib/engine');

exports.processRound = async (req, res) => {
  const requestId = `${req.body.gameId}-r${req.body.roundNumber}`;
  const result = await callEngine('/v1/simulate-round', buildPayload(req.body), {requestId});

  if (result.status !== 200) {
    console.error('engine_error', {requestId, status: result.status, body: result.body});
    return res.status(502).json({error: 'engine_unavailable', requestId});
  }
  // result.body is the full SimulateRoundResponse
  await writeRoundResultsToFirestore(result.body);
  res.json({ok: true, requestId});
};
```

## Browse the full schema

Open Swagger UI in a browser:

```
https://huginx-mock-aaerm3z5oq-uc.a.run.app/docs
```

Authenticate first by adding the identity token to your browser session, or use the curl pattern above. The OpenAPI spec at `/openapi.json` is also available for codegen.

## Contact / changes

Surface integration issues with the engine to Tim. Include the `request_id` from the failing response — that's all needed to find the server-side trace.
