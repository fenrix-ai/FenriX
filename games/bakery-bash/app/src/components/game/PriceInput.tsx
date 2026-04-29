import { useEffect, useState } from 'react';
import type { ProductPriceConfig, PriceZone } from '../../types/game';
import { classifyZone, clampPrice, snapPriceToStep } from '../../lib/pricing';

interface Props {
  value: number;
  onChange: (next: number) => void;
  cfg: ProductPriceConfig;
  disabled?: boolean;
}

const ZONE_LABEL: Record<PriceZone, string> = {
  floor: 'Cheap',
  competitive: 'Competitive',
  premium: 'Premium',
};

export function PriceInput({ value, onChange, cfg, disabled }: Props) {
  const [raw, setRaw] = useState(value.toFixed(2));
  const zone = classifyZone(value, cfg);
  const overMax = (Number.parseFloat(raw) || 0) > 999999;

  // Resync the visible input whenever the controlled value changes externally:
  // round transitions, carry-over prefill from the player doc, or a parent
  // reset. Without this, the input keeps whatever the user typed while the
  // underlying `value` silently diverges.
  useEffect(() => {
    setRaw(value.toFixed(2));
  }, [value]);

  const commit = (next: number) => {
    const snapped = clampPrice(snapPriceToStep(next), cfg);
    setRaw(snapped.toFixed(2));
    if (snapped !== value) onChange(snapped);
  };

  const nudge = (step: number) => commit(value + step);

  return (
    <div className="price-input">
      <button
        type="button"
        disabled={disabled || value <= cfg.floor}
        onClick={() => nudge(-0.25)}
        className="price-input__nudge"
        aria-label="decrease price"
      >-</button>
      <span className="price-input__symbol">$</span>
      <input
        type="number"
        step="0.25"
        min={cfg.floor}
        max={Math.min(cfg.ceiling, 999999)}
        value={raw}
        disabled={disabled}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => commit(Number.parseFloat(raw) || cfg.floor)}
        className={`price-input__field${overMax ? " price-input__field--error" : ""}`}
        aria-invalid={overMax ? "true" : undefined}
        title={`Floor $${cfg.floor.toFixed(2)} / Ceiling $${cfg.ceiling.toFixed(2)}`}
      />
      {overMax && (
        <p className="price-input__error" role="alert">Going way over budget there!</p>
      )}
      <button
        type="button"
        disabled={disabled || value >= cfg.ceiling}
        onClick={() => nudge(+0.25)}
        className="price-input__nudge"
        aria-label="increase price"
      >+</button>
      <span className={`price-input__badge price-input__badge--${zone}`}>
        {ZONE_LABEL[zone]}
      </span>
    </div>
  );
}
