# FenriX New-Generation Games Platform — GCP Container Baseline

**Date:** 2026-08-16
**Status:** Approved design, pending implementation plan
**Owner:** Kavin (infra)

## 1. Summary

FenriX is moving its game hosting from the Firebase stack (Firestore client SDKs +
Cloud Functions + Firebase Hosting) to a **fully containerized platform on Google
Cloud**, built on Cloud Run. This spec defines the platform baseline: the GCP
project, the service architecture, CI/CD from GitHub, the database, auth, the
AI-agent-player service, observability, and cost controls.

Games on this platform are **round-based**: play happens in rounds, but per-game
mechanics (teams, join codes, lobbies, scoring) are deliberately left to each game.
Students access games **entirely through the browser** — no installs, no Docker, no
accounts required by the platform itself. **AI agents fill empty player seats** so
sessions work at any class size; students still compete against each other.

Decomposition — this project is three sub-projects, each with its own spec cycle:

1. **Platform baseline** (this spec): GCP project, hub, CI/CD, agent-players
   service, game-service template.
2. **New games**: built from the template, one spec per game.
3. **Salary Showdown port**: migrate the existing Firebase game onto this platform.
   In scope for the overall effort; specced separately after the baseline lands.

Bakery Bash remains on Firebase as the only legacy-generation game. The
`quant_finance/` work is unrelated and untouched.

## 2. Goals and non-goals

**Goals**

- One URL students visit; zero local setup for players.
- Every deployable is a container on Cloud Run; per-game isolation so one game's
  deploy can never take down another.
- CI from GitHub: PR checks → auto-deploy to staging on merge → manual promote to
  prod. No service-account keys stored in GitHub.
- A pluggable **agent-players** service so the agent "brain" (classic ML, LLM API,
  or local models) can change without touching game code.
- Near-zero idle cost between class sessions (classroom-burst usage: ~30–100
  concurrent students a few times a term).
- Doc-first: infra as reviewable code, runbooks, and API docs in the style of
  `docs/engine-api.md`.

**Non-goals**

- Designing any specific game's mechanics (teams, join flows, scoring).
- Migrating Bakery Bash.
- Choosing the agent brain (this spec keeps it open and prices the options).
- Kubernetes. Cloud Run covers this workload; GKE is a later escape hatch if a
  game ever genuinely needs it.

## 3. Architecture overview

```
                          students' browsers
                                 │ https
              ┌──────────────────┼──────────────────────┐
              ▼                  ▼                      ▼
        ┌──────────┐      ┌────────────────┐    ┌────────────────┐
        │   hub    │      │ game-<a>-prod  │    │ game-<b>-prod  │   Cloud Run
        │ (site)   │      │ API + frontend │    │ API + frontend │   (scale to 0)
        └──────────┘      └───────┬────────┘    └───────┬────────┘
                                  │ IAM (OIDC)          │
                    Cloud Tasks ◄─┤ round deadlines     │
                                  ▼                     ▼
                          ┌───────────────────────────────┐
                          │        agent-players          │  internal-only
                          │  POST /v1/decide (pluggable)  │  Cloud Run
                          └───────────────────────────────┘
                                  │
                          ┌───────────────┐
                          │   Firestore   │  named DBs: staging / prod
                          │ (server-side  │  accessed only via
                          │  client only) │  @google-cloud/firestore
                          └───────────────┘
```

Everything above exists twice: a `-staging` and a `-prod` Cloud Run service per
deployable, in one GCP project.

## 4. GCP project, environments, and provisioning

- **Project:** `fenrix-games` (single project). Staging and prod are parallel Cloud
  Run services (`game-x-staging` / `game-x-prod`) and separate named Firestore
  databases — a second project adds ceremony a small team doesn't need.
- **Region:** `us-west1` for everything (matches Salary Showdown's existing region
  pin; document as the single region).
- **Billing:** not yet set up. Provisioning checklist to hand the professor:
  1. Create (or designate) a billing account; grant Kavin `Billing Account User`.
  2. Kavin creates project `fenrix-games`, links billing, becomes `Owner`.
  3. Budget alerts at 50% / 90% / 100% of a monthly budget (propose **$50/mo**
     initially — see §14; alerts email professor + Kavin).
- **Enabled APIs:** Cloud Run, Artifact Registry, Firestore, Cloud Tasks, Secret
  Manager, Cloud Build (optional), IAM Credentials, Cloud Monitoring/Logging,
  Cloud Scheduler (future).
- **Service accounts** (least privilege, one per service):
  - `run-game-<name>@` — Firestore r/w, Cloud Tasks enqueue, invoke agent-players.
  - `run-agent-players@` — Secret Manager access (LLM key, if/when used); no
    Firestore.
  - `run-hub@` — nothing beyond logging.
  - `github-deployer@` — Artifact Registry writer, Cloud Run deploy, `iam.serviceAccountUser`
    on the runtime SAs only. Used exclusively via Workload Identity Federation.

## 5. Services

All services are containers in Artifact Registry
(`us-west1-docker.pkg.dev/fenrix-games/services/<name>`), deployed to Cloud Run
with `min-instances=0`.

### 5.1 `hub`

The site students visit. Static build (Vite/React/TS, matching repo conventions)
served by a minimal Node server in one container. Lists active games and links to
each game's URL. Custom domain via Cloud Run domain mapping when one exists;
`*.run.app` URLs until then. No database access.

### 5.2 `game-<name>` (one service per game)

A single container that serves **both** the game's built frontend (static assets)
and its API:

- **Join / session endpoints** — whatever mechanics the game defines (join codes,
  teams, free-for-all). The platform mandates nothing here.
- **Round endpoints** — submit decisions, read round state, read results.
- **Professor/console endpoints** — create game, start/advance/close rounds,
  export results.
- **`GET /events` (SSE)** — pushes round transitions and results to browsers, with
  client-side polling fallback. SSE works on Cloud Run with streaming responses
  and needs no session affinity. WebSockets are not part of the baseline (no
  mid-round realtime interaction is required for round-based play); a game that
  later needs them can enable them on its own service without platform changes.
- **`POST /internal/close-round`** — invoked by Cloud Tasks (OIDC-authenticated,
  restricted to the game's own SA) when a round deadline fires. See §7.
- **`GET /healthz`** — liveness for uptime checks and CI smoke tests.

Runtime: Node 22 + TypeScript (Fastify), matching the repo's existing TS
conventions. The starter template (§15) fixes these choices so every game looks
the same.

### 5.3 `agent-players`

Internal-only Cloud Run service (ingress: internal + no unauthenticated access);
game services call it with IAM-signed OIDC tokens — the exact pattern
`docs/engine-api.md` already documents for huginX.

**Contract** (documented in `docs/agent-players-api.md`, engine-api style):

```
POST /v1/decide
{
  "game": "salary-showdown",          // which game's decision schema
  "game_id": "...", "round": 3,
  "seats": [ {"agent_id": "bot_1", "persona": "aggressive"}, ... ],
  "round_state": { ... game-defined snapshot ... },
  "decision_schema": { ... JSON schema the reply must satisfy ... }
}
→ { "decisions": [ {"agent_id": "bot_1", "decision": {...}}, ... ],
    "brain": "heuristic-v1", "latency_ms": 12 }
```

- The **brain behind the contract is pluggable**: v1 ships a per-game heuristic
  module; a classic-ML or LLM-API brain replaces the internals with zero game-side
  changes. A local-GPU brain would be a different backend behind the same route.
- **Fallback rule:** every game service also embeds a trivial built-in heuristic.
  If `agent-players` errors or times out (2s budget, one retry), agent seats
  degrade to the built-in fallback — a class session never stalls on the agent
  service.
- Decisions are validated against `decision_schema` before use; invalid decisions
  fall back the same way.

### 5.4 Agent brain options (decision open — for the professor)

Illustrative session: 30 agent seats × 10 rounds, ~2K input + ~300 output tokens
per decision if LLM-driven.

| Option | Per-session cost | Standing cost | Trade-offs |
|---|---|---|---|
| Classic ML / heuristics | ~$0 | $0 | Deterministic, fast, cheapest. Needs per-game feature engineering + offline tuning; least "human-like". |
| LLM API | ~$1–5 depending on model (Claude Haiku 4.5 $1/$5 per MTok ≈ $1; Sonnet 5 $3/$15 ≈ $3; Opus 5 $5/$25 ≈ $5) | $0 (key in Secret Manager, budget-capped) | No retraining across games; personas via prompts; adds 1–3s latency per round; needs cost caps + prompt-injection care with student-visible state. |
| Local models (GPU) | $0 marginal | GPU provisioning: the single local 5090 can't serve concurrent classroom load; a cloud L4 GPU is ~$0.70/hr and doesn't scale to zero cleanly | Only worth it at much larger scale or for research control. Not recommended for baseline. |

**Recommendation:** ship the heuristic brain in the baseline (needed as the
fallback anyway); when the professor decides, add the LLM-API brain behind the
same contract with a per-session spend cap. Local GPU stays a documented
non-default.

## 6. Database — Firestore, server-side only

- **Firestore in Native mode**, two named databases in the project: `staging` and
  `prod`. Each environment's services are configured with their database ID.
- Access **only from game services** via `@google-cloud/firestore` (the Cloud
  client library). **No Firebase client SDKs, no security rules, no client
  listeners** — browsers never talk to the database. This is the part of Firebase
  being dropped; the database engine itself is a serverless GCP product with $0
  idle cost and a free tier that covers classroom scale.
- **Why not Cloud SQL:** at this scale Postgres's only real advantage is SQL
  analytics, at the cost of the platform's only always-on bill (~$10–15/mo) and a
  full data-model rewrite for the Salary Showdown port. Keeping Firestore makes
  that port "move logic into a container, swap listeners for SSE" with the data
  model intact. If post-game analytics ever needs SQL, Firestore's built-in
  BigQuery export covers it.
- **Conventions** (documented in the starter template):
  - Each game namespaces its data under top-level collections prefixed with the
    game name (e.g. `salaryShowdown_games/{gameId}/…`).
  - Shared TypeScript types in `shared/` define document shapes — the guard
    against schema drift in a schemaless store, especially with AI agents writing
    the code.
  - All round resolution writes go through transactions; documents carry
    `schemaVersion`.

## 7. Round lifecycle on a scale-to-zero platform

A round deadline must fire even when no request is in flight, so timing is
delegated to **Cloud Tasks**:

1. Professor (or auto-advance config) opens round N with a deadline.
2. The game service writes round state and enqueues a Cloud Tasks HTTP task for
   the deadline, targeting its own `POST /internal/close-round` with an OIDC
   token (task queue per game service).
3. At the deadline, Cloud Tasks calls the endpoint (retries with backoff if the
   service is cold or errors). The handler is idempotent (round-state guard).
4. The handler: collects submitted decisions → requests agent decisions for empty
   seats (§5.3) → resolves the round (in-process, or by calling an external sim
   engine like huginX where a game has one) → writes results in a transaction →
   SSE-notifies connected browsers.
5. Early close (all players submitted) uses the same handler invoked directly;
   the later Cloud Tasks callback no-ops on the idempotency guard.

## 8. Auth and sessions

- **Students:** browser-only. On join, the game service issues a **signed,
  HttpOnly cookie** (HMAC with a per-environment secret from Secret Manager)
  binding the browser to a player/seat in a game. The cookie carries an explicit
  multi-hour `Max-Age` (default 12h) so it survives a closed tab — not a
  browser-session cookie. Join mechanics (codes, names, team pick) are per-game.

  **Reconnection is a first-class property of this design.** All game state lives
  in Firestore and no Cloud Run instance holds in-memory session state, so a
  closed tab, a page refresh, or a dropped connection loses nothing: reopening
  the game URL re-identifies the student from the cookie, the API returns
  current round state, and the SSE stream reopens (the browser's `EventSource`
  auto-reconnects on brief drops without a reload — any instance can serve the
  reconnect). The starter template's frontend implements this
  rehydrate-on-load pattern. The remaining edge case — a different device or a
  cleared cookie — is per-game rejoin mechanics (e.g. re-entering the join code
  to reclaim a seat), not a platform concern.
- **Professors:** baseline is a per-deployment console passcode (Secret Manager)
  exchanged for a professor-scoped session cookie. Good enough for a trusted
  small user set.
- **Upgrade path:** if any game needs real accounts or SSO later, GCP Identity
  Platform slots in behind the same cookie-issuing endpoint — no re-architecture.
- **Service-to-service:** IAM OIDC everywhere (game → agent-players, Cloud Tasks →
  game). No shared API keys between services.

## 9. CI/CD

GitHub Actions (the repo currently has none — this is new infrastructure), with
**Workload Identity Federation**: GitHub's OIDC tokens are exchanged for
short-lived `github-deployer@` credentials. No SA keys in GitHub secrets, nothing
to rotate.

- **Reusable workflow** `.github/workflows/_service.yml` (repo templating
  culture): inputs `service_name`, `source_path`. Jobs: lint → test → docker build
  → push to Artifact Registry tagged with the commit SHA → deploy **by image
  digest** to `<service>-staging` → staging smoke test.
- **Per-service caller workflows** with path filters: a PR touching only
  `games/foo/**` runs only foo's pipeline. `platform/**` and `shared/**` changes
  trigger dependents.
- **On PR:** lint + test + build only — runs entirely in the GitHub runner, so PR
  workflows need no GCP credentials at all.
- **On merge to `main`:** deploy to staging + smoke test.
- **Prod promote:** `workflow_dispatch` workflow taking service + image digest
  (default: what's on staging); deploys to `<service>-prod`. A human clicks this;
  nothing reaches students automatically. Git workflow (feature branch → PR → 1
  approval → squash merge) is unchanged.
- **Smoke test:** because agent seats exist, staging verification is a real game:
  a script creates a game with agents-only seats via the API, runs two rounds
  end-to-end, and asserts a leaderboard exists. Zero humans, full-stack coverage.

## 10. Infrastructure as code

Minimal **Terraform** in `infra/` (state in a GCS bucket in the project):

- API enablement, Artifact Registry repo, WIF pool/provider bound to the
  `fenrix-ai/FenriX` repo, service accounts + IAM bindings, Firestore databases,
  Cloud Tasks queues, budget + alerting, uptime checks.
- Cloud Run services are **created** by Terraform (name, SA, ingress, env vars,
  scaling bounds) with the image field lifecycle-ignored; **CI owns image
  revisions**. This keeps infra reviewable as PRs without Terraform fighting CI.
- `docs/gcp-infra.md` is the runbook: provisioning checklist, how to bootstrap a
  new game service, how to promote, how to roll back (`gcloud run services
  update-traffic` to the previous revision), emergency procedures.

## 11. Observability

- **Structured JSON logs** with the `X-Request-ID` propagation convention already
  established in `docs/engine-api.md`; a student-visible error surfaces its
  request ID.
- **Uptime checks** on `/healthz` for each prod service; alert policy → email
  (Slack webhook later).
- **Budget alerts** per §4.
- **Log-based metrics** for round-resolution failures and agent-players
  fallback activations (a spike in fallbacks means the agent service is sick even
  though games kept working).

## 12. Testing strategy

- **Unit/integration per service** in CI on every PR (Vitest, matching repo
  convention). Game logic is tested against the Firestore emulator
  (`gcloud emulators firestore` — dev-tooling only; no Firebase SDKs in runtime
  code).
- **Staging smoke test** (§9): scripted agents-only game after every staging
  deploy.
- **Local dev:** each service has a Dockerfile + a `docker compose` file (service
  + Firestore emulator). Zero-install applies to *students*; developers/AI agents
  use Docker locally.

## 13. Repo layout changes

```
infra/                       # Terraform + gcp-infra runbook pointers
platform/
  hub/                       # the student-facing site
  agent-players/             # agent seat-filler service (heuristic v1)
games/
  bakery-bash/               # legacy Firebase — untouched
  salary-showdown/           # ports onto the platform later (own spec)
  <new-game>/                # created from the starter template
templates/
  cloudrun-game-starter/     # new-generation counterpart to firebase-react-starter
docs/
  gcp-infra.md               # provisioning + operations runbook
  agent-players-api.md       # contract doc, engine-api.md style
  tech-stack.md              # updated: new-generation stack section
```

`templates/cloudrun-game-starter/` contains: Fastify + TS server serving static
frontend + API, SSE endpoint, session-cookie auth helper, Firestore data-access
layer with typed documents, Cloud Tasks round-deadline helper, agent-players
client with built-in fallback, Dockerfile, compose file, caller CI workflow, and
a README that walks an AI agent through creating a new game.

**The template is copy-and-own, not a framework.** A new game starts as a copy;
from then on the game owns its code, and every feature module is separable and
deletable — a game without agent seats deletes the agent-players client, a game
without timed rounds deletes the Cloud Tasks helper, and nothing else breaks.
The only mandatory pieces are the platform's **deployability contract**: a
Dockerfile, a `/healthz` endpoint, and the caller CI workflow — the minimum for
CI to build, deploy, and monitor the game like any other service. The README
marks each module as required-by-platform or optional.

## 14. Cost model (classroom bursts)

| Item | Idle | Per class session (100 students, ~1h) |
|---|---|---|
| Cloud Run (all services) | $0 (scale to zero) | cents |
| Firestore | $0 (free tier) | ~free at this read/write volume |
| Artifact Registry + logs + misc | ~$1–5/mo | — |
| Cloud Tasks | $0 | ~free |
| LLM agent brain (only if chosen) | $0 | ~$1–5 (see §5.4) |

Expected total: **under ~$5/month idle**, single-digit dollars per active class
week. The $50/mo budget alert threshold is generous headroom, not a target.

## 15. Phasing

- **Phase 0 — provisioning:** billing + project + Terraform apply (§4, §10).
  Blocked on the professor providing a billing account.
- **Phase 1 — platform baseline:** CI/CD workflows, `hub`, `agent-players`
  (heuristic), `cloudrun-game-starter` template, docs. Exit criteria: the smoke
  test runs a full agents-only game on staging from a template-generated demo
  game, and promote-to-prod works.
- **Phase 2 — first new game** (own spec, on the template).
- **Phase 3 — Salary Showdown port** (own spec): move Cloud Functions logic into a
  game service, replace client Firestore listeners with the SSE/poll pattern,
  keep the Firestore data model.

## 16. Open decisions

| Decision | Status |
|---|---|
| Agent brain (heuristic / LLM API / local) | Open — professor decides; §5.4 comparison. Baseline ships heuristic regardless. |
| Custom domain for the hub | Open — deferred until one exists; run.app URLs meanwhile. |
| Monthly budget figure | Proposed $50; professor confirms at provisioning. |
