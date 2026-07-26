// Parity pin: the panel's client-side phase order (src/lib/phaseOrder.ts,
// consumed by AdvanceControl's button label and confirm guards) must NEVER
// drift from the server's authority, backend/functions/src/phases.js. If the
// server order ever changes, this test forces the client to change in the
// same commit.
//
// The backend module is untyped ESM JS outside this tsconfig's include set;
// the @ts-expect-error is load-bearing (tsc reports the unresolvable import
// on that line; vitest resolves and runs it fine at runtime).
// @ts-expect-error — untyped backend module, outside tsconfig include
import * as server from '../../../backend/functions/src/phases.js';
import { nextOf, ORDER, TOTAL_ROUNDS } from './phaseOrder';

test('client ORDER and TOTAL_ROUNDS mirror backend phases.js exactly', () => {
  expect(ORDER).toEqual(server.ORDER);
  expect(TOTAL_ROUNDS).toBe(server.TOTAL_ROUNDS);
});

test('nextOf matches server nextPhase for every in-order phase across rounds 1..5', () => {
  // Server signature is nextPhase(round, phase); client is nextOf(phase, round).
  for (let round = 1; round <= TOTAL_ROUNDS; round += 1) {
    for (const phase of ORDER) {
      const client = nextOf(phase, round);
      const srv = server.nextPhase(round, phase) as { round: number; phase: string };
      expect(client).not.toBeNull();
      expect({ round: client!.round, phase: client!.phase })
        .toEqual({ round: srv.round, phase: srv.phase });
    }
  }
});

test('phases without an advance control: client returns null where the server throws', () => {
  // LOBBY is not in the server ORDER (startSeason, not advancePhase, leaves
  // it) — nextPhase throws "unknown phase"; the panel renders no control.
  expect(nextOf('LOBBY', 0)).toBeNull();
  expect(() => server.nextPhase(0, 'LOBBY')).toThrow('unknown phase');
  // FINALE is terminal server-side; the panel renders no control.
  expect(nextOf('FINALE', 5)).toBeNull();
  expect(() => server.nextPhase(5, 'FINALE')).toThrow('FINALE is terminal');
});
