import { useGame } from "../../../contexts/GameContext";

const AD_BONUSES: Record<string, number> = {
  TV: 200,
  Billboard: 150,
  Radio: 100,
  Newspaper: 75,
};

export function AuctionTab() {
  const { player, config } = useGame();
  const adBonuses = config?.adBonuses ?? AD_BONUSES;

  const pendingAdBid = player?.pendingBids?.adBid;
  const pendingChefBid = player?.pendingBids?.chefBid;

  return (
    <div className="auction-tab">
      <h3 className="sidebar-tab__title">Auction Bids</h3>
      <p className="sidebar-tab__hint">Your submitted bids for this round.</p>

      <div className="auction-tab__section">
        <h4 className="auction-tab__section-title">Ad Slot Bids</h4>
        <div style={{ fontSize: "0.9rem", color: "#666" }}>
          {pendingAdBid?.adType ? (
            <div>
              <strong>{pendingAdBid.adType}</strong> — ${pendingAdBid.amount.toLocaleString()}
              <br />
              <span style={{ color: "#888" }}>
                Bonus if won: +${(adBonuses[pendingAdBid.adType] ?? 0).toLocaleString()}
              </span>
            </div>
          ) : (
            <span>No ad bid submitted</span>
          )}
        </div>
      </div>

      <div className="auction-tab__section">
        <h4 className="auction-tab__section-title">Chef Bids</h4>
        <div style={{ fontSize: "0.9rem", color: "#666" }}>
          {pendingChefBid && pendingChefBid.amount > 0 ? (
            <div>
              <strong>${pendingChefBid.amount.toLocaleString()}</strong> bid
              <br />
              <span style={{ color: "#888" }}>
                Skill: 0–100 random | Bonus: skill × $5/round
              </span>
            </div>
          ) : (
            <span>No chef bid submitted</span>
          )}
        </div>
      </div>
    </div>
  );
}
