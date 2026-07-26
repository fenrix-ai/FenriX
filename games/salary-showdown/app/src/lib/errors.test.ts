import { errorCopy } from './errors';
import { FirebaseError } from 'firebase/app';

test('CAP_EXCEEDED parses round and payroll into copy', () => {
  expect(errorCopy(new Error('CAP_EXCEEDED:3:104.2')).headline)
    .toBe('Over the cap: round 3 payroll would hit $104.2M against the $100.0M cap.');
});
test('coded messages map to student copy', () => {
  expect(errorCopy(new Error('BAD_YEARS')).headline)
    .toBe('That contract length is not available this round.');
  expect(errorCopy(new Error('ROSTER_FULL')).headline)
    .toBe('Your roster is full — 10 players is the maximum.');
  expect(errorCopy(new Error('STAR_TAKEN')).headline)
    .toBe("This star's claim has already been used this round.");
  expect(errorCopy(new Error('BAD_TIMER')).headline)
    .toBe("Timer request was invalid — check the phase hasn't changed.");
  expect(errorCopy(new Error('BAD_STEP')).headline)
    .toBe("That reveal step doesn't exist.");
});
test('prose messages: cut prefix and phase-closed strings', () => {
  expect(errorCopy(new Error('cut: pid 1104 not on roster')).headline)
    .toBe('That player is not on your roster.');
  expect(errorCopy(new Error('market is closed')).headline).toBe('Free agency is closed.');
});
test('PHASE_MISMATCH maps to the phase-closed copy', () => {
  expect(errorCopy(new Error('PHASE_MISMATCH')).headline).toBe('The phase just closed.');
});
test('unknown errors fall back with the raw message attached', () => {
  const r = errorCopy(new Error('some new server string'));
  expect(r.headline).toBe('That did not go through — try again.');
  expect(r.raw).toBe('some new server string');
});
test('already-exists kind maps to the seat-taken copy', () => {
  expect(errorCopy(new FirebaseError('functions/already-exists', 'GM role already taken on that team')).headline)
    .toBe('That seat was just taken — pick another role.');
});
