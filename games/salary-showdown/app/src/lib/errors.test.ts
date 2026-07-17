import { errorCopy } from './errors';

test('CAP_EXCEEDED parses round and payroll into copy', () => {
  expect(errorCopy(new Error('CAP_EXCEEDED:3:104.2')).headline)
    .toBe('Over the cap: round 3 payroll would hit $104.2M against the $100.0M cap.');
});
test('coded messages map to student copy', () => {
  expect(errorCopy(new Error('BAD_YEARS')).headline)
    .toBe('That contract length is not available this round.');
  expect(errorCopy(new Error('ROSTER_FULL')).headline)
    .toBe('Your roster is full — 10 players is the maximum.');
});
test('prose messages: cut prefix and phase-closed strings', () => {
  expect(errorCopy(new Error('cut: pid 1104 not on roster')).headline)
    .toBe('That player is not on your roster.');
  expect(errorCopy(new Error('market is closed')).headline).toBe('Free agency is closed.');
});
test('unknown errors fall back with the raw message attached', () => {
  const r = errorCopy(new Error('some new server string'));
  expect(r.headline).toBe('That did not go through — try again.');
  expect(r.raw).toBe('some new server string');
});
