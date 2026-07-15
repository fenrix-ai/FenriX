import { describe, it, expect } from 'vitest';
import { nextPhase } from '../src/phases.js';

describe('phase machine', () => {
  it('walks round 1 without front office', () => {
    expect(nextPhase(1, 'FREE_AGENCY')).toEqual({ round: 1, phase: 'AUCTION' });
    expect(nextPhase(1, 'AUCTION')).toEqual({ round: 1, phase: 'LINEUP' });
    expect(nextPhase(1, 'LINEUP')).toEqual({ round: 1, phase: 'SIMULATE' });
    expect(nextPhase(1, 'SIMULATE')).toEqual({ round: 1, phase: 'RESULTS' });
    expect(nextPhase(1, 'RESULTS')).toEqual({ round: 2, phase: 'FRONT_OFFICE' });
  });
  it('walks rounds 2-4 with front office and ends at finale', () => {
    expect(nextPhase(2, 'FRONT_OFFICE')).toEqual({ round: 2, phase: 'FREE_AGENCY' });
    expect(nextPhase(4, 'RESULTS')).toEqual({ round: 5, phase: 'FRONT_OFFICE' });
    expect(nextPhase(5, 'RESULTS')).toEqual({ round: 5, phase: 'FINALE' });
  });
  it('rejects unknown transitions', () => {
    expect(() => nextPhase(1, 'FINALE')).toThrow(/terminal/i);
  });
});
