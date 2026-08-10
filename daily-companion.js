/* Daily companion integration: source-backed market context, personal shortcuts, and collection clarity. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.install(root);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const PRIMARY = 'googleSheet';
  const CROSS_CHECK = 'vaultedValuesX';
  const safe = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
  const numeric = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const format = value => numeric(value) == null ? 'Unlisted' : new Intl.NumberFormat().format(value);

  function snapshotsFor(history, itemId) {
    return (history?.snapshots || []).map(snapshot => {
      const item = (snapshot.items || []).find(record => record.id === itemId);
      return item ? { observedAt: snapshot.observedAt, value: numeric(item.value), valueText: item.valueText || 'Unlisted' } : null;
    }).filter(Boolean);
  }
  function trendState(points) {
    const valued = points.filter(point => point.value != null);
    if (valued.length < 2) return { state: 'baseline', message: 'One source-backed snapshot is available. A trend will appear after a later committed snapshot.' };
    const first = valued[0].value, last = valued[valued.length - 1].value;
    if (last === first) return { state: 'flat', message: `No value change across ${valued.length} committed snapshots.` };
    return { state: last > first ? 'up' : 'down', delta: last - first, percent: first ? (last - first) / first * 100 : null, message: `${last > first ? 'Up' : 'Down'} ${format(Math.abs(last - first))} since the first committed snapshot.` };
  }
  function sparklinePath(points, width = 152, height = 44) {
    const values = points.map(point => point.value).filter(value => value != null);
    if (values.length < 2) return null;
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const usable = points.filter(point => point.value != null);
    return usable.map((point, index) => `${index ? 'L' : 'M'}${(index / (usable.length - 1)) * width} ${height - ((point.value - min) / span) * (height - 6) - 3}`).join(' ');
  }
  function sourceProfile(item) {
    const values = item?.sourceValues || {};
    const google = values[PRIMARY] || {};
    const vaulted = values[CROSS_CHECK] || {};
    const primaryValue = numeric(google.value);
    const crossValue = numeric(vaulted.value);
    const hasCross = Object.keys(vaulted).length > 0;
    const conflict = Boolean(item?.sourceConflict) || (primaryValue != null && crossValue != null && primaryValue !== crossValue);
    return { primaryValue, crossValue, hasCross, conflict, difference: primaryValue != null && crossValue != null ? crossValue - primaryValue : null };
  }

  function install(win) {
    const state = { history: null, changes: null, installed: false };
    const el = selector => win.document.querySelector(selector);
    const all = selector => [...win.document.querySelectorAll(selector)];
    const itemById = id => (typeof data === 'object' ? data.items : [])?.find(item => item.id === id);
    // `page` is a top-level lexical binding from renderer.js (not a window property).
    const currentPage = () => typeof page === 'string' ? page : 'home';
    const money = value => typeof win.money === 'function' ? win.money(value) : format(value);

    async function loadArtifacts() {
      try {
        const [history, changes] = await Promise.all([win.haze?.getValueHistory?.(), win.haze?.getValueChanges?.()]);
        state.history = history || null; state.changes = changes || null;
      } catch (_) { state.history = null; state.changes = null; }
    }
    function historyPanel(item) {
      const points = snapshotsFor(state.history, item.id), trend = trendState(points), path = sparklinePath(points);
      const latest = points.at(-1);
      return `<section class="panel daily-history" aria-label="Source-backed value history"><div class="panel-title"><div><p class="eyebrow">COMMITTED VALUE HISTORY</p><h2>Value trend</h2></div><span class="daily-trend ${trend.state}">${trend.state === 'baseline' ? 'BASELINE' : trend.state === 'flat' ? 'UNCHANGED' : trend.state.toUpperCase()}</span></div>${path ? `<svg class="daily-sparkline" viewBox="0 0 152 44" role="img" aria-label="${safe(trend.message)}"><path d="${path}" pathLength="1"></path></svg>` : '<div class="daily-baseline-chart" aria-hidden="true"><span></span></div>'}<p class="detail-note">${safe(trend.message)}</p>${latest ? `<small>Latest committed observation: ${safe(new Date(latest.observedAt).toLocaleString())} · ${safe(latest.valueText)}</small>` : '<small>History file is not available in this snapshot.</small>'}</section>`;
    }
    function confidencePanel(item) {
      const profile = sourceProfile(item);
      const status = profile.conflict ? 'DIFFERENCE TO REVIEW' : profile.hasCross ? 'CROSS-CHECKED' : 'PRIMARY ONLY';
      return `<section class="panel daily-confidence ${profile.conflict ? 'has-conflict' : ''}"><div class="panel-title"><div><p class="eyebrow">SOURCE CONFIDENCE</p><h2>Why this value is shown</h2></div><span class="daily-trend ${profile.conflict ? 'down' : 'flat'}">${status}</span></div><p>The Google Sheet is the primary value source. Vaulted Values X is shown only as a reconciliation cross-check; it never replaces the displayed or calculator value.</p><dl class="daily-source-grid"><div><dt>Google Sheet · primary</dt><dd>${safe(profile.primaryValue == null ? 'Unlisted' : money(profile.primaryValue))}</dd></div><div><dt>Vaulted Values X · cross-check</dt><dd>${safe(!profile.hasCross ? 'Unavailable' : profile.crossValue == null ? 'Unlisted' : money(profile.crossValue))}</dd></div></dl>${profile.conflict ? `<p class="daily-conflict-note">The sources disagree${profile.difference == null ? '.' : ` by ${safe(money(Math.abs(profile.difference)))}.`} Review both values before accepting a trade.</p>` : '<p class="detail-note">No conflicting numeric value is present in this committed snapshot.</p>'}<button class="secondary" data-review-source="${safe(item.id)}">Review source decision</button></section>`;
    }
    function openReview(item) {
      const profile = sourceProfile(item);
      let dialog = el('#sourceReviewDialog');
      if (!dialog) { dialog = win.document.createElement('dialog'); dialog.id = 'sourceReviewDialog'; dialog.className = 'source-review-dialog'; win.document.body.append(dialog); }
      dialog.innerHTML = `<button class="close" data-close-review aria-label="Close">×</button><p class="eyebrow">CONFLICT RESOLUTION</p><h2>${safe(item.name)}</h2><ol><li>Compare the published Google Sheet and Vaulted Values X values below.</li><li>Keep the Google Sheet value as the active value: it is the declared primary source.</li><li>Mark this difference reviewed locally, then use the source links if a trade needs further verification.</li></ol><div class="daily-source-grid"><div><dt>Google Sheet · active</dt><dd>${safe(profile.primaryValue == null ? 'Unlisted' : money(profile.primaryValue))}</dd></div><div><dt>Vaulted Values X · reference</dt><dd>${safe(!profile.hasCross ? 'Unavailable' : profile.crossValue == null ? 'Unlisted' : money(profile.crossValue))}</dd></div></div><div class="daily-review-actions"><a class="secondary" target="_blank" rel="noopener" href="https://docs.google.com/spreadsheets/d/e/2PACX-1vR13VPAyegTk7IIY7bjc22p0MjeCclNdbK4TsEiAPcoSfObTfZcWZAXxOq3eeIrGd2zHDeTddApGark/pubhtml">Open primary sheet ↗</a><button class="secondary" data-copy-conflict="${safe(item.id)}">Copy review note</button><button class="primary" data-mark-reviewed="${safe(item.id)}">Mark reviewed</button></div>`;
      dialog.querySelector('[data-close-review]').onclick = () => dialog.close();
      dialog.querySelector('[data-mark-reviewed]').onclick = () => { const reviewed = JSON.parse(win.localStorage.getItem('haze-reviewed-source-conflicts') || '{}'); reviewed[item.id] = new Date().toISOString(); win.localStorage.setItem('haze-reviewed-source-conflicts', JSON.stringify(reviewed)); dialog.close(); win.toast?.('Source difference marked reviewed on this device'); };
      dialog.querySelector('[data-copy-conflict]').onclick = async () => { const note = `${item.name}: Google Sheet (primary) ${profile.primaryValue == null ? 'Unlisted' : money(profile.primaryValue)}; Vaulted Values X (cross-check) ${profile.crossValue == null ? 'Unavailable' : money(profile.crossValue)}. The calculator uses the Google Sheet value.`; try { await win.navigator.clipboard.writeText(note); win.toast?.('Review note copied'); } catch (_) { win.toast?.('Could not copy review note'); } };
      dialog.showModal();
    }
    function activityPage() {
      const summary = state.changes?.summary || { total: 0, up: 0, down: 0, added: 0, removed: 0 };
      const rows = state.changes?.changes || [];
      const generated = state.changes?.observedAt || state.history?.generatedAt;
      return `<div class="page-head compact"><div><p class="eyebrow">SOURCE-BACKED MARKET ACTIVITY</p><h1>Value updates</h1><p class="muted">Only changes between committed source snapshots appear here. A first snapshot is a baseline, not a market change.</p></div><button class="secondary" data-daily-page="items">Browse values</button></div><section class="daily-activity-summary"><div><small>CHANGED</small><strong>${summary.total || 0}</strong></div><div><small>UP</small><strong>${summary.up || 0}</strong></div><div><small>DOWN</small><strong>${summary.down || 0}</strong></div><div><small>BASELINE</small><strong>${state.history?.snapshots?.length || 0} snapshot${state.history?.snapshots?.length === 1 ? '' : 's'}</strong></div></section><section class="panel daily-activity-list"><div class="panel-title"><h2>Latest committed activity</h2><span>${generated ? safe(new Date(generated).toLocaleString()) : 'Unavailable'}</span></div>${rows.length ? rows.map(change => `<button data-item="${safe(change.id)}"><span><b>${safe(change.name)}</b><small>${safe(change.category || 'Value item')} · ${safe((change.fields || []).join(', ') || 'value')}</small></span><strong class="${safe(change.direction || 'same')}">${safe(change.previousValueText || change.previousText || '—')} → ${safe(change.valueText || '—')}</strong></button>`).join('') : `<div class="daily-baseline-empty"><b>No value changes to report yet.</b><p>${state.history?.snapshots?.length === 1 ? 'This is the first committed source snapshot. Haze Atlas will show a change only after a later snapshot differs.' : 'No change artifact is available in this build.'}</p></div>`}</section>`;
    }
    function quickHub() {
      if (currentPage() !== 'home' || el('.daily-quick-hub')) return;
      const recents = (typeof recentItems === 'undefined' ? [] : recentItems).slice(0, 4);
      const favoriteItems = (typeof favorites === 'undefined' ? [] : favorites).map(record => itemById(record.id) || record).slice(0, 4);
      const host = el('.atlas-dashboard') || el('#view'); if (!host) return;
      const list = (title, items, empty) => `<section class="panel daily-mini-list"><div class="panel-title"><h2>${title}</h2><button data-daily-page="${title === 'Recents' ? 'items' : 'favorites'}">Open →</button></div>${items.length ? items.map(item => `<button data-item="${safe(item.id)}"><span><b>${safe(item.name)}</b><small>${safe(item.demand || '—')} demand</small></span><strong>${safe(item.valueText || 'Unlisted')}</strong></button>`).join('') : `<p class="muted">${empty}</p>`}</section>`;
      const section = win.document.createElement('section'); section.className = 'daily-quick-hub';
      section.innerHTML = `<div class="daily-hub-actions"><button data-daily-search><b>Quick search</b><small>Find an item, guide, or tool</small></button><button data-daily-page="trade"><b>Check a trade</b><small>Source-aware offer context</small></button><button data-daily-page="activity"><b>Value updates</b><small>${state.changes?.summary?.total || 0} committed changes</small></button><button data-daily-page="collection"><b>Collection</b><small>Track owned and wanted items</small></button></div><div class="daily-mini-columns">${list('Recents', recents, 'Open an item to keep it handy here.')}${list('Favorites', favoriteItems, 'Save favorites with the heart on any item.')}</div>`;
      host.append(section); bind(section);
    }
    function collectionProgress() {
      if (currentPage() !== 'collection' || el('.daily-collection-progress')) return;
      const items = typeof data === 'object' ? data.items || [] : [], collection = typeof atlasCollection === 'object' ? atlasCollection : {};
      const owned = items.filter(item => collection[item.id]?.owned).length;
      const wanted = items.filter(item => collection[item.id]?.wanted).length;
      const percent = items.length ? Math.round(owned / items.length * 100) : 0;
      const toolbar = el('.feature-toolbar'); if (!toolbar) return;
      const progress = win.document.createElement('section'); progress.className = 'panel daily-collection-progress';
      progress.innerHTML = `<div><p class="eyebrow">COLLECTION PROGRESS</p><h2>${owned} of ${items.length} tracked items owned</h2><div class="daily-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${items.length}" aria-valuenow="${owned}" aria-label="Collection completion"><span style="width:${percent}%"></span></div><p class="muted">${percent}% complete · ${wanted} marked wanted. Item status stays on this device.</p></div><button class="secondary" data-daily-page="builds" title="Open Build Planner to see which saved-build items are still missing">Review build goals</button>`;
      toolbar.after(progress); bind(progress);
      all('.collection-actions .tag-toggle').forEach(button => { const label = button.textContent.trim(); button.title = `${label}: saved locally. Tap to toggle.`; button.setAttribute('aria-label', `${label}: saved locally. Tap to toggle.`); });
    }
    function bind(scope = win.document) {
      scope.querySelectorAll?.('[data-daily-page]').forEach(button => button.onclick = () => win.go(button.dataset.dailyPage));
      scope.querySelectorAll?.('[data-daily-search]').forEach(button => button.onclick = () => { el('#search')?.click(); });
      scope.querySelectorAll?.('[data-review-source]').forEach(button => button.onclick = () => { const item = itemById(button.dataset.reviewSource); if (item) openReview(item); });
      scope.querySelectorAll?.('[data-item]').forEach(button => { if (!button.dataset.dailyBound) { button.dataset.dailyBound = 'true'; button.onclick = () => { const item = itemById(button.dataset.item); if (item) detail(item); }; } });
    }
    function decorateDetail() {
      const dialog = el('#detailDialog'), detail = el('#detail');
      if (!dialog?.open || !detail || detail.querySelector('.daily-history')) return;
      const heading = detail.querySelector('.detail-head h1'); const item = [...(typeof data === 'object' ? data.items || [] : [])].find(record => record.name === heading?.textContent.trim());
      if (!item) return;
      detail.insertAdjacentHTML('beforeend', historyPanel(item) + confidencePanel(item)); bind(detail);
    }
    function decorate() { if (currentPage() === 'activity') { el('#view').innerHTML = activityPage(); bind(); } quickHub(); collectionProgress(); decorateDetail(); }
    const priorRender = render;
    render = function dailyRender() { priorRender(); decorate(); };
    win.render = render;
    const priorGo = go;
    go = function dailyGo(next) { priorGo(next); };
    win.go = go;
    const priorDetail = detail;
    detail = function dailyDetail(item) { priorDetail(item); decorateDetail(); };
    win.detail = detail;
    loadArtifacts().then(() => { if (currentPage() === 'activity') render(); else decorate(); });
    win.document.addEventListener('click', event => { const target = event.target.closest?.('[data-daily-page],[data-daily-search],[data-review-source]'); if (target) event.stopPropagation(); });
  }
  return { snapshotsFor, trendState, sparklinePath, sourceProfile, install };
});
