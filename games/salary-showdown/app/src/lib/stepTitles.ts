// Finale reveal step titles — contract-fixed, verbatim (design spec §5.8 /
// §6.5). ONE definition: FinaleWall (projector) and RevealStepper (panel)
// both import this module, so the two surfaces can never drift. Never
// re-word these; stepTitles.test.ts pins them.
export const STEP_TITLES = [
  'Podium',
  'Hype vs Reality',
  'What the engine paid for',
  'Wins per dollar',
  'Best & worst signings',
] as const;
