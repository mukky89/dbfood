const axios = require('axios');
const cheerio = require('cheerio');
const config = require('./config');

// Cache: ukladame menu aby sme nerobili request pri kazdom nacitani stranky
let cache = {
  data: null,
  timestamp: null,
  TTL: 30 * 60 * 1000 // 30 minut
};

async function fetchMenu() {
  // Ak mame platny cache, vratime ho
  if (cache.data && cache.timestamp && (Date.now() - cache.timestamp) < cache.TTL) {
    console.log('[Scraper] Vraciame menu z cache');
    return cache.data;
  }

  try {
    console.log('[Scraper] Stahujem menu z', config.restaurantUrl);

    const response = await fetchHtml(config.restaurantUrl);

    const $ = cheerio.load(response.data);
    const menu = parseMenu($);

    if (!menu.sekcie || menu.sekcie.length === 0) {
      console.warn('[Scraper] Stranka nacitana, ale nenasli sa ziadne sekcie menu (mozno sa zmenila struktura stranky).');
    }

    // Ulozime do cache
    cache.data = menu;
    cache.timestamp = Date.now();

    console.log('[Scraper] Menu uspesne nacitane, sekcie:', menu.sekcie.map(s => s.nazov).join(', '));
    return menu;

  } catch (err) {
    const status = err.response?.status;
    console.error('[Scraper] Chyba pri stahovani menu:', status ? `HTTP ${status}` : err.message);
    if (status === 403 || status === 429) {
      console.error('[Scraper] Fantozzi pravdepodobne blokuje automatizovane poziadavky (anti-bot). Zvaz manualne menu v admin zone.');
    }
    // Ak mame stary cache, vratime ho aj po vyprsani
    if (cache.data) {
      console.log('[Scraper] Vraciame stary cache po chybe');
      return cache.data;
    }
    return null;
  }
}

// Stiahne HTML so sadou hlaviciek imitujucich realny prehliadac (Chrome),
// aby sme znizili sancu na 403 z anti-bot WAF. Pri 403/429 skusi 1 retry.
async function fetchHtml(url, attempt = 1) {
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
    'Referer': 'https://www.fantozzi.sk/'
  };
  try {
    return await axios.get(url, { timeout: 12000, headers, maxRedirects: 5 });
  } catch (err) {
    const status = err.response?.status;
    if ((status === 403 || status === 429) && attempt < 2) {
      console.warn(`[Scraper] HTTP ${status} — skusam znova (pokus ${attempt + 1})...`);
      await new Promise(r => setTimeout(r, 1200));
      return fetchHtml(url, attempt + 1);
    }
    throw err;
  }
}

function parseMenu($) {
  const result = {
    datum: '',
    sekcie: []
  };

  // Datum z textu "Denné menu do 14:00: Utorok 28.04.2026"
  const datumText = $('#daily-menu b').first().text();
  const datumMatch = datumText.match(/(Pondelok|Utorok|Streda|Štvrtok|Piatok|Sobota|Nedeľa)\s+\d{1,2}\.\d{2}\.\d{4}/i);
  if (datumMatch) {
    result.datum = datumMatch[0].trim();
  } else {
    // Fallback: dnesny datum
    result.datum = new Date().toLocaleDateString('sk-SK', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // Parsujeme sekcie: h4 + nasledujuci ol.daily-menu-list
  $('#daily-menu h4').each((i, h4el) => {
    const $h4 = $(h4el);

    // Nazov sekcie - odstraname text price-tag
    const $h4clone = $h4.clone();
    $h4clone.find('.price-tag').remove();
    const nazov = $h4clone.text().trim();

    // Cena z .price-tag
    const cenaText = $h4.find('.price-tag').text().trim();
    const cena = cenaText || null;

    // Polozky z nasledujuceho ol
    const $ol = $h4.next('ol.daily-menu-list');
    const polozky = [];

    $ol.find('li').each((j, li) => {
      const $li = $(li);

      // Hmotnost z .daily-menu-weight
      const hmotnost = $li.find('.daily-menu-weight').text().trim();

      // Nazov polozky - odstraname span s hmotnostou
      const $liclone = $li.clone();
      $liclone.find('.daily-menu-weight').remove();
      const nazovPolozky = $liclone.text().trim();

      if (nazovPolozky) {
        // Cislo polozky - bud z atributu ol[start] alebo pocitame
        const olStart = parseInt($ol.attr('start') || '1', 10);
        const cislo = olStart + j;

        polozky.push({
          cislo,
          nazov: nazovPolozky,
          hmotnost
        });
      }
    });

    // Pridame sekciu iba ak ma polozky
    if (polozky.length > 0) {
      result.sekcie.push({ nazov, cena, polozky });
    }
  });

  return result;
}

// Manualne nastavenie menu (ked scraping nefunguje)
function setManualMenu(menu) {
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
  try {
    const response = await fetchHtml(config.restaurantUrl);
    const $ = cheerio.load(response.data);
    const menu = parseMenu($);
    return {
      ok: true,
      url: config.restaurantUrl,
      httpStatus: response.status,
      htmlLength: (response.data || '').length,
      sekcie: menu.sekcie.length,
      datum: menu.datum,
      nazvy: menu.sekcie.map(s => s.nazov)
    };
  } catch (err) {
    return {
      ok: false,
      url: config.restaurantUrl,
      httpStatus: err.response?.status || null,
      error: err.message
    };
  }
}

module.exports = { fetchMenu, setManualMenu, clearCache, debugFetch };
