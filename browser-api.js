(() => {
  const json = async (file) => {
    const response = await fetch(file, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load ${file} (${response.status})`);
    return response.json();
  };

  window.haze = {
    getData: () => json('data.json'),
    getContent: () => json('content.json'),
    getMastery: () => json('mastery-xp.json'),
    getTrelloDetails: () => json('trello-details.json'),
    refresh: () => json('data.json'),
    openSource: () => window.open('https://docs.google.com/spreadsheets/d/e/2PACX-1vR13VPAyegTk7IIY7bjc22p0MjeCclNdbK4TsEiAPcoSfObTfZcWZAXxOq3eeIrGd2zHDeTddApGark/pubhtml', '_blank', 'noopener')
  };
})();
