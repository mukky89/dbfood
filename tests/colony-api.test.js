'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createColonyRouter, dayInBratislava, monday, seedForDay, RUN_TTL } = require('../colony-api');
const { MemoryColonyStore } = require('../colony-store');
const { replay } = require('../public/colony-challenge');

async function fixture(t, options = {}) {
  let time = Date.parse('2026-10-05T10:00:00Z');
  const store = options.store || new MemoryColonyStore(), app = express();
  app.use('/api/colony', createColonyRouter({ store, now: () => time, logger: { error() {} }, ...options }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/colony`;
  function client() {
    let cookie = '';
    return async (path = '', body, extra = {}) => {
      const response = await fetch(url + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(extra.headers || {}) },
        ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, body: await response.json(), headers: response.headers };
    };
  }
  return { store, client, advance: ms => { time += ms; }, setTime: value => { time = Date.parse(value); } };
}

test('Bratislava challenge dates and Monday boundaries respect local midnight and DST', () => {
  assert.equal(dayInBratislava(Date.parse('2026-10-04T22:30:00Z')), '2026-10-05');
  assert.equal(dayInBratislava(Date.parse('2026-10-25T22:30:00Z')), '2026-10-25');
  assert.equal(dayInBratislava(Date.parse('2026-10-25T23:30:00Z')), '2026-10-26');
  assert.equal(monday('2026-10-04'), '2026-09-28');
  assert.equal(monday('2026-10-05'), '2026-10-05');
  assert.equal(seedForDay('2026-10-05'), seedForDay('2026-10-05'));
  assert.notEqual(seedForDay('2026-10-05'), seedForDay('2026-10-06'));
});

test('empty leaderboard has no invented players or new identity and rejects invalid periods', async t => {
  const { client } = await fixture(t), request = client();
  const response = await request();
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.entries, []);
  assert.equal(response.body.me, null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal((await request('?period=all')).status, 400);
});

test('a run creates a private browser cookie; subsequent reads and starts preserve that identity', async t => {
  const { client } = await fixture(t), request = client();
  const start = await request('/runs', {});
  assert.equal(start.status, 201);
  const cookie = start.headers.get('set-cookie');
  assert.match(cookie, /colony_player=[a-f0-9]{64}/);
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/api\/colony/);
  assert.equal((await request()).headers.get('set-cookie'), null);
  assert.equal((await request('/runs', {})).headers.get('set-cookie'), null);
});

test('a slow anonymous leaderboard response cannot overwrite the identity of a concurrent first run', async t => {
  const store = new MemoryColonyStore(), board = store.leaderboard.bind(store);
  let releaseRead, enteredRead;
  const blocked = new Promise(resolve => { releaseRead = resolve; });
  const entered = new Promise(resolve => { enteredRead = resolve; });
  store.leaderboard = async (...args) => { enteredRead(); await blocked; return board(...args); };
  const f = await fixture(t, { store, replay: () => ({ score: 55, delivered: 5 }) }), request = f.client();
  const delayedRead = request();
  await entered;
  const start = await request('/runs', { name: 'Prvý hráč' });
  assert.equal(start.status, 201); assert.ok(start.headers.get('set-cookie'));
  releaseRead();
  const oldRead = await delayedRead;
  assert.equal(oldRead.headers.get('set-cookie'), null);
  assert.equal(oldRead.body.me, null);
  f.advance(180000);
  const finish = await request(`/runs/${start.body.id}/finish`, { actions: [] });
  assert.equal(finish.status, 200); assert.equal(finish.body.score, 55);
  assert.equal((await request()).body.me.score, 55);
});

test('server replays a complete timed run and rejects spoofed scores, another browser and repeated finishes', async t => {
  const f = await fixture(t), player = f.client(), stranger = f.client();
  const start = await player('/runs', { name: '  Marek\u0000  ' });
  assert.equal(start.status, 201); assert.equal(start.body.duration, 180);
  const path = `/runs/${start.body.id}/finish`;
  assert.equal((await stranger(path, { actions: [] })).status, 404);
  const early = await player(path, { actions: [] });
  assert.equal(early.status, 425); assert.equal(early.body.remainingMs, 180000);
  f.advance(180000);
  assert.equal((await player(path, { actions: [], score: 999999 })).status, 400);
  const result = await player(path, { actions: [] });
  assert.equal(result.status, 200);
  const expected = replay(start.body.seed, []);
  assert.equal(result.body.score, expected.score);
  assert.equal(result.body.delivered, expected.delivered);
  assert.equal(result.body.personalBest, expected.score);
  assert.equal(result.body.improved, true);
  assert.equal((await player(path, { actions: [] })).status, 409);
  const board = await player();
  assert.deepEqual(board.body.entries, [{ rank: 1, name: 'Marek', score: expected.score, delivered: expected.delivered, isMe: true }]);
  assert.deepEqual(board.body.me, board.body.entries[0]);
  assert.equal((await stranger()).body.entries[0].isMe, false);
  assert.equal((await stranger()).body.me, null);
  assert.ok(!JSON.stringify(board.body).includes('playerId'));
});

test('invalid action logs cannot publish results; a valid retry remains possible', async t => {
  const f = await fixture(t), player = f.client();
  const start = await player('/runs', { name: 'Hráč' }), path = `/runs/${start.body.id}/finish`;
  f.advance(180000);
  for (const actions of [[{ frame: 0, type: 'score', score: 999 }], [{ frame: 1800, type: 'food', food: 'bread', x: 500 }], Array.from({ length: 121 }, () => ({}))]) {
    const response = await player(path, { actions });
    assert.equal(response.status, 400); assert.equal(response.body.code, 'ACTIONS');
  }
  assert.deepEqual((await player()).body.entries, []);
  assert.equal((await player(path, { actions: [] })).status, 200);
});

test('daily best never decreases and weekly score sums only best daily results', async t => {
  let computed = { score: 100, delivered: 10 };
  const f = await fixture(t, { replay: () => computed }), player = f.client();
  async function run() {
    const started = await player('/runs', { name: 'Nora' });
    f.advance(180000);
    return player(`/runs/${started.body.id}/finish`, { actions: [] });
  }
  assert.equal((await run()).body.personalBest, 100);
  computed = { score: 40, delivered: 4 };
  const lower = await run(); assert.equal(lower.body.personalBest, 100); assert.equal(lower.body.improved, false);
  computed = { score: 130, delivered: 13 };
  assert.equal((await run()).body.personalBest, 130);
  f.setTime('2026-10-06T10:00:00Z'); computed = { score: 50, delivered: 5 };
  await run();
  assert.equal((await player()).body.me.score, 50);
  const week = (await player('?period=week')).body;
  assert.equal(week.startDay, '2026-10-05'); assert.equal(week.me.score, 180); assert.equal(week.me.delivered, 18);
  f.setTime('2026-10-12T10:00:00Z');
  assert.deepEqual((await player('?period=week')).body.entries, []);
});

test('a run spanning Bratislava midnight belongs to its original day and seed', async t => {
  const f = await fixture(t, { replay: () => ({ score: 25, delivered: 2 }) }), player = f.client();
  f.setTime('2026-10-05T21:59:00Z');
  const start = await player('/runs', { name: 'Noc' });
  f.advance(180000);
  const result = await player(`/runs/${start.body.id}/finish`, { actions: [] });
  assert.equal(result.body.day, '2026-10-05');
  assert.equal((await player()).body.me, null);
  assert.equal((await player('?period=week')).body.me.score, 25);
});

test('expired tokens, huge bodies, invalid JSON and foreign origins are rejected', async t => {
  const f = await fixture(t), player = f.client();
  const start = await player('/runs', { name: 'Meno' });
  f.advance(RUN_TTL + 1);
  assert.equal((await player(`/runs/${start.body.id}/finish`, { actions: [] })).status, 404);
  assert.equal(f.store.runs.size, 0);
  assert.equal((await player('/runs', JSON.stringify({ name: 'x'.repeat(70000) }))).status, 413);
  assert.equal((await player('/runs', '{bad')).status, 400);
  assert.equal((await player('/runs', {}, { headers: { origin: 'https://different.example' } })).status, 403);
  assert.equal((await player('/runs', { name: {} })).status, 400);
});

test('start rate limit survives a repeated cookie and recovers after its window', async t => {
  const f = await fixture(t), player = f.client();
  for (let i = 0; i < 6; i++) assert.equal((await player('/runs', {})).status, 201);
  assert.equal((await player('/runs', {})).status, 429);
  f.advance(600001);
  assert.equal((await player('/runs', {})).status, 201);
});

test('unavailable stores fail quickly and failed persistence permits retry', async t => {
  const store = new MemoryColonyStore();
  let available = false, failures = 1;
  store.ready = () => available;
  const save = store.saveBest.bind(store);
  store.saveBest = async (...args) => { if (failures-- > 0) throw new Error('offline'); return save(...args); };
  const f = await fixture(t, { store, replay: () => ({ score: 55, delivered: 5 }) }), player = f.client();
  assert.equal((await player()).status, 503);
  available = true;
  const start = await player('/runs', {}), path = `/runs/${start.body.id}/finish`;
  f.advance(180000);
  assert.equal((await player(path, { actions: [] })).status, 503);
  assert.equal((await player(path, { actions: [] })).status, 200);
});

test('concurrent submissions only claim a run once', async t => {
  const store = new MemoryColonyStore(), save = store.saveBest.bind(store);
  store.saveBest = async (...args) => { await new Promise(resolve => setTimeout(resolve, 25)); return save(...args); };
  const f = await fixture(t, { store, replay: () => ({ score: 80, delivered: 8 }) }), player = f.client();
  const start = await player('/runs', {}), path = `/runs/${start.body.id}/finish`;
  f.advance(180000);
  const responses = await Promise.all([player(path, { actions: [] }), player(path, { actions: [] })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal((await player()).body.me.score, 80);
});

test('own rank is returned even when the player is outside the twenty visible entries', async () => {
  const store = new MemoryColonyStore();
  for (let i = 0; i < 25; i++) await store.saveBest({ day: '2026-10-05', playerId: `p${i}`, name: `Hráč ${i}` }, { score: 100 - i, delivered: 10 }, 0);
  const board = await store.leaderboard('2026-10-05', '2026-10-05', 'p24');
  assert.equal(board.entries.length, 20); assert.equal(board.me.rank, 25); assert.equal(board.me.score, 76);
});
