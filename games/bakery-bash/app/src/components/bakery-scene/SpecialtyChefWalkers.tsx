import { useEffect, useState } from "react";
import { SCENE } from "./scene-geometry";
import type { SpecialtyChefBadge } from "./SpecialtyChefBadges";

/**
 * Specialty chef WALKERS (replaces static portrait cameos for the
 * simulation phase). Each chef paces back-and-forth in a band BEHIND the
 * counter (rendered before CounterFrontLayer in PixelBakeryScene), using
 * the existing nationality SVG portraits at a larger size so they're not
 * occluded by the bakery station / espresso machine.
 *
 * Sized at 40×40 px (vs the 22×22 wall cameos) so the chef silhouette is
 * clearly visible above the counter line. Each walker has its own random
 * speed + start position so the team's 1–3 specialty chefs don't pace in
 * sync.
 */

interface Props {
  chefs: SpecialtyChefBadge[];
}

/** Match the sous-chef sprite height after 1.5× scaling (original 40px → 60px). */
const WALKER_HEIGHT = 60;
const WALKER_WIDTH = 36;
/** Horizontal walking band — keep clear of the door (x=456) on the right. */
const WALK_X_MIN = 24;
const WALK_X_MAX = 420;
/** Top-edge Y aligned to SCENE.chefTopY so specialty chefs stand at the
 * same level as sous chefs, layered just behind them. */
const WALKER_TOP_Y = SCENE.chefTopY;
const SPEED_MIN = 0.015; // px / ms
const SPEED_MAX = 0.035;

interface WalkerState {
  x: number;
  direction: 1 | -1;
  speed: number;
  bobPhase: number;
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function makeInitial(index: number, total: number): WalkerState {
  // Spread starting positions evenly across the band so the walkers don't
  // overlap on first paint.
  const span = WALK_X_MAX - WALK_X_MIN;
  const slot = total > 0 ? span / total : span;
  return {
    x: Math.round(WALK_X_MIN + slot * (index + 0.5)),
    direction: Math.random() < 0.5 ? -1 : 1,
    speed: randRange(SPEED_MIN, SPEED_MAX),
    bobPhase: Math.random() * Math.PI * 2,
  };
}

export function SpecialtyChefWalkers({ chefs }: Props) {
  // Cap at 3 — matches specialtyChefCap.
  const visible = chefs.slice(0, 3);
  const visibleKey = visible.map((c) => c.id).join("|");

  // Walker state lives in useState (keyed by chef id) so reads during
  // render are safe. The rAF loop calls setStates() each frame and that
  // single call drives both motion and re-render.
  const [states, setStates] = useState<Record<string, WalkerState>>({});

  // Initialize / clean up walker state when the chef list changes.
  useEffect(() => {
    setStates((current) => {
      const next: Record<string, WalkerState> = {};
      visible.forEach((c, i) => {
        next[c.id] = current[c.id] ?? makeInitial(i, visible.length);
      });
      return next;
    });
    // visibleKey captures membership; we don't need to depend on the
    // unstable `visible` array reference itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);

  // Animation loop — paces each walker between WALK_X_MIN..MAX with a
  // gentle vertical bob.
  useEffect(() => {
    if (visible.length === 0) return;
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
      setStates((prev) => {
        const next: Record<string, WalkerState> = {};
        for (const id in prev) {
          const s = prev[id];
          let x = s.x + s.direction * s.speed * dt;
          let direction: 1 | -1 = s.direction;
          if (x <= WALK_X_MIN) {
            x = WALK_X_MIN;
            direction = 1;
          } else if (x >= WALK_X_MAX) {
            x = WALK_X_MAX;
            direction = -1;
          }
          next[id] = { x, direction, speed: s.speed, bobPhase: s.bobPhase + dt * 0.006 };
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [visible.length]);

  if (visible.length === 0) return null;

  return (
    <div
      aria-hidden
      data-testid="specialty-chef-walkers"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        width: SCENE.width,
        height: SCENE.height,
      }}
    >
      {visible.map((chef) => {
        const s = states[chef.id];
        if (!s) return null;
        const bob = Math.round(Math.sin(s.bobPhase) * 1.5);
        const portrait = `/assets/chefs/${chef.nationality}-${chef.gender}.svg`;
        const flip = s.direction === -1 ? "scaleX(-1)" : "scaleX(1)";
        return (
          <div
            key={chef.id}
            data-testid={`specialty-chef-walker-${chef.id}`}
            title={chef.name}
            style={{
              position: "absolute",
              left: `${Math.round(s.x - WALKER_WIDTH / 2)}px`,
              top: `${WALKER_TOP_Y + bob}px`,
              width: `${WALKER_WIDTH}px`,
              height: `${WALKER_HEIGHT}px`,
              transform: flip,
              transformOrigin: "center",
            }}
          >
            <img
              src={portrait}
              alt=""
              width={WALKER_WIDTH}
              height={WALKER_HEIGHT}
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                imageRendering: "auto",
                filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.4))",
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
