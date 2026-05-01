import { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, type DocumentData } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useGame } from "../../contexts/GameContext";

const TOTAL_DAYS = 30;
const DAY_DURATION_MS = 4000; // 4 seconds per day
const PRODUCTS = ["croissant", "cookie", "bagel", "sandwich", "coffee", "matcha"] as const;
type Product = typeof PRODUCTS[number];

const PRODUCT_LABELS: Record<Product, string> = {
  croissant: "Croissant",
  cookie:    "Cookie",
  bagel:     "Bagel",
  sandwich:  "Sandwich",
  coffee:    "Coffee",
  matcha:    "Matcha",
};

const AD_ICONS: Record<string, string> = {
  TV:        "/assets/ads/tv.svg",
  Radio:     "/assets/ads/radio.svg",
  Newspaper: "/assets/ads/newspaper.svg",
  Billboard: "/assets/ads/billboard.svg",
};

// Simulate which day each product sells out (days 20–28)
function getSelloutDays(): Record<Product, number> {
  const days = {} as Record<Product, number>;
  for (const p of PRODUCTS) {
    days[p] = 20 + Math.floor(Math.random() * 9);
  }
  return days;
}

/**
 * Sprite asset paths. These are placeholders that Kavin will provide as
 * SVG files in the project's `public/assets/sprites/` directory. Until the
 * real assets land, the <img> tags will silently 404 and CSS fallback
 * styling on the wrapper keeps the layout intact.
 */
const SPRITE_MAINTENANCE_MECHANIC = "/assets/sprites/maintenance-mechanic.svg";
const SPRITE_MAINTENANCE_JANITOR = "/assets/sprites/maintenance-janitor.svg";
const SPRITE_CHEF_DEFAULT = "/assets/sprites/chef-default.svg";

/**
 * For a given specialty chef, return the sprite path. Falls back to a
 * generic chef sprite when nationality/gender variants aren't yet provided.
 */
function chefSpriteFor(nationality?: string, gender?: string): string {
  if (!nationality || !gender) return SPRITE_CHEF_DEFAULT;
  return `/assets/sprites/chef-${nationality}-${gender}.svg`;
}

interface SpecialtyChefSprite {
  id: string;
  nationality?: string;
  gender?: string;
}

export function SimulatePhase() {
  const { gameId, playerId, roundResults, maintenanceBars } = useGame();
  const latest = roundResults[roundResults.length - 1];
  const targetRevenue = typeof latest?.revenue === "number" ? latest.revenue : 0;
  const adWon = latest?.auctionResults?.adWon as string | null | undefined;

  // Maintenance count comes from the latest round's confirmed staff counts.
  const maintenanceCount = Math.max(
    0,
    Number(latest?.staffCounts?.maintenanceGuys ?? 0),
  );

  // Subscribe to the player doc to get the live specialty chef roster, so
  // the count of chefs walking behind the counter matches what the player
  // actually owns (independent of the round-result publish lag).
  const [specialtyChefs, setSpecialtyChefs] = useState<SpecialtyChefSprite[]>([]);
  useEffect(() => {
    if (!gameId || !playerId) return;
    const ref = doc(db, "games", gameId, "players", playerId);
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as DocumentData;
      const raw = Array.isArray(data.specialtyChefs) ? data.specialtyChefs : [];
      const list: SpecialtyChefSprite[] = raw
        .filter((c: unknown): c is { id?: string } => Boolean(c) && typeof c === "object")
        .map((c: { id?: string; nationality?: string; gender?: string }) => ({
          id: String(c.id ?? Math.random().toString(36).slice(2)),
          nationality: c.nationality,
          gender: c.gender,
        }));
      setSpecialtyChefs(list);
    });
  }, [gameId, playerId]);

  // Build maintenance sprite list: alternate mechanic/janitor by index.
  const maintenanceSprites = useMemo(
    () =>
      Array.from({ length: maintenanceCount }, (_, i) => ({
        id: `maint-${i}`,
        src: i % 2 === 0 ? SPRITE_MAINTENANCE_MECHANIC : SPRITE_MAINTENANCE_JANITOR,
        kind: i % 2 === 0 ? "mechanic" : "janitor",
      })),
    [maintenanceCount],
  );

  const [day, setDay] = useState(1);
  const [isNight, setIsNight] = useState(false);
  const [displayRevenue, setDisplayRevenue] = useState(0);
  const [soldOut, setSoldOut] = useState<Set<Product>>(new Set());
  const [cleanlinessDisplay, setCleanlinessDisplay] = useState(maintenanceBars?.cleanliness ?? 100);
  const [ovenDisplay, setOvenDisplay] = useState(maintenanceBars?.ovenHealth ?? 100);

  const selloutDays = useRef(getSelloutDays());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducedMotion = typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  useEffect(() => {
    if (reducedMotion) return;

    let currentDay = 1;
    let nightPhase = false;

    intervalRef.current = setInterval(() => {
      if (!nightPhase) {
        // Day phase: show customers, check sellouts
        const newSoldOut = new Set(soldOut);
        for (const p of PRODUCTS) {
          if (currentDay >= selloutDays.current[p]) newSoldOut.add(p);
        }
        setSoldOut(newSoldOut);

        // Animate maintenance decay
        setCleanlinessDisplay(prev => Math.max(0, prev - (maintenanceBars?.cleanliness ?? 100) / (TOTAL_DAYS * 3)));
        setOvenDisplay(prev => Math.max(0, prev - (maintenanceBars?.ovenHealth ?? 100) / (TOTAL_DAYS * 4)));

        // Animate revenue
        if (targetRevenue > 0) {
          setDisplayRevenue(Math.round((currentDay / TOTAL_DAYS) * targetRevenue));
        }

        nightPhase = true;
        setIsNight(true);
      } else {
        // Night phase: advance day
        currentDay++;
        nightPhase = false;
        setIsNight(false);
        if (currentDay > TOTAL_DAYS) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setDisplayRevenue(targetRevenue);
          return;
        }
        setDay(currentDay);
      }
    }, DAY_DURATION_MS / 2);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const burglary = Boolean((latest as { burglary?: boolean } | undefined)?.burglary);
  const burglaryAmount = Number((latest as { burglaryAmount?: number } | undefined)?.burglaryAmount ?? 0);

  return (
    <section className={`simulate-phase ${isNight ? "simulate-phase--night" : "simulate-phase--day"}`}>
      {/* Top bar */}
      <div className="simulate-phase__topbar">
        <div className="simulate-phase__day-counter">
          {reducedMotion ? "Simulating round…" : `Day ${day} / ${TOTAL_DAYS}`}
        </div>
        <div className="simulate-phase__revenue-counter">
          Revenue: <strong>${displayRevenue.toLocaleString()}</strong>
        </div>
      </div>

      {burglary && (
        <div className="simulate-phase__burglar-banner" role="alert">
          🔓 Your bakery was broken into! A maintenance deficit left you vulnerable.
          {burglaryAmount > 0 ? ` –$${burglaryAmount.toLocaleString()}` : ""}
        </div>
      )}

      <div className="simulate-phase__main">
        {/* Left: Menu */}
        <aside className="simulate-phase__menu-panel">
          <h3 className="simulate-phase__panel-title">Menu</h3>
          <ul className="simulate-phase__menu-list">
            {PRODUCTS.map(p => (
              <li key={p} className={`simulate-phase__menu-item ${soldOut.has(p) ? "simulate-phase__menu-item--soldout" : ""}`}>
                <img src={`/assets/products/${p}.svg`} alt={PRODUCT_LABELS[p]} className="simulate-phase__menu-icon" />
                <span>{PRODUCT_LABELS[p]}</span>
                {soldOut.has(p) && <span className="simulate-phase__sold-out-badge">SOLD OUT</span>}
              </li>
            ))}
          </ul>
        </aside>

        {/* Centre: Bakery visual.
            Layered floor plan (top → bottom):
              1. Maintenance walkway — staff pace in front of the counter
              2. Counter line + ad sign
              3. Behind-counter zone — specialty chefs walk back-and-forth
              4. Storefront label / night overlay */}
        <div className="simulate-phase__bakery-visual">
          {adWon && AD_ICONS[adWon] && (
            <div className="simulate-phase__ad-display">
              <img src={AD_ICONS[adWon]} alt={`${adWon} ad`} className="simulate-phase__ad-icon" />
            </div>
          )}

          {/* Maintenance walkway — front-of-counter, top of the screen */}
          <div className="simulate-phase__maintenance-walkway" aria-hidden="true">
            {maintenanceSprites.length === 0 ? (
              <span className="simulate-phase__maintenance-empty">
                No maintenance hired
              </span>
            ) : (
              maintenanceSprites.map((m, i) => (
                <img
                  key={m.id}
                  src={m.src}
                  alt=""
                  className={`simulate-phase__sprite simulate-phase__sprite--maintenance simulate-phase__sprite--maintenance-${m.kind}`}
                  style={{ animationDelay: `${i * 0.7}s` }}
                />
              ))
            )}
          </div>

          {/* Counter line — separates customers/maintenance (front) from chefs (back) */}
          <div className="simulate-phase__counter" aria-hidden="true" />

          {/* Behind-counter zone — specialty chefs pace back and forth.
              Sprites are larger than the maintenance row and rendered
              on a dedicated stage so they're not occluded by the counter. */}
          <div className="simulate-phase__chef-stage" aria-hidden="true">
            {specialtyChefs.length === 0 ? (
              <span className="simulate-phase__chef-empty">No chefs on staff</span>
            ) : (
              specialtyChefs.map((c, i) => (
                <img
                  key={c.id}
                  src={chefSpriteFor(c.nationality, c.gender)}
                  alt=""
                  className="simulate-phase__sprite simulate-phase__sprite--chef"
                  style={{ animationDelay: `${i * 0.9}s` }}
                />
              ))
            )}
          </div>

          <div className="simulate-phase__storefront">
            <div className="simulate-phase__store-label">🥐 Your Bakery</div>
            {isNight && <div className="simulate-phase__night-label">🌙 Closed</div>}
          </div>
        </div>

        {/* Right: Maintenance bars */}
        <aside className="simulate-phase__status-panel">
          <h3 className="simulate-phase__panel-title">Status</h3>
          {[
            { label: "Cleanliness", value: cleanlinessDisplay },
            { label: "Oven", value: ovenDisplay },
          ].map(({ label, value }) => (
            <div key={label} className="simulate-phase__bar-row">
              <span className="simulate-phase__bar-label">{label}</span>
              <div className="simulate-phase__bar-track">
                <div
                  className="simulate-phase__bar-fill"
                  style={{ width: `${Math.round(value)}%`, background: value > 50 ? "var(--sage, #84cc16)" : "var(--berry, #ef4444)" }}
                />
              </div>
              <span className="simulate-phase__bar-pct">{Math.round(value)}%</span>
            </div>
          ))}
          <p className="simulate-phase__waiting">
            Results loading shortly…
          </p>
        </aside>
      </div>
    </section>
  );
}
