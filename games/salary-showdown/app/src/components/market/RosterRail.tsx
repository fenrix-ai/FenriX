import { activeContracts } from '../../lib/contracts';
import { fmtM } from '../../lib/money';
import type { CatalogPlayer, TeamDoc } from '../../types/models';
import { PositionBadge } from '../ui/PositionBadge';
import styles from '../../pages/FreeAgencyPage.module.css';

export function RosterRail({ team, round, catalog, accepted }: {
  team: TeamDoc; round: number; catalog: ReadonlyMap<number, CatalogPlayer>;
  accepted: { pid: number; id: number } | null;
}) {
  const contracts = activeContracts(team, round);
  const counts = { G: 0, W: 0, B: 0 };
  contracts.forEach((c) => { const p = catalog.get(c.pid); if (p) counts[p.position]++; });
  return <section data-testid="my-roster" aria-label="Your roster" className={styles.roster}>
    <h2>Your roster <span>{contracts.length} of 10</span></h2>
    <p>Roster checklist: {contracts.length}/8+ players · G {counts.G}/2 · W {counts.W}/2 · B {counts.B}/1</p>
    <p>Minimum 8 players, maximum 10. Starting positions: 2 guards, 2 wings, 1 big.</p>
    {contracts.length === 0 && <p>No players under contract yet.</p>}
    <ul>{contracts.map((c) => {
      const player = catalog.get(c.pid);
      return <li key={`${c.pid}-${c.startRound}-${accepted?.pid === c.pid ? accepted.id : ''}`}
        className={accepted?.pid === c.pid ? styles.accepted : undefined} data-testid={`roster-${c.pid}`}>
        <strong>{player?.name ?? `Player ${c.pid}`}</strong>{' '}
        {player && <PositionBadge pos={player.position} />}
        <div className="mono">{fmtM(c.rate)}/rd × {c.years}</div>
      </li>;
    })}</ul>
  </section>;
}
