(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.hazeEventTimer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'haze-atlas.event-timer';
  const STORAGE_VERSION = 1;
  const MIN_ANCHOR_MS = Date.UTC(2020, 0, 1);
  const MAX_ANCHOR_MS = Date.UTC(2100, 0, 1);

  // Source: bundled Official Haze Seas Trello snapshot, Storm card (tA9P4FBA/452-storm).
  // The card states: "Every 2H 35M ... for exactly 10 minutes."
  const EVENT_CONFIGS = Object.freeze({
    storm: Object.freeze({
      id: 'storm',
      name: 'Storm',
      intervalMs: 155 * 60 * 1000,
      durationMs: 10 * 60 * 1000,
      sourceLabel: 'Official Haze Seas Trello — Storm',
      sourceUrl: 'https://trello.com/c/tA9P4FBA/452-storm'
    })
  });

  const notificationAdapter = Object.freeze({
    status: 'unimplemented',
    isAvailable: function () { return false; },
    requestPermission: function () {
      return Promise.reject(new Error('Notifications are not implemented yet.'));
    },
    schedule: function () {
      return Promise.reject(new Error('Notifications are not implemented yet.'));
    }
  });

  function getConfig(id) { return EVENT_CONFIGS[id] || null; }
  function isFiniteMs(value) { return Number.isInteger(value) && value >= MIN_ANCHOR_MS && value <= MAX_ANCHOR_MS; }

  function validateSaved(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.version !== STORAGE_VERSION || typeof value.configId !== 'string' || !getConfig(value.configId)) return null;
    if (!isFiniteMs(value.anchorMs)) return null;
    return { version: STORAGE_VERSION, configId: value.configId, anchorMs: value.anchorMs };
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

  function clearSettings(storage) {
    if (storage && typeof storage.removeItem === 'function') storage.removeItem(STORAGE_KEY);
  }

  function eventState(settings, nowMs) {
    const valid = validateSaved(settings);
    const now = Number(nowMs);
    if (!valid || !Number.isFinite(now)) return null;
    const config = getConfig(valid.configId);
    const cycles = Math.floor((now - valid.anchorMs) / config.intervalMs);
    const currentStartMs = valid.anchorMs + cycles * config.intervalMs;
    const active = now >= currentStartMs && now < currentStartMs + config.durationMs;
    const nextStartMs = active ? currentStartMs + config.intervalMs : currentStartMs > now ? currentStartMs : currentStartMs + config.intervalMs;
    return Object.freeze({ config: config, active: active, currentStartMs: currentStartMs, currentEndMs: currentStartMs + config.durationMs, nextStartMs: nextStartMs, remainingMs: active ? currentStartMs + config.durationMs - now : nextStartMs - now });
  }

  function upcomingStarts(settings, nowMs, horizonMs) {
    const state = eventState(settings, nowMs);
    const horizon = Number(horizonMs);
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
    const total = Math.max(0, Math.ceil(Number(ms) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return [hours, minutes, seconds].map(function (value) { return String(value).padStart(2, '0'); }).join(':');
  }

  function localDateTimeValue(timestamp) {
    const date = new Date(timestamp);
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function parseLocalDateTime(value) {
    if (typeof value !== 'string' || !value) return null;
    const date = new Date(value);
    const timestamp = date.getTime();
    return isFiniteMs(timestamp) ? timestamp : null;
  }

  return Object.freeze({ STORAGE_KEY: STORAGE_KEY, STORAGE_VERSION: STORAGE_VERSION, EVENT_CONFIGS: EVENT_CONFIGS, notificationAdapter: notificationAdapter, getConfig: getConfig, validateSaved: validateSaved, readSettings: readSettings, saveSettings: saveSettings, clearSettings: clearSettings, eventState: eventState, upcomingStarts: upcomingStarts, groupSchedule: groupSchedule, formatDuration: formatDuration, localDateTimeValue: localDateTimeValue, parseLocalDateTime: parseLocalDateTime });
});
