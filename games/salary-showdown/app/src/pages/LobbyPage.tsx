import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGame } from '../contexts/GameContext';
import { PhaseHeader } from '../components/ui/PhaseHeader';

// Cheat-sheet rules, verbatim tone: facts and rules only, no strategy hints.
const RULES = [
  'Wins crown the champion.',
  '$100M hard cap, every round.',
  'Salaries are paid every round of the contract.',
  'Cut players still get paid — dead money stays on your cap.',
  'Prices rise about 8% each round.',
  'Roster: minimum 8, maximum 10. Starters: 2 G, 2 W, 1 B.',
  'One submit per phase: GM signs, Scout bids, Coach sets the lineup.',
];

interface Member { teamId: string; role: string; displayName: string }

export default function LobbyPage() {
  const { gameId, game, membership, teams } = useGame();
  const [members, setMembers] = useState<Member[]>([]);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (!gameId || !membership) return;
    return onSnapshot(collection(db, 'games', gameId, 'players'),
      (s) => setMembers(s.docs.map((d) => d.data() as Member)));
  }, [gameId, membership]);

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % RULES.length), 5000);
    return () => clearInterval(id);
  }, []);

  if (!game || !membership) return null;
  return (
    <main className="page">
      <PhaseHeader title="Lobby" round={0} timerEndsAt={game.timerEndsAt} />
      <div className="ticker" role="status">
        <span className="tag">HOUSE RULES</span><span>{RULES[slide]}</span>
      </div>
      <p className="muted">Join code on the projector: <span className="mono">{game.joinCode}</span>.
        Waiting for the professor to start the season.</p>
      {[...teams.entries()].map(([tid, t]) => (
        <div key={tid} className="card"
          style={{ marginTop: 10, outline: tid === membership.teamId ? '1.5px solid var(--gold)' : 'none' }}>
          <strong>{t.name}</strong>
          <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
            {['GM', 'Scout', 'Coach'].map((role) => {
              const m = members.find((x) => x.teamId === tid && x.role === role);
              return (
                <span key={role} className={m ? 'ok' : 'dim'}>
                  {role}: {m ? m.displayName : 'open'}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </main>
  );
}
