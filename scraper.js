const axios = require('axios');
const cheerio = require('cheerio');
const config = require('./config');
const { parseMenu } = require('./fantozzi-parser');
const { translateMenu } = require('./translator');
const { parseLupo, parseNevadzka, selectDay, dateKey, applyLupoCharges } = require('./menu-parsers');
const { getRestaurant, todaySK } = require('./restaurants');
const loadSource = require('./menu-source').createSourceLoader();
const pendingMenus = new Map();
let getContext = async () => ({ restaurant: getRestaurant('fantozzi'), date: todaySK(), key: `fantozzi:0:${todaySK()}` });
let manualStore = null;
function configureRestaurants(context, store) { getContext = context; manualStore = store; }

// Cache: ukladame menu aby sme nerobili request pri kazdom nacitani stranky
let cache = {
  data: null,
  timestamp: null,
  TTL: 30 * 60 * 1000 // 30 minut
};

async function fetchMenu() {
  const context = await getContext();
  if (pendingMenus.has(context.key)) return pendingMenus.get(context.key);
  const task = fetchMenuForContext(context).finally(() => pendingMenus.delete(context.key));
  pendingMenus.set(context.key, task);
  return task;
}

async function fetchMenuForContext(context) {
  const { restaurant, date, key } = context;
  const manual = manualStore && await manualStore.findOne({ key });
  if (manual?.menu) {
    const menu = { ...manual.menu, restaurant, date, key };
    return restaurant.id === 'lupo' ? applyLupoCharges(menu) : menu;
  }
  // Ak mame platny cache, vratime ho
  if (cache.data?.key === key && cache.timestamp && (Date.now() - cache.timestamp) < cache.TTL) {
    console.log('[Scraper] Vraciame menu z cache');
    return cache.data;
  }

  try {
    const { menu } = await fetchAutomaticMenu(context);
    if (!menu.sekcie?.length) return menu;

    // Preklad menu (EN/FR) — raz pri stiahnuti noveho menu, vysledok ide do cache.
    // Chyba prekladu nesmie zhodit nacitanie menu.
    try { await translateMenu(menu); } catch (e) { console.error('[Scraper] Preklad zlyhal:', e.message); }

    // Ulozime do cache
    cache.data = menu;
    cache.timestamp = Date.now();

    console.log('[Scraper] Menu uspesne nacitane, sekcie:', menu.sekcie.map(s => s.nazov).join(', '));
    return menu;

  } catch (err) {
    const status = err.response?.status;
    console.error('[Scraper] Chyba pri stahovani menu:', status ? `HTTP ${status}` : err.message);
    if (status === 403 || status === 429) {
      console.error('[Scraper] Zdroj blokuje automatizované požiadavky. Použite import alebo ručné menu v admin zóne.');
    }
    // Ak mame stary cache, vratime ho aj po vyprsani
    if (cache.data?.key === key) {
      console.log('[Scraper] Vraciame stary cache po chybe');
      return { ...cache.data, stale: true, warning: 'Čerstvé menu sa nepodarilo overiť. Zobrazuje sa posledné menu pre dnešný dátum.' };
    }
    return { restaurant, date, key, sekcie: [], unavailable: true, error: status === 403 || status === 429 ? 'Zdroj blokuje automatické načítanie. Administrátor môže vložiť menu ručne.' : 'Menu sa nepodarilo načítať.' };
  }
}

// Rovnaké automatické zdroje a parsery ako ostré menu, ale bez čítania/zápisu DB,
// prekladov a bez zmeny kontextu či cache aktívneho menu.
async function fetchAutomaticMenu({ restaurant, date, key }) {
  const url = restaurant.id === 'fantozzi' ? config.restaurantUrl : restaurant.url;
  const response = await fetchHtml(url);
  const days = restaurant.id === 'lupo' ? parseLupo(response.data)
    : restaurant.id === 'nevadzka' ? parseNevadzka(response.data) : null;
  const menu = days ? selectDay(days, date) : parseMenu(cheerio.load(response.data));
  const availableDates = days ? Object.keys(days) : [dateKey(menu.datum)].filter(Boolean);
  if (!availableDates.includes(date)) { menu.sekcie = []; menu.unavailable = true; }
  Object.assign(menu, { restaurant, date, key, source: response.menuSource });
  return { menu, availableDates };
}

// Stiahne HTML so sadou hlaviciek imitujucich realny prehliadac (Chrome),
// aby sme znizili sancu na 403 z anti-bot WAF. Pri 403/429 skusi 1 retry.
function fetchHtml(url) {
  return loadSource(url, target => fetchDirectHtml(target, ['lupo', 'nevadzka'].some(id => getRestaurant(id).url === target) ? 2 : 1));
}

async function fetchDirectHtml(url, attempt = 1) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'sk-SK,sk;q=0.9,cs;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Referer': new URL(url).origin + '/'
  };
  try {
    const timeout = url === getRestaurant('fantozzi').url ? 5000 : 12000;
    return await axios.get(url, { timeout, headers, maxRedirects: 5 });
  } catch (err) {
    const status = err.response?.status;
    if ((status === 403 || status === 429) && attempt < 2) {
      console.warn(`[Scraper] HTTP ${status} — skusam znova (pokus ${attempt + 1})...`);
      await new Promise(r => setTimeout(r, 1200));
      return fetchDirectHtml(url, attempt + 1);
    }
    throw err;
  }
}

// Manualne nastavenie menu (ked scraping nefunguje)
async function setManualMenu(menu) {
  const { restaurant, date, key } = await getContext();
  if ((dateKey(menu.datum) || menu.date) !== date) throw new Error('Ručné menu musí mať dnešný dátum');
  if (!Array.isArray(menu.sekcie) || !menu.sekcie.length) throw new Error('Menu musí obsahovať sekcie');
  if (restaurant.id !== 'fantozzi' && !menu.pricing) throw new Error('Pre novú jedáleň importujte HTML alebo doplňte ceny položiek a pravidlá pricing do JSON');
  for (const section of menu.sekcie) {
    if (!['Polievka', 'Hlavné jedlo', 'Pizza', 'Dezert'].includes(section.nazov) || !Array.isArray(section.polozky)) throw new Error('Neplatná sekcia menu');
    const numbers = new Set();
    for (const p of section.polozky) {
      if (!Number.isInteger(p.cislo) || p.cislo < 1 || numbers.has(p.cislo) || typeof p.nazov !== 'string' || !p.nazov.trim()) throw new Error('Neplatná položka menu');
      numbers.add(p.cislo);
    }
  }
  Object.assign(menu, { restaurant, date, key });
  if (restaurant.id === 'lupo') applyLupoCharges(menu);
  if (manualStore) await manualStore.findOneAndUpdate({ key }, { $set: { menu } }, { upsert: true });
  try { await translateMenu(menu); } catch (e) { console.error('[Scraper] Preklad manualneho menu zlyhal:', e.message); }
  cache.data = menu;
  cache.timestamp = Date.now();
  console.log('[Scraper] Manualne menu nastavene');
}

// Vymaz cache (napr. kazde rano)
function clearCache() {
  cache.data = null;
  cache.timestamp = null;
  console.log('[Scraper] Cache vymazana');
}

// Diagnostika: cerstvy pokus o stiahnutie + parsovanie (bez cache).
// Vrati HTTP status / chybu a pocet najdenych sekcii — na overenie scrapovania.
async function debugFetch() {
  const { restaurant, date } = await getContext();
  const url = restaurant.id === 'fantozzi' ? config.restaurantUrl : restaurant.url;
  try {
    const response = await fetchHtml(url);
    const $ = cheerio.load(response.data);
    const days = restaurant.id === 'lupo' ? parseLupo(response.data) : restaurant.id === 'nevadzka' ? parseNevadzka(response.data) : null;
    const menu = days ? selectDay(days, date) : parseMenu($);
    if (!days && dateKey(menu.datum) !== date) menu.sekcie = [];
    return {
      ok: menu.sekcie.length > 0,
      url,
      availableDates: days ? Object.keys(days) : [dateKey(menu.datum)].filter(Boolean),
      httpStatus: response.status,
      source: response.menuSource,
      attempts: response.sourceAttempts,
      htmlLength: (response.data || '').length,
      sekcie: menu.sekcie.length,
      datum: menu.datum,
      nazvy: menu.sekcie.map(s => s.nazov)
    };
  } catch (err) {
    return {
      ok: false,
      url,
      httpStatus: err.response?.status || null,
      attempts: err.sourceAttempts,
      error: err.message
    };
  }
}

module.exports = { fetchMenu, setManualMenu, clearCache, debugFetch, configureRestaurants, fetchHtml, parseMenu, fetchAutomaticMenu };
