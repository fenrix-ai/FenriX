import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/ui/PageShell";

// Stage cards as specified in FE-P01
const HOW_TO_PLAY_STAGES = [
  {
    label: "Decisions",
    tagline: "Your bakery, your call.",
    body: "Each round, your team decides what to stock, how many staff to hire, and which machines to keep running. Every choice has a cost — plan carefully, because what you spend now comes out of your profits.",
  },
  {
    label: "Ad Auction",
    tagline: "The loudest bakery wins the crowd.",
    body: "Teams bid against each other for advertising slots. The highest bidder wins that ad for the entire round — one month of exclusive reach. Ownership resets at every auction, so no one can hold an ad forever. There are four ad types: TV, Radio, Newspaper, and Billboard.",
  },
  {
    label: "Chef Auction",
    tagline: "Great chefs don't come cheap.",
    body: "One chef is available each round. Teams bid to recruit them. Each chef specializes in a station and independently boosts production there — their output adds on top of your existing team. Chef speed multipliers do not stack; each chef handles their own station's work separately.",
  },
  {
    label: "Results",
    tagline: "The receipts don't lie.",
    body: "After every round, see how your bakery performed — revenue, costs, customer traffic, and where you stand on the leaderboard. Study the results before the next round begins.",
  },
];

export function HowToPlayPage() {
  const navigate = useNavigate();
  return (
    <PageShell className="how-to-play">
      <div className="how-to-play__header">
        <button className="btn btn--ghost how-to-play__back" onClick={() => navigate(-1)}>
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
    </PageShell>
  );
}
