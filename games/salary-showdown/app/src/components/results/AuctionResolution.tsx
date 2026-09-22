import { fmtM } from '../../lib/money';
import type {
  AuctionDoc,
  CatalogPlayer,
  PrivateAuctionDoc,
  TeamDoc,
} from '../../types/models';
import styles from '../../pages/ResultsPage.module.css';

export type AuctionResolutionProps = {
  auction: AuctionDoc | null;
  privateAuction: PrivateAuctionDoc | null;
  round: number;
  catalog: ReadonlyMap<number, CatalogPlayer>;
  teams: ReadonlyMap<string, TeamDoc>;
};

export function AuctionResolution({
  auction,
  privateAuction,
  round,
  catalog,
  teams,
}: AuctionResolutionProps) {
  if (!auction?.results) return null;

  return (
    <section className={styles.auction} data-testid="auction-results" aria-labelledby="auction-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="auction-title">Star Auction · Round {round}</h2>
          <p>Final public contracts from this round.</p>
        </div>
      </div>
      <div className={styles.compactScroll} tabIndex={0} role="region"
        aria-label="Auction resolution table, horizontally scrollable">
        <table className="table">
          <thead>
            <tr><th className="name">Star</th><th>Pos</th><th>Signed by</th><th>Rate</th><th>Years</th></tr>
          </thead>
          <tbody>
            {auction.stars.map((pid) => {
              const result = auction.results!.find((entry) => entry.pid === pid);
              const won = result?.teamId != null;
              return (
                <tr key={pid}>
                  <td className="name">{catalog.get(pid)?.name ?? pid}</td>
                  <td>{catalog.get(pid)?.position ?? '—'}</td>
                  <td>{won ? teams.get(result.teamId!)?.name ?? '—' : 'Unsold'}</td>
                  <td className="mono">{won ? `${fmtM(result.rate!)}/rd` : '—'}</td>
                  <td className="mono">{won ? `${result.years} yr` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {privateAuction?.skippedRound === round && (privateAuction.skipped ?? []).length > 0 ? (
        <p className={styles.skipNote} data-testid="auction-skip-note">
          {(privateAuction.skipped ?? []).map((entry) =>
            `Your winning bid on ${catalog.get(entry.pid)?.name ?? entry.pid} couldn't be awarded (${
              entry.reason === 'cap' ? 'salary cap' : 'roster full'}).`).join(' ')}
        </p>
      ) : null}
    </section>
  );
}
