/**
 * Decision validation contract tests. These pin invariants that
 * `submitDecision` in index.js relies on after spreading the validated
 * object into the persisted decisionPatch.
 */

const assert = require('node:assert/strict');
const { validateDecision } = require('../functions/modules/decision-validation');
const configMod = require('../functions/modules/config');

const config = {
  ...configMod,
  ...configMod.DEFAULT_GAME_CONFIG,
};

// BASE_MENU = croissant, bagel, coffee — always unlocked.
const baseInput = () => ({
  menu: { croissant: true, bagel: true, coffee: true },
  quantities: { croissant: 100, bagel: 100, coffee: 100 },
  sousChefCount: 0,
  sousChefAssignments: {},
});

describe('validateDecision staffCounts contract (PR #128)', () => {
  it('defaults staffCounts.maintenanceGuys to 2 when client omits the field', () => {
    const validated = validateDecision(baseInput(), 1, config, {});
    assert.ok(validated.staffCounts, 'validated should include staffCounts');
    assert.equal(validated.staffCounts.maintenanceGuys, 2,
      'maintenanceGuys must default to 2 — submitDecision relies on this default ' +
      'flowing through the {...validated} spread into the persisted decisionPatch.');
  });

  it('preserves explicit staffCounts.maintenanceGuys from the client', () => {
    const validated = validateDecision(
      { ...baseInput(), staffCounts: { maintenanceGuys: 5 } },
      1, config, {},
    );
    assert.equal(validated.staffCounts.maintenanceGuys, 5);
  });

  it('survives the {...validated} spread used in submitDecision', () => {
    // This pins the pattern in index.js submitDecision: a decisionPatch is
    // built by spreading `validated`. Any explicit `staffCounts:` assignment
    // AFTER the spread would overwrite the defaulted value with the raw
    // client object — that is the bug PR #128 fixes.
    const validated = validateDecision(baseInput(), 1, config, {});
    const decisionPatch = {
      round: 1,
      submittedAt: 'sentinel',
      ...validated,
    };
    assert.equal(decisionPatch.staffCounts.maintenanceGuys, 2,
      'spread should carry through the validator default');
  });
});
