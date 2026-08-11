(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.hazeEventTimer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'haze-atlas.event-timer';
  const STORAGE_VERSION = 2;
  const MIN_CAPTURED_AT_MS = Date.UTC(2020, 0, 1);
  const MAX_CAPTURED_AT_MS = Date.UTC(2100, 0, 1);
  const MAX_SERVER_ELAPSED_MS = 365 * 24 * 60 * 60 * 1000;

  // Official Trello: "Every 2H 35M a storm occurs ... for exactly 10 minutes."
  // The missed 65:50 prediction confirms this is a 2h35m start-to-start cadence.
  // First player-observed phase is server elapsed 2:35.
  const EVENT_CONFIGS = Object.freeze({
    storm: Object.freeze({
      id: 'storm',
      name: 'Storm',
      firstStartServerElapsedMs: 155 * 60 * 1000,
      durationMs: 10 * 60 * 1000,
      cooldownAfterEndMs: 145 * 60 * 1000,
      intervalMs: 155 * 60 * 1000,
      sourceLabel: 'Official Haze Seas Trello Storm timing',
      sourceUrl: 'https://trello.com/c/tA9P4FBA/452-storm'
    })
  });

  const notificationAdapter = Object.freeze({
    status: 'unimplemented',
    isAvailable: function () { return false; },
    requestPermission: function () { return Promise.reject(new Error('Notifications are not implemented yet.')); },
    schedule: function () { return Promise.reject(new Error('Notifications are not implemented yet.')); }
  });

  function getConfig(id) { return EVENT_CONFIGS[id] || null; }
  function isCapturedAt(value) { return Number.isInteger(value) && value >= MIN_CAPTURED_AT_MS && value <= MAX_CAPTURED_AT_MS; }
  function isServerElapsed(value) { return Number.isInteger(value) && value >= 0 && value <= MAX_SERVER_ELAPSED_MS; }

  function validateSaved(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.version !== STORAGE_VERSION || typeof value.configId !== 'string' || !getConfig(value.configId)) return null;
    if (!isCapturedAt(value.capturedAtMs) || !isServerElapsed(value.serverElapsedMs)) return null;
    return Object.freeze({ version: STORAGE_VERSION, configId: value.configId, capturedAtMs: value.capturedAtMs, serverElapsedMs: value.serverElapsedMs });
  }

  function readSettings(storage) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try { return validateSaved(JSON.parse(storage.getItem(STORAGE_KEY))); } catch (_) { return null; }
  }

  function saveSettings(storage, settings) {
    const valid = validateSaved(settings);
    if (!valid) throw new TypeError('Invalid event timer settings.');
    if (!storage || typeof storage.setItem !== 'function') throw new TypeError('Storage is unavailable.');
    storage.setItem(STORAGE_KEY, JSON.stringify(valid));
    return valid;
  }

  function clearSettings(storage) { if (storage && typeof storage.removeItem === 'function') storage.removeItem(STORAGE_KEY); }

  function settingsFromServerElapsed(configId, capturedAtMs, serverElapsedMs) {
    return validateSaved({ version: STORAGE_VERSION, configId: configId, capturedAtMs: capturedAtMs, serverElapsedMs: serverElapsedMs });
  }

  function serverElapsedAt(settings, nowMs) {
    const valid = validateSaved(settings), now = Number(nowMs);
    if (!valid || !Number.isFinite(now)) return null;
    return Math.max(0, valid.serverElapsedMs + now - valid.capturedAtMs);
  }

  function firstStormStartMs(settings) {
    const valid = validateSaved(settings), config = valid && getConfig(valid.configId);
    return !valid || !config ? null : valid.capturedAtMs + config.firstStartServerElapsedMs - valid.serverElapsedMs;
  }

  function eventState(settings, nowMs) {
    const valid = validateSaved(settings), now = Number(nowMs), config = valid && getConfig(valid.configId), anchorMs = firstStormStartMs(valid);
    if (!valid || !config || !Number.isFinite(now) || !Number.isFinite(anchorMs)) return null;
    const cycles = Math.floor((now - anchorMs) / config.intervalMs);
    const currentStartMs = anchorMs + cycles * config.intervalMs;
    const active = now >= currentStartMs && now < currentStartMs + config.durationMs;
    const nextStartMs = active ? currentStartMs + config.intervalMs : currentStartMs > now ? currentStartMs : currentStartMs + config.intervalMs;
    return Object.freeze({ config: config, active: active, currentStartMs: currentStartMs, currentEndMs: currentStartMs + config.durationMs, nextStartMs: nextStartMs, remainingMs: active ? currentStartMs + config.durationMs - now : nextStartMs - now });
  }

  function upcomingStarts(settings, nowMs, horizonMs) {
    const state = eventState(settings, nowMs), horizon = Number(horizonMs);
    if (!state || !Number.isFinite(horizon) || horizon < 0) return [];
    const result = [];
    for (let start = state.nextStartMs; start <= Number(nowMs) + horizon; start += state.config.intervalMs) result.push(start);
    return result;
  }

  function groupSchedule(starts, locale) {
    const groups = new Map();
    starts.forEach(function (timestamp) {
      const date = new Date(timestamp);
      const key = new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }).format(date);
      const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ timestamp: timestamp, time: time });
    });
    return Array.from(groups, function (entry) { return { date: entry[0], events: entry[1] }; });
  }

  function formatDuration(ms) {
    const total = Math.max(0, Math.ceil(Number(ms) / 1000)), hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
    return [hours, minutes, seconds].map(function (value) { return String(value).padStart(2, '0'); }).join(':');
  }

  function parseServerElapsed(value) {
    const match = typeof value === 'string' && value.trim().match(/^(\d{1,4}):([0-5]\d)$/);
    return match ? (Number(match[1]) * 60 + Number(match[2])) * 60 * 1000 : null;
  }

  function formatServerElapsed(ms) {
    if (!isServerElapsed(Math.floor(Number(ms)))) return '';
    const totalMinutes = Math.floor(Number(ms) / 60000);
    return Math.floor(totalMinutes / 60) + ':' + String(totalMinutes % 60).padStart(2, '0');
  }

  return Object.freeze({ STORAGE_KEY, STORAGE_VERSION, EVENT_CONFIGS, notificationAdapter, getConfig, validateSaved, readSettings, saveSettings, clearSettings, settingsFromServerElapsed, serverElapsedAt, firstStormStartMs, eventState, upcomingStarts, groupSchedule, formatDuration, parseServerElapsed, formatServerElapsed });
});
