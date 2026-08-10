'use strict';
const assert = require('assert');
const Trade = require('../trade-intelligence.js');

const catalog = [
  { id: 'alpha', name: 'Alpha', value: 100, sourceValues: { googleSheet: { value: 100 }, vaultedValuesX: { value: 100 } }, demand: 'HIGH', trend: 'STABLE', stability: 'STABLE' },
  { id: 'beta', name: 'Beta', value: 120, sourceValues: { googleSheet: { value: 120 }, vaultedValuesX: { value: 150 } }, demand: 'LOW', trend: 'FALLING', stability: 'VOLATILE' },
  { id: 'gamma', name: 'Gamma', value: 108, sourceValues: { googleSheet: { value: 108 }, vaultedValuesX: { value: 108 } }, demand: 'VERY HIGH', trend: 'RISING', stability: 'STABLE' },
  { id: 'delta', name: 'Delta', value: 92, sourceValues: { googleSheet: { value: 92 }, vaultedValuesX: { value: 92 } }, demand: 'MEDIUM', trend: 'STABLE', stability: 'STABLE' },
];
const result = Trade.calculate({ yours: [catalog[0]], theirs: [catalog[1]] }, { fairPercent: 5, winPercent: 15, sourceDisagreementPercent: 10 });
assert.equal(result.result, 'W');
assert.equal(result.difference, 20, 'Google primary must be used, not Vaulted 150');
assert(result.warnings.some(warning => warning.includes('differs by 25.0%')));
assert(result.warnings.some(warning => warning.includes('low demand')));
assert(result.warnings.some(warning => warning.includes('falling')));
assert(result.warnings.some(warning => warning.includes('volatile')));
assert.equal(Trade.calculate({ yours: [catalog[0]], theirs: [{ id: 'gone', name: 'Old name' }] }).theirs.missing.length, 1);
assert.deepEqual(Trade.suggestions(catalog, catalog[0], 'upgrade').map(row => row.id), ['gamma']);
assert.deepEqual(Trade.suggestions(catalog, catalog[0], 'better-demand').map(row => row.id), ['gamma']);
const saved = Trade.snapshot({ yours: [{ ...catalog[0], quantity: 2 }], theirs: [{ ...catalog[1], quantity: 1 }] }, result);
const restored = Trade.hydrate(saved, [catalog[0]]);
assert.equal(restored.trade.yours[0].quantity, 2);
assert.deepEqual(restored.missing, [{ id: 'beta', name: 'Beta' }]);
console.log('trade-intelligence tests: PASS');
