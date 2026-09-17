export function presentationProgress(
  elapsedMs: number,
  gameCount: number,
  reduced: boolean,
): number {
  if (gameCount <= 0) return 0;
  if (reduced) return gameCount;
  const step = Math.max(1500, Math.min(3000, 45000 / gameCount));
  return Math.min(gameCount, Math.max(0, Math.floor((elapsedMs - 1200) / step)));
}
