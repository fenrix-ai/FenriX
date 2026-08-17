import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useGame } from '../contexts/GameContext';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { ErrorNotice } from '../components/ui/ErrorNotice';

// Cheat-sheet rules, verbatim tone: facts and rules only, no strategy hints.
const RULES = [
  'Wins crown the champion.',
  '$100M hard cap, every round.',
  'Salaries are paid every round of the contract.',
  'Cut players still get paid — dead money stays on your cap.',
  'Prices rise about 8% each round.',
  'Roster: minimum 8, maximum 10. Starters: 2 G, 2 W, 1 B.',
  'One submit per phase: GM signs, Scout bids, Coach sets the lineup.',
  'Missing a seat? Any teammate covers that role.',
];

interface Member { teamId: string; role: string; displayName: string }

export default function LobbyPage() {
  const { gameId, game, membership, teams } = useGame();
  const [members, setMembers] = useState<Member[]>([]);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (!gameId || !membership?.teamId) return;
    return onSnapshot(collection(db, 'games', gameId, 'players'),
      (s) => setMembers(s.docs.map((d) => d.data() as Member)),
      () => {});
  }, [gameId, membership?.teamId]);

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % RULES.length), 5000);
    return () => clearInterval(id);
  }, []);

  if (!game || !membership) return null;
  return (
    <main className="page">
      <PhaseHeader title="Lobby" round={0} timerEndsAt={game.timerEndsAt} timerPausedMs={game.timerPausedMs} />
      <div className="ticker" role="status">
        <span className="tag">HOUSE RULES</span><span>{RULES[slide]}</span>
      </div>
      <p className="muted">Join code on the projector: <span className="mono">{game.joinCode}</span>.
        Waiting for the professor to start the season.</p>
      {/* name-sorted, numeric-aware: Franchise 2 before Franchise 10 (T1 review carry) */}
      {[...teams.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, undefined, { numeric: true })).map(([tid, t]) => (
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
          {tid === membership.teamId && game.status === 'lobby' && (
            <RenameRow current={t.name} />
          )}
        </div>
      ))}
    </main>
  );
}

// Franchise naming (playtest-2 item 1, adjudicated): any member of the team,
// until the season starts. The input tracks the LIVE name until the user
// edits, so a teammate's rename doesn't get clobbered by a stale prefill.
function RenameRow({ current }: { current: string }) {
  const { gameId, call } = useGame();
  const [name, setName] = useState(current);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (!dirty) setName(current); }, [current, dirty]);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await call<{ name: string }>('renameTeam', { gameId, name });
      setName(res.name);
      setDirty(false);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input aria-label="team name" className="inset" maxLength={24}
        style={{ color: 'inherit', flex: 1, minWidth: 140 }} value={name}
        onChange={(e) => { setDirty(true); setName(e.target.value); }} />
      <button type="button" className="btn" disabled={busy || name.trim().length === 0}
        onClick={() => void save()}>Rename</button>
      <ErrorNotice error={err} />
    </div>
  );
}
