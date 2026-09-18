import type { RevealDoc } from '../../types/models';
import styles from '../../pages/FinalePage.module.css';

type Story = RevealDoc['perTeam'][number];

function SigningFact({ label, signing, playerNames }: {
  label: string;
  signing: Story['bestSigning'];
  playerNames: ReadonlyMap<number, string>;
}) {
  if (!signing) return null;
  return (
    <div className={styles.signingFact}>
      <span>{label}</span>
      <strong>{playerNames.get(signing.pid) ?? `Player ${signing.pid}`}</strong>
      <span className="mono">{signing.valuePerDollar.toFixed(2)} TI per $M</span>
    </div>
  );
}

export function SigningStory({ teamName, story, playerNames }: {
  teamName: string;
  story: Story | null;
  playerNames: ReadonlyMap<number, string>;
}) {
  const hasSigning = Boolean(story?.bestSigning || story?.worstSigning);
  return (
    <section className={styles.story} data-testid="your-signings" aria-labelledby="signing-story-title">
      <div>
        <p className={styles.sectionLabel}>Your franchise record</p>
        <h2 id="signing-story-title">{teamName}'s signing ledger</h2>
        <p className={styles.storyIntro}>
          These are the server-recorded highest and lowest TrueImpact returns per $1M committed.
        </p>
      </div>
      {hasSigning && story ? (
        <div className={styles.signingFacts}>
          <SigningFact label="Highest return" signing={story.bestSigning}
            playerNames={playerNames} />
          <SigningFact label="Lowest return" signing={story.worstSigning}
            playerNames={playerNames} />
        </div>
      ) : (
        <p className={styles.emptyStory}>
          No eligible signings were recorded for this franchise. Synthetic hardship players are
          excluded from the signing ledger.
        </p>
      )}
    </section>
  );
}
