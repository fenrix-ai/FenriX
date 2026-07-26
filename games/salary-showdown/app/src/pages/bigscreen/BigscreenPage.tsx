import { useProfessor } from '../../contexts/ProfessorContext';
import { PHASE_NAMES } from '../../lib/phaseNames';
import { LobbyWall } from '../../components/bigscreen/LobbyWall';
import { DecisionWall } from '../../components/bigscreen/DecisionWall';
import '../../styles/bigscreen.css';

// Minimal full-screen phase-title card. Task 10 renders it for SIMULATE, RESULTS
// and FINALE; Task 11 replaces the SIMULATE/RESULTS cases with SimulateFlood /
// StandingsShuffle and Task 13 replaces the FINALE case with FinaleWall. The
// switch below is complete and final — later tasks swap CASE BODIES only.
function PhaseTitleCard({ title, round }: { title: string; round: number | null }) {
  return (
    <main className="bigscreen bs-center">
      <div className="brand bs-brand">Salary Showdown</div>
      <h1 className="bs-phase-title">{title}</h1>
      {round !== null && <p className="bs-sub">Round {round}</p>}
    </main>
  );
}

// Projector view. Mode = f(transition-gated phase): while an advance is settling
// the provider keeps presenting the phase being LEFT (its data is fully
// materialised), so the wall never points at documents that do not exist yet.
// Display-only surface: no controls anywhere below this line.
export default function BigscreenPage() {
  const { game } = useProfessor();
  if (!game) {
    return (
      <main className="bigscreen bs-center">
        <div className="brand bs-brand">Salary Showdown</div>
        <p className="bs-sub">Waiting for a session.</p>
      </main>
    );
  }
  switch (game.phase) {
    case 'LOBBY':
      return <LobbyWall />;
    case 'FRONT_OFFICE':
    case 'FREE_AGENCY':
    case 'AUCTION':
    case 'LINEUP':
      return <DecisionWall />;
    case 'SIMULATE':
      return <PhaseTitleCard title={PHASE_NAMES.SIMULATE} round={game.round} />;
    case 'RESULTS':
      return <PhaseTitleCard title={PHASE_NAMES.RESULTS} round={game.round} />;
    case 'FINALE':
      return <PhaseTitleCard title={PHASE_NAMES.FINALE} round={null} />;
  }
}
