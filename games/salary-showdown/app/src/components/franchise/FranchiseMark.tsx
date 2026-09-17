import { useId } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { resolveIdentity, teamMonogram } from '../../lib/franchiseIdentity';
import type { TeamIdentity } from '../../lib/franchiseIdentity';
import styles from './FranchiseMark.module.css';

export type FranchiseMarkProps = {
  teamId: string;
  name: string;
  identity?: TeamIdentity;
  size?: number;
};

export function FranchiseMark({
  teamId,
  name,
  identity,
  size = 56,
}: FranchiseMarkProps): ReactElement {
  const resolved = resolveIdentity(teamId, identity);
  const rawId = useId();
  const clipId = `franchise-mark-${rawId.replace(/:/g, '')}`;
  const dimensions = { '--mark-size': `${size}px` } as CSSProperties;

  return (
    <svg
      aria-hidden="true"
      className={styles.mark}
      data-accent={resolved.accent}
      data-jersey={resolved.jersey}
      focusable="false"
      style={dimensions}
      viewBox="0 0 64 72"
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M10 8 22 3h20l12 5 7 15-8 38-21 9-21-9-8-38Z" />
        </clipPath>
      </defs>
      <path className={styles.shadow} d="M10 8 22 3h20l12 5 7 15-8 38-21 9-21-9-8-38Z" />
      <g clipPath={`url(#${clipId})`}>
        <rect className={styles.field} width="64" height="72" />
        {resolved.jersey === 'classic' ? (
          <>
            <path className={styles.secondary} d="M0 0h18l8 19H0ZM64 0H46l-8 19h26Z" />
            <path className={styles.detail} d="M18 0c1 10 6 15 14 15S45 10 46 0" />
          </>
        ) : null}
        {resolved.jersey === 'stripe' ? (
          <>
            <rect className={styles.secondary} x="25" width="14" height="72" />
            <path className={styles.detail} d="M28 0v72M36 0v72" />
          </>
        ) : null}
        {resolved.jersey === 'chevron' ? (
          <>
            <path className={styles.secondary} d="M-4 13 32 34 68 13v14L32 48-4 27Z" />
            <path className={styles.detail} d="m-4 13 36 21 36-21" />
          </>
        ) : null}
      </g>
      <path className={styles.outline} d="M10 8 22 3h20l12 5 7 15-8 38-21 9-21-9-8-38Z" />
      <text className={styles.monogram} x="32" y="45" textAnchor="middle">
        {teamMonogram(name)}
      </text>
    </svg>
  );
}
