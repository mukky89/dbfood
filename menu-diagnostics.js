const { fetchHtml } = require('./scraper');
const { parseLupo, parseNevadzka } = require('./menu-parsers');
const { getRestaurant, todaySK } = require('./restaurants');

// Iba čítanie verejných zdrojov: nemení DB, aktívnu jedáleň ani cache a neprekladá menu.
async function checkMenuSources({ fetch = fetchHtml, log = console.log, now = new Date() } = {}) {
  const results = [];
  for (const id of ['nevadzka', 'lupo']) {
    let result;
    try {
      const response = await fetch(getRestaurant(id).url);
      const days = (id === 'nevadzka' ? parseNevadzka : parseLupo)(response.data);
      result = { id, httpStatus: response.status, today: todaySK(now),
        todayFound: !!days[todaySK(now)]?.sekcie.some(s => s.nazov === 'Hlavné jedlo' && s.polozky.length),
        days: Object.fromEntries(Object.entries(days).map(([date, menu]) => [date, {
          sections: menu.sekcie.map(s => ({ name: s.nazov, count: s.polozky.length })),
          pricing: menu.pricing,
          mainPrices: menu.sekcie.find(s => s.nazov === 'Hlavné jedlo')?.polozky.map(p => p.cena)
        }])) };
    } catch (error) {
      result = { id, httpStatus: error.response?.status || null, error: error.message };
    }
    results.push(result);
    log('MENU_SOURCE_DIAGNOSTIC ' + JSON.stringify(result));
  }
  return results;
}
module.exports = { checkMenuSources };
