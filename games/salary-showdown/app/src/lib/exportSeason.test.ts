import { concatBoxCsv } from './exportSeason';

test('empty input produces the empty string', () => {
  expect(concatBoxCsv([])).toBe('');
});

test('one round passes through: its header once, LF endings, trailing LF', () => {
  expect(concatBoxCsv(['h1,h2\na,1\nb,2\n'])).toBe('h1,h2\na,1\nb,2\n');
});

test('three rounds: single header, bodies concatenated in order, LF only', () => {
  const r1 = 'round,team\n1,Alpha\n1,Beta\n';
  const r2 = 'round,team\n2,Alpha\n';
  const r3 = 'round,team\n3,Beta'; // no trailing LF on the wire — normalised out
  expect(concatBoxCsv([r1, r2, r3]))
    .toBe('round,team\n1,Alpha\n1,Beta\n2,Alpha\n3,Beta\n');
});
