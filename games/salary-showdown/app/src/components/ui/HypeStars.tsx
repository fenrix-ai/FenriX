// Hype renders ONLY as ★ glyphs (halves as ½) — never numerically (spec §11).
// ★ and ½ are glyphs, not emojis; the no-emoji rule is untouched.
export function HypeStars({ hype }: { hype: number }) {
  const full = Math.floor(hype);
  const half = hype - full >= 0.5;
  return (
    <span className="stars" aria-label={`hype ${hype} of 5`}>
      {'★'.repeat(full)}{half ? '½' : ''}
    </span>
  );
}
