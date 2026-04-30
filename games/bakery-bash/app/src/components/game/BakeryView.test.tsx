import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BakeryView } from "./BakeryView";
import type { GameState, PendingDecisionDraft } from "../../types/game";

let mockState: GameState;
const mockDispatch = vi.fn();

vi.mock("../../contexts/GameContext", () => ({
  useGame: () => mockState,
  useGameDispatch: () => mockDispatch,
}));

function buildPendingDecision(): PendingDecisionDraft {
  return {
    menu: {
      croissant: true,
      cookie: false,
      bagel: true,
      sandwich: true,
      coffee: true,
      matcha: false,
    },
    quantities: {
      croissant: 0,
      cookie: 0,
      bagel: 0,
      sandwich: 0,
      coffee: 0,
      matcha: 0,
    },
    sousChefCount: 0,
    sousChefAssignments: {
      croissant: 0,
      cookie: 0,
      bagel: 0,
      sandwich: 0,
      coffee: 0,
      matcha: 0,
    },
    staffCounts: {
      bakerySousChefs: 0,
      deliSousChefs: 0,
      baristaSousChefs: 0,
      maintenanceGuys: 0,
    },
    productPrices: {
      croissant: 4.75,
      cookie: 2.5,
      bagel: 3,
      sandwich: 8.75,
      coffee: 4,
      matcha: 6.25,
    },
    miscSpent: 0,
  };
}

describe("BakeryView quantity inputs", () => {
  beforeEach(() => {
    mockDispatch.mockReset();
    mockState = {
      gameId: "game-123",
      playerId: "player-123",
      gameCode: "ABC123",
      phase: "round_1_decide",
      currentRound: 1,
      totalRounds: 5,
      player: {
        id: "player-123",
        name: "Taylor",
        bakeryName: "Test Bakery",
        cumulativeRevenue: 0,
      },
      players: [],
      roundResults: [],
      auctionTab: "ads",
      teamName: "Test Bakery",
      pendingDecision: buildPendingDecision(),
      pendingAdBids: { TV: 0, Billboard: 0, Radio: 0, Newspaper: 0 },
      pendingChefBids: {},
      role: "solo",
      teamRoleAssignments: {},
      config: null,
      decisionSubmitted: false,
      pricesSubmitted: false,
      adBidsSubmitted: false,
      chefBidsSubmitted: false,
      unlockedProducts: ["croissant", "bagel", "coffee", "sandwich"],
      budgetCurrent: null,
      equipmentGrade: "C",
      cleanlinessGrade: "B",
      cleanlinessScore: 75,
      teamId: "team-123",
      unlocksPurchased: 0,
      phaseEndsAtMs: null,
      leaderboard: [],
      leaderboardError: null,
      acquiredCsvs: [],
    };
  });

  it("renders zero quantity as an empty field with a placeholder", () => {
    render(<BakeryView />);

    const input = screen.getByRole("spinbutton", { name: "Sandwich quantity" });
    expect(input).toHaveAttribute("placeholder", "0");
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("lets players type a new quantity and clear it back to zero", () => {
    const { rerender } = render(<BakeryView />);

    const input = screen.getByRole("spinbutton", { name: "Sandwich quantity" });
    fireEvent.change(input, { target: { value: "200" } });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: "UPDATE_PENDING_DECISION",
      payload: { quantities: { sandwich: 200 } },
    });

    mockState.pendingDecision.quantities.sandwich = 200;
    rerender(<BakeryView />);
    expect(
      (screen.getByRole("spinbutton", {
        name: "Sandwich quantity",
      }) as HTMLInputElement).value,
    ).toBe("200");

    fireEvent.change(screen.getByRole("spinbutton", { name: "Sandwich quantity" }), {
      target: { value: "" },
    });

    expect(mockDispatch).toHaveBeenLastCalledWith({
      type: "UPDATE_PENDING_DECISION",
      payload: { quantities: { sandwich: 0 } },
    });
  });
});
