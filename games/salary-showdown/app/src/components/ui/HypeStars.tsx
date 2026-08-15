// Hype renders VISUALLY only as ★ glyphs (halves as ½) — never numerically
// on-screen (spec §11). The aria-label DELIBERATELY carries the numeric value:
// assistive tech gets the same information losslessly, which is correct a11y
// practice and in-scope per the handoff §6 note (2026-08-15, F9b).
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
