import { useMemo, useState } from 'react';
import { ScatterTI } from '../charts/ScatterTI';
import { classifyScatter, type ScatterClass } from '../../lib/revealCharts';
import type { RevealDoc, TeamDoc } from '../../types/models';
import styles from '../../pages/FinalePage.module.css';

type Filter = 'all' | 'trap' | 'bargain';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All players' },
  { id: 'trap', label: 'Known traps' },
  { id: 'bargain', label: 'Known bargains' },
];

const classLabel: Record<ScatterClass, string> = {
  trap: 'Known trap', bargain: 'Known bargain', normal: 'Other player',
};

export function RevealExplorer({ rows, teams }: {
  rows: RevealDoc['scatter'];
  teams: ReadonlyMap<string, TeamDoc>;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const classes = useMemo(() => classifyScatter(rows), [rows]);
  const visiblePids = useMemo(() => new Set(rows
    .filter((row) => filter === 'all' || classes.get(row.pid) === filter)
    .map((row) => row.pid)), [classes, filter, rows]);
  const highlightPids = useMemo(() => new Set(
    selectedTeamId
      ? (teams.get(selectedTeamId)?.spendLog ?? []).map((contract) => contract.pid)
      : [],
  ), [selectedTeamId, teams]);
  const selected = rows.find((row) => row.pid === selectedPid) ?? null;
  const teamOptions = useMemo(() => [...teams.entries()]
    .sort((a, b) => a[1].name.localeCompare(b[1].name)), [teams]);

  return (
    <div className={styles.explorer}>
      <div className={styles.explorerControls}>
        <div className={styles.filterGroup} aria-label="Player classification filter">
          {FILTERS.map((item) => (
            <button key={item.id} type="button"
              className={`${styles.filterButton} ${filter === item.id ? styles.activeFilter : ''}`}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <label className={styles.teamFilter}>
          <span>Highlight franchise signings</span>
          <select value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)}>
            <option value="">No franchise highlight</option>
            {teamOptions.map(([teamId, team]) => (
              <option key={teamId} value={teamId}>{team.name}</option>
            ))}
          </select>
        </label>
      </div>

      <p className={styles.explorerSummary}>
        {`Showing ${visiblePids.size} of ${rows.length} players`}
        {selectedTeamId && ' · Rings mark players signed by the selected franchise.'}
      </p>
      {selectedTeamId && (
        <p className={styles.sharedNote}>
          Ordinary free agents can appear for more than one franchise; each signing is an
          independent roster copy.
        </p>
      )}

      <ScatterTI rows={rows} selectedPid={selectedPid} onSelectPid={setSelectedPid}
        highlightPids={highlightPids} visiblePids={visiblePids} />

      <div className={styles.selectedPoint} role="status" aria-label="Selected player details">
        {selected ? (
          <>
            <strong>{selected.name}</strong>
            <span>Hype {selected.hype}</span>
            <span>TrueImpact {selected.ti}</span>
            <span>{selected.salary == null ? 'Auction player · no list salary'
              : `$${selected.salary.toFixed(1)}M list salary`}</span>
            <span>{classLabel[classes.get(selected.pid) ?? 'normal']}</span>
          </>
        ) : (
          <span>Select a point with the pointer, Enter, or Space to inspect its exact values.</span>
        )}
      </div>

      <div className={styles.pointList} aria-label="Visible player data">
        <h4>Visible player data</h4>
        <ul>
          {rows.filter((row) => visiblePids.has(row.pid)).map((row) => (
            <li key={row.pid}>
              <strong>{row.name}</strong>
              <span>Hype {row.hype}; TrueImpact {row.ti}; {row.salary == null
                ? 'no list salary' : `$${row.salary.toFixed(1)}M list salary`}; {
                classLabel[classes.get(row.pid) ?? 'normal']}.</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
