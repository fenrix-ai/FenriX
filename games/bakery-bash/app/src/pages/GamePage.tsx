import { useGame } from "../contexts/GameContext";
import { RoundHeader } from "../components/game/RoundHeader";
import { BakeryView } from "../components/game/BakeryView";
import { GameSidebar } from "../components/game/GameSidebar";
import { PageShell } from "../components/ui/PageShell";
import { SimulatePhase } from "./phases/SimulatePhase";
import { ResultsPhase } from "./phases/ResultsPhase";

export function GamePage() {
  const { phase } = useGame();

  if (phase === "simulating") {
    return (
      <PageShell className="game-page">
        <RoundHeader />
        <SimulatePhase />
      </PageShell>
    );
  }

  if (phase === "results_ready") {
    return (
      <PageShell className="game-page">
        <RoundHeader />
        <ResultsPhase />
      </PageShell>
    );
  }

  return (
    <PageShell className="game-page game-page--wide">
      <RoundHeader />
      <div className="game-page__dashboard">
        <BakeryView />
        <GameSidebar />
      </div>
    </PageShell>
  );
}
