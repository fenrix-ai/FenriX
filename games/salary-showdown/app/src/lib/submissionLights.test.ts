import { LIGHT_PHASES, submittedTeamIds } from './submissionLights';
import type { TeamDoc } from '../types/models';

const mkTeam = (over: Partial<TeamDoc>): TeamDoc => ({
  name: 'T', wins: 0, losses: 0, pointDiff: 0, pointsFor: 0,
  roster: [], deadMoney: [], spendLog: [], lineup: null,
  lineupLockedRound: 0, hardshipUsed: [], doneRound: 0, donePhase: '',
  ...over,
});

test('FRONT_OFFICE: doneRound AND donePhase must both match', () => {
  const teams = new Map<string, TeamDoc>([
    ['a', mkTeam({ doneRound: 2, donePhase: 'FRONT_OFFICE' })],
    ['b', mkTeam({ doneRound: 2, donePhase: 'FREE_AGENCY' })],  // wrong-phase flag
    ['c', mkTeam({ doneRound: 1, donePhase: 'FRONT_OFFICE' })], // stale-round flag
    ['d', mkTeam({})],                                          // never pressed
  ]);
  expect(submittedTeamIds('FRONT_OFFICE', 2, teams, new Set())).toEqual(new Set(['a']));
});

test('FREE_AGENCY: the same pair check, against FREE_AGENCY', () => {
  const teams = new Map<string, TeamDoc>([
    ['a', mkTeam({ doneRound: 3, donePhase: 'FREE_AGENCY' })],
    ['b', mkTeam({ doneRound: 3, donePhase: 'FRONT_OFFICE' })], // this round's FO flag
  ]);
  expect(submittedTeamIds('FREE_AGENCY', 3, teams, new Set())).toEqual(new Set(['a']));
});

test('AUCTION: bidsSubmitted presence only — done flags and lineup locks ignored', () => {
  const teams = new Map<string, TeamDoc>([
    ['a', mkTeam({ doneRound: 2, donePhase: 'AUCTION', lineupLockedRound: 2 })],
    ['b', mkTeam({})],
  ]);
  expect(submittedTeamIds('AUCTION', 2, teams, new Set(['b']))).toEqual(new Set(['b']));
});

test('LINEUP: lineupLockedRound must equal the current round', () => {
  const teams = new Map<string, TeamDoc>([
    ['a', mkTeam({ lineupLockedRound: 4 })],
    ['b', mkTeam({ lineupLockedRound: 3 })], // last round's lock
  ]);
  expect(submittedTeamIds('LINEUP', 4, teams, new Set())).toEqual(new Set(['a']));
});

test('no-lights phases return the empty set even when every flag is set', () => {
  const teams = new Map<string, TeamDoc>([
    ['a', mkTeam({ doneRound: 5, donePhase: 'RESULTS', lineupLockedRound: 5 })],
  ]);
  for (const phase of ['LOBBY', 'SIMULATE', 'RESULTS', 'FINALE'] as const) {
    expect(LIGHT_PHASES.has(phase)).toBe(false);
    expect(submittedTeamIds(phase, 5, teams, new Set(['a']))).toEqual(new Set());
  }
});
