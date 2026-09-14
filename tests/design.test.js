const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

// Execute the production appearance functions/routes with only Mongo replaced.
// This avoids booting cron, notification/email jobs or connecting to production.
function appearance(saved = 'rc') {
  let doc = { tema: saved, designVersion: 2, futuristicky: false }, writes = 0;
  const routes = {}, db = {
    findOne: async () => ({ ...doc }),
    findOneAndUpdate: async (_, update) => { writes++; doc = { ...doc, ...update.$set }; return doc; }
  };
  const sandbox = { NastaveniaVzhlad: db, config: { adminPassword: 'test-only' }, app: {
    get: (url, handler) => { routes['GET ' + url] = handler; },
    post: (url, handler) => { routes['POST ' + url] = handler; }
  } };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf('const PLATNE_TEMY'), source.indexOf('async function loadOrders')), sandbox);
  vm.runInContext(source.slice(source.indexOf("app.get('/api/design'"), source.indexOf('// POST /api/qr')), sandbox);
  return {
    sandbox, db, writes: () => writes, doc: () => doc,
    async request(method, body = {}) {
      let status = 200, data;
      const res = { status: code => { status = code; return res; }, json: value => { data = value; } };
      await routes[method === 'GET' ? 'GET /api/design' : 'POST /api/admin/design']({ body }, res);
      return { status, data };
    }
  };
}

test('adding blocks does not migrate or replace the current theme', async () => {
  for (const theme of ['rc', 'classic', 'futuristic', 'spiderman', 'blocks']) {
    const api = appearance(theme);
    assert.equal((await api.request('GET')).data.theme, theme);
    assert.equal(api.writes(), 0);
  }
});
test('admin can persist blocks, reload settings and return to another theme', async () => {
  const api = appearance();
  assert.equal((await api.request('GET')).data.theme, 'rc');
  const saved = await api.request('POST', { adminPass: 'test-only', theme: 'blocks' });
  assert.equal(saved.status, 200); assert.equal(saved.data.theme, 'blocks');
  assert.equal(api.doc().tema, 'blocks'); assert.equal(api.doc().designVersion, 2);
  vm.runInContext('clearVzhladCache()', api.sandbox);
  assert.equal((await api.request('GET')).data.theme, 'blocks');
  await api.request('POST', { adminPass: 'test-only', theme: 'classic' });
  assert.equal((await api.request('GET')).data.theme, 'classic');
});
test('unauthorized and unknown theme changes leave saved settings untouched', async () => {
  const api = appearance();
  assert.equal((await api.request('POST', { adminPass: 'wrong', theme: 'blocks' })).status, 401);
  assert.equal((await api.request('POST', { adminPass: 'test-only', theme: 'unknown' })).status, 400);
  assert.equal(api.writes(), 0); assert.equal((await api.request('GET')).data.theme, 'rc');
});
test('database failure does not report a successfully saved theme', async () => {
  const api = appearance();
  api.db.findOneAndUpdate = async () => { throw new Error('DB unavailable'); };
  assert.equal((await api.request('POST', { adminPass: 'test-only', theme: 'blocks' })).status, 500);
  assert.equal(api.doc().tema, 'rc');
});
test('legacy boolean still maps to futuristic and classic', async () => {
  const api = appearance();
  const res = await api.request('POST', { adminPass: 'test-only', futuristic: true });
  assert.equal(res.data.theme, 'futuristic'); assert.equal(res.data.futuristic, true);
});
test('early load, runtime switch and admin selection all support blocks', () => {
  for (const name of ['TEMY', 'APP_THEMES']) {
    assert.match(html.match(new RegExp('(?:var|const) ' + name + ' = \\[([^\\]]+)\\]'))[1], /'blocks'/);
  }
  assert.match(html, /data-theme="blocks" onclick="saveDesignConfig\('blocks'\)"/);
  assert.match(html, /classList.toggle\('theme-blocks',\s+theme === 'blocks'\)/);
  assert.ok(html.indexOf('/blocks-engine.js') < html.indexOf('/blocks-theme.js'));
  for (const id of ['menu-content', 'order-form', 'summary-content', 'orders-list', 'submit-btn', 'qr-btn']) {
    assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1);
  }
});
