import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { FranchiseMark } from '../components/franchise/FranchiseMark';
import type { TeamIdentity } from '../lib/franchiseIdentity';
import styles from './LandingPage.module.css';

interface LobbyTeam {
  teamId: string;
  name: string;
  claimedRoles: string[];
  identity?: TeamIdentity;
}

interface LobbyInfo {
  gameId: string;
  status: string;
  phase: string;
  round: number;
  teams: LobbyTeam[];
}

type Selection = { kind: 'existing'; teamId: string } | { kind: 'new' };
const ROLES = ['GM', 'Scout', 'Coach'] as const;
const STEP_LABELS = ['League', 'Franchise', 'Role'];

export default function LandingPage() {
  const { call, setGameId } = useGame();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [code, setCode] = useState(
    () => (new URLSearchParams(window.location.search).get('code') ?? '').toUpperCase().slice(0, 6));
  const [name, setName] = useState('');
  const [newTeam, setNewTeam] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [seatRace, setSeatRace] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { heading.current?.focus(); }, [step]);

  const lookup = useCallback(async (value: string, surfaceError = true) => {
    try {
      if (surfaceError) setErr(null);
      const next = await call<LobbyInfo>('getLobby', { joinCode: value.trim().toUpperCase() });
      setLobby(next);
      return next;
    } catch (caught) {
      if (surfaceError) {
        setLobby(null);
        setErr(caught);
      }
      return null;
    }
  }, [call]);

  // Non-members cannot read Firestore. Poll only the lobby-safe callable while
  // franchise and role selection are open.
  useEffect(() => {
    if (!lobby || step === 1) return undefined;
    timer.current = setInterval(() => void lookup(code, false), 3000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [lobby, step, code, lookup]);

  const findLeague = async () => {
    setBusy(true);
    const found = await lookup(code);
    if (found) {
      setSelection(null);
      setSeatRace(false);
      setStep(2);
    }
    setBusy(false);
  };

  const chooseExisting = (teamId: string) => {
    setSelection({ kind: 'existing', teamId });
    setSeatRace(false);
    setErr(null);
    setStep(3);
  };

  const chooseNew = () => {
    setSelection({ kind: 'new' });
    setSeatRace(false);
    setErr(null);
    setStep(3);
  };

  const claim = async (teamId: string, role: string) => {
    setBusy(true);
    setSeatRace(false);
    setErr(null);
    try {
      await call('joinGame', {
        joinCode: code.trim().toUpperCase(), teamId, role,
        displayName: name.trim() || 'Anonymous',
      });
      setGameId(lobby!.gameId);
    } catch (caught) {
      setErr(caught);
      setSeatRace(true);
      await lookup(code, false);
    } finally {
      setBusy(false);
    }
  };

  const createFranchise = async (role: string) => {
    setBusy(true);
    setSeatRace(false);
    setErr(null);
    try {
      const res = await call<{ gameId: string }>('createTeam', {
        joinCode: code.trim().toUpperCase(), name: newTeam.trim(), role,
        displayName: name.trim() || 'Anonymous',
      });
      setGameId(res.gameId);
    } catch (caught) {
      setErr(caught);
      await lookup(code, false);
    } finally {
      setBusy(false);
    }
  };

  const sortedTeams = [...(lobby?.teams ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const selectedTeam = selection?.kind === 'existing'
    ? lobby?.teams.find((team) => team.teamId === selection.teamId) ?? null
    : null;
  const allSeatsClaimed = selectedTeam
    ? ROLES.every((role) => selectedTeam.claimedRoles.includes(role))
    : false;

  return (
    <main className={`page ${styles.landing}`}>
      <header className={styles.hero}>
        <div className={`brand ${styles.brand}`}>Salary Showdown</div>
        <p className={styles.eyebrow}>Build a front office. Run the season.</p>
        <h1 ref={heading} tabIndex={-1}>
          {step === 1 ? 'Join your league' : step === 2 ? 'Choose your franchise' : 'Choose your role'}
        </h1>
        <p className={styles.intro}>
          {step === 1 && 'Start with the six-character code on the classroom screen.'}
          {step === 2 && 'Join an existing front office or create a new franchise.'}
          {step === 3 && 'Claim one seat. Open roles can be covered by any teammate later.'}
        </p>
      </header>

      <nav className={styles.progress} aria-label="Join progress">
        <span className={styles.progressLabel}>Step {step} of 3</span>
        <ol>
          {STEP_LABELS.map((label, index) => {
            const number = index + 1;
            return (
              <li key={label} className={number <= step ? styles.reached : undefined}
                aria-current={number === step ? 'step' : undefined}>
                <span>{number}</span>{label}
              </li>
            );
          })}
        </ol>
      </nav>

      <ErrorNotice error={err} />

      {step === 1 ? (
        <section className={styles.joinCard} aria-label="League details">
          <label>
            League code
            <input className="inset mono" placeholder="CODE" maxLength={6} value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              aria-label="join code" autoComplete="off" />
          </label>
          <label>
            Your name
            <input className="inset" placeholder="Name shown to teammates" maxLength={24} value={name}
              onChange={(event) => setName(event.target.value)} aria-label="display name" />
          </label>
          <button className="btn gold" disabled={code.length < 6 || busy}
            onClick={() => void findLeague()}>{busy ? 'Finding league…' : 'Find game'}</button>
        </section>
      ) : null}

      {step === 2 && lobby ? (
        <section className={styles.stepPanel}>
          <div className={styles.stepToolbar}>
            <button type="button" className="btn" disabled={busy}
              onClick={() => { setErr(null); setStep(1); }}>Back to league</button>
            <span className="mono">League {code}</span>
          </div>
          {lobby.status !== 'lobby' ? (
            <p className={styles.notice}>Season in progress. You can still claim an open seat.</p>
          ) : null}
          <div className={styles.teamGrid}>
            {sortedTeams.map((team) => {
              const open = ROLES.length - team.claimedRoles.length;
              return (
                <article key={team.teamId} className={styles.teamCard}>
                  <FranchiseMark teamId={team.teamId} name={team.name}
                    identity={team.identity} size={62} />
                  <div>
                    <h2>{team.name}</h2>
                    <p>{open === 0 ? 'All seats claimed' : `${open} open ${open === 1 ? 'seat' : 'seats'}`}</p>
                  </div>
                  <button type="button" className="btn" disabled={busy}
                    onClick={() => chooseExisting(team.teamId)} aria-label={`Choose ${team.name}`}>
                    View roles
                  </button>
                </article>
              );
            })}
          </div>
          {lobby.status === 'lobby' ? (
            <section className={styles.createCard} aria-labelledby="create-franchise-heading">
              <div>
                <span className={styles.kicker}>New franchise</span>
                <h2 id="create-franchise-heading">Put your name on the league</h2>
                <p>Your entry stays here if the server asks you to revise it.</p>
              </div>
              <label>
                Franchise name
                <input className="inset" placeholder="Franchise name" maxLength={24} value={newTeam}
                  onChange={(event) => setNewTeam(event.target.value)} aria-label="new franchise name" />
              </label>
              <button type="button" className="btn gold" disabled={busy || newTeam.trim().length === 0}
                onClick={chooseNew}>Continue with new franchise</button>
            </section>
          ) : null}
        </section>
      ) : null}

      {step === 3 && lobby && selection ? (
        <section className={styles.rolePanel}>
          <div className={styles.stepToolbar}>
            <button type="button" className="btn" disabled={busy}
              onClick={() => { setErr(null); setSeatRace(false); setStep(2); }}>Back to franchises</button>
            <span className="mono">League {code}</span>
          </div>
          <div className={styles.selectedFranchise}>
            <FranchiseMark teamId={selectedTeam?.teamId ?? `new-${newTeam}`}
              name={selectedTeam?.name ?? newTeam} identity={selectedTeam?.identity} size={88} />
            <div>
              <span className={styles.kicker}>{selection.kind === 'new' ? 'Creating' : 'Joining'}</span>
              <h2>{selectedTeam?.name ?? newTeam}</h2>
              <p>{selection.kind === 'new'
                ? 'Your franchise is created only after the role request succeeds.'
                : 'Seat availability refreshes while you decide.'}</p>
            </div>
          </div>
          {allSeatsClaimed ? <p className={styles.notice}>All seats are currently claimed.</p> : null}
          {seatRace ? (
            <p className={styles.notice}>That role was claimed while you were choosing. Pick another seat.</p>
          ) : null}
          <div className={styles.roleGrid}>
            {ROLES.map((role) => {
              const taken = selectedTeam?.claimedRoles.includes(role) ?? false;
              return (
                <article key={role} className={styles.roleCard}>
                  <span className={styles.roleNumber}>{role === 'GM' ? '01' : role === 'Scout' ? '02' : '03'}</span>
                  <h3>{role}</h3>
                  <p>{role === 'GM' && 'Contracts, cuts, and free-agent signings.'}
                    {role === 'Scout' && 'Auction bids and market evidence.'}
                    {role === 'Coach' && 'Lineups, rotation, and playstyle.'}</p>
                  {selection.kind === 'existing' ? (
                    <button type="button" className={taken ? 'btn' : 'btn gold'}
                      aria-label={taken ? `${role} unavailable` : `Join as ${role}`}
                      disabled={busy || taken} onClick={() => void claim(selection.teamId, role)}>
                      {taken ? 'Taken' : busy ? 'Joining…' : `Join as ${role}`}
                    </button>
                  ) : (
                    <button type="button" className="btn gold" disabled={busy}
                      onClick={() => void createFranchise(role)}>
                      {busy ? 'Creating…' : `Create as ${role}`}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
