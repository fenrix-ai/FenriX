import { useEffect, useState } from "react";
import { SCENE } from "./scene-geometry";

/**
 * Maintenance staff walkers, displayed at the top of the simulation
 * scene IN FRONT of the counter (rendered after CounterFrontLayer in
 * PixelBakeryScene so they overlap the counter graphic).
 *
 * Two roles, alternating by hire order:
 *   - mechanic — uses /assets/staff/maintenance.svg
 *   - janitor  — uses /assets/staff/maintenance-guy.svg
 *
 * Both assets already ship with the game, so no extra art is required.
 * Emoji placeholders remain as a defensive fallback if the SVG ever
 * 404s, but the network requests resolve in normal builds.
 */

interface Props {
  /** Number of maintenance staff hired (`pendingDecision.staffCounts.maintenanceGuys`). */
  count: number;
}

const WALKER_SIZE = 32;
/** Walking band sits at the top of the floor strip, in front of the
 *  counter. The counter spans y=140..180; the walkers sit at y≈148 so
 *  the upper half of their sprite peeks above the counter while their
 *  feet stay below the counter line (z-ordered in front). */
const WALKER_TOP_Y = 144;
const WALK_X_MIN = 16;
const WALK_X_MAX = 440;
const SPEED_MIN = 0.018;
const SPEED_MAX = 0.04;

type Role = "mechanic" | "janitor";

interface WalkerState {
  x: number;
  direction: 1 | -1;
  speed: number;
  bobPhase: number;
  role: Role;
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function makeInitial(index: number, total: number): WalkerState {
  const span = WALK_X_MAX - WALK_X_MIN;
  const slot = total > 0 ? span / total : span;
  // Alternate roles so a hired pair shows one mechanic + one janitor.
  const role: Role = index % 2 === 0 ? "mechanic" : "janitor";
  return {
    x: Math.round(WALK_X_MIN + slot * (index + 0.5)),
    direction: Math.random() < 0.5 ? -1 : 1,
    speed: randRange(SPEED_MIN, SPEED_MAX),
    bobPhase: Math.random() * Math.PI * 2,
    role,
  };
}

const ROLE_PLACEHOLDER: Record<Role, string> = {
  mechanic: "🔧",
  janitor: "🧹",
};

const ROLE_LABEL: Record<Role, string> = {
  mechanic: "Mechanic",
  janitor: "Janitor",
};

const ROLE_ASSET: Record<Role, string> = {
  mechanic: "/assets/staff/maintenance.svg",
  janitor: "/assets/staff/maintenance-guy.svg",
};

export function MaintenanceWalkers({ count }: Props) {
  const visibleCount = Math.max(0, Math.floor(count));

  // Walker state lives in useState (not a ref) so reads during render
  // are safe. The rAF loop calls setStates() with mutated copies on
  // every frame, which drives both motion and re-render in one step.
  const [states, setStates] = useState<WalkerState[]>([]);

  // Initialize / resize states when the hire count changes.
  useEffect(() => {
    setStates((current) => {
      const next: WalkerState[] = [];
      for (let i = 0; i < visibleCount; i++) {
        next.push(current[i] ?? makeInitial(i, visibleCount));
      }
      return next;
    });
  }, [visibleCount]);

  useEffect(() => {
    if (visibleCount === 0) return;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let raf = 0;
    let lastTs: number | null = null;
    const step = (ts: number) => {
      const dt = lastTs == null ? 0 : ts - lastTs;
      lastTs = ts;
      setStates((prev) =>
        prev.map((s) => {
          let x = s.x + s.direction * s.speed * dt;
          let direction: 1 | -1 = s.direction;
          if (x <= WALK_X_MIN) {
            x = WALK_X_MIN;
            direction = 1;
          } else if (x >= WALK_X_MAX) {
            x = WALK_X_MAX;
            direction = -1;
          }
          return { ...s, x, direction, bobPhase: s.bobPhase + dt * 0.007 };
        }),
      );
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [visibleCount]);

  if (visibleCount === 0) return null;

  return (
    <div
      aria-hidden
      data-testid="maintenance-walkers"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        width: SCENE.width,
        height: SCENE.height,
        // Layer on top of the counter front (rendered after
        // CounterFrontLayer in PixelBakeryScene). z-index keeps the
        // walkers visible above any earlier-positioned layers that share
        // the same stacking context.
        zIndex: 5,
      }}
    >
      {states.map((s, i) => {
        const bob = Math.round(Math.sin(s.bobPhase) * 1.5);
        const flip = s.direction === -1 ? "scaleX(-1)" : "scaleX(1)";
        const asset = ROLE_ASSET[s.role];
        return (
          <div
            key={`maint-${i}`}
            data-testid={`maintenance-walker-${i}`}
            title={ROLE_LABEL[s.role]}
            style={{
              position: "absolute",
              left: `${Math.round(s.x - WALKER_SIZE / 2)}px`,
              top: `${WALKER_TOP_Y + bob}px`,
              width: `${WALKER_SIZE}px`,
              height: `${WALKER_SIZE}px`,
              transform: flip,
              transformOrigin: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
            }}
          >
            <img
              src={asset}
              alt=""
              width={WALKER_SIZE}
              height={WALKER_SIZE}
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                imageRendering: "auto",
                filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.4))",
              }}
              onError={(e) => {
                // Defensive fallback only — the listed assets ship with
                // the game, so this branch should not normally trigger.
                (e.currentTarget as HTMLImageElement).style.display = "none";
                const parent = e.currentTarget.parentElement;
                if (parent && !parent.dataset.fallbackShown) {
                  parent.dataset.fallbackShown = "1";
                  parent.textContent = ROLE_PLACEHOLDER[s.role];
                }
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
