(() => {
  const bust = () => `t=${Date.now()}`;
  const json = async (file) => {
    const join = file.includes('?') ? '&' : '?';
    const response = await fetch(`${file}${join}${bust()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load ${file} (${response.status})`);
    return response.json();
  };

  window.haze = {
    getData: () => json('data.json'),
    getContent: () => json('content.json'),
    getMastery: () => json('mastery-xp.json'),
    getTrelloDetails: () => json('trello-details.json'),
    getSyncMeta: () => json('sync-meta.json').catch(() => null),
    /**
     * Reload deployed snapshots produced by the GitHub Actions sync workflow.
     * Does not scrape sources in the browser — Actions writes JSON to the repo,
     * Pages deploys it, then this re-fetches those files with a cache bust.
     */
    refresh: async () => {
      const [data, content, mastery, trello, meta] = await Promise.all([
        json('data.json'),
        json('content.json'),
        json('mastery-xp.json'),
        json('trello-details.json'),
        json('sync-meta.json').catch(() => null),
      ]);
      const checkedAt = new Date().toISOString();
      data.sync = {
        ...(data.sync || {}),
        status: 'Ready',
        lastChecked: checkedAt,
        lastUpdated: data.updatedAt || data.sync?.lastUpdated || checkedAt,
        via: data.sync?.via || meta?.via || 'deployed-snapshot',
        runUrl: data.sync?.runUrl || meta?.runUrl || null,
        clientReloadedAt: checkedAt,
      };
      return { data, content, mastery, trello, meta };
    },
    openSource: () =>
      window.open(
        'https://docs.google.com/spreadsheets/d/e/2PACX-1vR13VPAyegTk7IIY7bjc22p0MjeCclNdbK4TsEiAPcoSfObTfZcWZAXxOq3eeIrGd2zHDeTddApGark/pubhtml',
        '_blank',
        'noopener'
      ),
  };
})();
