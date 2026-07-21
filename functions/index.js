const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const CHECKER_CONFIG = require('./checker-config.json');

const ATLAS_URL = 'https://haze-atlas.web.app';
const TRELLO_BOARD_URL = 'https://trello.com/b/nn8bpTB0.json';
const SHEET_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR13VPAyegTk7IIY7bjc22p0MjeCclNdbK4TsEiAPcoSfObTfZcWZAXxOq3eeIrGd2zHDeTddApGark/pub';
const SHEETS = {
  Overview: '1077085569', Tutorial: '1764732080', Fruits: '1700828745',
  Accessories: '383264331', Swords: '1926500499', 'Misc Items': '1829965652',
  Gamepasses: '1675626398', 'Perm Fruits (Robux)': '1519254710'
};

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'HazeAtlasSourceChecker/1.0' } });
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
function normalizeRow(row, category) {
  const cells = [...row, '', '', '', '', '', '', '', ''].slice(0, 8).map(value => String(value || '').trim());
  const [name, rarity, valueText, demand, dragons, pvp, pve, sourceLabel] = cells;
  if (!name || rarity === '-----' || /^(top|[a-fs]) tier$/i.test(name) || name.toLowerCase().startsWith('sources')) return null;
  return { id: `${slug(category)}-${slug(name)}`, name, category, rarity, valueText, demand, dragons, pvp, pve, sourceLabel };
}
function sample(items, limit = 50) { return items.slice(0, limit); }

async function runSourceCheck() {
  const sheetEntries = Object.entries(SHEETS);
  const [atlasContent, atlasData, trelloBoard, ...sheetCsv] = await Promise.all([
    fetchJson(`${ATLAS_URL}/content.json`), fetchJson(`${ATLAS_URL}/data.json`), fetchJson(TRELLO_BOARD_URL),
    ...sheetEntries.map(([, gid]) => fetchText(`${SHEET_BASE}?gid=${gid}&single=true&output=csv`))
  ]);

  const atlasCardIds = new Set((atlasContent.entries || []).map(entry => String(entry.id || '').replace(/^trello-/, '')));
  const ignoredTrelloCards = new Set(CHECKER_CONFIG.ignoredTrelloCardIds || []);
  const openCards = (trelloBoard.cards || []).filter(card => !card.closed && !ignoredTrelloCards.has(card.id));
  const missingTrelloCards = openCards.filter(card => !atlasCardIds.has(card.id)).map(card => ({ id: card.id, name: card.name, url: `https://trello.com/c/${card.shortLink}` }));

  const remoteItems = [];
  sheetCsv.forEach((csv, index) => {
    const category = sheetEntries[index][0];
    if (category === 'Overview' || category === 'Tutorial') return;
    parseCsv(csv).slice(2).forEach(row => { const item = normalizeRow(row, category); if (item) remoteItems.push(item); });
  });
  const localItems = new Map();
  for (const item of atlasData.items || []) {
    const previous = localItems.get(item.id);
    if (!previous || (previous.valueText === '???' && item.valueText !== '???')) localItems.set(item.id, item);
  }
  const remoteById = new Map(remoteItems.map(item => [item.id, item]));
  const missingValueItems = remoteItems.filter(item => !localItems.has(item.id));
  const removedValueItems = [...localItems.values()].filter(item => !remoteById.has(item.id));
  const changedValueItems = remoteItems.flatMap(remote => {
    const local = localItems.get(remote.id);
    if (!local) return [];
    const changed = ['rarity', 'valueText', 'demand', 'dragons', 'pvp', 'pve'].filter(field => String(local[field] || '').trim() !== String(remote[field] || '').trim());
    return changed.length ? [{ id: remote.id, name: remote.name, changed, live: Object.fromEntries(changed.map(field => [field, local[field] || ''])), source: Object.fromEntries(changed.map(field => [field, remote[field] || ''])) }] : [];
  });

  return {
    checkedAt: new Date().toISOString(),
    sources: { trello: TRELLO_BOARD_URL, valueList: SHEET_BASE, atlas: ATLAS_URL },
    trello: { openCards: openCards.length, ignoredCards: ignoredTrelloCards.size, atlasRecords: atlasCardIds.size, missingCount: missingTrelloCards.length, missing: sample(missingTrelloCards) },
    valueList: { sourceRows: remoteItems.length, atlasRecords: localItems.size, missingCount: missingValueItems.length, removedCount: removedValueItems.length, changedCount: changedValueItems.length, missing: sample(missingValueItems), removed: sample(removedValueItems.map(item => ({ id: item.id, name: item.name }))), changed: sample(changedValueItems) }
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
