import { useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../../contexts/GameContext";
import {
  daysInRound,
  formatDayInRound,
  monthNameForRound,
} from "../../lib/dateSystem";
import type { ProductKey, StaffCounts } from "../../types/game";

/**
 * SimulatePhase — Apr 22 visual rework.
 *
 * The old simulation used two emoji customers and a single "storefront"
 * block. This version lays out a full bakery interior:
 *
 *   - A pastry display counter with each menu product + remaining quantity
 *     + a "sold out" stamp that lights up as stations run out.
 *   - A register on the left with a live revenue counter.
 *   - A barista bar on the right showing the coffee + matcha stations.
 *   - An oven + prep area along the back wall populated with specialty
 *     chef + sous chef sprites (sous chef sprite repeats per hired
 *     count), plus maintenance staff on the floor.
 *   - Neutral silhouette customers cycle in/out of the front of the
 *     store.
 *
 * Simulation duration now matches the number of days in the current
 * round's calendar month (January = 31, February = 28, etc.) and uses
 * the shared date system so day labels read "Jan 14", "Feb 3", etc.
 */
const DAY_DURATION_MS = 2000;

const PRODUCTS: ProductKey[] = [
  "croissant",
  "cookie",
  "bagel",
  "sandwich",
  "coffee",
  "matcha",
];

const PRODUCT_LABELS: Record<ProductKey, string> = {
  croissant: "Croissant",
  cookie: "Cookie",
  bagel: "Bagel",
  sandwich: "Sandwich",
  coffee: "Coffee",
  matcha: "Matcha",
};

const AD_ICONS: Record<string, string> = {
  TV: "/assets/ads/tv.svg",
  Radio: "/assets/ads/radio.svg",
  Newspaper: "/assets/ads/newspaper.svg",
  Billboard: "/assets/ads/billboard.svg",
};

const CUSTOMER_ASSETS = [
  "/assets/customers/customer-1.svg",
  "/assets/customers/customer-2.svg",
  "/assets/customers/customer-3.svg",
];

const CHEF_FALLBACK = "/assets/chefs/french-m.svg";
const SOUS_CHEF_ASSET = "/assets/staff/sous-chef.svg";
const MAINTENANCE_ASSET = "/assets/staff/maintenance.svg";

interface SimulatedStartQuantities {
  [productId: string]: number;
}

function getStartingQuantities(
  productBreakdown: Partial<Record<ProductKey, number>> | undefined,
): SimulatedStartQuantities {
  // Use the breakdown from the result as the "starting" quantity so each
  // product's counter visibly ticks down over the sim. When we don't have
  // that data yet (legacy round docs), fall back to a plausible 300 so the
  // menu doesn't show "0" the entire sim.
  const out: SimulatedStartQuantities = {};
  for (const p of PRODUCTS) {
    const raw = productBreakdown?.[p];
    out[p] =
      typeof raw === "number" && raw > 0 ? raw : 300;
  }
  return out;
}

function clampRange(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function countSpecialtyChefs(result: unknown): number {
  if (
    result &&
    typeof result === "object" &&
    "chefSatisfactionScores" in result
  ) {
    const scores = (result as { chefSatisfactionScores?: Record<string, number> })
      .chefSatisfactionScores;
    if (scores && typeof scores === "object") {
      return Object.keys(scores).length;
    }
  }
  return 0;
}

export function SimulatePhase() {
  const { roundResults, maintenanceBars, currentRound } = useGame();
  const latest = roundResults[roundResults.length - 1];

  const adWon = latest?.auctionResults?.adWon ?? latest?.adWon ?? null;
  const targetRevenue =
    typeof latest?.revenueNet === "number"
      ? latest.revenueNet
      : typeof latest?.revenue === "number"
      ? latest.revenue
      : 0;

  const staffCounts: StaffCounts = latest?.staffCounts ?? {
    bakerySousChefs: 0,
    deliSousChefs: 0,
    baristaSousChefs: 0,
    maintenanceGuys: 0,
  };
  const specialtyChefCount = countSpecialtyChefs(latest);

  const totalDays = daysInRound(currentRound);
  const monthName = monthNameForRound(currentRound) ?? "Month";

  const [day, setDay] = useState(1);
  const [isNight, setIsNight] = useState(false);
  const [displayRevenue, setDisplayRevenue] = useState(0);
  const [remaining, setRemaining] = useState<SimulatedStartQuantities>(() =>
    getStartingQuantities(latest?.productBreakdown),
  );
  const [soldOut, setSoldOut] = useState<Set<ProductKey>>(new Set());
  const [cleanlinessDisplay, setCleanlinessDisplay] = useState(
    maintenanceBars?.cleanliness ?? 100,
  );
  const [ovenDisplay, setOvenDisplay] = useState(
    maintenanceBars?.ovenHealth ?? 100,
  );

  const startingRef = useRef<SimulatedStartQuantities>(
    getStartingQuantities(latest?.productBreakdown),
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  useEffect(() => {
    if (reducedMotion) return;

    let currentDay = 1;
    let nightPhase = false;

    intervalRef.current = setInterval(() => {
      if (!nightPhase) {
        // Tick each product down toward 0 proportionally to how many days
        // remain. Products naturally sell out near the end of the month.
        setRemaining((prev) => {
          const next: SimulatedStartQuantities = { ...prev };
          const newSoldOut = new Set<ProductKey>();
          for (const p of PRODUCTS) {
            const start = startingRef.current[p];
            const burn = Math.ceil(start / totalDays);
            const leftover = Math.max(0, next[p] - burn);
            next[p] = leftover;
            if (leftover === 0) newSoldOut.add(p);
          }
          setSoldOut((prevSet) => {
            const merged = new Set(prevSet);
            newSoldOut.forEach((p) => merged.add(p));
            return merged;
          });
          return next;
        });

        setCleanlinessDisplay((prev) =>
          Math.max(
            0,
            prev - (maintenanceBars?.cleanliness ?? 100) / (totalDays * 3),
          ),
        );
        setOvenDisplay((prev) =>
          Math.max(
            0,
            prev - (maintenanceBars?.ovenHealth ?? 100) / (totalDays * 4),
          ),
        );

        if (targetRevenue > 0) {
          setDisplayRevenue(
            Math.round((currentDay / totalDays) * targetRevenue),
          );
        }

        nightPhase = true;
        setIsNight(true);
      } else {
        currentDay++;
        nightPhase = false;
        setIsNight(false);
        if (currentDay > totalDays) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setDisplayRevenue(targetRevenue);
          return;
        }
        setDay(currentDay);
      }
    }, DAY_DURATION_MS / 2);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const burglary = Boolean(
    (latest as { burglary?: boolean } | undefined)?.burglary,
  );
  const burglaryAmount = Number(
    (latest as { burglaryAmount?: number } | undefined)?.burglaryAmount ?? 0,
  );

  const customerCycle = useMemo(() => {
    // Rotate through 4 customer positions per day for visual interest.
    const positions = clampRange(3 + ((day % 5) - 1), 0, 4);
    return Array.from({ length: positions }, (_, i) => ({
      idx: i,
      asset: CUSTOMER_ASSETS[(day + i) % CUSTOMER_ASSETS.length],
    }));
  }, [day]);

  return (
    <section
      className={`simulate-phase ${
        isNight ? "simulate-phase--night" : "simulate-phase--day"
      }`}
    >
      <div className="simulate-phase__topbar">
        <div className="simulate-phase__day-counter">
          {reducedMotion
            ? "Simulating round…"
            : `${formatDayInRound(currentRound, day)} · Day ${day}/${totalDays}`}
        </div>
        <div className="simulate-phase__month-label" aria-hidden>
          {monthName}
        </div>
        <div className="simulate-phase__revenue-counter">
          Revenue: <strong>${displayRevenue.toLocaleString()}</strong>
        </div>
      </div>

      {burglary && (
        <div className="simulate-phase__burglar-banner" role="alert">
          🔓 Your bakery was broken into!
          {burglaryAmount > 0
            ? ` –$${burglaryAmount.toLocaleString()}`
            : ""}
        </div>
      )}

      <div className="simulate-phase__bakery-interior">
        {/* Back wall: oven + prep + barista bar */}
        <div className="bakery-interior__back-wall">
          <div className="bakery-interior__oven" aria-label="Oven">
            <div className="bakery-interior__oven-glow" />
            <span className="bakery-interior__oven-label">OVEN</span>
          </div>
          <div
            className="bakery-interior__prep-line"
            aria-label="Specialty chefs at the prep line"
          >
            {Array.from({
              length: Math.max(1, specialtyChefCount),
            }).map((_, i) => (
              <img
                key={`chef-${i}`}
                src={CHEF_FALLBACK}
                alt=""
                aria-hidden
                className="bakery-interior__chef"
              />
            ))}
          </div>
          <div
            className="bakery-interior__barista-bar"
            aria-label="Barista bar with coffee and matcha"
          >
            <div className="bakery-interior__barista-machine">
              <span>☕</span>
              <small>Coffee</small>
            </div>
            <div className="bakery-interior__barista-machine">
              <span>🍵</span>
              <small>Matcha</small>
            </div>
            {Array.from({
              length: staffCounts.baristaSousChefs,
            }).map((_, i) => (
              <img
                key={`barista-${i}`}
                src={SOUS_CHEF_ASSET}
                alt=""
                aria-hidden
                className="bakery-interior__sous-chef"
              />
            ))}
          </div>
        </div>

        {/* Middle row: sous-chef stations (bakery + deli) */}
        <div className="bakery-interior__stations">
          <div className="bakery-interior__station">
            <div className="bakery-interior__station-label">Bakery</div>
            <div className="bakery-interior__station-staff">
              {Array.from({
                length: staffCounts.bakerySousChefs,
              }).map((_, i) => (
                <img
                  key={`bakery-sous-${i}`}
                  src={SOUS_CHEF_ASSET}
                  alt=""
                  aria-hidden
                  className="bakery-interior__sous-chef"
                />
              ))}
            </div>
          </div>
          <div className="bakery-interior__station">
            <div className="bakery-interior__station-label">Deli</div>
            <div className="bakery-interior__station-staff">
              {Array.from({
                length: staffCounts.deliSousChefs,
              }).map((_, i) => (
                <img
                  key={`deli-sous-${i}`}
                  src={SOUS_CHEF_ASSET}
                  alt=""
                  aria-hidden
                  className="bakery-interior__sous-chef"
                />
              ))}
            </div>
          </div>
          <div className="bakery-interior__maintenance-row">
            {Array.from({
              length: staffCounts.maintenanceGuys,
            }).map((_, i) => (
              <img
                key={`maint-${i}`}
                src={MAINTENANCE_ASSET}
                alt=""
                aria-hidden
                className="bakery-interior__maintenance"
              />
            ))}
          </div>
        </div>

        {/* Pastry display case + menu */}
        <div className="bakery-interior__display-case">
          <div className="bakery-interior__display-case-label">
            Pastry Display
          </div>
          <ul className="bakery-interior__menu">
            {PRODUCTS.map((p) => {
              const sold = soldOut.has(p);
              const qty = remaining[p] ?? 0;
              return (
                <li
                  key={p}
                  className={`bakery-interior__menu-item${
                    sold ? " bakery-interior__menu-item--soldout" : ""
                  }`}
                >
                  <img
                    src={`/assets/products/${p}.svg`}
                    alt=""
                    aria-hidden
                    className="bakery-interior__menu-icon"
                  />
                  <span className="bakery-interior__menu-name">
                    {PRODUCT_LABELS[p]}
                  </span>
                  <span className="bakery-interior__menu-qty">
                    {sold ? 0 : qty.toLocaleString()}
                  </span>
                  {sold && (
                    <span className="bakery-interior__soldout-stamp" aria-hidden>
                      SOLD OUT
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Front: register + customers + ad display */}
        <div className="bakery-interior__front">
          <div
            className="bakery-interior__register"
            aria-label="Cash register"
          >
            <div className="bakery-interior__register-top">💰</div>
            <div className="bakery-interior__register-body">REGISTER</div>
          </div>
          <div className="bakery-interior__customer-floor">
            {!isNight &&
              !reducedMotion &&
              customerCycle.map(({ idx, asset }) => (
                <img
                  key={`customer-${day}-${idx}`}
                  src={asset}
                  alt=""
                  aria-hidden
                  className="bakery-interior__customer"
                  style={{ left: `${8 + idx * 20}%` }}
                />
              ))}
            {isNight && (
              <div className="bakery-interior__closed">🌙 Closed</div>
            )}
          </div>
          {adWon && AD_ICONS[adWon] && (
            <div
              className="bakery-interior__ad"
              aria-label={`${adWon} ad active`}
            >
              <img src={AD_ICONS[adWon]} alt="" aria-hidden />
              <span>{adWon}</span>
            </div>
          )}
        </div>
      </div>

      <aside className="simulate-phase__status-panel">
        <h3 className="simulate-phase__panel-title">Kitchen Status</h3>
        {[
          { label: "Cleanliness", value: cleanlinessDisplay },
          { label: "Oven", value: ovenDisplay },
        ].map(({ label, value }) => (
          <div key={label} className="simulate-phase__bar-row">
            <span className="simulate-phase__bar-label">{label}</span>
            <div className="simulate-phase__bar-track">
              <div
                className="simulate-phase__bar-fill"
                style={{
                  width: `${Math.round(value)}%`,
                  background:
                    value > 50
                      ? "var(--sage, #84cc16)"
                      : "var(--berry, #ef4444)",
                }}
              />
            </div>
            <span className="simulate-phase__bar-pct">
              {Math.round(value)}%
            </span>
          </div>
        ))}
        <p className="simulate-phase__waiting">
          Results loading shortly…
        </p>
      </aside>
    </section>
  );
}
