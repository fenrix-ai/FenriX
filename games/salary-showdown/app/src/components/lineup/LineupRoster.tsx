import { useDraggable } from '@dnd-kit/core';
import type { CSSProperties, ReactElement } from 'react';
import { PositionBadge } from '../ui/PositionBadge';
import type { CatalogPlayer } from '../../types/models';
import styles from './LineupControls.module.css';

type LineupRosterProps = {
  pids: number[];
  catalog: ReadonlyMap<number, CatalogPlayer>;
  selectedPid: number | null;
  canEdit: boolean;
  onSelect: (pid: number) => void;
};

export function LineupPlayerSummary({ player }: { player: CatalogPlayer }): ReactElement {
  return (
    <span className={styles.player} data-player-pid={player.pid}>
      <PositionBadge pos={player.position} />
      <span className={styles.playerCopy}>
        <span className={styles.playerName} data-testid="lineup-player-name">{player.name}</span>
        <span className={styles.playerStats}>
          {Number(player.pts_per_game).toFixed(1)} PPG · {Number(player.rebounds_per_game).toFixed(1)} REB
        </span>
      </span>
      <span className={styles.playerPosition} data-testid="lineup-player-position">
        {player.position}
      </span>
    </span>
  );
}

function RosterPlayer({
  player,
  selected,
  canEdit,
  onSelect,
}: {
  player: CatalogPlayer;
  selected: boolean;
  canEdit: boolean;
  onSelect: () => void;
}): ReactElement {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: player.pid,
    disabled: !canEdit,
  });
  const style: CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <li
      ref={setNodeRef}
      className={styles.rosterRow}
      data-dragging={isDragging}
      style={style}
    >
      <button
        type="button"
        aria-label={`Select ${player.name}, ${player.position}, player ${player.pid}`}
        aria-pressed={selected}
        className={styles.rosterButton}
        disabled={!canEdit}
        onClick={onSelect}
      >
        <LineupPlayerSummary player={player} />
      </button>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag ${player.name}, ${player.position}, player ${player.pid}`}
        className={styles.dragHandle}
        disabled={!canEdit}
      >
        Move
      </button>
    </li>
  );
}

export function LineupRoster({
  pids,
  catalog,
  selectedPid,
  canEdit,
  onSelect,
}: LineupRosterProps): ReactElement {
  return (
    <ul className={styles.roster} aria-label="Active roster">
      {pids.map((pid) => {
        const player = catalog.get(pid);
        return player ? (
          <RosterPlayer
            key={pid}
            player={player}
            selected={selectedPid === pid}
            canEdit={canEdit}
            onSelect={() => onSelect(pid)}
          />
        ) : null;
      })}
    </ul>
  );
}
