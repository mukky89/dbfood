const axios = require('axios');
const config = require('./config');

// DeepL Free API — https://developers.deepl.com/docs
// Zdarma do 500 000 znakov/mesiac. Vyzaduje bezplatny kluc v env DEEPL_KEY.
const DEEPL_URL = 'https://api-free.deepl.com/v2/translate';

// Cielove jazyky: kod v menu (nazov_en/nazov_fr) -> DeepL kod cieloveho jazyka
const TARGETS = [
  ['en', 'EN-GB'],
  ['fr', 'FR']
];

// Preloz pole textov zo SK do cieloveho jazyka cez DeepL (jedna davka).
// Vrati pole prelozenych textov v rovnakom poradi, alebo null pri chybe.
async function translateBatch(texts, targetLang) {
  if (!texts.length) return [];
  try {
    const resp = await axios.post(DEEPL_URL, {
      text: texts,
      source_lang: 'SK',
      target_lang: targetLang
    }, {
      headers: {
        'Authorization': `DeepL-Auth-Key ${config.deeplKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 12000
    });
    return (resp.data.translations || []).map(t => t.text);
  } catch (err) {
    const status = err.response?.status;
    console.error('[Translator] DeepL chyba:', status ? `HTTP ${status}` : err.message);
    if (status === 403) console.error('[Translator] Neplatny alebo chybajuci DEEPL_KEY.');
    if (status === 456) console.error('[Translator] Vycerpany mesacny limit DeepL Free.');
    return null;
  }
}

// Obohati menu o preklady: k sekciam/polozkam/datumu prida nazov_en/nazov_fr
// (resp. datum_en/datum_fr). Preklad prebehne raz pri stiahnuti noveho menu,
// vysledok sa cachuje spolu s menu. Pri chybe/nezadanom kluci vrati menu bez zmien.
async function translateMenu(menu) {
  if (!menu || !menu.sekcie || !menu.sekcie.length) return menu;
  if (!config.deeplKey) {
    menu.langs = [];
    return menu;
  }

  // Poskladame plochy zoznam textov + settery, aby sme prelozili vsetko naraz.
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
  for (const [code, deeplLang] of TARGETS) {
    const out = await translateBatch(texts, deeplLang);
    if (out && out.length === texts.length) {
      out.forEach((t, i) => setters[i](code, t));
      langs.push(code);
    }
  }

  menu.langs = langs;
  if (langs.length) console.log('[Translator] Menu prelozene do:', langs.join(', '));
  return menu;
}

module.exports = { translateMenu };
