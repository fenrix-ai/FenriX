import { useGame } from "../../contexts/GameContext";
import type { StationId } from "../../types/game";

/**
 * Storefront shelf items. The asset files are still named after the legacy
 * product keys (`latte.svg`, `matcha-latte.svg`) — art pipeline rename is
 * tracked separately. The canonical product keys (`coffee`, `matcha`) are
 * used everywhere in code; we just point at the old files for display.
 */
const SHELF_ITEMS = [
  { src: "/assets/products/croissant.svg", alt: "Croissant" },
  { src: "/assets/products/cookie.svg", alt: "Cookie" },
  { src: "/assets/products/bagel.svg", alt: "Bagel" },
  { src: "/assets/products/sandwich.svg", alt: "Sandwich" },
  { src: "/assets/products/latte.svg", alt: "Coffee" },
  { src: "/assets/products/matcha-latte.svg", alt: "Matcha" },
];

/**
 * Placeholder sprite paths. Until the art team ships station-specific sous
 * chef and maintenance guy sprites, we reuse existing chef portraits (each
 * station picks a different nationality portrait so the zones look distinct).
 * The maintenance guy placeholder is called out in the proposal as
 * `customer-walk-spritesheet.svg`; that asset is not in the repo yet, so we
 * fall back to the `american-m` portrait.
 */
const STATION_SPRITE: Record<StationId, string> = {
  bakery: "/assets/chefs/french-f.svg",
  deli: "/assets/chefs/italian-m.svg",
  barista: "/assets/chefs/japanese-f.svg",
};
const MAINTENANCE_SPRITE = "/assets/chefs/american-m.svg";

const STATION_LABEL: Record<StationId, string> = {
  bakery: "Bakery",
  deli: "Deli",
  barista: "Barista",
};

/** How many sprites to actually render before collapsing to "+N more". */
const VISUAL_CAP = 5;

interface ZoneProps {
  label: string;
  count: number;
  sprite: string;
  modifier?: string;
}
function StaffZone({ label, count, sprite, modifier = "" }: ZoneProps) {
  const visible = Math.min(count, VISUAL_CAP);
  const overflow = Math.max(0, count - VISUAL_CAP);
  return (
    <div className={`bakery-view__zone ${modifier}`}>
      <span className="bakery-view__zone-label">{label}</span>
      <div className="bakery-view__zone-sprites">
        {Array.from({ length: visible }).map((_, i) => (
          <img
            key={i}
            className="bakery-view__zone-sprite"
            src={sprite}
            alt=""
            aria-hidden
          />
        ))}
        {overflow > 0 && (
          <span className="bakery-view__zone-overflow">+{overflow} more</span>
        )}
        {count === 0 && (
          <span className="bakery-view__zone-empty">No one assigned</span>
        )}
      </div>
    </div>
  );
}

export function BakeryView() {
  const { player, currentRound, totalRounds, pendingDecision } = useGame();
  const { bakerySousChefs, deliSousChefs, baristaSousChefs, maintenanceGuys } =
    pendingDecision.staffCounts;

  return (
    <div className="bakery-view">
      <div className="bakery-view__storefront">
        <div className="bakery-view__sign">
          <h2 className="bakery-view__name">
            {player?.bakeryName ?? "My Bakery"}
          </h2>
          <span className="bakery-view__round">
            Round {currentRound} of {totalRounds}
          </span>
        </div>

        <div className="bakery-view__window">
          <div className="bakery-view__display">
            <div className="bakery-view__shelf">
              {SHELF_ITEMS.slice(0, 3).map((item) => (
                <img
                  key={item.alt}
                  className="bakery-view__shelf-item"
                  src={item.src}
                  alt={item.alt}
                />
              ))}
            </div>
            <div className="bakery-view__shelf">
              {SHELF_ITEMS.slice(3).map((item) => (
                <img
                  key={item.alt}
                  className="bakery-view__shelf-item"
                  src={item.src}
                  alt={item.alt}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="bakery-view__floor">
          <div className="bakery-view__counter" />

          {/* Sous chef zones — one per station, sprites reflect live counts. */}
          <div className="bakery-view__zones">
            <StaffZone
              label={STATION_LABEL.bakery}
              count={bakerySousChefs}
              sprite={STATION_SPRITE.bakery}
              modifier="bakery-view__zone--bakery"
            />
            <StaffZone
              label={STATION_LABEL.deli}
              count={deliSousChefs}
              sprite={STATION_SPRITE.deli}
              modifier="bakery-view__zone--deli"
            />
            <StaffZone
              label={STATION_LABEL.barista}
              count={baristaSousChefs}
              sprite={STATION_SPRITE.barista}
              modifier="bakery-view__zone--barista"
            />
          </div>

          {/* Maintenance strip — tiled mop-bucket floor, one sprite per hire. */}
          <div className="bakery-view__maintenance-strip">
            <StaffZone
              label="Maintenance"
              count={maintenanceGuys}
              sprite={MAINTENANCE_SPRITE}
              modifier="bakery-view__zone--maintenance"
            />
          </div>
        </div>
      </div>

      <p className="bakery-view__hint">
        Use the tabs on the right to set your menu quantities, hire staff per
        station, and place auction bids. Hit <strong>Submit</strong> when
        ready.
      </p>
    </div>
  );
}
