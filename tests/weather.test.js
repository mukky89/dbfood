const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/weather-widget.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
function widget(fetch) {
  const nodes = Object.fromEntries(['hdr-weather', 'hw-icon', 'hw-temp', 'hw-desc'].map(id => [id, {
    textContent: '', title: '', dataset: {}, attrs: {}, events: {},
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this.events[k] = fn; }
  }]));
  const timers = new Map(), events = {}; let next = 0;
  vm.runInNewContext(source, {
    document: { readyState: 'complete', getElementById: id => nodes[id] },
    window: { addEventListener: (k, fn) => { events[k] = fn; } },
    fetch, AbortController, Date, Number,
    setTimeout: (fn, ms) => { timers.set(++next, { fn, ms }); return next; },
    clearTimeout: id => timers.delete(id)
  });
  return { nodes, timers, events, root: nodes['hdr-weather'], retry: () => nodes['hdr-weather'].events.click() };
}
const response = (temperature = 17.4, code = 3) => ({ ok: true, json: async () => ({ current: { temperature_2m: temperature, weather_code: code } }) });
test('loads immediately, displays rounded temperature and schedules a 15-minute refresh', async () => {
  const w = widget(async () => response()); await settle();
  assert.equal(w.nodes['hw-temp'].textContent, '17°C');
  assert.equal(w.nodes['hw-desc'].textContent, 'Zamračené');
  assert.equal(w.root.dataset.weatherState, 'ready');
  assert.equal(w.root.attrs['aria-busy'], 'false');
  assert.deepEqual([...w.timers.values()].map(t => t.ms), [900000]);
});
test('rejects HTTP failures, exposes retry and recovers after a click', async () => {
  let calls = 0;
  const w = widget(async () => ++calls === 1 ? { ok: false, status: 429 } : response(0, 0)); await settle();
  assert.equal(w.root.dataset.weatherState, 'unavailable');
  assert.deepEqual([...w.timers.values()].map(t => t.ms), [60000]);
  await w.retry();
  assert.equal(w.nodes['hw-temp'].textContent, '0°C');
  assert.equal(w.root.dataset.weatherState, 'ready');
  assert.equal(w.timers.size, 1);
});
test('a failed refresh retains the last reading and clearly marks it stale', async () => {
  let calls = 0; const w = widget(async () => { if (++calls > 1) throw new Error('offline'); return response(-3.6, 73); });
  await settle(); await w.retry();
  assert.equal(w.nodes['hw-temp'].textContent, '-4°C');
  assert.equal(w.root.dataset.weatherState, 'stale');
  assert.equal(w.nodes['hw-desc'].textContent, 'Neaktuálne');
  assert.match(w.root.attrs['aria-label'], /Posledný údaj/);
});
test('a hanging request aborts after eight seconds and concurrent clicks do not duplicate requests', async () => {
  let calls = 0;
  const w = widget((_, { signal }) => { calls++; return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))); });
  await w.retry(); assert.equal(calls, 1);
  const timeout = [...w.timers.values()].find(t => t.ms === 8000); assert.ok(timeout); timeout.fn(); await settle();
  assert.equal(w.root.dataset.weatherState, 'unavailable'); assert.equal(w.root.attrs['aria-busy'], 'false');
});
test('rejects missing, null and non-finite values instead of displaying fake temperatures', async () => {
  for (const data of [null, {}, { current: { temperature_2m: null, weather_code: 3 } }, { current: { temperature_2m: Infinity, weather_code: 3 } }, { current: { temperature_2m: 12 } }]) {
    const w = widget(async () => ({ ok: true, json: async () => data })); await settle();
    assert.equal(w.root.dataset.weatherState, 'unavailable');
    assert.equal(w.nodes['hw-temp'].textContent, '–°C');
  }
});
test('retries on restored connectivity and does not depend on the main page initialization', async () => {
  let calls = 0; const w = widget(async () => { if (++calls === 1) throw new Error('offline'); return response(); });
  await settle(); await w.events.online(); assert.equal(w.root.dataset.weatherState, 'ready');
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /<script src="\/weather-widget.js"><\/script>/);
  assert.doesNotMatch(html, /await loadOrders\(\);[\s\S]{0,100}loadWeather\(\)/);
});
