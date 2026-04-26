import { useGame } from "../contexts/GameContext";
import { RoundHeader } from "../components/game/RoundHeader";
import { BakeryView } from "../components/game/BakeryView";
import { GameSidebar } from "../components/game/GameSidebar";
import { PageShell } from "../components/ui/PageShell";
import { DecidePhase } from "./phases/DecidePhase";
import { ResultsPhase } from "./phases/ResultsPhase";

export function GamePage() {
  const { phase } = useGame();

  if (phase === "closing_hours") {
    return (
      <PageShell className="game-page game-page--wide">
        <RoundHeader />
        <div className="game-page__dashboard">
          <BakeryView />
          <GameSidebar />
        </div>
        <DecidePhase />
      </PageShell>
    );
  }

  if (phase === "results") {
    return (
      <PageShell className="game-page">
        <RoundHeader />
        <div className="game-page__content">
          <ResultsPhase />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="game-page">
      <RoundHeader />
      <div className="game-page__content">
        <ResultsPhase />
      </div>
    </PageShell>
  );
}