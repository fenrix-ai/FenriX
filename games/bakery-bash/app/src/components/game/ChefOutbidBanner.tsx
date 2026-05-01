import type { ChefNationality, ChefGender } from "../../types/game";

/**
 * Shows the chefs a player bid on but was outbid for in the current round.
 * Rendered above ChefWinnerBanner on the Kitchen Roster page so students can
 * immediately see who beat them and for how much.
 */
export interface ChefOutbidEntry {
  id: string;
  name: string;
  nationality: ChefNationality;
  gender: ChefGender;
  skillTier?: "novel" | "intermediate" | "advanced" | "base";
  winnerBakeryName: string;
  winningBid: number;
}

export interface ChefOutbidBannerProps {
  round: number | null;
  outbid: ChefOutbidEntry[];
  hideWhenEmpty?: boolean;
  resolved?: boolean;
}

function chefIcon(nationality: ChefNationality, gender: ChefGender): string {
  return `/assets/chefs/${nationality}-${gender}.svg`;
}

const SKILL_LABEL: Record<NonNullable<ChefOutbidEntry["skillTier"]>, string> = {
  novel: "Low",
  intermediate: "Medium",
  advanced: "High",
  base: "Base",
};

export function ChefOutbidBanner({
  round,
  outbid,
  hideWhenEmpty,
  resolved = true,
}: ChefOutbidBannerProps) {
  const hasAny = outbid.length > 0;
  if (hideWhenEmpty && !hasAny && resolved) return null;

  return (
    <section
      className="chef-winner-banner chef-winner-banner--outbid"
      aria-label={round ? `Round ${round} outbid chefs` : "Outbid chefs"}
    >
      <header className="chef-winner-banner__header">
        <span className="chef-winner-banner__eyebrow">Chefs Outbid…</span>
        <h3 className="chef-winner-banner__title">
          {round ? `Round ${round}` : "This round"}
        </h3>
      </header>

      {hasAny ? (
        <ul className="chef-winner-banner__grid">
          {outbid.map((entry) => (
            <li key={entry.id} className="chef-winner-banner__cell chef-winner-banner__cell--outbid">
              <div className="chef-winner-banner__icon">
                <img
                  src={chefIcon(entry.nationality, entry.gender)}
                  alt={entry.name}
                />
              </div>
              <div className="chef-winner-banner__content">
                <div className="chef-winner-banner__name" title={entry.name}>
                  {entry.name}
                </div>
                {entry.skillTier && (
                  <div className="chef-winner-banner__tier">
                    {SKILL_LABEL[entry.skillTier]}
                  </div>
                )}
                <div className="chef-winner-banner__amount chef-winner-banner__amount--outbid">
                  Won by <strong>{entry.winnerBakeryName}</strong>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : !resolved ? (
        <p className="chef-winner-banner__empty">
          Resolving the chef auction…
        </p>
      ) : (
        <p className="chef-winner-banner__empty">
          You weren't outbid on any chefs this round.
        </p>
      )}
    </section>
  );
}
