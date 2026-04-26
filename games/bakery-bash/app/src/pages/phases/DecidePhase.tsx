import { useState } from "react";
import { useGame, useGameDispatch } from "../../contexts/GameContext";
import { callSubmitDecision } from "../../lib/firebase";

const BASE_MENU = [
  { id: "croissant", name: "Croissant", price: 5 },
  { id: "cookie", name: "Cookie", price: 4 },
  { id: "bagel", name: "Bagel", price: 3 },
] as const;

const UNLOCKABLE = [
  { id: "sandwich", name: "Sandwich", price: 6 },
  { id: "latte", name: "Latte", price: 5 },
  { id: "matchaLatte", name: "Matcha Latte", price: 6 },
] as const;

const AD_TYPES = ["TV", "Radio", "Newspaper", "Billboard"] as const;

export function DecidePhase() {
  const { currentRound, totalRounds, gameId, player, config } = useGame();
  const dispatch = useGameDispatch();

  const [prices, setPrices] = useState<Record<string, number>>({
    croissant: 5,
    cookie: 4,
    bagel: 3,
    sandwich: 0,
    latte: 0,
    matchaLatte: 0,
  });
  const [quantities, setQuantities] = useState<Record<string, number>>({
    croissant: 0,
    cookie: 0,
    bagel: 0,
    sandwich: 0,
    latte: 0,
    matchaLatte: 0,
  });
  const [staffCount, setStaffCount] = useState(3);
  const [adType, setAdType] = useState<string | null>(null);
  const [adSpend, setAdSpend] = useState(0);
  const [chefBidSkill] = useState(0);
  const [chefBidAmount, setChefBidAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unitCost = config?.unitCostPerProduct ?? 1;
  const costPerStaff = config?.costPerStaffPerRound ?? 50;

  const setPrice = (id: string, value: number) => {
    setPrices((prev) => ({ ...prev, [id]: Math.max(0, value) }));
  };

  const setQty = (id: string, value: number) => {
    setQuantities((prev) => ({ ...prev, [id]: Math.max(0, value) }));
  };

  const handleSubmit = async () => {
    if (!gameId) {
      setError("No game connected.");
      return;
    }

    if (player?.pendingDecision?.submitted) {
      setError("Decision already submitted for this round.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const menu: Record<string, boolean> = {
      croissant: true,
      cookie: true,
      bagel: true,
      sandwich: quantities.sandwich > 0,
      latte: quantities.latte > 0,
      matchaLatte: quantities.matchaLatte > 0,
    };

    const productPrices: Record<string, number> = {};
    for (const item of [...BASE_MENU, ...UNLOCKABLE]) {
      const key = item.id === "matchaLatte" ? "matchaLatte" : item.id;
      productPrices[key] = prices[item.id] || 0;
    }

    const q: Record<string, number> = {};
    for (const item of [...BASE_MENU, ...UNLOCKABLE]) {
      const key = item.id === "matchaLatte" ? "matchaLatte" : item.id;
      q[key] = quantities[item.id] || 0;
    }

    try {
      await callSubmitDecision({
        gameId,
        menu,
        productPrices,
        quantities: q,
        staffCount,
        adSpend: adType ? adSpend : 0,
        adType: adType || undefined,
        chefBid: {
          skillLevel: chefBidSkill,
          amount: chefBidAmount,
        },
      });

      dispatch({
        type: "SET_PHASE",
        payload: "auction",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const totalStockCost = Object.values(quantities).reduce((s, q) => s + Math.max(0, q) * unitCost, 0);
  const totalStaffCost = staffCount * costPerStaff;
  const totalAdCost = adType ? adSpend : 0;
  const totalChefCost = chefBidAmount;
  const estimatedTotal = totalStockCost + totalStaffCost + totalAdCost + totalChefCost;
  const budgetAvailable = player?.budgetCurrent ?? 2000;

  return (
    <section className="decide-phase">
      <h2>
        Make Your Decisions — Round {currentRound} of {totalRounds}
      </h2>

      <p style={{ color: "#888", fontSize: "0.9rem", marginBottom: "1rem" }}>
        Budget: ${budgetAvailable.toLocaleString()} | Estimated cost: ${estimatedTotal.toLocaleString()}
      </p>

      {error && (
        <div style={{ background: "#fee", color: "#c00", padding: "0.75rem", borderRadius: "6px", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      <div className="decide-phase__grid">
        <div className="decide-phase__section">
          <h3>Menu Prices &amp; Stock</h3>
          {[...BASE_MENU, ...UNLOCKABLE].map((item) => {
            const isUnlocked = [...BASE_MENU].some((b) => b.id === item.id);
            return (
              <div key={item.id} className="decide-phase__item">
                <span>{item.name}</span>
                <input
                  type="number"
                  placeholder="Price ($)"
                  min={0}
                  step={0.5}
                  value={prices[item.id] || ""}
                  onChange={(e) => setPrice(item.id, parseFloat(e.target.value) || 0)}
                  disabled={!isUnlocked && quantities[item.id] === 0}
                />
                <input
                  type="number"
                  placeholder="Qty"
                  min={0}
                  step={1}
                  value={quantities[item.id] || ""}
                  onChange={(e) => setQty(item.id, parseInt(e.target.value) || 0)}
                />
              </div>
            );
          })}
        </div>

        <div className="decide-phase__section">
          <h3>Staffing</h3>
          <label className="form-field">
            <span className="form-field__label">Number of Staff ({costPerStaff}/staff)</span>
            <input
              type="number"
              className="form-field__input"
              placeholder="e.g. 3"
              min={1}
              max={20}
              value={staffCount}
              onChange={(e) => setStaffCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
            />
          </label>
        </div>

        <div className="decide-phase__section">
          <h3>Ad Auction Bids</h3>
          <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "0.5rem" }}>
            Winner pays their bid. Bonus: TV +$200, Billboard +$150, Radio +$100, Newspaper +$75
          </p>
          <div style={{ marginBottom: "0.5rem" }}>
            <label className="form-field">
              <span className="form-field__label">Ad Type</span>
              <select
                value={adType || ""}
                onChange={(e) => setAdType(e.target.value || null)}
                className="form-field__input"
              >
                <option value="">No bid</option>
                {AD_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          {adType && (
            <label className="form-field">
              <span className="form-field__label">Bid Amount ($)</span>
              <input
                type="number"
                className="form-field__input"
                min={0}
                value={adSpend}
                onChange={(e) => setAdSpend(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </label>
          )}
        </div>

        <div className="decide-phase__section">
          <h3>Chef Auction Bids</h3>
          <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "0.5rem" }}>
            Winner receives a random 0–100 skill chef. Bonus: skill × $5/round
          </p>
          <label className="form-field">
            <span className="form-field__label">Bid Amount ($)</span>
            <input
              type="number"
              className="form-field__input"
              min={0}
              value={chefBidAmount}
              onChange={(e) => setChefBidAmount(Math.max(0, parseInt(e.target.value) || 0))}
            />
          </label>
        </div>
      </div>

      <button
        className="btn btn--primary decide-phase__submit"
        onClick={handleSubmit}
        disabled={submitting || player?.pendingDecision?.submitted}
      >
        {submitting ? "Submitting..." : player?.pendingDecision?.submitted ? "Already Submitted" : "Submit Decisions"}
      </button>
    </section>
  );
}