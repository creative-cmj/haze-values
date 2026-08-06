(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HazeImprovementCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const demandWeights = {
    VERY_HIGH: 1.16, HIGH: 1.10, GOOD: 1.06, DECENT: 1.02,
    MEDIUM: 1, NORMAL: 1, LOW: 0.94, VERY_LOW: 0.88,
    UNSTABLE: 0.90, UNKNOWN: 0.985, '???': 0.985,
  };
  const rarityWeights = {
    MYTHICAL: 1.035, LEGENDARY: 1.02, RARE: 1.01,
    UNCOMMON: 1, COMMON: 1, 'REGION BASED': 1.015,
  };

  function normalizeSearchText(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function editDistance(a, b) {
    const left = normalizeSearchText(a).replace(/\s/g, '');
    const right = normalizeSearchText(b).replace(/\s/g, '');
    if (!left) return right.length;
    if (!right) return left.length;
    const matrix = Array.from({ length: left.length + 1 }, (_, i) => {
      const row = new Array(right.length + 1).fill(0);
      row[0] = i;
      return row;
    });
    for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;
    for (let i = 1; i <= left.length; i += 1) {
      for (let j = 1; j <= right.length; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
        if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
          matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + cost);
        }
      }
    }
    return matrix[left.length][right.length];
  }

  function fuzzyScore(query, label, aliases = []) {
    const q = normalizeSearchText(query);
    if (!q) return 0;
    const candidates = [label, ...aliases].map(normalizeSearchText).filter(Boolean);
    let best = 0;
    for (const candidate of candidates) {
      if (candidate === q) best = Math.max(best, 1);
      else if (candidate.startsWith(q)) best = Math.max(best, 0.94 - Math.min(0.2, (candidate.length - q.length) / 100));
      else if (candidate.includes(q)) best = Math.max(best, 0.82 - Math.min(0.25, candidate.indexOf(q) / 50));
      else {
        const compactCandidate = candidate.replace(/\s/g, '');
        const compactQuery = q.replace(/\s/g, '');
        const similarity = 1 - editDistance(compactQuery, compactCandidate) / Math.max(compactQuery.length, compactCandidate.length, 1);
        const queryChars = new Set(compactQuery);
        const overlap = [...queryChars].filter(char => compactCandidate.includes(char)).length / Math.max(1, queryChars.size);
        if (overlap >= 0.5) best = Math.max(best, similarity * 0.86);
      }
    }
    return best >= 0.34 ? Number(best.toFixed(4)) : 0;
  }

  function groupedSearch(query, sources, limitPerGroup = 6) {
    const groups = { Items: [], Guides: [], Tools: [] };
    const definitions = [
      ['Items', sources.items || []],
      ['Guides', sources.content || []],
      ['Tools', sources.pages || []],
    ];
    for (const [group, records] of definitions) {
      groups[group] = records.map(record => ({
        ...record,
        stableId: record.id,
        score: Math.max(
          fuzzyScore(query, record.name, record.aliases || []),
          fuzzyScore(query, record.category || '', []),
        ),
      })).filter(record => record.score > 0)
        .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
        .slice(0, limitPerGroup);
    }
    return groups;
  }

  function demandWeight(item) {
    const key = String(item && item.demand || 'NORMAL').toUpperCase().replace(/\s+/g, '_');
    return demandWeights[key] || 1;
  }

  function rarityWeight(item) {
    return rarityWeights[String(item && item.rarity || 'COMMON').toUpperCase()] || 1;
  }

  function sideTotals(side, dragonValue) {
    return (side || []).reduce((totals, item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const value = Math.max(0, Number(item.value) || 0);
      totals.raw += value * quantity;
      totals.weighted += value * demandWeight(item) * rarityWeight(item) * quantity;
      totals.count += quantity;
      totals.demand += demandWeight(item) * quantity;
      return totals;
    }, { raw: 0, weighted: 0, count: 0, demand: 0, dragons: 0 });
  }

  function calculateTrade(trade, dragonValue) {
    const safeDragon = Math.max(1, Number(dragonValue) || 1);
    const yours = sideTotals(trade && trade.yours, safeDragon);
    const theirs = sideTotals(trade && trade.theirs, safeDragon);
    yours.dragons = yours.raw / safeDragon;
    theirs.dragons = theirs.raw / safeDragon;
    const weightedDifference = theirs.weighted - yours.weighted;
    const percentage = yours.weighted ? weightedDifference / yours.weighted * 100 : (theirs.weighted ? 100 : 0);
    const result = percentage >= 12 ? 'Win' : percentage <= -12 ? 'Loss' : 'Fair';
    const warnings = [];
    for (const [label, side] of [['Your offer', trade && trade.yours], ['Their offer', trade && trade.theirs]]) {
      for (const item of side || []) {
        const demand = String(item.demand || '').toLowerCase();
        if (demand.includes('unstable')) warnings.push(`${label} includes unstable ${item.name || 'an item'}.`);
        else if (demand === 'low' || demand === 'very low') warnings.push(`${label} includes low demand ${item.name || 'an item'}.`);
        const trend = String(item.trend || item.status || '').toLowerCase();
        if (trend.includes('fall')) warnings.push(`${item.name || 'An item'} is currently falling.`);
      }
    }
    return {
      yours, theirs,
      rawDifference: theirs.raw - yours.raw,
      weightedDifference,
      percentage,
      result,
      warnings: [...new Set(warnings)],
    };
  }

  function suggestBalanceItem(items, gap, excludedIds = new Set()) {
    const target = Math.abs(Number(gap) || 0);
    if (!target) return null;
    const candidates = (items || []).filter(item => {
      const value = Number(item.value);
      return value > 0 && value <= target && !excludedIds.has(item.id);
    });
    candidates.sort((a, b) => Math.abs(target - Number(a.value)) - Math.abs(target - Number(b.value)) || Number(b.value) - Number(a.value));
    return candidates[0] || null;
  }

  function migratePreferences(input) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      version: 2,
      theme: source.theme || 'dark',
      density: source.density || 'comfortable',
      sidebar: Boolean(source.sidebar),
      readingMode: Boolean(source.readingMode),
      lowPerformance: Boolean(source.lowPerformance),
      reduceMotion: ['system', 'on', 'off'].includes(source.reduceMotion) ? source.reduceMotion : 'system',
    };
  }

  function encodeShareState(state) {
    const text = JSON.stringify(state);
    if (typeof Buffer !== 'undefined') return Buffer.from(text, 'utf8').toString('base64url');
    return btoa(unescape(encodeURIComponent(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function decodeShareState(payload) {
    try {
      let text;
      if (typeof Buffer !== 'undefined') text = Buffer.from(String(payload), 'base64url').toString('utf8');
      else {
        const padded = String(payload).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(payload).length / 4) * 4, '=');
        text = decodeURIComponent(escape(atob(padded)));
      }
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  return {
    normalizeSearchText,
    fuzzyScore,
    groupedSearch,
    calculateTrade,
    suggestBalanceItem,
    migratePreferences,
    encodeShareState,
    decodeShareState,
  };
});
