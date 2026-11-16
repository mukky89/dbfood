const axios = require('axios');
const config = require('./config');
const { getRestaurant } = require('./restaurants');
const { parseLupo, parseNevadzka } = require('./menu-parsers');

const LUPO_API = 'https://jedalenlupo.sk/wp-json/wp/v2/pages/14?_fields=content';
const READER = 'https://r.jina.ai/';

function createSourceLoader({ get = (...args) => axios.get(...args), readerEnabled = () => config.menuReaderEnabled, readerKey = () => config.menuReaderApiKey } = {}) {
  const pending = new Map();
  function load(url, direct) {
    // Externá služba dostáva iba tieto dve verejné URL; žiadne klientské URL ani prihlasovacie údaje.
    const id = ['lupo', 'nevadzka'].find(id => getRestaurant(id).url === url);
    if (!id) return direct(url);
    if (pending.has(id)) return pending.get(id);
    const task = retrieve(id, url, direct).finally(() => pending.delete(id));
    pending.set(id, task);
    return task;
  }
  async function retrieve(id, url, direct) {
    const attempts = [];
    const parser = id === 'lupo' ? parseLupo : parseNevadzka;
    const request = target => get(target, { timeout: 12000, maxRedirects: 5, maxContentLength: 2 * 1024 * 1024 });
    const candidates = id === 'lupo'
      ? [{ name: 'wordpress', request: () => request(LUPO_API), json: true }, { name: 'direct', request: () => direct(url) }]
      : [{ name: 'direct', request: () => direct(url) }];
    if (readerEnabled()) candidates.push({ name: 'reader', json: id === 'lupo', request: () => get(READER + (id === 'lupo' ? LUPO_API : url), {
      timeout: 35000, maxRedirects: 2, maxContentLength: 2 * 1024 * 1024,
      headers: { 'X-Return-Format': id === 'lupo' ? 'text' : 'html', 'X-No-Cache': 'true', 'X-Timeout': '25',
        ...(readerKey() ? { Authorization: 'Bearer ' + readerKey() } : {}) }
    }) });
    let lastError;
    for (const candidate of candidates) {
      try {
        const response = await candidate.request();
        let html = response.data;
        if (candidate.json) {
          const data = typeof html === 'string' ? JSON.parse(html) : html;
          html = data?.content?.rendered;
        }
        if (typeof html !== 'string') throw new Error('Zdroj nevrátil HTML menu');
        const days = parser(html);
        if (!Object.values(days).some(menu => menu.sekcie.some(s => s.nazov === 'Hlavné jedlo' && s.polozky.length))) throw new Error('Zdroj neobsahuje žiadne datované menu');
        attempts.push({ transport: candidate.name, httpStatus: response.status, valid: true });
        return { status: response.status, data: html, menuSource: { transport: candidate.name, url }, sourceAttempts: attempts };
      } catch (error) {
        attempts.push({ transport: candidate.name, httpStatus: error.response?.status || null, valid: false });
        lastError = error;
      }
    }
    const error = new Error('Automatické zdroje menu nie sú dostupné');
    error.response = lastError?.response;
    error.sourceAttempts = attempts;
    throw error;
  }
  return load;
}
module.exports = { createSourceLoader, LUPO_API, READER };
