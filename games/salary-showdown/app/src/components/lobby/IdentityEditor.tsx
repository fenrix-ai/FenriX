import { useEffect, useState, type ReactElement } from 'react';
import type { TeamIdentity } from '../../lib/franchiseIdentity';
import { ErrorNotice } from '../ui/ErrorNotice';
import styles from './IdentityEditor.module.css';

const ACCENTS: { value: TeamIdentity['accent']; label: string }[] = [
  { value: 'gold', label: 'Gold' },
  { value: 'teal', label: 'Teal' },
  { value: 'coral', label: 'Coral' },
  { value: 'violet', label: 'Violet' },
  { value: 'sky', label: 'Sky' },
  { value: 'mint', label: 'Mint' },
];

const JERSEYS: { value: TeamIdentity['jersey']; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'chevron', label: 'Chevron' },
];

export function IdentityEditor({ identity, onSave, disabled }: {
  identity: TeamIdentity;
  onSave: (identity: TeamIdentity) => Promise<void>;
  disabled: boolean;
}): ReactElement {
  const [draft, setDraft] = useState(identity);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(identity);
    // Draft lifecycle changes do not resync an unchanged prop: a successful
    // save keeps its preview while the team snapshot catches up.
  }, [identity.accent, identity.jersey]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (next: Partial<TeamIdentity>) => {
    setDraft((current) => ({ ...current, ...next }));
    setDirty(true);
    setSaved(false);
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      await onSave(draft);
      setDirty(false);
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.editor} aria-labelledby="identity-heading">
      <div className={styles.headingRow}>
        <div>
          <h2 id="identity-heading">Franchise identity</h2>
          <p>Preview your colors and jersey, then save for the whole team.</p>
        </div>
        <div className={styles.preview} data-accent={draft.accent} data-jersey={draft.jersey}
          aria-label={`${ACCENTS.find((item) => item.value === draft.accent)?.label} ${JERSEYS.find((item) => item.value === draft.jersey)?.label} jersey preview`}>
          <span>SS</span>
        </div>
      </div>

      <fieldset className={styles.options} disabled={disabled || busy}>
        <legend>Accent</legend>
        <div className={styles.optionGrid}>
          {ACCENTS.map(({ value, label }) => (
            <label key={value} className={styles.option} data-accent={value}>
              <input type="radio" name="franchise-accent" value={value}
                checked={draft.accent === value}
                onChange={() => change({ accent: value })} />
              <span className={styles.swatch} aria-hidden="true" />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.options} disabled={disabled || busy}>
        <legend>Jersey</legend>
        <div className={styles.jerseyOptions}>
          {JERSEYS.map(({ value, label }) => (
            <label key={value} className={styles.option}>
              <input type="radio" name="franchise-jersey" value={value}
                checked={draft.jersey === value}
                onChange={() => change({ jersey: value })} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.actions}>
        <button type="button" className="btn gold" disabled={disabled || busy || !dirty}
          onClick={() => void save()}>
          {busy ? 'Saving identity…' : 'Save identity'}
        </button>
        {saved ? <span className="ok" role="status">Identity saved.</span> : null}
        {disabled ? <span className="muted">Identity editing closes when the season starts.</span> : null}
      </div>
      <ErrorNotice error={error} />
    </section>
  );
}
