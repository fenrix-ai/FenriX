import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { PlayerSeat, Role } from '../../types/models';
import styles from './RoleSeats.module.css';

const ROLES: Role[] = ['GM', 'Scout', 'Coach'];

export function RoleSeats({ seats, currentUid }: {
  seats: ReadonlyMap<string, PlayerSeat>;
  currentUid: string | null;
}): ReactElement {
  const seen = useRef<Set<string> | null>(null);
  const arrivalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [arrivals, setArrivals] = useState<Set<string>>(new Set());

  useEffect(() => () => {
    if (arrivalTimer.current) clearTimeout(arrivalTimer.current);
  }, []);

  useEffect(() => {
    const next = new Set(seats.keys());
    // The provider publishes an empty map until its first server snapshot.
    // Treat the first non-empty map as baseline so initial teammates do not animate.
    if (seen.current === null) {
      if (next.size > 0) seen.current = next;
      return undefined;
    }

    const joined = new Set([...next].filter((uid) => !seen.current!.has(uid)));
    seen.current = next;
    if (joined.size === 0) return undefined;
    setArrivals(joined);
    if (arrivalTimer.current) clearTimeout(arrivalTimer.current);
    arrivalTimer.current = setTimeout(() => {
      setArrivals(new Set());
      arrivalTimer.current = null;
    }, 2400);
    return undefined;
  }, [seats]);

  const byRole = new Map<Role, { uid: string; seat: PlayerSeat }>();
  for (const [uid, seat] of seats) byRole.set(seat.role, { uid, seat });

  return (
    <section className={styles.section} aria-labelledby="front-office-seats">
      <div className={styles.heading}>
        <div>
          <span>Front office</span>
          <h3 id="front-office-seats">Three seats, one franchise</h3>
        </div>
        <p>Any teammate can cover an open role until it is claimed.</p>
      </div>
      <ol className={styles.seats}>
        {ROLES.map((role) => {
          const occupant = byRole.get(role);
          const own = occupant?.uid === currentUid;
          const arrived = occupant ? arrivals.has(occupant.uid) : false;
          return (
            <li key={role} className={`${styles.seat} ${arrived ? styles.arrival : ''}`}>
              <span className={styles.role}>{role}</span>
              {occupant ? (
                <div className={styles.occupant}>
                  <strong>{occupant.seat.displayName}</strong>
                  <span className={own ? styles.own : styles.claimed}>
                    {own ? 'Your seat' : 'Claimed'}
                  </span>
                  {arrived ? <span className={styles.justJoined}>Just joined</span> : null}
                </div>
              ) : (
                <div className={styles.open}>
                  <strong>Open seat</strong>
                  <span>Covered by the team</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
