import { useProfessor } from '../../contexts/ProfessorContext';
import { LobbyWall } from '../../components/bigscreen/LobbyWall';
import { DecisionWall } from '../../components/bigscreen/DecisionWall';
import { SimulateFlood } from '../../components/bigscreen/SimulateFlood';
import { StandingsShuffle } from '../../components/bigscreen/StandingsShuffle';
import { FinaleWall } from '../../components/bigscreen/FinaleWall';
import '../../styles/bigscreen.css';

// Projector view. Mode = f(transition-gated phase): while an advance is settling
// the provider keeps presenting the phase being LEFT (its data is fully
// materialised), so the wall never points at documents that do not exist yet.
// Display-only surface: no controls anywhere below this line.
export default function BigscreenPage() {
  const { game } = useProfessor();
  // The no-game shell doubles as the default switch arm: the Phase union is
  // exhaustive at compile time, but game.phase arrives off the wire untyped —
  // a runtime-unknown value must show this shell, never a blank projector.
  const shell = (
    <main className="bigscreen bs-center">
      <div className="brand bs-brand">Salary Showdown</div>
      <p className="bs-sub">Waiting for a session.</p>
    </main>
  );
  if (!game) return shell;
  switch (game.phase) {
    case 'LOBBY':
      return <LobbyWall />;
    case 'FRONT_OFFICE':
    case 'FREE_AGENCY':
    case 'AUCTION':
    case 'LINEUP':
      return <DecisionWall />;
    case 'SIMULATE':
      return <SimulateFlood />;
    case 'RESULTS':
      return <StandingsShuffle />;
    case 'FINALE':
      return <FinaleWall />;
    default:
      return shell;
  }
}
