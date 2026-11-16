const cheerio = require('cheerio');
const { todaySK } = require('./restaurants');
const { LUPO_PREPARATION_FEE, LUPO_PRICING_NOTE } = require('./public/menu-pricing');
function applyLupoCharges(menu) {
  if (menu.pricing) menu.pricing = { ...menu.pricing, preparationFee: LUPO_PREPARATION_FEE };
  menu.pricingNote = LUPO_PRICING_NOTE;
  return menu;
}
const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
function dateKey(text) {
  const m = text.match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
function money(text) {
  const m = clean(text).match(/(\d+[,.]\d{2})\s*€/);
  return m ? Number(m[1].replace(',', '.')) : null;
}
function item(text, cislo, cena = null) {
  let nazov = clean(text), hmotnost = '';
  const weight = nazov.match(/^(\d+(?:[,.]\d+)?\s*(?:kg|ml|ks|g|l)|1\/4)\s*/i);
  if (weight) { hmotnost = weight[1]; nazov = nazov.slice(weight[0].length); }
  const allergens = nazov.match(/\s+(\d{1,2}(?:\s*,\s*\d{1,2})*,?)$/);
  if (allergens) { hmotnost += ` (${allergens[1].replace(/,$/, '')})`; nazov = nazov.slice(0, allergens.index).trim(); }
  return { cislo, nazov, hmotnost: hmotnost.trim(), cena };
}
function day(datum) { return { datum, date: dateKey(datum), sekcie: [], informational: [] }; }
function section(menu, nazov) {
  let s = menu.sekcie.find(s => s.nazov === nazov);
  if (!s) { s = { nazov, cena: null, polozky: [] }; menu.sekcie.push(s); }
  return s;
}
function parseLupo(html) {
  const $ = cheerio.load(html), days = {};
  let current, category = '';
  $('h2, .elementor-price-list').each((_, el) => {
    const node = $(el), text = clean(node.text());
    if (node.is('h2')) {
      if (dateKey(text)) { current = day(text); days[current.date] = current; }
      category = text;
      return;
    }
    if (!current) return;
    node.find('li').each((_, li) => {
      const title = clean($(li).find('.elementor-price-list-title').text());
      if (!title) return;
      const cena = money($(li).find('.elementor-price-list-price').text());
      const type = /^Polievka$/i.test(category) ? 'Polievka' : /^Menu\s*\(/i.test(category) ? 'Hlavné jedlo' : /^Dezert/i.test(category) ? 'Dezert' : null;
      if (type) {
        const s = section(current, type);
        s.polozky.push(item(title, s.polozky.length + 1, cena));
      } else {
        current.informational.push({ category, text: title, cena });
      }
    });
  });
  for (const m of Object.values(days)) {
    m.pricing = { soup: m.informational.find(i => /Polievka samostatne/i.test(i.text))?.cena ?? null, soupIncluded: true, withoutSoupDiscount: m.informational.find(i => /Menu bez polievky/i.test(i.text))?.cena ?? null };
    m.sideOptions = m.informational.filter(i => /^Prílohy$/i.test(i.category)).flatMap(i => item(i.text, 0).nazov.split('/'));
    for (const p of section(m, 'Hlavné jedlo').polozky) if (/\bpríloha\b/i.test(p.nazov)) p.sideOptions = m.sideOptions;
    applyLupoCharges(m);
  }
  return days;
}
function parseNevadzka(html) {
  const $ = cheerio.load(html), days = {};
  let current, minutes = false;
  const mainPrices = {};
  const priceBlock = $('.continuing-offer-block').filter((_, el) => /Ceny obedového menu/.test($(el).text()));
  const priceText = priceBlock.html() || '';
  const lines = cheerio.load(priceText.replace(/<br\s*\/?\s*>/gi, '\n')).text().split('\n').map(clean);
  const pricing = { soup: null, soupWithMain: null };
  for (const line of lines) {
    const roman = line.match(/Hlavn[eé]\s+jedlo\s*(IV|III|II|I)\./i);
    if (roman) mainPrices[roman[1]] = money(line);
    if (/Polievka samostatne/i.test(line)) pricing.soup = money(line);
    if (/Polievka k hlavnemu jedlu/i.test(line)) pricing.soupWithMain = money(line);
  }
  $('.day-title, .col-xs-10.col-sm-10').each((_, el) => {
    const node = $(el), text = clean(node.text());
    if (node.hasClass('day-title')) {
      if (!dateKey(text)) { current = null; return; }
      current = day(text); current.pricing = { ...pricing }; days[current.date] = current; minutes = false; return;
    }
    if (!current || !text) return;
    if (/^Minútky\s*:/i.test(text)) { minutes = true; return; }
    const roman = text.match(/^(IV|III|II|I)\.\s*/);
    if (roman) {
      const s = section(current, 'Hlavné jedlo');
      s.polozky.push(item(text.slice(roman[0].length), ['I','II','III','IV'].indexOf(roman[1]) + 1, mainPrices[roman[1]] ?? null));
    } else if (/^\d+[,.]\d+\s*l\b/i.test(text)) {
      const s = section(current, 'Polievka'); s.polozky.push(item(text, s.polozky.length + 1));
    } else if (minutes) {
      // Zdroj neuvádza cenu minútok. Nevymýšľame ju a neponúkame neocenené jedlo na platbu.
      current.informational.push({ category: 'Minútky — cenu overiť telefonicky', text, cena: null });
    }
  });
  return days;
}
function selectDay(days, date = todaySK()) {
  return days[date] || { datum: date, date, sekcie: [], informational: [], unavailable: true };
}
module.exports = { parseLupo, parseNevadzka, selectDay, dateKey, money, applyLupoCharges };
