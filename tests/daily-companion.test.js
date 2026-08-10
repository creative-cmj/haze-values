const test = require('node:test');
const assert = require('node:assert/strict');
const companion = require('../daily-companion');

const history = { snapshots: [
  { observedAt: '2026-08-01T00:00:00Z', items: [{ id: 'dragon', value: 100, valueText: '100' }] },
  { observedAt: '2026-08-02T00:00:00Z', items: [{ id: 'dragon', value: 125, valueText: '125' }] },
] };

test('uses committed snapshots only and labels one snapshot as a baseline', () => {
  const baseline = companion.snapshotsFor({ snapshots: [history.snapshots[0]] }, 'dragon');
  assert.equal(baseline.length, 1);
  assert.equal(companion.trendState(baseline).state, 'baseline');
  assert.equal(companion.sparklinePath(baseline), null);
});

test('renders trend math from real sequential snapshots', () => {
  const points = companion.snapshotsFor(history, 'dragon');
  const trend = companion.trendState(points);
  assert.equal(trend.state, 'up');
  assert.equal(trend.delta, 25);
  assert.equal(trend.percent, 25);
  assert.match(companion.sparklinePath(points), /^M/);
});

test('keeps Google Sheet primary when a cross-check disagrees', () => {
  const profile = companion.sourceProfile({ sourceValues: {
    googleSheet: { value: 100 }, vaultedValuesX: { value: 90 },
  } });
  assert.equal(profile.primaryValue, 100);
  assert.equal(profile.crossValue, 90);
  assert.equal(profile.conflict, true);
  assert.equal(profile.difference, -10);
});
