/* Application Improvement Pass — requirements 1–50. Loaded after the legacy and redesign layers. */
(() => {
  'use strict';
  const Core = window.HazeImprovementCore;
  if (!Core) throw new Error('Haze Improvement Core did not load');

  const STORE = {
    preferences: 'haze-preferences-v2', pinned: 'haze-pinned-routes-v1',
    recentRoutes: 'haze-recent-routes-v1', searches: 'haze-search-history-v1',
    filters: 'haze-advanced-filters-v1', presets: 'haze-filter-presets-v1',
    drafts: 'haze-trade-drafts-v2',
  };
  const itemAliases = {
    'swords-dark-blade': ['DB', 'Darkblade'],
    'fruits-dragon': ['Dragon Fruit'],
    'gamepasses-gpm': ['GPM', 'Golden Pumpkin Mask'],
    'swords-krampus-scythe': ['Krampus'],
    'misc-items-broom': ['Flying Broom'],
    'fruits-gum': ['Rubber', 'Gomu'],
  };
  const routeCatalog = [
    ['home', 'Home', 'Main'], ['items', 'Value List', 'Values'], ['fruits', 'Fruits', 'Values'],
    ['accessories', 'Accessories', 'Values'], ['swords', 'Weapons', 'Values'], ['misc items', 'Materials & Other', 'Values'],
    ['gamepasses', 'Gamepasses', 'Values'], ['perm fruits (robux)', 'Permanent Fruits', 'Values'],
    ['gallery', 'Power Gallery', 'Guides'], ['content:Races', 'Races', 'Guides'],
    ['content:Fighting Styles', 'Fighting Styles', 'Guides'], ['content:Bosses', 'Bosses', 'Guides'],
    ['content:Sea Events', 'Sea Events', 'Guides'], ['content:Sea 1 Locations', 'Sea 1', 'Guides'],
    ['content:Sea 2 Locations', 'Sea 2', 'Guides'], ['content:Sea 3 Locations', 'Sea 3', 'Guides'],
    ['content:Fishing', 'Fishing', 'Guides'], ['content:Ships', 'Ships', 'Guides'],
    ['trade', 'Trade Calculator', 'Tools'], ['compare', 'Compare Items', 'Tools'], ['builds', 'Build Planner', 'Tools'],
    ['mastery', 'Mastery XP', 'Tools'], ['timers', 'Boss Timers', 'Tools'], ['releases', 'Release Tracker', 'Tools'],
    ['collection', 'Collection', 'Personal'], ['favorites', 'Favorite Items', 'Personal'],
    ['history', 'Trade History', 'Personal'],
  ].map(([id, name, category]) => ({ id, name, category, aliases: [] }));
  const categoryRoutes = new Set(['items', 'fruits', 'accessories', 'swords', 'misc items', 'gamepasses', 'perm fruits (robux)']);
  const state = {
    preferences: Core.migratePreferences(readStore(STORE.preferences, window.settings || {})),
    pinned: readStore(STORE.pinned, []),
    recentRoutes: readStore(STORE.recentRoutes, []),
    searches: readStore(STORE.searches, []),
    advancedFilters: readStore(STORE.filters, {}),
    presets: readStore(STORE.presets, []),
    gridPage: 1,
    tradeUndo: [], tradeRedo: [],
    dialogTrigger: null,
  };

  function readStore(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; } }
  function writeStore(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function safe(value) { return typeof window.esc === 'function' ? esc(value) : String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function routeLabel(route) { return routeCatalog.find(entry => entry.id === route)?.name || String(route || 'Home').replace(/^content:/, ''); }
  function moneyValue(value) { return new Intl.NumberFormat('en-US').format(Math.round(Number(value) || 0)); }
  function routeCategory(route) { return routeCatalog.find(entry => entry.id === route)?.category || (String(route).startsWith('content:') ? 'Guides' : 'Haze Atlas'); }

  function installStartupSkeleton() {
    const view = document.querySelector('#view');
    if (!view || view.children.length) return;
    view.innerHTML = '<div class="startup-skeleton" role="status" aria-label="Loading Haze Atlas"><div class="skeleton-hero"></div><div class="skeleton-grid">' + '<div class="skeleton-card"></div>'.repeat(4) + '</div></div>';
  }

  function applyPreferences() {
    document.body.dataset.reading = String(state.preferences.readingMode);
    document.body.dataset.lowPerformance = String(state.preferences.lowPerformance);
    const systemReduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reduced = state.preferences.reduceMotion === 'on' || (state.preferences.reduceMotion === 'system' && systemReduce);
    document.body.dataset.motion = reduced ? 'reduce' : 'full';
    writeStore(STORE.preferences, state.preferences);
  }

  function installHistoryControls() {
    const topbar = document.querySelector('.topbar');
    if (!topbar || topbar.querySelector('.history-controls')) return;
    const controls = document.createElement('div');
    controls.className = 'history-controls';
    controls.innerHTML = '<button class="icon-btn" id="routeBack" aria-label="Go back" title="Back">←</button><button class="icon-btn" id="routeForward" aria-label="Go forward" title="Forward">→</button>';
    const host = topbar.querySelector('.topbar-left') || topbar;
    const before = host === topbar ? topbar.querySelector('.search-wrap') : null;
    if (before) host.insertBefore(controls, before); else host.append(controls);
    controls.querySelector('#routeBack').onclick = () => history.back();
    controls.querySelector('#routeForward').onclick = () => history.forward();
  }

  function isLiveRoute(route) {
    return routeCatalog.some(entry => entry.id === route) || [...document.querySelectorAll('#nav [data-page], .sidebar-foot [data-page], .mobile-bottom [data-page]')].some(node => node.dataset.page === route);
  }

  function syncRouteToUrl(route, mode = 'push') {
    const url = new URL(location.href);
    url.searchParams.set('page', route);
    if (Object.keys(state.advancedFilters).some(key => state.advancedFilters[key])) url.searchParams.set('filters', Core.encodeShareState(state.advancedFilters));
    else url.searchParams.delete('filters');
    history[mode === 'replace' ? 'replaceState' : 'pushState']({ page: route }, '', url);
  }

  function restoreRouteFromUrl() {
    const url = new URL(location.href);
    const filterState = Core.decodeShareState(url.searchParams.get('filters'));
    if (filterState) state.advancedFilters = filterState;
    const shared = Core.decodeShareState(url.searchParams.get('state'));
    if (shared?.filters) state.advancedFilters = shared.filters;
    if (shared?.trade) hydrateTrade(shared.trade);
    const requested = shared?.route || url.searchParams.get('page');
    if (requested && isLiveRoute(requested)) baseGo(requested);
    const itemId = url.searchParams.get('item');
    const contentId = url.searchParams.get('guide');
    if (itemId) originalDetail(data.items.find(item => item.id === itemId));
    else if (contentId) originalContentDetail(content.entries.find(entry => entry.id === contentId));
  }

  function recordRecentRoute(route) {
    if (!route || route === 'home') return;
    const record = { id: route, name: routeLabel(route), seenAt: new Date().toISOString() };
    state.recentRoutes = [record, ...state.recentRoutes.filter(entry => entry.id !== route)].slice(0, 6);
    writeStore(STORE.recentRoutes, state.recentRoutes);
  }

  function togglePinnedRoute(route = window.page || page) {
    state.pinned = state.pinned.includes(route) ? state.pinned.filter(id => id !== route) : [route, ...state.pinned].slice(0, 8);
    writeStore(STORE.pinned, state.pinned);
    renderNavigationShortcuts();
    installBreadcrumbs();
  }

  function renderNavigationShortcuts() {
    const nav = document.querySelector('#nav');
    const anchor = nav?.querySelector('.nav-primary');
    if (!anchor) return;
    nav.querySelectorAll('.nav-pinned,.nav-recent').forEach(node => node.remove());
    const make = (className, titleText, records) => {
      if (!records.length) return null;
      const section = document.createElement('section');
      section.className = className;
      section.innerHTML = `<div class="nav-mini-label">${safe(titleText)}</div>${records.map(record => `<button class="nav-item nav-compact-link" data-page="${safe(record.id || record)}" aria-label="${safe(routeLabel(record.id || record))}"><span>•</span><span class="nav-label">${safe(routeLabel(record.id || record))}</span></button>`).join('')}`;
      return section;
    };
    const pinned = make('nav-pinned', 'Pinned', state.pinned);
    const recent = make('nav-recent', 'Recent', state.recentRoutes.slice(0, 3));
    if (recent) anchor.after(recent);
    if (pinned) anchor.after(pinned);
  }

  function installBreadcrumbs() {
    const view = document.querySelector('#view');
    if (!view) return;
    view.querySelector('.route-tools')?.remove();
    const route = window.page || page;
    const tools = document.createElement('div');
    tools.className = 'route-tools';
    tools.innerHTML = `<nav class="breadcrumbs" aria-label="Breadcrumb"><button data-route-home>Haze Atlas</button><span aria-hidden="true">/</span><span>${safe(routeCategory(route))}</span><span aria-hidden="true">/</span><strong>${safe(routeLabel(route))}</strong></nav><button class="secondary page-pin ${state.pinned.includes(route) ? 'active' : ''}" aria-label="${state.pinned.includes(route) ? 'Unpin' : 'Pin'} ${safe(routeLabel(route))}" title="Pin this page">${state.pinned.includes(route) ? '★' : '☆'}</button><button class="secondary route-share" aria-label="Copy link to this page" title="Copy page link">↗</button>`;
    view.prepend(tools);
    tools.querySelector('[data-route-home]').onclick = () => go('home');
    tools.querySelector('.page-pin').onclick = () => togglePinnedRoute(route);
    tools.querySelector('.route-share').onclick = () => copyText(location.href, 'Page link copied');
  }

  function highlightMatch(label, query) {
    const text = String(label || '');
    if (!query) return safe(text);
    const expression = new RegExp(`(${String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
    return text.split(expression).map((part, index) => index % 2 ? `<mark>${safe(part)}</mark>` : safe(part)).join('');
  }

  function searchSources() {
    return {
      items: (data?.items || []).map(item => ({ ...item, aliases: itemAliases[item.id] || [] })),
      content: (content?.entries || []).filter(entry => !entry.aliasOf && !entry.archived).map(entry => ({ ...entry, aliases: [] })),
      pages: routeCatalog,
    };
  }

  function restoreSearchHistory() { return state.searches.slice(0, 6); }
  function rememberSearch(queryText) {
    const clean = String(queryText || '').trim();
    if (clean.length < 2) return;
    state.searches = [clean, ...state.searches.filter(value => value.toLowerCase() !== clean.toLowerCase())].slice(0, 10);
    writeStore(STORE.searches, state.searches);
  }

  function commandDialog() {
    let dialog = document.querySelector('#commandPalette');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'commandPalette';
    dialog.className = 'command-palette';
    dialog.setAttribute('aria-label', 'Search and navigate Haze Atlas');
    dialog.innerHTML = '<div class="command-shell"><div class="command-input-row"><input id="commandInput" aria-label="Search items, guides, and tools" placeholder="Search Haze Atlas…"><button class="secondary" data-command-close aria-label="Close search">×</button></div><p class="command-hint">Type a name, alias, page, or misspelling · ↑↓ navigate · Enter open · Esc close</p><div class="search-history-chips"></div><div class="command-results" role="listbox"></div></div>';
    document.body.append(dialog);
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', restoreDialogFocus);
    dialog.querySelector('[data-command-close]').onclick = () => dialog.close();
    const input = dialog.querySelector('#commandInput');
    input.oninput = () => renderCommandResults(input.value);
    input.onkeydown = event => {
      const rows = [...dialog.querySelectorAll('.command-result')];
      let index = rows.findIndex(row => row.getAttribute('aria-selected') === 'true');
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        rows[index]?.setAttribute('aria-selected', 'false');
        index = event.key === 'ArrowDown' ? Math.min(rows.length - 1, index + 1) : Math.max(0, index < 0 ? 0 : index - 1);
        rows[index]?.setAttribute('aria-selected', 'true'); rows[index]?.scrollIntoView({ block: 'nearest' });
      }
      if (event.key === 'Enter' && rows.length) { event.preventDefault(); (rows[index] || rows[0]).click(); }
    };
    return dialog;
  }

  function renderCommandResults(queryText = '') {
    const dialog = commandDialog();
    const historyEl = dialog.querySelector('.search-history-chips');
    historyEl.innerHTML = queryText ? '' : restoreSearchHistory().map(value => `<button data-history-query="${safe(value)}">${safe(value)}</button>`).join('');
    historyEl.querySelectorAll('[data-history-query]').forEach(button => button.onclick = () => { dialog.querySelector('#commandInput').value = button.dataset.historyQuery; renderCommandResults(button.dataset.historyQuery); });
    const queryValue = queryText.trim();
    const groups = queryValue ? Core.groupedSearch(queryValue, searchSources(), 7) : { Items: [], Guides: [], Tools: routeCatalog.slice(0, 7).map(entry => ({ ...entry, stableId: entry.id, score: 1 })) };
    const html = Object.entries(groups).filter(([, records]) => records.length).map(([group, records]) => `<section class="command-group"><h3>${group}</h3>${records.map(record => {
      const isItem = group === 'Items', isGuide = group === 'Guides';
      const artSource = isItem ? `./${artPath(record)}` : isGuide && record.image ? `./${safe(record.image)}` : './assets/haze-atlas-icon.webp';
      return `<button class="command-result" role="option" data-command-type="${isItem ? 'item' : isGuide ? 'guide' : 'page'}" data-command-id="${safe(record.stableId)}"><img src="${artSource}" loading="lazy" decoding="async" alt=""><span><b>${highlightMatch(record.name, queryValue)}</b><small>${safe(record.category || group)}</small></span><span>↗</span></button>`;
    }).join('')}</section>`).join('');
    dialog.querySelector('.command-results').innerHTML = html || '<div class="command-empty">No match yet. Try another spelling or browse a category.</div>';
    dialog.querySelectorAll('.command-result').forEach(button => button.onclick = () => {
      rememberSearch(queryValue);
      dialog.close();
      if (button.dataset.commandType === 'item') detail(data.items.find(item => item.id === button.dataset.commandId));
      else if (button.dataset.commandType === 'guide') contentDetail(content.entries.find(entry => entry.id === button.dataset.commandId));
      else go(button.dataset.commandId);
    });
  }

  function openCommandPalette(initial = '') {
    state.dialogTrigger = document.activeElement;
    const dialog = commandDialog();
    const input = dialog.querySelector('#commandInput');
    input.value = initial;
    renderCommandResults(initial);
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }

  function installGlobalSearch() {
    const oldInput = document.querySelector('#search');
    if (!oldInput || oldInput.dataset.improved) return;
    const input = oldInput.cloneNode(true);
    input.dataset.improved = 'true';
    input.readOnly = true;
    input.placeholder = 'Search or jump…  Ctrl K';
    input.setAttribute('aria-haspopup', 'dialog');
    oldInput.replaceWith(input);
    input.onclick = () => openCommandPalette();
    input.onfocus = () => openCommandPalette();
    const clear = document.querySelector('#clearSearch');
    if (clear) { const replacement = clear.cloneNode(true); clear.replaceWith(replacement); replacement.onclick = () => openCommandPalette(); }
    const mobile = document.querySelector('.mobile-search-button');
    if (mobile) mobile.onclick = () => openCommandPalette();
  }

  function filterOptions(field) {
    return [...new Set((data?.items || []).map(item => item[field]).filter(Boolean))].sort();
  }
  function renderSelect(label, key, options) {
    const value = state.advancedFilters[key] || '';
    return `<label><span>${safe(label)}</span><select data-advanced-filter="${safe(key)}"><option value="">Any</option>${options.map(option => `<option value="${safe(option)}" ${String(value) === String(option) ? 'selected' : ''}>${safe(option)}</option>`).join('')}</select></label>`;
  }

  function renderAdvancedFilters() {
    if (!categoryRoutes.has(page)) return;
    const grid = document.querySelector('#view .item-grid');
    if (!grid || grid.dataset.advanced) return;
    grid.dataset.advanced = 'true';
    document.querySelector('#view .filter-panel')?.setAttribute('hidden', '');
    const shell = document.createElement('section');
    shell.className = 'panel advanced-filter-shell';
    shell.innerHTML = `<div class="filter-grid">${renderSelect('Category', 'category', filterOptions('category'))}${renderSelect('Rarity', 'rarity', filterOptions('rarity'))}${renderSelect('Demand', 'demand', filterOptions('demand'))}${renderSelect('Trend', 'trend', ['Rising', 'Stable', 'Falling'])}${renderSelect('PvP', 'pvp', filterOptions('pvp'))}${renderSelect('PvE', 'pve', filterOptions('pve'))}<label><span>Minimum value</span><input type="number" data-advanced-filter="min" min="0" value="${safe(state.advancedFilters.min || '')}" placeholder="0"></label><label><span>Maximum value</span><input type="number" data-advanced-filter="max" min="0" value="${safe(state.advancedFilters.max || '')}" placeholder="No maximum"></label></div><div class="filter-actions"><button class="secondary" data-save-preset>Save preset</button><select data-load-preset aria-label="Load saved filter preset"><option value="">Saved presets…</option>${state.presets.map((preset, index) => `<option value="${index}">${safe(preset.name)}</option>`).join('')}</select><button class="secondary" data-random-item>Surprise me</button><button class="secondary" data-clear-advanced>Clear filters</button><span class="filter-count" aria-live="polite"></span></div><div class="active-filter-chips"></div>`;
    grid.before(shell);
    shell.querySelectorAll('[data-advanced-filter]').forEach(control => control.oninput = () => {
      const key = control.dataset.advancedFilter;
      if (control.value) state.advancedFilters[key] = control.value; else delete state.advancedFilters[key];
      state.gridPage = 1; writeStore(STORE.filters, state.advancedFilters); applyAdvancedFilters(); syncRouteToUrl(page, 'replace');
    });
    shell.querySelector('[data-save-preset]').onclick = saveFilterPreset;
    shell.querySelector('[data-load-preset]').onchange = event => { const preset = state.presets[Number(event.target.value)]; if (preset) { state.advancedFilters = { ...preset.filters }; writeStore(STORE.filters, state.advancedFilters); render(); } };
    shell.querySelector('[data-random-item]').onclick = randomDiscovery;
    shell.querySelector('[data-clear-advanced]').onclick = () => { state.advancedFilters = {}; state.gridPage = 1; writeStore(STORE.filters, {}); render(); };
    applyAdvancedFilters();
  }

  function advancedMatch(item) {
    const f = state.advancedFilters;
    const trend = String(item.trend || item.status || 'Stable');
    return (!f.category || item.category === f.category) && (!f.rarity || item.rarity === f.rarity) &&
      (!f.demand || item.demand === f.demand) && (!f.trend || trend.toLowerCase().includes(String(f.trend).toLowerCase())) &&
      (!f.pvp || item.pvp === f.pvp) && (!f.pve || item.pve === f.pve) &&
      (!f.min || Number(item.value) >= Number(f.min)) && (!f.max || Number(item.value) <= Number(f.max));
  }

  function applyAdvancedFilters() {
    const grid = document.querySelector('#view .item-grid');
    if (!grid) return;
    const matching = [];
    grid.querySelectorAll('[data-item]').forEach(cardNode => {
      const item = data.items.find(record => record.id === cardNode.dataset.item);
      const match = item && advancedMatch(item);
      cardNode.hidden = !match;
      if (match) matching.push(cardNode);
    });
    const shell = document.querySelector('.advanced-filter-shell');
    if (shell) {
      shell.querySelector('.filter-count').textContent = `${matching.length} matching item${matching.length === 1 ? '' : 's'}`;
      shell.querySelector('.active-filter-chips').innerHTML = Object.entries(state.advancedFilters).map(([key, value]) => `<button data-remove-filter="${safe(key)}">${safe(key)}: ${safe(value)} ×</button>`).join('');
      shell.querySelectorAll('[data-remove-filter]').forEach(button => button.onclick = () => { delete state.advancedFilters[button.dataset.removeFilter]; writeStore(STORE.filters, state.advancedFilters); render(); });
    }
    paginateLargeGrid(grid, matching);
  }

  function saveFilterPreset() {
    if (!Object.keys(state.advancedFilters).length) return toast('Choose at least one filter first');
    const name = prompt('Name this filter preset:');
    if (!name?.trim()) return;
    state.presets = [{ name: name.trim(), filters: { ...state.advancedFilters } }, ...state.presets.filter(preset => preset.name.toLowerCase() !== name.trim().toLowerCase())].slice(0, 12);
    writeStore(STORE.presets, state.presets); render(); toast('Filter preset saved');
  }

  function randomDiscovery() {
    const visible = [...document.querySelectorAll('#view .item-grid [data-item]')].filter(node => !node.hidden);
    if (!visible.length) return toast('No visible items to choose from');
    visible[Math.floor(Math.random() * visible.length)].click();
  }

  function paginateLargeGrid(grid, matching = [...grid.querySelectorAll('[data-item]')].filter(node => !node.hidden)) {
    document.querySelector('.grid-pagination')?.remove();
    const size = innerWidth <= 430 ? 20 : 48, pages = Math.max(1, Math.ceil(matching.length / size));
    state.gridPage = Math.min(state.gridPage, pages);
    matching.forEach((node, index) => { node.hidden = index < (state.gridPage - 1) * size || index >= state.gridPage * size; });
    if (pages <= 1) return;
    const controls = document.createElement('nav');
    controls.className = 'grid-pagination'; controls.setAttribute('aria-label', 'Item pages');
    controls.innerHTML = `<button class="secondary" data-grid-page="${state.gridPage - 1}" ${state.gridPage === 1 ? 'disabled' : ''}>← Previous</button><span>Page ${state.gridPage} of ${pages}</span><button class="secondary" data-grid-page="${state.gridPage + 1}" ${state.gridPage === pages ? 'disabled' : ''}>Next →</button>`;
    grid.after(controls);
    controls.querySelectorAll('[data-grid-page]').forEach(button => button.onclick = () => { state.gridPage = Number(button.dataset.gridPage); applyAdvancedFilters(); grid.scrollIntoView({ behavior: document.body.dataset.motion === 'reduce' ? 'auto' : 'smooth', block: 'start' }); });
  }

  function normalizeTradeSide(side) {
    const map = new Map();
    for (const item of trade[side] || []) {
      if (!item?.id) continue;
      const existing = map.get(item.id);
      if (existing) existing.quantity += Math.max(1, Number(item.quantity) || 1);
      else map.set(item.id, { ...item, quantity: Math.max(1, Number(item.quantity) || 1) });
    }
    trade[side] = [...map.values()];
  }
  function normalizeTrade() { normalizeTradeSide('yours'); normalizeTradeSide('theirs'); }
  function tradeSnapshot() { normalizeTrade(); return { yours: trade.yours.map(item => ({ id: item.id, quantity: item.quantity })), theirs: trade.theirs.map(item => ({ id: item.id, quantity: item.quantity })) }; }
  function hydrateTrade(snapshot) {
    const hydrate = side => (snapshot?.[side] || []).map(entry => {
      const id = typeof entry === 'string' ? entry : entry.id;
      const item = data?.items?.find(record => record.id === id);
      return item ? { ...item, quantity: Math.max(1, Number(entry.quantity) || 1) } : null;
    }).filter(Boolean);
    trade = { yours: hydrate('yours'), theirs: hydrate('theirs') };
  }
  function recordTradeCheckpoint() { state.tradeUndo.push(tradeSnapshot()); state.tradeUndo = state.tradeUndo.slice(-30); state.tradeRedo = []; }
  function tradeQuantity(side, id, delta) {
    recordTradeCheckpoint(); normalizeTrade();
    const item = trade[side].find(record => record.id === id);
    if (!item) return;
    item.quantity = Math.max(1, Math.min(99, item.quantity + delta)); render();
  }
  function removeTradeItem(side, id) { recordTradeCheckpoint(); trade[side] = trade[side].filter(item => item.id !== id); render(); }
  function moveTradeItem(side, index, delta) {
    normalizeTrade(); const next = index + delta; if (next < 0 || next >= trade[side].length) return;
    recordTradeCheckpoint(); [trade[side][index], trade[side][next]] = [trade[side][next], trade[side][index]]; render();
  }
  function undoTrade() { if (!state.tradeUndo.length) return; state.tradeRedo.push(tradeSnapshot()); hydrateTrade(state.tradeUndo.pop()); render(); }
  function redoTrade() { if (!state.tradeRedo.length) return; state.tradeUndo.push(tradeSnapshot()); hydrateTrade(state.tradeRedo.pop()); render(); }

  function tradeTotals() {
    normalizeTrade();
    const dragon = data.items.find(item => item.id === 'fruits-dragon')?.value || 130000;
    return { dragon, result: Core.calculateTrade(trade, dragon) };
  }
  function suggestion() {
    const { result } = tradeTotals();
    const side = result.rawDifference > 0 ? 'yours' : 'theirs';
    const excluded = new Set(trade[side].map(item => item.id));
    return { side, item: Core.suggestBalanceItem(data.items, Math.abs(result.rawDifference), excluded) };
  }
  function suggestTradeBalance() {
    const next = suggestion(); if (!next.item) return toast('No smaller listed item closely fits this gap');
    recordTradeCheckpoint(); trade[next.side].push({ ...next.item, quantity: 1 }); render(); toast(`${next.item.name} added to ${next.side === 'yours' ? 'your' : 'their'} side`);
  }
  function renderTradeWarnings(warnings) { return warnings.length ? `<ul class="trade-warning-list">${warnings.map(message => `<li>${safe(message)}</li>`).join('')}</ul>` : '<p class="muted">No unstable, falling, or low-demand warnings in this offer.</p>'; }
  function tradeItemMarkup(side, item, index) {
    const trend = item.trend || item.status || 'Stable';
    return `<article class="offer-item" draggable="true" data-trade-drag="${side}:${index}" data-item-id="${safe(item.id)}">${typeof art === 'function' ? art(item) : ''}<span><b>${safe(item.name)}</b><small>${safe(item.valueText || 'Unlisted')} each · ${safe(item.demand || '—')} demand · ${safe(trend)}</small></span><div class="quantity-stepper" aria-label="${safe(item.name)} quantity"><button data-trade-quantity="${side}:${safe(item.id)}:-1" aria-label="Decrease ${safe(item.name)} quantity">−</button><output aria-label="Quantity">${item.quantity}</output><button data-trade-quantity="${side}:${safe(item.id)}:1" aria-label="Increase ${safe(item.name)} quantity">+</button></div><div><button data-trade-move="${side}:${index}:-1" ${index === 0 ? 'disabled' : ''} aria-label="Move ${safe(item.name)} earlier">↑</button><button data-trade-move="${side}:${index}:1" ${index === trade[side].length - 1 ? 'disabled' : ''} aria-label="Move ${safe(item.name)} later">↓</button><button data-trade-remove="${side}:${safe(item.id)}" aria-label="Remove ${safe(item.name)}">×</button></div></article>`;
  }
  function offerMarkup(side, titleText) {
    return `<section class="panel offer" data-trade-drop="${side}"><div class="panel-title"><h2>${safe(titleText)}</h2><span>${trade[side].reduce((sum, item) => sum + item.quantity, 0)} total</span></div><div class="offer-list">${trade[side].map((item, index) => tradeItemMarkup(side, item, index)).join('') || '<div class="empty">No items added. Add one or drop an item here.</div>'}</div><button class="add-offer" data-pick-trade="${side}">＋ Add from values</button></section>`;
  }

  function improvedTradePage() {
    normalizeTrade(); const { dragon, result: calc } = tradeTotals(); const max = Math.max(calc.yours.weighted, calc.theirs.weighted, 1); const balance = suggestion();
    const explanation = calc.result === 'Win' ? 'Their demand-adjusted offer is at least 12% stronger than yours.' : calc.result === 'Loss' ? 'Your demand-adjusted offer is at least 12% stronger than theirs.' : 'Both demand-adjusted totals are inside the ±12% fair range.';
    const drafts = readStore(STORE.drafts, []);
    return `<div class="trade-workbench"><div class="page-head"><div><p class="eyebrow">DEMAND-AWARE TRADING</p><h1>Trade Calculator Pro</h1><p class="muted">Quantities, demand, rarity, Dragon equivalents, warnings, and balancing—explained.</p></div><div class="trade-actionbar"><button class="secondary" data-trade-undo ${state.tradeUndo.length ? '' : 'disabled'}>Undo</button><button class="secondary" data-trade-redo ${state.tradeRedo.length ? '' : 'disabled'}>Redo</button><button class="secondary" data-save-draft>Save draft</button><button class="secondary" data-copy-trade>Copy link</button><button class="secondary" data-export-discord>Discord image</button></div></div><div class="trade-grid">${offerMarkup('yours', 'Your offer')}<section class="trade-result pro-result"><span class="result-badge ${calc.result.toLowerCase()}">${calc.result}</span><strong>${calc.rawDifference >= 0 ? '+' : ''}${moneyValue(calc.rawDifference)}</strong><small>raw difference</small><div class="trade-value-bars"><div class="trade-bar yours"><span>Your weighted</span><div class="trade-bar-track"><div class="trade-bar-fill" style="width:${calc.yours.weighted / max * 100}%"></div></div><b>${moneyValue(calc.yours.weighted)}</b></div><div class="trade-bar theirs"><span>Their weighted</span><div class="trade-bar-track"><div class="trade-bar-fill" style="width:${calc.theirs.weighted / max * 100}%"></div></div><b>${moneyValue(calc.theirs.weighted)}</b></div></div><div class="details"><div><span>Demand-adjusted gap</span><b>${calc.percentage >= 0 ? '+' : ''}${calc.percentage.toFixed(1)}%</b></div><div><span>Your Dragons</span><b>${calc.yours.dragons.toFixed(2)}</b></div><div><span>Their Dragons</span><b>${calc.theirs.dragons.toFixed(2)}</b></div><div><span>Dragon baseline</span><b>${moneyValue(dragon)}</b></div></div><p class="trade-explanation">${safe(explanation)}</p>${balance.item ? `<button class="secondary" data-balance-trade>Add ${safe(balance.item.name)} to ${balance.side === 'yours' ? 'your' : 'their'} side to reduce the gap</button>` : ''}<p class="trade-formula">Demand-weighted value = current Dragon value × demand multiplier × rarity confidence. Raw and weighted totals are shown separately; no hidden values are invented.</p></section>${offerMarkup('theirs', 'Their offer')}</div><section class="panel"><div class="panel-title"><h2>Trade warnings</h2><span>${calc.warnings.length}</span></div>${renderTradeWarnings(calc.warnings)}</section>${drafts.length ? `<section class="panel"><div class="panel-title"><h2>Named drafts</h2><span>${drafts.length}</span></div><div class="trade-drafts">${drafts.map((draft, index) => `<div class="trade-draft"><button class="secondary" data-load-draft="${index}"><span><b>${safe(draft.name)}</b><small>${new Date(draft.savedAt).toLocaleString()}</small></span></button><button class="secondary" data-share-draft="${index}" aria-label="Copy ${safe(draft.name)} link">↗</button><button class="secondary" data-delete-draft="${index}" aria-label="Delete ${safe(draft.name)}">×</button></div>`).join('')}</div></section>` : ''}</div>`;
  }

  function saveTradeDraft() {
    const name = prompt('Name this trade draft:'); if (!name?.trim()) return;
    const drafts = readStore(STORE.drafts, []), draft = { name: name.trim(), trade: tradeSnapshot(), savedAt: new Date().toISOString() };
    writeStore(STORE.drafts, [draft, ...drafts.filter(entry => entry.name.toLowerCase() !== draft.name.toLowerCase())].slice(0, 20)); render(); toast('Trade draft saved');
  }
  function copyTradeLink(snapshot = tradeSnapshot()) {
    const url = new URL(location.href); url.searchParams.set('page', 'trade'); url.searchParams.set('state', Core.encodeShareState({ route: 'trade', trade: snapshot }));
    copyText(url.href, 'Trade link copied');
  }
  function exportDiscordTradeImage() {
    const { result: calc } = tradeTotals(), canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 675;
    const ctx = canvas.getContext('2d'), drawSide = (label, side, x) => {
      ctx.fillStyle = '#0b1a28'; ctx.fillRect(x, 160, 470, 380); ctx.fillStyle = '#39d7ef'; ctx.font = '700 28px Arial'; ctx.fillText(label, x + 28, 205);
      ctx.fillStyle = '#f4f8fb'; ctx.font = '600 21px Arial';
      trade[side].slice(0, 8).forEach((item, index) => ctx.fillText(`${item.quantity}× ${item.name} — ${item.valueText || moneyValue(item.value)}`, x + 28, 250 + index * 34));
      ctx.fillStyle = '#e6bd63'; ctx.font = '700 24px Arial'; ctx.fillText(`Total: ${moneyValue(calc[side].raw)}`, x + 28, 510);
    };
    const gradient = ctx.createLinearGradient(0, 0, 1200, 675); gradient.addColorStop(0, '#050c14'); gradient.addColorStop(1, '#102b3d'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1200, 675);
    ctx.fillStyle = '#f4f8fb'; ctx.font = '800 48px Arial'; ctx.fillText('HAZE ATLAS TRADE', 55, 85); ctx.fillStyle = '#a1b3c2'; ctx.font = '20px Arial'; ctx.fillText('Raw + demand-weighted comparison', 57, 120);
    drawSide('YOUR OFFER', 'yours', 55); drawSide('THEIR OFFER', 'theirs', 675);
    ctx.fillStyle = calc.result === 'Win' ? '#5fd49a' : calc.result === 'Loss' ? '#ff7f8f' : '#e6bd63'; ctx.font = '800 34px Arial'; ctx.textAlign = 'center'; ctx.fillText(calc.result.toUpperCase(), 600, 590); ctx.font = '18px Arial'; ctx.fillStyle = '#a1b3c2'; ctx.fillText(`Demand-adjusted gap ${calc.percentage >= 0 ? '+' : ''}${calc.percentage.toFixed(1)}% · creative-cmj.github.io/haze-values`, 600, 626);
    canvas.toBlob(blob => { if (!blob) return toast('Could not create the trade image'); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'haze-atlas-trade.png'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 500); toast('Discord trade image downloaded'); }, 'image/png');
  }

  function bindTradeWorkbench() {
    document.querySelectorAll('[data-trade-quantity]').forEach(button => button.onclick = () => { const [side, id, delta] = button.dataset.tradeQuantity.split(':'); tradeQuantity(side, id, Number(delta)); });
    document.querySelectorAll('[data-trade-remove]').forEach(button => button.onclick = () => { const [side, id] = button.dataset.tradeRemove.split(':'); removeTradeItem(side, id); });
    document.querySelectorAll('[data-trade-move]').forEach(button => button.onclick = () => { const [side, index, delta] = button.dataset.tradeMove.split(':'); moveTradeItem(side, Number(index), Number(delta)); });
    document.querySelector('[data-trade-undo]')?.addEventListener('click', undoTrade);
    document.querySelector('[data-trade-redo]')?.addEventListener('click', redoTrade);
    document.querySelector('[data-balance-trade]')?.addEventListener('click', suggestTradeBalance);
    document.querySelector('[data-save-draft]')?.addEventListener('click', saveTradeDraft);
    document.querySelector('[data-copy-trade]')?.addEventListener('click', () => copyTradeLink());
    document.querySelector('[data-export-discord]')?.addEventListener('click', exportDiscordTradeImage);
    const drafts = readStore(STORE.drafts, []);
    document.querySelectorAll('[data-load-draft]').forEach(button => button.onclick = () => { recordTradeCheckpoint(); hydrateTrade(drafts[Number(button.dataset.loadDraft)].trade); render(); });
    document.querySelectorAll('[data-share-draft]').forEach(button => button.onclick = () => copyTradeLink(drafts[Number(button.dataset.shareDraft)].trade));
    document.querySelectorAll('[data-delete-draft]').forEach(button => button.onclick = () => { drafts.splice(Number(button.dataset.deleteDraft), 1); writeStore(STORE.drafts, drafts); render(); });
    let dragged = null;
    document.querySelectorAll('[data-trade-drag]').forEach(node => {
      node.addEventListener('dragstart', event => { dragged = node.dataset.tradeDrag; node.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', dragged); });
      node.addEventListener('dragend', () => { node.classList.remove('dragging'); document.querySelectorAll('.drop-target').forEach(target => target.classList.remove('drop-target')); });
    });
    document.querySelectorAll('[data-trade-drop]').forEach(target => {
      target.addEventListener('dragover', event => { event.preventDefault(); target.classList.add('drop-target'); });
      target.addEventListener('dragleave', () => target.classList.remove('drop-target'));
      target.addEventListener('drop', event => {
        event.preventDefault(); const source = event.dataTransfer.getData('text/plain') || dragged; if (!source) return;
        const [from, indexText] = source.split(':'), to = target.dataset.tradeDrop, index = Number(indexText); if (!trade[from]?.[index]) return;
        recordTradeCheckpoint(); const [item] = trade[from].splice(index, 1); trade[to].push(item); render();
      });
    });
  }

  function improvedSettingsPage() {
    return `<div class="page-head compact"><div><p class="eyebrow">PREFERENCES</p><h1>Settings</h1><p class="muted">Display, motion, and performance preferences stay on this device.</p></div></div><section class="panel settings"><label>Theme<select id="theme"><option value="dark">Dark ocean</option><option value="light">Light</option></select></label><label>Interface density<select id="density"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label><label>Reading mode<select id="readingMode"><option value="false">Standard</option><option value="true">Brighter text and wider spacing</option></select></label><label>Motion<select id="reduceMotion"><option value="system">Follow device</option><option value="on">Reduce motion</option><option value="off">Allow subtle motion</option></select></label><label>Performance mode<select id="lowPerformance"><option value="false">Full visuals</option><option value="true">Low-performance mode</option></select></label><p class="muted performance-auto">Automatic suggestion: devices reporting 4 GB memory or less are offered low-performance defaults; you remain in control.</p><button class="secondary" id="clearData">Clear local preferences</button></section>`;
  }

  function bindImprovedSettings() {
    if (page !== 'settings') return;
    const bind = (id, key, transform = value => value) => { const control = document.querySelector(`#${id}`); if (!control) return; control.value = String(key in state.preferences ? state.preferences[key] : ''); control.onchange = () => { state.preferences[key] = transform(control.value); if (key === 'theme' || key === 'density') { settings[key] = state.preferences[key]; put('haze-settings', settings); } applyPreferences(); render(); }; };
    bind('theme', 'theme'); bind('density', 'density'); bind('readingMode', 'readingMode', value => value === 'true'); bind('reduceMotion', 'reduceMotion'); bind('lowPerformance', 'lowPerformance', value => value === 'true');
  }

  function decorateCardsAndImages() {
    document.body.dataset.category = page;
    document.querySelectorAll('[data-item]').forEach(cardNode => {
      const item = data.items.find(record => record.id === cardNode.dataset.item); if (!item) return;
      cardNode.dataset.category = String(item.category || '').toLowerCase(); cardNode.dataset.rarity = String(item.rarity || '').toLowerCase();
      const frame = cardNode.querySelector('.card-top');
      frame?.classList.add('item-art-frame');
      const image = frame?.querySelector('img');
      const showVisualFallback = () => {
        if (!frame || frame.querySelector('.item-fallback')) return;
        if (image) { image.dataset.fallback = 'true'; image.hidden = true; }
        frame.insertAdjacentHTML('beforeend', `<div class="item-fallback" role="img" aria-label="Visual placeholder for ${safe(item.name)}">${safe(item.name)}</div>`);
      };
      if (image?.src.includes('item-placeholder')) showVisualFallback();
      image?.addEventListener('error', showVisualFallback, { once: true });
      const pill = cardNode.querySelector('.pill'); if (pill) { pill.classList.add('item-status-badge'); const statusText = pill.textContent.toLowerCase(); ['rising', 'falling', 'stable', 'overpaid', 'underpaid'].forEach(name => { if (statusText.includes(name)) pill.classList.add(name); }); }
    });
    document.querySelectorAll('img').forEach(image => { if (!image.hasAttribute('loading') && !image.classList.contains('detail-art')) image.loading = 'lazy'; image.decoding = 'async'; image.addEventListener('error', () => { if (!image.dataset.fallback && !image.src.includes('item-placeholder')) { image.dataset.fallback = 'true'; image.src = './trello-images/item-placeholder.webp'; } }, { once: true }); });
    document.querySelectorAll('.detail-head .detail-art, .detail-head > .item-art').forEach(image => {
      if (image.parentElement?.classList.contains('detail-art-stage')) return;
      const stage = document.createElement('div'); stage.className = 'detail-art-stage'; image.before(stage); stage.append(image);
    });
  }

  function injectHomePersonalization() {
    if (page !== 'home') return;
    const root = document.querySelector('.atlas-dashboard'); if (!root || root.querySelector('.home-personalization')) return;
    const items = (window.recentItems || recentItems || []).slice(0, 5);
    const section = document.createElement('section'); section.className = 'panel home-personalization';
    section.innerHTML = `<div class="panel-title"><h2>Continue exploring</h2><button data-open-command>Search everything →</button></div>${items.length ? `<div class="compact-value-list">${items.map(item => `<button class="compact-value-row" data-item="${safe(item.id)}"><img src="./${artPath(item)}" loading="lazy" decoding="async" alt=""><span><b>${safe(item.name)}</b><small>Recently viewed · ${safe(item.demand || '—')} demand</small></span><strong>${safe(item.valueText || 'Unlisted')}</strong></button>`).join('')}</div>` : '<p class="muted">Open an item and it will appear here for a faster return trip.</p>'}`;
    root.append(section); section.querySelector('[data-open-command]').onclick = () => openCommandPalette();
  }

  function openMobileMore() {
    let dialog = document.querySelector('#mobileMore');
    if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'mobileMore'; dialog.className = 'mobile-more-sheet'; dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }); document.body.append(dialog); }
    const routes = ['search', 'compare', 'builds', 'mastery', 'timers', 'favorites', 'history'];
    dialog.innerHTML = `<div class="sheet-handle"></div><header class="sheet-head"><h2>More</h2><button class="drawer-close" data-more-close aria-label="Close more menu">×</button></header><div class="mobile-more-grid">${routes.map(route => `<button ${route === 'search' ? 'data-mobile-search' : `data-mobile-route="${route}"`}><b>${route === 'search' ? 'Search' : safe(routeLabel(route))}</b><small>${route === 'search' ? 'Everything' : safe(routeCategory(route))}</small></button>`).join('')}</div>`;
    dialog.querySelector('[data-more-close]').onclick = () => dialog.close(); dialog.querySelector('[data-mobile-search]').onclick = () => { dialog.close(); openCommandPalette(); };
    dialog.querySelectorAll('[data-mobile-route]').forEach(button => button.onclick = () => { dialog.close(); go(button.dataset.mobileRoute); });
    state.dialogTrigger = document.activeElement; dialog.showModal();
  }

  function installMobileMore() {
    const bottom = document.querySelector('.mobile-bottom'); if (!bottom) return;
    let button = bottom.querySelector('[data-mobile-more]');
    if (!button) { button = bottom.querySelector('[data-page="collection"]') || bottom.lastElementChild; if (!button) return; button.removeAttribute('data-page'); button.dataset.mobileMore = 'true'; button.innerHTML = '<span aria-hidden="true">•••</span><span>More</span>'; button.setAttribute('aria-label', 'Open more navigation'); }
    button.onclick = event => { event.stopPropagation(); openMobileMore(); };
  }

  function restoreDialogFocus() { const trigger = state.dialogTrigger; if (trigger && document.contains(trigger) && typeof trigger.focus === 'function') requestAnimationFrame(() => trigger.focus()); }
  function installAccessibility() {
    document.querySelectorAll('#nav [data-page],.mobile-bottom [data-page]').forEach(button => { if (button.dataset.page === page) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    document.querySelectorAll('dialog').forEach(dialog => { if (dialog.dataset.focusRestore) return; dialog.dataset.focusRestore = 'true'; dialog.addEventListener('close', restoreDialogFocus); });
    document.querySelectorAll('button:not([aria-label])').forEach(button => { if (!button.textContent.trim() && button.title) button.setAttribute('aria-label', button.title); });
  }

  function copyText(text, success) {
    const fallback = () => { const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); toast(success); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast(success)).catch(fallback); else fallback();
  }

  function postProcessRoute() {
    const view = document.querySelector('#view'); if (!view) return;
    view.classList.remove('route-transition'); void view.offsetWidth; view.classList.add('route-transition');
    renderNavigationShortcuts(); installBreadcrumbs(); installHistoryControls(); decorateCardsAndImages(); renderAdvancedFilters(); bindTradeWorkbench(); bindImprovedSettings(); injectHomePersonalization(); installAccessibility();
  }

  installStartupSkeleton(); applyPreferences();
  const baseRender = render, baseGo = go, originalDetail = detail, originalContentDetail = contentDetail, originalOpenTradePicker = openTradePicker;
  // Keep the actively maintained settings and trade pages; this pass augments them after render.
  render = function improvedRender() { baseRender(); postProcessRoute(); };
  window.render = render;
  go = function improvedGo(next, options = {}) { baseGo(next); recordRecentRoute(next); if (!options.fromHistory) syncRouteToUrl(next); };
  window.go = go;
  detail = function improvedDetail(item) { if (!item) return; state.dialogTrigger = document.activeElement; originalDetail(item); const url = new URL(location.href); url.searchParams.set('item', item.id); url.searchParams.delete('guide'); history.pushState({ item: item.id }, '', url); decorateCardsAndImages(); };
  contentDetail = function improvedContentDetail(entry) { if (!entry) return; state.dialogTrigger = document.activeElement; originalContentDetail(entry); const url = new URL(location.href); url.searchParams.set('guide', entry.id); url.searchParams.delete('item'); history.pushState({ guide: entry.id }, '', url); decorateCardsAndImages(); };
  openTradePicker = function improvedTradePicker(side) { recordTradeCheckpoint(); state.dialogTrigger = document.activeElement; originalOpenTradePicker(side); };
  window.detail = detail; window.contentDetail = contentDetail;

  window.addEventListener('popstate', () => {
    const url = new URL(location.href), next = url.searchParams.get('page') || 'home';
    if (next !== page) baseGo(next);
    const itemId = url.searchParams.get('item'), guideId = url.searchParams.get('guide');
    if (itemId) originalDetail(data.items.find(item => item.id === itemId));
    else if (guideId) originalContentDetail(content.entries.find(entry => entry.id === guideId));
    else document.querySelector('#detailDialog')?.close();
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && ['k', 'f'].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopImmediatePropagation(); openCommandPalette(); }
  }, true);
  document.addEventListener('click', event => { if (event.target.closest('[data-item],[data-content],[data-pick-trade]')) state.dialogTrigger = event.target.closest('button,[role="button"],a') || document.activeElement; }, true);

  const ready = setInterval(() => {
    if (typeof data === 'object' && data?.items?.length && typeof content === 'object' && content?.entries?.length && typeof trello === 'object') {
      clearInterval(ready);
      const autoLow = navigator.deviceMemory && navigator.deviceMemory <= 4 && localStorage.getItem(STORE.preferences) == null;
      if (autoLow) state.preferences.lowPerformance = true;
      installGlobalSearch(); restoreRouteFromUrl(); syncRouteToUrl(page, 'replace'); postProcessRoute();
    }
  }, 40);
})();
