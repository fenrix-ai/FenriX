import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { useGame } from "../contexts/GameContext";
import { db } from "../lib/firebase";
import { formatMoney } from "../lib/cost";
import { readNumber } from "../lib/utils";
import { PageShell } from "../components/ui/PageShell";
import type { RoundResult } from "../types/game";

/**
 * FE-16 — Professor leaderboard.
 *
 * Unlike the player-facing `/leaderboard`, this view is *the only*
 * place in the app where `budgetCurrent` is allowed to render during
 * play. It layers two reads on top of the shared `/leaderboard/latest`
 * document:
 *
 *   1. `/games/{gameId}/leaderboard/latest` — ranked rollup written by
 *      `simulateRound`. Includes `budgetCurrent` per entry.
 *   2. `/games/{gameId}/players/{uid}/rounds/*` — per-round history we
 *      aggregate into a single CSV via `downloadResultsCsv`.
 *
 * Both reads require the signed-in user to have the `professor: true`
 * custom claim (see `firestore.rules`). Without it the listeners
 * surface permission-denied errors and the page renders an inline
 * remediation note.
 */

interface ProfessorRanking {
  rank: number;
  playerId: string;
  displayName: string;
  bakeryName?: string;
  revenueNet?: number;
  cumulativeRevenue?: number;
  budgetCurrent?: number;
  amountBorrowed?: number;
}

interface ProfessorLeaderboardDoc {
  round: number;
  rankings: ProfessorRanking[];
  updatedAt: Timestamp | null;
}

/** Quote a CSV field if it contains delimiters or quotes. */
function quote(s: string): string {
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function fmt(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return String(Math.round(n * 100) / 100);
}

function readRanking(data: DocumentData): ProfessorRanking {
  return {
    rank: typeof data.rank === "number" ? data.rank : 0,
    playerId: typeof data.playerId === "string" ? data.playerId : "",
    displayName:
      typeof data.displayName === "string" ? data.displayName : "Player",
    bakeryName:
      typeof data.bakeryName === "string" ? data.bakeryName : undefined,
    revenueNet:
      typeof data.revenueNet === "number" ? data.revenueNet : undefined,
    cumulativeRevenue:
      typeof data.cumulativeRevenue === "number"
        ? data.cumulativeRevenue
        : undefined,
    budgetCurrent:
      typeof data.budgetCurrent === "number" ? data.budgetCurrent : undefined,
    amountBorrowed:
      typeof data.amountBorrowed === "number" ? data.amountBorrowed : undefined,
  };
}

export function ProfessorLeaderboardPage() {
  const { gameId } = useGame();
  const [board, setBoard] = useState<ProfessorLeaderboardDoc | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [boardReady, setBoardReady] = useState(false);

  // We also aggregate per-round history (for the "Export All" CSV) by
  // subscribing to every player's round subcollection. This is professor-only
  // (rules gate /players/*/rounds). `historyByUid[uid]` is a list of
  // normalised `RoundResult`s; we concat them all on export.
  const [historyByUid, setHistoryByUid] = useState<
    Record<string, RoundResult[]>
  >({});

  useEffect(() => {
    if (!gameId) return;
    const lbRef = doc(db, "games", gameId, "leaderboard", "latest");
    const unsubscribe = onSnapshot(
      lbRef,
      (snap) => {
        setBoardReady(true);
        if (!snap.exists()) {
          setBoard(null);
          return;
        }
        const data = snap.data() as DocumentData;
        const rankings = Array.isArray(data.rankings)
          ? (data.rankings as DocumentData[]).map(readRanking)
          : [];
        setBoard({
          round: typeof data.round === "number" ? data.round : 0,
          rankings,
          updatedAt: (data.updatedAt as Timestamp) ?? null,
        });
        setBoardError(null);
      },
      (err) => {
        console.error("professor-leaderboard/latest listener error", {
          gameId,
          err,
        });
        if ((err as { code?: string })?.code === "permission-denied") {
          setBoardError(
            "Leaderboard read denied. Your account needs the `professor` " +
              "custom claim — run `scripts/set-professor-claim.js`.",
          );
        } else {
          setBoardError("Could not load the professor leaderboard.");
        }
        setBoardReady(true);
      },
    );
    return unsubscribe;
  }, [gameId]);

  // Fan out per-player round subscriptions for Export-All CSV.
  useEffect(() => {
    if (!gameId || !board?.rankings) return;
    const unsubs: Array<() => void> = [];
    board.rankings.forEach((entry) => {
      const roundsRef = collection(
        db,
        "games",
        gameId,
        "players",
        entry.playerId,
        "rounds",
      );
      const unsubscribe = onSnapshot(
        roundsRef,
        (snap) => {
          const rows: RoundResult[] = snap.docs.map((d) => {
            const data = d.data() as DocumentData;
            const round = typeof data.round === "number" ? data.round : 0;
            return {
              round,
              revenue:
                readNumber(data.revenue) ?? readNumber(data.revenueNet) ?? 0,
              customerCount: readNumber(data.customerCount) ?? 0,
              customerSatisfaction: readNumber(data.customerSatisfaction) ?? 0,
              auctionResults: data.auctionResults ?? {
                adWon: null,
                chefWon: null,
              },
              revenueGross: readNumber(data.revenueGross),
              revenueNet: readNumber(data.revenueNet),
              amountBorrowed: readNumber(data.amountBorrowed),
              interestCharged: readNumber(data.interestCharged),
              chefSatisfactionScore:
                readNumber(data.chefSatisfactionScore) ?? 0,
              maintenanceBars: data.maintenanceBars ?? {
                cleanliness: 100,
                ovenHealth: 100,
                slicerHealth: 100,
                espressoHealth: 100,
              },
              chefDepartures: Array.isArray(data.chefDepartures)
                ? (data.chefDepartures as string[])
                : [],
            } satisfies RoundResult;
          });
          rows.sort((a, b) => a.round - b.round);
          setHistoryByUid((prev) => ({ ...prev, [entry.playerId]: rows }));
        },
        () => {
          // Silent — export will just skip that player.
        },
      );
      unsubs.push(unsubscribe);
    });
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [gameId, board?.rankings]);

  // Stats rollup (totals + averages across all players).
  const stats = useMemo(() => {
    const r = board?.rankings ?? [];
    if (r.length === 0) return null;
    const totalRevenue = r.reduce(
      (sum, e) =>
        sum + (readNumber(e.revenueNet) ?? readNumber(e.cumulativeRevenue) ?? 0),
      0,
    );
    const totalBudget = r.reduce(
      (sum, e) => sum + (readNumber(e.budgetCurrent) ?? 0),
      0,
    );
    const borrowers = r.filter(
      (e) => (readNumber(e.amountBorrowed) ?? 0) > 0,
    ).length;
    return {
      count: r.length,
      avgRevenue: totalRevenue / r.length,
      totalBudget,
      borrowers,
    };
  }, [board?.rankings]);

  const onExportAll = () => {
    // Multi-player CSV: one row per (player, round). Adds a `bakery` and
    // `player` column on top of the standard round fields. Kept inline
    // (rather than reusing `downloadResultsCsv`) so the professor view
    // can include player-identifying columns.
    const header = [
      "player",
      "bakery",
      "round",
      "revenue_gross",
      "revenue_net",
      "customers",
      "customer_satisfaction_pct",
      "amount_borrowed",
      "interest_charged",
      "chef_satisfaction_pct",
      "cleanliness_pct",
      "oven_pct",
      "slicer_pct",
      "espresso_pct",
      "chef_departures",
    ];
    const rows: string[] = [];
    Object.entries(historyByUid).forEach(([uid, playerRows]) => {
      const entry = board?.rankings.find((r) => r.playerId === uid);
      const name = entry?.displayName ?? uid;
      const bakery = entry?.bakeryName ?? "";
      playerRows.forEach((r) => {
        rows.push(
          [
            quote(name),
            quote(bakery),
            r.round,
            fmt(r.revenueGross),
            fmt(r.revenueNet),
            r.customerCount ?? 0,
            Math.round(r.customerSatisfaction ?? 0),
            fmt(r.amountBorrowed),
            fmt(r.interestCharged),
            Math.round(r.chefSatisfactionScore ?? 0),
            Math.round(r.maintenanceBars?.cleanliness ?? 0),
            Math.round(r.maintenanceBars?.ovenHealth ?? 0),
            Math.round(r.maintenanceBars?.slicerHealth ?? 0),
            Math.round(r.maintenanceBars?.espressoHealth ?? 0),
            quote((r.chefDepartures ?? []).join("; ")),
          ].join(","),
        );
      });
    });
    if (rows.length === 0) {
      window.alert("No round history available to export yet.");
      return;
    }
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bakery-bash-professor-${gameId ?? "export"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const rankings = board?.rankings ?? [];
  const showEmpty = boardReady && !boardError && rankings.length === 0;

  return (
    <PageShell className="professor-leaderboard">
      <div className="professor-leaderboard__header">
        <h1 className="professor-leaderboard__title">
          Professor Leaderboard
          {board?.round ? (
            <span className="professor-leaderboard__round">
              {" "}
              · Round {board.round}
            </span>
          ) : null}
        </h1>
        <div className="professor-leaderboard__actions">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={rankings.length === 0}
            onClick={onExportAll}
          >
            Export All (CSV)
          </button>
          <Link to="/professor" className="btn btn--ghost">
            ← Back to controls
          </Link>
        </div>
      </div>

      {boardError && (
        <p className="professor-leaderboard__error" role="alert">
          {boardError}
        </p>
      )}

      {stats && (
        <div className="professor-leaderboard__stats">
          <div className="professor-leaderboard__stat">
            <span className="professor-leaderboard__stat-label">Players</span>
            <span className="professor-leaderboard__stat-value">
              {stats.count}
            </span>
          </div>
          <div className="professor-leaderboard__stat">
            <span className="professor-leaderboard__stat-label">
              Avg. net revenue
            </span>
            <span className="professor-leaderboard__stat-value">
              {formatMoney(stats.avgRevenue)}
            </span>
          </div>
          <div className="professor-leaderboard__stat">
            <span className="professor-leaderboard__stat-label">
              Total budget
            </span>
            <span className="professor-leaderboard__stat-value">
              {formatMoney(stats.totalBudget)}
            </span>
          </div>
          <div className="professor-leaderboard__stat">
            <span className="professor-leaderboard__stat-label">Borrowers</span>
            <span className="professor-leaderboard__stat-value">
              {stats.borrowers}
            </span>
          </div>
        </div>
      )}

      <table className="professor-leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Bakery</th>
            <th>Player</th>
            <th>Net revenue</th>
            <th>Budget</th>
            <th>Borrowed?</th>
          </tr>
        </thead>
        <tbody>
          {!boardReady ? (
            <tr>
              <td colSpan={6} className="professor-leaderboard-table__empty">
                Loading leaderboard…
              </td>
            </tr>
          ) : showEmpty ? (
            <tr>
              <td colSpan={6} className="professor-leaderboard-table__empty">
                Waiting for first round results…
              </td>
            </tr>
          ) : (
            rankings.map((entry) => {
              const revenue =
                readNumber(entry.revenueNet) ??
                readNumber(entry.cumulativeRevenue) ??
                0;
              const budget = readNumber(entry.budgetCurrent) ?? 0;
              const borrowed = readNumber(entry.amountBorrowed) ?? 0;
              return (
                <tr key={entry.playerId || entry.rank}>
                  <td>{entry.rank}</td>
                  <td>{entry.bakeryName ?? "—"}</td>
                  <td>{entry.displayName}</td>
                  <td>{formatMoney(revenue)}</td>
                  <td
                    className={
                      budget < 0 ? "professor-leaderboard-table__deficit" : ""
                    }
                  >
                    {formatMoney(budget)}
                  </td>
                  <td>{borrowed > 0 ? formatMoney(borrowed) : "—"}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </PageShell>
  );
}
