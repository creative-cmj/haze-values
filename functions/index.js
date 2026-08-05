const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const CHECKER_CONFIG = require('./checker-config.json');

const ATLAS_URL = process.env.HAZE_ATLAS_URL || 'https://creative-cmj.github.io/haze-values';
const TRELLO_BOARD_URL = 'https://trello.com/b/nn8bpTB0.json';
const SHEET_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR13VPAyegTk7IIY7bjc22p0MjeCclNdbK4TsEiAPcoSfObTfZcWZAXxOq3eeIrGd2zHDeTddApGark/pub';
const VAULTED_URL = 'https://haze-seas.vaultedvaluesx.com/value-list';
const VAULTED_API = 'https://valuevaultx.com/_functions/api/haze-seas';
const SHEETS = {
  Overview: '1077085569', Tutorial: '1764732080', Fruits: '1700828745',
  Accessories: '383264331', Swords: '1926500499', 'Misc Items': '1829965652',
  Gamepasses: '1675626398', 'Perm Fruits (Robux)': '1519254710',
  'Tier List (PvE) [Fruit]': '1408297219', 'Tier List (PvP) [Fruit]': '752112998',
  'Tier List (PvE) [Sword]': '342268962', 'Tier List (PvP) [Sword]': '1251714687'
};
const ITEM_SHEETS = new Set(['Fruits', 'Accessories', 'Swords', 'Misc Items', 'Gamepasses', 'Perm Fruits (Robux)']);

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'HazeAtlasSourceChecker/2.0' } });
  if (!response.ok) throw new Error(`${response.status} while fetching ${url}`);
  return response.text();
}
async function fetchJson(url) { return JSON.parse(await fetchText(url)); }

function parseCsv(text) {
  const rows = [[]]; let cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { rows.at(-1).push(cell); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++;
      rows.at(-1).push(cell); cell = ''; rows.push([]); continue;
    }
    cell += char;
  }
  if (cell || rows.at(-1).length) rows.at(-1).push(cell);
  return rows.filter(row => row.some(value => String(value).trim()));
}
function slug(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
function header(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function numericValue(value) {
  const clean = String(value || '').replace(/[^0-9.-]+/g, '');
  if (!clean || ['-', '.', '-.'].includes(clean)) return null;
  const number = Number(clean);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}
function sample(items, limit = 50) { return items.slice(0, limit); }
function meaningful(value) { return !['', '???', '-----'].includes(String(value ?? '').trim()); }

function parseSheetRows(category, csv) {
  const rows = parseCsv(csv);
  const firstColumnNames = new Set(['fruit', 'accessories', 'sword', 'items', 'gamepasses']);
  const headerIndex = rows.findIndex(row => row.some(cell => ['value', 'demand'].includes(header(cell))) && row.some(cell => firstColumnNames.has(header(cell))));
  if (headerIndex < 0) throw new Error(`Could not locate headers for ${category}`);
  const positions = new Map(rows[headerIndex].map((cell, index) => [header(cell), index]).filter(([name]) => name));
  const get = (row, ...names) => {
    for (const name of names) {
      const index = positions.get(name);
      if (index !== undefined && index < row.length) return String(row[index] || '').trim();
    }
    return '';
  };
  return rows.slice(headerIndex + 1).flatMap(row => {
    const name = get(row, 'fruit', 'accessories', 'sword', 'items', 'gamepasses');
    const rarity = get(row, 'rarity');
    if (!name || name === '???' || rarity === '-----' || /^(top|[a-fs]) tier$/i.test(name)) return [];
    const valueText = get(row, 'value') || '???';
    return [{
      id: `${slug(category)}-${slug(name)}`, name, category, rarity,
      valueText, value: numericValue(valueText), demand: get(row, 'demand') || '???',
      dragons: get(row, 'valueindragons'), pvp: get(row, 'pvp'), pve: get(row, 'pve'),
      sourceLabel: get(row, 'links'), robux: get(row, 'robuxcost', 'robux')
    }];
  });
}

function canonicalize(items) {
  const result = new Map();
  for (const item of items) {
    const score = [item.value !== null, ['demand', 'dragons', 'pvp', 'pve', 'sourceLabel'].filter(field => meaningful(item[field])).length];
    const previous = result.get(item.id);
    const previousScore = previous ? [previous.value !== null, ['demand', 'dragons', 'pvp', 'pve', 'sourceLabel'].filter(field => meaningful(previous[field])).length] : null;
    if (!previous || score[0] > previousScore[0] || (score[0] === previousScore[0] && score[1] > previousScore[1])) result.set(item.id, item);
  }
  return result;
}

async function runSourceCheck() {
  const checkedAt = new Date().toISOString();
  const sheetEntries = Object.entries(SHEETS);
  const [atlasContent, atlasData, trelloBoard, vaultedRows, ...sheetCsv] = await Promise.all([
    fetchJson(`${ATLAS_URL}/content.json?checked=${Date.now()}`),
    fetchJson(`${ATLAS_URL}/data.json?checked=${Date.now()}`),
    fetchJson(TRELLO_BOARD_URL), fetchJson(VAULTED_API),
    ...sheetEntries.map(([, gid]) => fetchText(`${SHEET_BASE}?gid=${gid}&single=true&output=csv`))
  ]);

  const atlasCardIds = new Set((atlasContent.entries || []).map(entry => String(entry.id || '').replace(/^trello-/, '')));
  const ignoredTrelloCards = new Set(CHECKER_CONFIG.ignoredTrelloCardIds || []);
  const activeListIds = new Set((trelloBoard.lists || []).filter(list => !list.closed).map(list => list.id));
  const openCards = (trelloBoard.cards || []).filter(card => !card.closed && activeListIds.has(card.idList) && !ignoredTrelloCards.has(card.id));
  const missingTrelloCards = openCards.filter(card => !atlasCardIds.has(card.id)).map(card => ({ id: card.id, name: card.name, url: `https://trello.com/c/${card.shortLink}` }));

  const rawSheetItems = [];
  sheetCsv.forEach((csv, index) => {
    const category = sheetEntries[index][0];
    if (ITEM_SHEETS.has(category)) rawSheetItems.push(...parseSheetRows(category, csv));
  });
  const sheetItems = canonicalize(rawSheetItems);
  const vaultedItems = new Map(vaultedRows.map(item => [`${slug(item.category)}-${slug(item.title)}`, item]));
  const sourceIdMismatch = {
    missingInGoogleSheet: [...vaultedItems.keys()].filter(id => !sheetItems.has(id)),
    missingInVaultedValuesX: [...sheetItems.keys()].filter(id => !vaultedItems.has(id))
  };

  const expectedItems = new Map();
  const sourceConflicts = [];
  for (const [id, sheetItem] of sheetItems) {
    const vaulted = vaultedItems.get(id);
    if (!vaulted) continue;
    const expected = { ...sheetItem };
    if (Number.isFinite(vaulted.value) && vaulted.value >= 0) {
      const value = Math.trunc(vaulted.value);
      if (sheetItem.value !== value) sourceConflicts.push({ id, name: sheetItem.name, field: 'value', googleSheet: sheetItem.value, vaultedValuesX: value });
      expected.value = value; expected.valueText = value.toLocaleString('en-US');
    } else { expected.value = null; expected.valueText = '???'; }
    if (String(vaulted.demand || '').trim()) expected.demand = String(vaulted.demand).toUpperCase();
    if (String(vaulted.rarity || '').trim()) expected.rarity = String(vaulted.rarity).toUpperCase();
    expectedItems.set(id, expected);
  }

  const localItems = canonicalize(atlasData.items || []);
  const missingValueItems = [...expectedItems.values()].filter(item => !localItems.has(item.id));
  const removedValueItems = [...localItems.values()].filter(item => !expectedItems.has(item.id));
  const compareFields = ['rarity', 'valueText', 'value', 'demand', 'dragons', 'pvp', 'pve', 'robux', 'sourceLabel'];
  const changedValueItems = [...expectedItems.values()].flatMap(expected => {
    const local = localItems.get(expected.id);
    if (!local) return [];
    const changed = compareFields.filter(field => String(local[field] ?? '').trim() !== String(expected[field] ?? '').trim());
    return changed.length ? [{ id: expected.id, name: expected.name, changed, atlas: Object.fromEntries(changed.map(field => [field, local[field] ?? ''])), expected: Object.fromEntries(changed.map(field => [field, expected[field] ?? ''])) }] : [];
  });

  return {
    checkedAt,
    sources: { trello: TRELLO_BOARD_URL, googleSheet: SHEET_BASE, vaultedValuesX: VAULTED_URL, atlas: ATLAS_URL },
    trello: { openCards: openCards.length, ignoredCards: ignoredTrelloCards.size, atlasRecords: atlasCardIds.size, missingCount: missingTrelloCards.length, missing: sample(missingTrelloCards) },
    valueList: {
      googleSheetTabs: sheetEntries.length, googleSheetRawRows: rawSheetItems.length, googleSheetItems: sheetItems.size, vaultedItems: vaultedItems.size,
      atlasRecords: localItems.size, sourceIdMismatch,
      sourceConflictCount: sourceConflicts.length, sourceConflicts,
      missingCount: missingValueItems.length, removedCount: removedValueItems.length, changedCount: changedValueItems.length,
      missing: sample(missingValueItems), removed: sample(removedValueItems.map(item => ({ id: item.id, name: item.name }))), changed: sample(changedValueItems)
    }
  };
}

exports.checkSources = onRequest({ region: 'us-central1', cors: true, timeoutSeconds: 120, memory: '256MiB' }, async (request, response) => {
  if (request.method !== 'GET') { response.status(405).json({ error: 'Use GET.' }); return; }
  try { response.status(200).json(await runSourceCheck()); }
  catch (error) { logger.error('Source check failed', error); response.status(502).json({ error: 'Source check failed', detail: error.message }); }
});

exports.scheduledSourceCheck = onSchedule({ region: 'us-central1', schedule: 'every 6 hours', timeZone: 'UTC', timeoutSeconds: 120, memory: '256MiB' }, async () => {
  const report = await runSourceCheck();
  logger.info('Haze Atlas source-check report', report);
});

exports.runSourceCheck = runSourceCheck;
exports.parseCsv = parseCsv;
exports.parseSheetRows = parseSheetRows;
