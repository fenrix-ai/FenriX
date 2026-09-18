import type { ReactElement } from 'react';
import { PlayerCard } from '../players/PlayerCard';
import { fmtM, r01 } from '../../lib/money';
import type { TeamIdentity } from '../../lib/franchiseIdentity';
import type { CatalogPlayer } from '../../types/models';
import styles from './OfferCard.module.css';

export type OfferCardProps = {
  player: CatalogPlayer;
  rate: string;
  years: number;
  maxYears: number;
  minimum?: number;
  identity?: TeamIdentity;
  disabled: boolean;
  dirty: boolean;
  error?: string;
  onRateChange: (value: string) => void;
  onYearsChange: (value: number) => void;
};

const followers = (value: string): string => {
  const total = Number(value);
  if (!Number.isFinite(total)) return '—';
  return total >= 1_000_000 ? `${(total / 1_000_000).toFixed(1)}M` : `${Math.round(total / 1_000)}k`;
};

export function OfferCard({
  player,
  rate,
  years,
  maxYears,
  minimum = 0.1,
  identity,
  disabled,
  dirty,
  error,
  onRateChange,
  onYearsChange,
}: OfferCardProps): ReactElement {
  const numericRate = Number(rate);
  const hasOffer = rate.trim() !== '' && Number.isFinite(numericRate) && numericRate > 0;
  const guaranteed = hasOffer ? r01(numericRate * years) : null;
  const errorId = `offer-${player.pid}-error`;

  return (
    <PlayerCard player={player} identity={identity} selected={hasOffer}>
      <div className={styles.offer}>
        <dl className={styles.context} aria-label={`Auction facts for ${player.name}`}>
          <div><dt>Followers</dt><dd>{followers(player.social_media_followers)}</dd></div>
          <div><dt>Games</dt><dd>{player.games_played}</dd></div>
          <div><dt>Minutes</dt><dd>{player.mins_per_game}</dd></div>
        </dl>

        <label className={styles.salary}>
          <span>Salary per round</span>
          <span className={styles.inputWrap}>
            <span aria-hidden="true">$</span>
            <input
              aria-describedby={error ? errorId : undefined}
              aria-invalid={error ? true : undefined}
              aria-label={`Salary per round for ${player.name}`}
              disabled={disabled}
              inputMode="decimal"
              min={minimum}
              onChange={(event) => onRateChange(event.target.value)}
              placeholder={minimum.toFixed(1)}
              step="0.1"
              type="number"
              value={rate}
            />
            <span aria-hidden="true">M</span>
          </span>
        </label>

        <fieldset className={styles.years} disabled={disabled}>
          <legend>Contract duration</legend>
          <div className={styles.yearOptions}>
            {Array.from({ length: maxYears }, (_, index) => index + 1).map((value) => (
              <label key={value} className={styles.yearOption}>
                <input
                  aria-label={`${value} ${value === 1 ? 'round' : 'rounds'}`}
                  checked={years === value}
                  name={`offer-years-${player.pid}`}
                  onChange={() => onYearsChange(value)}
                  type="radio"
                />
                <span>{value}</span>
                <span className={styles.srOnly}>{value === 1 ? 'round' : 'rounds'}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.commitment} aria-live="polite">
          <span>{guaranteed === null ? 'No offer' : `${fmtM(guaranteed)} guaranteed`}</span>
          <span className={dirty ? styles.unsaved : styles.saved}>
            {dirty ? 'Unsaved offer' : hasOffer ? 'Saved offer' : 'No saved offer'}
          </span>
        </div>
        {error ? <p className={styles.error} id={errorId}>{error}</p> : null}
      </div>
    </PlayerCard>
  );
}
