const test = require('node:test');
const assert = require('node:assert/strict');
const timer = require('../event-timer');

const capturedAt = Date.UTC(2026, 0, 1, 0, 0, 0);
const settings = { version: 2, configId: 'storm', capturedAtMs: capturedAt, serverElapsedMs: 0 };

test('uses the fixed server-time first Storm at 2:35, then resets 2h35m after the window ends', () => {
  const config = timer.getConfig('storm');
  assert.equal(config.firstStartServerElapsedMs, 155 * 60 * 1000);
  assert.equal(config.cooldownAfterEndMs, 155 * 60 * 1000);
  assert.equal(config.intervalMs, 165 * 60 * 1000);
  assert.equal(config.durationMs, 10 * 60 * 1000);

  const beforeFirst = timer.eventState(settings, capturedAt + 154 * 60 * 1000 + 59_999);
  assert.equal(beforeFirst.active, false);
  assert.equal(beforeFirst.nextStartMs, capturedAt + 155 * 60 * 1000);

  const active = timer.eventState(settings, capturedAt + 165 * 60 * 1000 - 1);
  assert.equal(active.active, true);
  assert.equal(active.remainingMs, 1);

  const closed = timer.eventState(settings, capturedAt + 165 * 60 * 1000);
  assert.equal(closed.active, false);
  assert.equal(closed.nextStartMs, capturedAt + 320 * 60 * 1000);
});

test('expresses upcoming starts in server elapsed time rather than device wall-clock time', () => {
  const starts = timer.upcomingStarts(settings, capturedAt, 10 * 60 * 60 * 1000);
  assert.deepEqual(starts.map(timestamp => timer.formatServerElapsed(timer.serverElapsedAt(settings, timestamp))), ['2:35', '5:20', '8:05']);
});

test('converts a current server elapsed time to the fixed schedule without a storm observation', () => {
  const config = timer.getConfig('storm');
  const atTwoHours = timer.settingsFromServerElapsed('storm', capturedAt, 120 * 60 * 1000);
  const state = timer.eventState(atTwoHours, capturedAt);
  assert.equal(state.nextStartMs, capturedAt + 35 * 60 * 1000);
  assert.equal(timer.serverElapsedAt(atTwoHours, capturedAt + 30 * 60 * 1000), 150 * 60 * 1000);
  assert.equal(timer.formatServerElapsed(155 * 60 * 1000), '2:35');
  assert.equal(timer.parseServerElapsed('2:35'), 155 * 60 * 1000);
  assert.equal(timer.parseServerElapsed('25:07'), (25 * 60 + 7) * 60 * 1000);
  assert.equal(timer.parseServerElapsed('2:60'), null);
  assert.equal(config.id, 'storm');
});

test('calculates from timestamps rather than accumulated countdown state', () => {
  const config = timer.getConfig('storm');
  const anchor = capturedAt + config.firstStartServerElapsedMs;
  const lateTick = anchor + 3 * config.intervalMs + config.durationMs + 17_321;
  const state = timer.eventState(settings, lateTick);
  assert.equal(state.nextStartMs, anchor + 4 * config.intervalMs);
  assert.equal(state.remainingMs, config.intervalMs - config.durationMs - 17_321);
});

test('returns all upcoming starts in a horizon and groups device display dates', () => {
  const config = timer.getConfig('storm');
  const anchor = capturedAt + config.firstStartServerElapsedMs;
  const starts = timer.upcomingStarts(settings, anchor + 1, 5 * config.intervalMs);
  assert.deepEqual(starts, [1, 2, 3, 4, 5].map(n => anchor + n * config.intervalMs));
  const grouped = timer.groupSchedule(starts, 'en-US');
  assert.ok(grouped.length >= 1);
  assert.equal(grouped.flatMap(group => group.events).length, starts.length);
});

test('rejects corrupt, old-version, and invalid server-time settings', () => {
  assert.equal(timer.validateSaved({ version: 1, configId: 'storm', anchorMs: capturedAt }), null);
  assert.equal(timer.validateSaved({ version: 2, configId: 'unknown', capturedAtMs: capturedAt, serverElapsedMs: 0 }), null);
  assert.equal(timer.validateSaved({ version: 2, configId: 'storm', capturedAtMs: 'now', serverElapsedMs: 0 }), null);
  assert.equal(timer.validateSaved({ version: 2, configId: 'storm', capturedAtMs: capturedAt, serverElapsedMs: -1 }), null);
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
