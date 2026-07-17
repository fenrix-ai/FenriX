import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { ErrorNotice } from '../components/ui/ErrorNotice';

interface LobbyTeam { teamId: string; name: string; claimedRoles: string[] }
interface LobbyInfo {
  gameId: string; status: string; phase: string; round: number; teams: LobbyTeam[];
}
const ROLES = ['GM', 'Scout', 'Coach'] as const;

export default function LandingPage() {
  const { call, setGameId } = useGame();
  const [code, setCode] = useState(
    () => (new URLSearchParams(window.location.search).get('code') ?? '').toUpperCase().slice(0, 6));
  const [name, setName] = useState('');
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // No realtime pre-membership (rules deny reads until joinGame lands), so the
  // team list refreshes by polling getLobby every 3s while the picker is open.
  const lookup = useCallback(async (c: string, clearErr = true) => {
    try {
      if (clearErr) setErr(null);
      setLobby(await call<LobbyInfo>('getLobby', { joinCode: c.trim().toUpperCase() }));
    } catch (e) { setLobby(null); setErr(e); }
  }, [call]);

  useEffect(() => {
    if (!lobby) return;
    timer.current = setInterval(() => void lookup(code, false), 3000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [lobby !== null, code, lookup]); // eslint-disable-line react-hooks/exhaustive-deps

  const claim = async (teamId: string, role: string) => {
    setBusy(true); setErr(null);
    try {
      await call('joinGame', { joinCode: code.trim().toUpperCase(), teamId, role,
        displayName: name.trim() || 'Anonymous' });
      setGameId(lobby!.gameId); // membership listener + PhaseRouter take it from here
    } catch (e) {
      setErr(e);              // "seat taken" etc. — refresh the picker immediately
      void lookup(code, false);
    } finally { setBusy(false); }
  };

  return (
    <main className="page">
      <div className="brand" style={{ fontSize: 28 }}>Salary Showdown</div>
      <p className="muted">Enter the join code on the projector, pick your franchise, claim your seat.</p>
      <ErrorNotice error={err} />
      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="inset mono" style={{ color: 'inherit', fontSize: 18, width: 120 }}
          placeholder="CODE" maxLength={6} value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="join code" />
        <input className="inset" style={{ color: 'inherit', fontSize: 16, flex: 1, minWidth: 140 }}
          placeholder="Your name" maxLength={24} value={name}
          onChange={(e) => setName(e.target.value)} aria-label="display name" />
        <button className="btn gold" disabled={code.length < 6 || busy}
          onClick={() => void lookup(code)}>Find game</button>
      </div>
      {lobby && (
        <>
          {lobby.status !== 'lobby' && (
            <p className="muted">Season in progress — you can still claim an open seat.</p>
          )}
          {lobby.teams.map((t) => (
            <div key={t.teamId} className="card" style={{ marginTop: 10, display: 'flex',
              alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ flex: 1 }}>{t.name}</strong>
              {ROLES.map((r) => {
                const taken = t.claimedRoles.includes(r);
                return (
                  <button key={r} className={taken ? 'chip' : 'chip on'} disabled={taken || busy}
                    onClick={() => void claim(t.teamId, r)}>
                    {r}{taken ? ' · taken' : ''}
                  </button>
                );
              })}
            </div>
          ))}
        </>
      )}
    </main>
  );
}
