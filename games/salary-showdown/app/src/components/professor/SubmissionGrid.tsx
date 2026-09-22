import type { MouseEvent } from 'react';
import { useProfessor } from '../../contexts/ProfessorContext';
import { FranchiseMark } from '../franchise/FranchiseMark';
import { LIGHT_PHASES, submittedTeamIds } from '../../lib/submissionLights';
import type { Role } from '../../types/models';
import styles from './ProfessorDesk.module.css';

const ROLES: Role[] = ['GM', 'Scout', 'Coach'];

export function SubmissionGrid({ onManageSeats }: {
  onManageSeats(teamId: string | null, trigger: HTMLElement): void;
}) {
  const { game, teams, players, bidsSubmitted } = useProfessor();
  if (!game) return null;

  const hasSubmissionLights = LIGHT_PHASES.has(game.phase);
  const lit = hasSubmissionLights
    ? submittedTeamIds(game.phase, game.round, teams, bidsSubmitted)
    : new Set<string>();
  const rows = [...teams.entries()].sort((a, b) =>
    a[1].name.localeCompare(b[1].name, undefined, { numeric: true }));
  const seatHolder = (teamId: string, role: Role) =>
    [...players.values()].find((player) => player.teamId === teamId && player.role === role);

  const manage = (teamId: string, event: MouseEvent<HTMLButtonElement>) => {
    onManageSeats(teamId, event.currentTarget);
  };

  const content = (
    <div className={styles.teamGrid}>
      {rows.map(([teamId, team]) => {
        const submitted = lit.has(teamId);
        return (
          <article key={teamId} className={styles.teamCard}
            data-submitted={hasSubmissionLights ? submitted : undefined}
            data-testid={`franchise-${teamId}`}>
            <div className={styles.teamHeading} data-testid={`light-${teamId}`}>
              <FranchiseMark teamId={teamId} name={team.name} identity={team.identity} size={46} />
              <div className={styles.teamIdentity}>
                <strong className={styles.teamName} title={team.name}>
                  {hasSubmissionLights ? (submitted ? '● ' : '○ ') : ''}{team.name}
                </strong>
                <span className={styles.doneState} data-submitted={submitted}>
                  {hasSubmissionLights
                    ? (submitted ? 'Done signal received · revisions stay open' : 'Waiting for done signal')
                    : game.phase === 'LOBBY' ? 'Lobby seats' : 'Round in progress'}
                </span>
              </div>
            </div>
            <ul className={styles.roleList} aria-label={`${team.name} role seats`}>
              {ROLES.map((role) => {
                const holder = seatHolder(teamId, role);
                return (
                  <li key={role} className={styles.roleItem}>
                    <span className={styles.roleName}>{role}</span>
                    <span className={holder ? styles.roleHolder : styles.openSeat}>
                      {holder?.displayName ?? 'Open'}
                    </span>
                  </li>
                );
              })}
            </ul>
            <button type="button" className={`btn ${styles.manageButton}`}
              aria-label={`Manage seats for ${team.name}`}
              onClick={(event) => manage(teamId, event)}>
              Manage seats
            </button>
          </article>
        );
      })}
    </div>
  );

  return (
    <section className={styles.board} data-testid="franchise-grid" aria-label="Franchise readiness">
      <div className={styles.boardHeader}>
        <div>
          <h2 className={styles.panelTitle}>Franchise readiness</h2>
          <p className={styles.panelCopy}>
            Done is a status signal. Teams can revise until the phase advances.
          </p>
        </div>
        <span className={styles.boardMeta}>
          {hasSubmissionLights ? `${lit.size} of ${rows.length} submitted` : `${rows.length} franchises`}
        </span>
      </div>
      {hasSubmissionLights ? <div data-testid="submission-grid">{content}</div> : content}
    </section>
  );
}
