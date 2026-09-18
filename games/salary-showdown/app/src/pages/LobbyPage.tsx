import { useEffect, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { FranchiseMark } from '../components/franchise/FranchiseMark';
import { IdentityEditor } from '../components/lobby/IdentityEditor';
import { RoleSeats } from '../components/lobby/RoleSeats';
import { resolveIdentity, type TeamIdentity } from '../lib/franchiseIdentity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import styles from './LobbyPage.module.css';

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

export default function LobbyPage() {
  const { uid } = useAuth();
  const { gameId, game, membership, team, teamSeats, teams, call } = useGame();
  const [slide, setSlide] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return undefined;
    const id = setInterval(() => setSlide((current) => (current + 1) % RULES.length), 5000);
    return () => clearInterval(id);
  }, [reducedMotion]);

  if (!game || !membership || !team || !gameId) return null;

  const identity = resolveIdentity(membership.teamId, team.identity);
  const rivals = [...teams.entries()]
    .filter(([teamId]) => teamId !== membership.teamId)
    .sort((a, b) => a[1].name.localeCompare(b[1].name, undefined, { numeric: true }));
  const editingClosed = game.status !== 'lobby' || game.phase !== 'LOBBY';

  const saveIdentity = async (next: TeamIdentity) => {
    await call<{ ok: true }>('setTeamIdentity', { gameId, identity: next });
  };

  return (
    <main className={`page ${styles.lobby}`}>
      <PhaseHeader title="Lobby" round={0} timerEndsAt={game.timerEndsAt}
        timerPausedMs={game.timerPausedMs} />

      <div className={styles.ticker} role="status">
        <span>House rule</span>
        <strong>{RULES[slide]}</strong>
      </div>

      <section className={styles.hero} aria-labelledby="own-franchise-heading">
        <div className={styles.heroIdentity}>
          <FranchiseMark teamId={membership.teamId} name={team.name}
            identity={team.identity} size={112} />
          <div>
            <span className={styles.kicker}>Your franchise</span>
            <h2 id="own-franchise-heading">{team.name}</h2>
            <p>League code <strong className="mono">{game.joinCode}</strong></p>
          </div>
        </div>
        <div className={styles.waiting}>
          <span className={styles.pulse} aria-hidden="true" />
          Waiting for the professor to start the season
        </div>
      </section>

      <div className={styles.workspace}>
        <section className={styles.teamPanel}>
          <RoleSeats seats={teamSeats} currentUid={uid} />
          {game.status === 'lobby' ? <RenameRow current={team.name} /> : null}
        </section>
        <IdentityEditor identity={identity} onSave={saveIdentity} disabled={editingClosed} />
      </div>

      <section className={styles.rivals} aria-labelledby="league-franchises-heading">
        <div className={styles.rivalHeading}>
          <div>
            <span className={styles.kicker}>Around the league</span>
            <h2 id="league-franchises-heading">Other franchises</h2>
          </div>
          <p>{teams.size} {teams.size === 1 ? 'franchise' : 'franchises'} in the room</p>
        </div>
        <div className={styles.rivalGrid}>
          {rivals.map(([teamId, rival]) => (
            <article key={teamId} className={styles.rivalCard}>
              <FranchiseMark teamId={teamId} name={rival.name} identity={rival.identity} size={48} />
              <strong data-rival-name>{rival.name}</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function RenameRow({ current }: { current: string }) {
  const { gameId, call } = useGame();
  const [name, setName] = useState(current);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  useEffect(() => { if (!dirty) setName(current); }, [current, dirty]);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await call<{ name: string }>('renameTeam', { gameId, name });
      setName(res.name);
      setDirty(false);
    } catch (caught) {
      setErr(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.rename} aria-labelledby="franchise-name-heading">
      <div>
        <h3 id="franchise-name-heading">Franchise name</h3>
        <p>Any teammate may rename the franchise before the season starts.</p>
      </div>
      <div className={styles.renameControls}>
        <input aria-label="team name" className="inset" maxLength={24} value={name}
          onChange={(event) => { setDirty(true); setName(event.target.value); }} />
        <button type="button" className="btn" disabled={busy || name.trim().length === 0 || !dirty}
          onClick={() => void save()}>{busy ? 'Renaming…' : 'Rename'}</button>
      </div>
      <ErrorNotice error={err} />
    </section>
  );
}
