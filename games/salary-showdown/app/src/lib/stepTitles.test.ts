import { STEP_TITLES } from './stepTitles';

// The five finale reveal step titles are contract-fixed, VERBATIM (design
// spec §5.8 panel + §6.5 wall). This pin exists so that "improving" the copy
// in either consumer is impossible without failing the suite.
test('finale step titles are the contract-fixed five, verbatim', () => {
  expect(STEP_TITLES).toEqual([
    'Podium',
    'Hype vs Reality',
    'What the engine paid for',
    'Wins per dollar',
    'Best & worst signings',
  ]);
  expect(STEP_TITLES).toHaveLength(5);
});
