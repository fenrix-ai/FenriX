import { Link } from "react-router-dom";
import { useGame, useGameDispatch } from "../../contexts/GameContext";
import type { GamePhase } from "../../types/game";

export function DevNav() {
  const { phase } = useGame();
  const dispatch = useGameDispatch();

  if (import.meta.env.PROD) return null;

  const setPhase = (p: GamePhase) => {
    dispatch({ type: "SET_PHASE", payload: p });
  };

  return (
    <nav className="dev-nav">
      <span className="dev-nav__label">DEV</span>
      <Link to="/">Landing</Link>
      <Link to="/lobby">Lobby</Link>
      <Link to="/game" onClick={() => setPhase("round_1_decide")}>decide</Link>
      <Link to="/game" onClick={() => setPhase("round_1_bid_ad")}>bid</Link>
      <Link to="/game" onClick={() => setPhase("round_1_roster")}>roster</Link>
      <Link to="/game" onClick={() => setPhase("simulating")}>simulate</Link>
      <Link to="/game" onClick={() => setPhase("results_ready")}>results</Link>
      <Link to="/leaderboard">Board</Link>
      <Link to="/professor">Prof</Link>
    </nav>
  );
}
