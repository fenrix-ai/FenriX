import { describe, expect, it } from "vitest";
import { buildDefaultDecisionDraft, gameReducer, initialState } from "./GameContext";
import type { ProductKey } from "../types/game";

const STARTER_UNLOCKS: ProductKey[] = ["croissant", "bagel", "coffee"];
const STARTER_PLUS_SANDWICH: ProductKey[] = [
  "croissant",
  "bagel",
  "coffee",
  "sandwich",
];

describe("gameReducer", () => {
  it("auto-enables newly unlocked products in SET_TEAM_UNLOCKS", () => {
    const state = {
      ...initialState,
      pendingDecision: buildDefaultDecisionDraft(),
      unlockedProducts: STARTER_UNLOCKS,
    };

    const next = gameReducer(state, {
      type: "SET_TEAM_UNLOCKS",
      payload: {
        unlockedProducts: STARTER_PLUS_SANDWICH,
        unlocksPurchased: 1,
      },
    });

    expect(next.unlockedProducts).toContain("sandwich");
    expect(next.pendingDecision.menu.sandwich).toBe(true);
  });

  it("clears menu + quantity when a product is no longer unlocked", () => {
    const state = {
      ...initialState,
      unlockedProducts: STARTER_PLUS_SANDWICH,
      pendingDecision: {
        ...buildDefaultDecisionDraft(),
        menu: {
          ...buildDefaultDecisionDraft().menu,
          sandwich: true,
        },
        quantities: {
          ...buildDefaultDecisionDraft().quantities,
          sandwich: 12,
        },
      },
    };

    const next = gameReducer(state, {
      type: "SET_TEAM_UNLOCKS",
      payload: {
        unlockedProducts: STARTER_UNLOCKS,
        unlocksPurchased: 0,
      },
    });

    expect(next.pendingDecision.menu.sandwich).toBe(false);
    expect(next.pendingDecision.quantities.sandwich).toBe(0);
  });

  it("seeds next-round menu from unlockedProducts and preserves prices", () => {
    const draft = buildDefaultDecisionDraft();
    draft.menu.sandwich = false;
    draft.menu.matcha = false;
    draft.productPrices.sandwich = 9.75;

    const state = {
      ...initialState,
      currentRound: 1,
      unlockedProducts: STARTER_PLUS_SANDWICH,
      pendingDecision: draft,
      decisionSubmitted: true,
      pricesSubmitted: true,
    };

    const next = gameReducer(state, { type: "SET_ROUND", payload: 2 });

    expect(next.currentRound).toBe(2);
    expect(next.pendingDecision.menu.croissant).toBe(true);
    expect(next.pendingDecision.menu.bagel).toBe(true);
    expect(next.pendingDecision.menu.coffee).toBe(true);
    expect(next.pendingDecision.menu.sandwich).toBe(true);
    expect(next.pendingDecision.menu.matcha).toBe(false);
    expect(next.pendingDecision.productPrices.sandwich).toBe(9.75);
    expect(next.pendingDecision.quantities.sandwich).toBe(0);
    expect(next.decisionSubmitted).toBe(false);
    expect(next.pricesSubmitted).toBe(false);
  });
});
