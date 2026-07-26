# Salary Showdown load drill — 2026-07-26

- Mode: PROD (project salary-showdown, functions us-west1)
- Teams: 21 (63 synthetic clients + 1 driver) · gameId WCAZ3lwN9Qz1xVvcoR7f · joinCode WCAZ3L
- Listener set per client: game doc, own membership, teams collection, market/{round}, rounds/{r} in SIMULATE/RESULTS/FINALE, one-time catalog fetch

## Per-flip game-doc propagation (ms, transition-gated delivery vs driver post-callable)

| Flip | acks | p50 | p95 | max | missed@15s |
|---|---|---|---|---|---|
| 1:FREE_AGENCY | 63/63 | 94 | 351 | 3955 | 0 |
| 1:AUCTION | 63/63 | 21 | 22 | 23 | 0 |
| 1:LINEUP | 63/63 | 0 | 3 | 3 | 0 |
| 1:SIMULATE | 63/63 | 13 | 15 | 39 | 0 |
| 1:RESULTS | 63/63 | 204 | 204 | 396 | 0 |
| 2:FRONT_OFFICE | 63/63 | 19 | 42 | 43 | 0 |
| 2:FREE_AGENCY | 63/63 | 1 | 3 | 3 | 0 |
| 2:AUCTION | 63/63 | 0 | 0 | 6 | 0 |
| 2:LINEUP | 63/63 | 0 | 1 | 1 | 0 |
| 2:SIMULATE | 63/63 | 3 | 85 | 91 | 0 |
| 2:RESULTS | 63/63 | 9 | 10 | 10 | 0 |
| 3:FRONT_OFFICE | 63/63 | 17 | 21 | 22 | 0 |
| 3:FREE_AGENCY | 63/63 | 98 | 101 | 102 | 0 |
| 3:AUCTION | 63/63 | 19 | 19 | 19 | 0 |
| 3:LINEUP | 63/63 | 0 | 0 | 0 | 0 |
| 3:SIMULATE | 63/63 | 2 | 89 | 257 | 0 |
| 3:RESULTS | 63/63 | 87 | 88 | 88 | 0 |
| 4:FRONT_OFFICE | 61/63 | 41 | 52 | 7972 | 2 |
| 4:FREE_AGENCY | 61/63 | 1 | 2 | 13914 | 2 |
| 4:AUCTION | 63/63 | 18 | 18 | 20 | 0 |
| 4:LINEUP | 63/63 | 74 | 111 | 111 | 0 |
| 4:SIMULATE | 63/63 | 311 | 394 | 394 | 0 |
| 4:RESULTS | 63/63 | 11 | 11 | 93 | 0 |
| 5:FRONT_OFFICE | 63/63 | 117 | 125 | 126 | 0 |
| 5:FREE_AGENCY | 63/63 | 15 | 21 | 21 | 0 |
| 5:AUCTION | 63/63 | 18 | 132 | 132 | 0 |
| 5:LINEUP | 63/63 | 0 | 0 | 0 | 0 |
| 5:SIMULATE | 63/63 | 915 | 1267 | 1386 | 0 |
| 5:RESULTS | 63/63 | 30 | 30 | 30 | 0 |
| 5:FINALE | 63/63 | 10 | 10 | 11 | 0 |

Worst overall: p95 1267 ms at flip 5:SIMULATE.

## Callable latency (ms)

| Callable | calls | p50 | p95 | errors |
|---|---|---|---|---|
| createGame | 1 | 1300 | 1300 | 0 |
| joinGame | 63 | 1335 | 2482 | 0 |
| startSeason | 1 | 230 | 230 | 0 |
| setTimer | 19 | 184 | 1166 | 0 |
| signPlayer | 168 | 589 | 1251 | 0 |
| markDone | 189 | 1094 | 3533 | 0 |
| advancePhase | 29 | 740 | 1524 | 0 |
| submitBids | 105 | 803 | 1309 | 0 |

## Listener health

- Error callbacks fired: 0
- Stale-window strikes (missed a 15 s ack window): t09-scoutx1, t19-scoutx2, t11-gmx1
- Deaths (errors + permanently stale at season end): 0

## rounds/{r} serialized size

| Round | bytes |
|---|---|
| 1 | 352608 |
| 2 | 349450 |
| 3 | 349704 |
| 4 | 351190 |
| 5 | 349888 |


## PASS criteria

| Criterion | Threshold | Measured | Verdict |
|---|---|---|---|
| p95 flip propagation (worst flip) | < 3000 ms | 1267 ms | PASS |
| listener deaths | = 0 | 0 | PASS |
| callable p95 (worst callable) | < 5000 ms | 3533 ms | PASS |
| rounds/{r} max size | < 700000 B | 352608 B | PASS |

**RESULT: PASS**

## Cost note

575 function invocations + ~751277 Firestore reads (upper bound; collection snapshots counted whole). Ballpark: reads ~$0.45 + invocations ~$0.00 — locked expectation: class session + load drill each < $1 of overage; idle $0.
