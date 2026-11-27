const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { registerWaferClosure } = require('../wafer-closure');

test('ukončenie obedov platí pre verejnú stránku, menu aj zápis zo starej karty', async t => {
  let tema = 'oblatky';
  let writes = 0;
  const app = express();
  registerWaferClosure(app, async () => ({ tema }), () => '09:55');
  app.get('/admin', (_, res) => res.send('správa'));
  app.get('/api/menu', (_, res) => res.json({ menu: ['obed'] }));
  app.post('/api/orders', (_, res) => { writes++; res.sendStatus(201); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port;
  for (const path of ['/', '/index.html']) {
    const page = await (await fetch(url + path)).text();
    assert.match(page, /https:\/\/oblatky\.mmucka\.xyz\/#ponuka/);
    assert.doesNotMatch(page, /id="order-form"|id="menu-card"/);
  }
  assert.equal((await (await fetch(url + '/api/status')).json()).open, false);
  assert.equal((await (await fetch(url + '/api/menu')).json()).menu, null);
  assert.equal((await fetch(url + '/api/orders', { method: 'POST' })).status, 403);
  assert.equal(writes, 0);
  assert.equal(await (await fetch(url + '/admin')).text(), 'správa');
  tema = 'classic';
  assert.deepEqual((await (await fetch(url + '/api/menu')).json()).menu, ['obed']);
  assert.equal((await fetch(url + '/api/orders', { method: 'POST' })).status, 201);
  assert.equal(writes, 1);
});
