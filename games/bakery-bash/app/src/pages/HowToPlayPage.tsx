import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/ui/PageShell";

/**
 * How-to-play content (refreshed Apr 22).
 *
 * Round order now reflects the live flow: **Ad Auction → Chef Auction →
 * Decisions → Simulation → Results**. Copy tweaks per the Apr 22 bugfix
 * spec:
 *   - Ad Auction card is owned by the "Bidder" (not Advertising) and
 *     explicitly calls out that each ad type yields different foot
 *     traffic.
 *   - Chef Auction card clarifies specialty chefs don't have station
 *     assignments; only sous chefs do. Tier multipliers are shown in a
 *     table that also ties into the purchasable chef-data CSV.
 *   - New Simulation Round card.
 *   - Results card calls out the per-day CSV + curveball events.
 *   - New "CSV Inbox" card explains the header button.
 */
const HOW_TO_PLAY_STAGES = [
  {
    label: "Ad Auction",
    tagline: "The loudest bakery wins the crowd.",
    body: "Your Bidder Teammate submits this. Teams bid competitively for four advertising slots: TV, Radio, Newspaper, and Billboard. The highest bidder holds that ad for the entire round — ownership resets every auction. Keep in mind, each advertisement type yields a different level of foot traffic, something your team will need to figure out from your predictive model.",
  },
  {
    label: "Chef Auction",
    tagline: "Great chefs don't come cheap.",
    body: "Each round a fresh chef pool goes up for auction. Specialty chefs are not assigned to a station — their production contributes to the overall output of your bakery. Only sous chefs are assigned to specific stations. Specialty chefs specialize in different foods; you can discover which nationality is strong at which products by purchasing the Tier 1 specialty-chef CSV.",
  },
  {
    label: "Decisions",
    tagline: "Your bakery, your call.",
    body: "Assign sous chefs to stations, set your menu quantities, price each product, and schedule maintenance. Every hire and every unit ordered costs money — spend wisely, because it all comes out of your revenue.",
  },
  {
    label: "Simulation Round",
    tagline: "Lights on — customers incoming.",
    body: "See your bakery come to life! Spectate a simulation of your bakery over the course of a month. Watch the menu sell down in real time; sold-out products get stamped so you can see what ran short.",
  },
  {
    label: "Results",
    tagline: "The receipts don't lie.",
    body: "After every round, see your revenue, costs, customer count, maintenance state, and leaderboard position. This is also where you can download a CSV containing the round's daily data — one row per day of the simulation. Curveball events like burglaries and food safety inspections will show up here as cards so you can see exactly when and how they hit.",
  },
  {
    label: "CSV Inbox",
    tagline: "Every file you've earned, in one place.",
    body: "Tap the CSV Inbox button in the header to open a scrollable panel listing every data file your team has acquired: the results CSV, any competitor intel you've bought, and purchasable chef-data CSVs. Pick which file to download — nothing auto-downloads when you open the panel.",
  },
];

const CHEF_TIERS = [
  {
    tier: "Tier 1 — Novel",
    multiplier: "1.0×",
    body: "Entry-level specialty chefs. Solid production, cheap to acquire.",
  },
  {
    tier: "Tier 2 — Intermediate",
    multiplier: "1.5×",
    body: "Experienced specialty chefs. Moderate bid floor, reliable output.",
  },
  {
    tier: "Tier 3 — Advanced",
    multiplier: "2.0×",
    body: "Top-tier specialty chefs. High minimum bid, but double production.",
  },
];

export function HowToPlayPage() {
  const navigate = useNavigate();
  return (
    <PageShell className="how-to-play">
      <div className="how-to-play__header">
        <button
          className="btn btn--ghost how-to-play__back"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>
        <h1 className="how-to-play__title">How to Play</h1>
      </div>
      <div className="how-to-play__stages">
        {HOW_TO_PLAY_STAGES.map((stage) => (
          <div key={stage.label} className="how-to-play__card">
            <span className="how-to-play__card-label">{stage.label}</span>
            <h2 className="how-to-play__card-tagline">{stage.tagline}</h2>
            <p className="how-to-play__card-body">{stage.body}</p>
          </div>
        ))}
      </div>

      <section className="how-to-play__chef-tiers">
        <h2 className="how-to-play__chef-tiers-title">Chef Tiers</h2>
        <p className="how-to-play__chef-tiers-hint">
          Three specialty-chef tiers appear in the Chef Auction. Higher tier
          means a higher minimum bid, but also a bigger production multiplier.
        </p>
        <table className="how-to-play__chef-tier-table">
          <thead>
            <tr>
              <th>Tier</th>
              <th>Multiplier</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {CHEF_TIERS.map((t) => (
              <tr key={t.tier}>
                <td>{t.tier}</td>
                <td>{t.multiplier}</td>
                <td>{t.body}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </PageShell>
  );
}
