const test = require('node:test');
const assert = require('node:assert/strict');
const timer = require('../event-timer');

const anchor = Date.UTC(2026, 0, 1, 0, 0, 0);
const settings = { version: 1, configId: 'storm', anchorMs: anchor };

test('waits 2h35m after the ten-minute storm ends before the next start', () => {
  const config = timer.getConfig('storm');
  assert.equal(config.cooldownAfterEndMs, 155 * 60 * 1000);
  assert.equal(config.intervalMs, 165 * 60 * 1000);
  assert.equal(config.durationMs, 10 * 60 * 1000);
  const active = timer.eventState(settings, anchor + 10 * 60 * 1000 - 1);
  assert.equal(active.active, true);
  assert.equal(active.remainingMs, 1);
  const closed = timer.eventState(settings, anchor + 10 * 60 * 1000);
  assert.equal(closed.active, false);
  assert.equal(closed.nextStartMs, anchor + 165 * 60 * 1000);
});

test('calculates from timestamps rather than accumulated countdown state', () => {
  const config = timer.getConfig('storm');
  const lateTick = anchor + 3 * config.intervalMs + config.durationMs + 17_321;
  const state = timer.eventState(settings, lateTick);
  assert.equal(state.nextStartMs, anchor + 4 * config.intervalMs);
  assert.equal(state.remainingMs, config.intervalMs - config.durationMs - 17_321);
});

test('returns all upcoming starts in a horizon and groups local display dates', () => {
  const config = timer.getConfig('storm');
  const starts = timer.upcomingStarts(settings, anchor + 1, 5 * config.intervalMs);
  assert.deepEqual(starts, [1,2,3,4,5].map(n => anchor + n * config.intervalMs));
  const grouped = timer.groupSchedule(starts, 'en-US');
  assert.ok(grouped.length >= 1);
  assert.equal(grouped.flatMap(group => group.events).length, starts.length);
});

test('rejects corrupt, wrong-version, and unknown-config saved values', () => {
  assert.equal(timer.validateSaved({ version: 2, configId: 'storm', anchorMs: anchor }), null);
  assert.equal(timer.validateSaved({ version: 1, configId: 'unknown', anchorMs: anchor }), null);
  assert.equal(timer.validateSaved({ version: 1, configId: 'storm', anchorMs: 'now' }), null);
});

test('round-trips only validated versioned local storage settings', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  assert.deepEqual(timer.saveSettings(storage, settings), settings);
  assert.deepEqual(timer.readSettings(storage), settings);
  store.set(timer.STORAGE_KEY, '{bad json');
  assert.equal(timer.readSettings(storage), null);
});

test('notification adapter is explicitly unavailable and never schedules', async () => {
  assert.equal(timer.notificationAdapter.isAvailable(), false);
  await assert.rejects(timer.notificationAdapter.schedule(), /not implemented/i);
});
