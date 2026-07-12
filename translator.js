const axios = require('axios');
const config = require('./config');

// MyMemory Translation API — https://mymemory.translated.net/doc/spec.php
// Zdarma bez kluca: ~5000 slov/den (anonymne, podla IP). S e-mailom v parametri
// `de` sa limit zdvihne na ~50 000 slov/den — nastav MYMEMORY_EMAIL v env.
// MyMemory neprekladá dávkovo — jeden text = jeden GET request. Objem menu je
// maly (~15 poloziek), takze prelozime kazdy text zvlast (paralelne v ramci jazyka).
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

// Cielove jazyky: kod v menu (nazov_en/nazov_fr) -> MyMemory langpair
const TARGETS = [
  ['en', 'sk|en'],
  ['fr', 'sk|fr']
];

// Preloz jeden text (SK -> cielovy jazyk). Vrati preklad, alebo null pri chybe/limite.
async function translateOne(text, langpair) {
  if (!text || !text.trim()) return text;
  try {
    const params = { q: text, langpair };
    if (config.mymemoryEmail) params.de = config.mymemoryEmail;
    const resp = await axios.get(MYMEMORY_URL, { params, timeout: 12000 });
    const data = resp.data || {};
    const translated = data.responseData?.translatedText;
    const status = data.responseStatus;

    // MyMemory pri prekroceni limitu vracia varovanie priamo v texte (napr.
    // "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY").
    if (!translated || /MYMEMORY WARNING|QUOTA EXCEEDED|INVALID LANGUAGE/i.test(translated)) {
      console.error('[Translator] MyMemory limit/chyba:', data.responseDetails || translated || status);
      return null;
    }
    if (status && String(status) !== '200') {
      console.error('[Translator] MyMemory status:', status, data.responseDetails || '');
      return null;
    }
    return translated;
  } catch (err) {
    console.error('[Translator] MyMemory chyba:', err.response?.status || err.message);
    return null;
  }
}

// Obohati menu o preklady: k sekciam/polozkam/datumu prida nazov_en/nazov_fr
// (resp. datum_en/datum_fr). Preklad prebehne raz pri stiahnuti noveho menu,
// vysledok sa cachuje spolu s menu. Jazyk sa prida do menu.langs iba ak sa
// podarilo prelozit vsetky texty; inak sa vynecha (fallback na SK).
async function translateMenu(menu) {
  if (!menu || !menu.sekcie || !menu.sekcie.length) return menu;

  // Poskladame plochy zoznam textov + settery.
  const texts = [];
  const setters = [];
  if (menu.datum) {
    texts.push(menu.datum);
    setters.push((lang, t) => { menu['datum_' + lang] = t; });
  }
  menu.sekcie.forEach(sekcia => {
    texts.push(sekcia.nazov);
    setters.push((lang, t) => { sekcia['nazov_' + lang] = t; });
    (sekcia.polozky || []).forEach(p => {
      texts.push(p.nazov);
      setters.push((lang, t) => { p['nazov_' + lang] = t; });
    });
  });

  const langs = [];
  for (const [code, langpair] of TARGETS) {
    const out = await Promise.all(texts.map(t => translateOne(t, langpair)));
    if (out.every(t => t)) {
      out.forEach((t, i) => setters[i](code, t));
      langs.push(code);
    } else {
      console.warn(`[Translator] Preklad do ${code} neuplny — vynechavam (fallback SK).`);
    }
  }

  menu.langs = langs;
  if (langs.length) console.log('[Translator] Menu prelozene do:', langs.join(', '));
  return menu;
}

module.exports = { translateMenu };
