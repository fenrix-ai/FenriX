import { useEffect, useMemo, useRef, useState } from 'react';
import { useProfessor } from '../../contexts/ProfessorContext';
import { ErrorNotice } from '../ui/ErrorNotice';
import type { Role } from '../../types/models';
import styles from './ProfessorDesk.module.css';

const ROLES: Role[] = ['GM', 'Scout', 'Coach'];
const FOCUSABLE = [
  'button:not([disabled])',
  'select:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type ArmedRelease = { teamId: string; role: Role; holderUid: string };

export function SeatPanel({ open, initialTeamId, onClose }: {
  open: boolean;
  initialTeamId: string | null;
  onClose(): void;
}) {
  const { gameId, game, teams, players, call } = useProfessor();
  const [arm, setArm] = useState<ArmedRelease | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const initializedForRef = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const rows = useMemo(() => [...teams.entries()].sort((a, b) =>
    a[1].name.localeCompare(b[1].name, undefined, { numeric: true })), [teams]);

  useEffect(() => {
    if (!open) {
      initializedForRef.current = null;
      return;
    }
    const sessionTarget = JSON.stringify([gameId, initialTeamId]);
    if (initializedForRef.current === sessionTarget) return;
    initializedForRef.current = sessionTarget;
    const next = initialTeamId && teams.has(initialTeamId) ? initialTeamId : rows[0]?.[0] ?? '';
    setSelectedTeamId(next);
    setArm(null);
    setError(null);
    queueMicrotask(() => closeRef.current?.focus());
  }, [open, initialTeamId, gameId, rows, teams]);

  useEffect(() => {
    if (!open || (selectedTeamId && teams.has(selectedTeamId))) return;
    const next = initialTeamId && teams.has(initialTeamId) ? initialTeamId : rows[0]?.[0] ?? '';
    if (next !== selectedTeamId) setSelectedTeamId(next);
    setArm(null);
  }, [open, initialTeamId, rows, selectedTeamId, teams]);

  useEffect(() => {
    if (!arm) return;
    const currentHolder = [...players.entries()].find(([, player]) =>
      player.teamId === arm.teamId && player.role === arm.role);
    if (currentHolder?.[0] !== arm.holderUid) setArm(null);
  }, [arm, players]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const drawer = drawerRef.current;
      if (!drawer) return;
      const controls = [...drawer.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (!drawer.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !gameId || !game) return null;
  const selected = rows.find(([teamId]) => teamId === selectedTeamId) ?? rows[0];
  const seatHolder = (teamId: string, role: Role) =>
    [...players.entries()].find(([, player]) =>
      player.teamId === teamId && player.role === role) ?? null;
  const release = async (teamId: string, role: Role, holderUid: string) => {
    if (pendingRef.current) return;
    if (seatHolder(teamId, role)?.[0] !== holderUid) {
      setArm(null);
      return;
    }
    pendingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await call('releaseSeat', { gameId, teamId, role });
      setArm(null);
    } catch (e) {
      setError(e);
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <section ref={drawerRef} id="professor-seat-panel" className={styles.drawer} data-testid="seat-panel"
        role="dialog" aria-modal="true" aria-labelledby="seat-panel-title">
        <div className={styles.drawerHeader}>
          <div>
            <h2 id="seat-panel-title">Seat tools</h2>
            <p className={styles.drawerIntro}>
              Releasing a seat signs that player out. Teammates can act for a role only when
              that role has no claimed seat.
            </p>
          </div>
          <button ref={closeRef} type="button" className="btn" onClick={onClose}>
            Close seat tools
          </button>
        </div>

        <label className={styles.pickerLabel}>
          Franchise
          <select className={styles.teamPicker} value={selected?.[0] ?? ''}
            onChange={(event) => { setSelectedTeamId(event.target.value); setArm(null); }}>
            {rows.map(([teamId, team]) => (
              <option key={teamId} value={teamId}>{team.name}</option>
            ))}
          </select>
        </label>

        {selected && (
          <div className={styles.seatTeam} data-testid={`seats-${selected[0]}`}>
            <h3 className={styles.seatTeamTitle}>{selected[1].name}</h3>
            <div className={styles.seatRows}>
              {ROLES.map((role) => {
                const holderEntry = seatHolder(selected[0], role);
                const holder = holderEntry?.[1] ?? null;
                const armed = Boolean(holderEntry && arm?.teamId === selected[0]
                  && arm.role === role && arm.holderUid === holderEntry[0]);
                return (
                  <div key={role} className={styles.seatRow}>
                    <span className={holder ? styles.seatHolder : styles.seatOpen}>
                      {role}: {holder?.displayName ?? 'open'}
                    </span>
                    {holderEntry && (
                      <button type="button" className="btn" disabled={busy}
                        aria-label={armed
                          ? `Confirm release ${role} on ${selected[1].name}`
                          : `Release ${role} on ${selected[1].name}`}
                        onClick={() => (armed
                          ? void release(selected[0], role, holderEntry[0])
                          : setArm({ teamId: selected[0], role, holderUid: holderEntry[0] }))}>
                        {armed ? 'Confirm release' : 'Release'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <ErrorNotice error={error} />
      </section>
    </div>
  );
}
