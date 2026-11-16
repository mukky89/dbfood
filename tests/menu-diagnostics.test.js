const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkMenuSources } = require('../menu-diagnostics');
const fixture = id => fs.readFileSync(path.join(__dirname, 'fixtures', id + '.html'), 'utf8');
test('diagnostika načíta oba zdroje a zapíše dátumy, počty a ceny bez objednávok', async () => {
  const messages = [], urls = [];
  const results = await checkMenuSources({ now: new Date('2026-11-16T10:00:00Z'), log: message => messages.push(message),
    fetch: async url => { urls.push(url); return { status: 200, data: fixture(url.includes('lupo') ? 'lupo' : 'nevadzka') }; } });
  assert.equal(urls.length, 2); assert.equal(messages.length, 2);
  for (const result of results) { assert.equal(result.httpStatus, 200); assert.equal(result.todayFound, true); assert.equal(Object.keys(result.days).length, 5); }
  assert.deepEqual(results[0].days['2026-11-16'].mainPrices, [7.4,7.4,7.4,7.4]);
});
test('HTTP 403 jedného zdroja nezastaví kontrolu druhého', async () => {
  const results = await checkMenuSources({ log: () => {}, fetch: async url => {
    if (url.includes('menucka')) throw Object.assign(new Error('HTTP 403'), {response:{status:403}});
    return {status:200,data:fixture('lupo')};
  }});
  assert.equal(results[0].httpStatus,403); assert.equal(results[1].httpStatus,200);
});
