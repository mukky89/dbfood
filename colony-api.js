'use strict';

const express = require('express');
const crypto = require('node:crypto');
const challenge = require('./public/colony-challenge');
const RUN_TTL = 30 * 60 * 1000;
const COOKIE = 'colony_player';
const VERSION = 1;

function dayInBratislava(now) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  const part = name => parts.find(item => item.type === name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function monday(day) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
function seedForDay(day) { return crypto.createHash('sha256').update(`colony-v${VERSION}:${day}`).digest().readUInt32LE(0); }
function fail(res, status, code, error, extra) { return res.status(status).json({ ok: false, code, error, ...extra }); }
function exactBody(body, fields) {
  return body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).every(key => fields.includes(key));
}

function createColonyRouter({ store, now = Date.now, replay = challenge.replay, logger = console, rateLimits = true }) {
  const router = express.Router(), buckets = new Map();
  const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  function allow(key, limit, ms) {
    if (!rateLimits) return true;
    const time = now();
    for (const [id, entry] of buckets) if (entry.until <= time) buckets.delete(id);
    let entry = buckets.get(key);
    if (!entry) {
      if (buckets.size >= 10000) return false;
      buckets.set(key, entry = { count: 0, until: time + ms });
    }
    return ++entry.count <= limit;
  }
  router.use(express.json({ limit: '64kb', strict: true }));
  router.use(wrap(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!store.ready()) return fail(res, 503, 'UNAVAILABLE', 'Rebríček je dočasne nedostupný. Skúste to neskôr.');
    const cookies = (req.headers.cookie || '').split(';').map(value => value.trim());
    const cookie = cookies.find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    // Reading a leaderboard must never replace a cookie minted by an overlapping
    // run-start request. Create the browser identity only after a run is created.
    req.colonyPlayer = /^[a-f0-9]{64}$/.test(cookie || '') ? cookie : null;
    // Use Express's trusted IP policy, never an arbitrary forwarded address.
    req.colonyIP = req.ip || 'unknown';
    if (req.method === 'POST') {
      if (req.get('origin')) {
        let origin;
        try { origin = new URL(req.get('origin')); } catch { return fail(res, 403, 'ORIGIN', 'Požiadavka musí pochádzať z tejto stránky.'); }
        if (origin.host !== req.get('host')) return fail(res, 403, 'ORIGIN', 'Požiadavka musí pochádzať z tejto stránky.');
      }
      if (!req.is('application/json')) return fail(res, 415, 'CONTENT_TYPE', 'Očakáva sa JSON.');
    }
    await store.prune(now());
    next();
  }));
  function limit(req, res, kind, maximum, window, ipMaximum) {
    if (allow(`${kind}:ip:${req.colonyIP}`, ipMaximum, window) &&
        (!req.colonyPlayer || allow(`${kind}:player:${req.colonyPlayer}`, maximum, window))) return true;
    res.set('Retry-After', String(Math.ceil(window / 1000)));
    fail(res, 429, 'RATE_LIMIT', 'Príliš veľa pokusov. Pred ďalším pokusom chvíľu počkajte.');
    return false;
  }
  router.get('/', wrap(async (req, res) => {
    if (!limit(req, res, 'board', 60, 60000, 500)) return;
    const period = req.query.period || 'day';
    if (!['day', 'week'].includes(period)) return fail(res, 400, 'PERIOD', 'Vyberte deň alebo týždeň.');
    const day = dayInBratislava(now()), startDay = period === 'week' ? monday(day) : day;
    res.json({ ok: true, period, day, startDay, ...await store.leaderboard(startDay, day, req.colonyPlayer) });
  }));
  router.post('/runs', wrap(async (req, res) => {
    if (!limit(req, res, 'start', 6, 600000, 120)) return;
    if (!exactBody(req.body, ['name']) || (req.body.name !== undefined && typeof req.body.name !== 'string'))
      return fail(res, 400, 'BODY', 'Neplatné meno hráča.');
    const name = (req.body.name || '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 30) || 'Pozorovateľ';
    const newIdentity = !req.colonyPlayer;
    if (newIdentity) {
      req.colonyPlayer = crypto.randomBytes(32).toString('hex');
      // Include the first run in this identity's normal per-browser limit.
      allow(`start:player:${req.colonyPlayer}`, 6, 600000);
    }
    const startedAt = now(), day = dayInBratislava(startedAt), id = crypto.randomBytes(16).toString('hex');
    const run = { id, playerId: req.colonyPlayer, name, day, seed: seedForDay(day), version: VERSION,
      startedAt, expiresAt: startedAt + RUN_TTL, status: 'active' };
    await store.createRun(run);
    if (newIdentity) res.cookie(COOKIE, req.colonyPlayer, {
      httpOnly: true, sameSite: 'strict', secure: req.secure || req.get('x-forwarded-proto') === 'https',
      path: '/api/colony', maxAge: 365 * 24 * 60 * 60 * 1000
    });
    res.status(201).json({ ok: true, id, seed: run.seed, day, duration: challenge.DURATION,
      startedAt: run.startedAt, expiresAt: run.expiresAt });
  }));
  router.post('/runs/:id/finish', wrap(async (req, res) => {
    if (!limit(req, res, 'finish', 18, 600000, 240)) return;
    if (!/^[a-f0-9]{32}$/.test(req.params.id)) return fail(res, 404, 'RUN_NOT_FOUND', 'Tento pokus neexistuje.');
    if (!exactBody(req.body, ['actions']) || !Array.isArray(req.body.actions) || req.body.actions.length > challenge.MAX_ACTIONS)
      return fail(res, 400, 'ACTIONS', 'Záznam pokusu je neplatný alebo príliš dlhý.');
    const time = now(), run = await store.getRun(req.params.id);
    if (!run || run.playerId !== req.colonyPlayer) return fail(res, 404, 'RUN_NOT_FOUND', 'Tento pokus neexistuje.');
    if (run.expiresAt <= time) return fail(res, 410, 'RUN_EXPIRED', 'Čas na odoslanie pokusu vypršal. Spustite novú výzvu.');
    if (run.status === 'complete') return fail(res, 409, 'RUN_FINISHED', 'Tento výsledok už bol odoslaný.');
    if (run.version !== VERSION) return fail(res, 409, 'RUN_VERSION', 'Hra sa aktualizovala. Spustite novú výzvu.');
    const remainingMs = run.startedAt + challenge.DURATION * 1000 - time;
    if (remainingMs > 0) return fail(res, 425, 'RUN_TOO_EARLY', 'Výzva ešte neskončila.', { remainingMs });
    const claimed = await store.claimRun(run.id, req.colonyPlayer, time);
    if (!claimed) return fail(res, 409, 'RUN_BUSY', 'Tento pokus sa už spracúva.');
    let result;
    try { result = replay(run.seed, req.body.actions); }
    catch {
      await store.releaseRun(run.id);
      return fail(res, 400, 'ACTIONS', 'Záznam nevyhovuje pravidlám dennej výzvy.');
    }
    try {
      if (!Number.isSafeInteger(result.score) || result.score < 0 || !Number.isSafeInteger(result.delivered) || result.delivered < 0)
        throw new Error('Invalid replay result');
      const best = await store.saveBest(run, result, time);
      await store.completeRun(run.id);
      res.json({ ok: true, score: result.score, delivered: result.delivered, day: run.day, ...best });
    } catch (error) {
      await store.releaseRun(run.id);
      throw error;
    }
  }));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') return fail(res, 413, 'BODY_TOO_LARGE', 'Záznam pokusu je príliš veľký.');
    if (error.type === 'entity.parse.failed') return fail(res, 400, 'JSON', 'Neplatný JSON.');
    logger.error('[Colony] Request failed:', error.message);
    fail(res, 503, 'UNAVAILABLE', 'Rebríček je dočasne nedostupný. Výsledok skúste odoslať znova.');
  });
  return router;
}

module.exports = { createColonyRouter, dayInBratislava, monday, seedForDay, RUN_TTL };
