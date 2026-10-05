// Isolated preview only. Run with tests/preview-server.cjs and PLAYWRIGHT_MODULE.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8766';
const KEY = 'fob_colony_run_v1';
const runA = 'a'.repeat(32), runB = 'b'.repeat(32);
const checkpoint = (id, frame, submitted = false) => ({
  version: 1, run: { id, seed: 123, day: '2026-10-05', startedAt: Date.now(), expiresAt: Date.now() + 1800000 },
  frame, actions: [], submitted
});
const saved = (page, storage = 'localStorage') => page.evaluate(({ storage, key }) => JSON.parse(window[storage].getItem(key)), { storage, key: KEY });
async function restoreSession(page, value) {
  await page.evaluate(value => sessionStorage.setItem('colony_test_next_session', JSON.stringify(value)), value);
  await page.reload();
}
async function openDaily(page) {
  await page.locator('#colony-open').click();
  await page.locator('#ant-game [data-mode=daily]').click();
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      localStorage.setItem('fantozzi_user', 'Test viacerých kariet');
      const next = sessionStorage.getItem('colony_test_next_session');
      if (next) {
        sessionStorage.setItem('fob_colony_run_v1', next);
        sessionStorage.removeItem('colony_test_next_session');
      }
    });
    await context.route('**/api/colony**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      const body = pathname.endsWith('/runs')
        ? { ok: true, ...checkpoint(runB, 0).run, duration: 180 }
        : pathname.endsWith('/finish')
          ? { ok: true, score: 100, delivered: 10, personalBest: 100, improved: true }
          : { ok: true, entries: [], me: null, period: 'day' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    async function tab() {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install();
      await page.clock.pauseAt(new Date());
      await page.goto(base);
      return page;
    }

    const a = await tab();
    await a.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: KEY, value: checkpoint(runA, 100) });
    await restoreSession(a, checkpoint(runA, 100));
    const b = await tab();
    assert.equal(await saved(b, 'sessionStorage'), null, 'a lunch-only tab does not claim the shared run');

    await restoreSession(a, checkpoint(runA, 900));
    assert.equal((await saved(a)).frame, 900);
    await b.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    assert.equal(await saved(b, 'sessionStorage'), null, 'pagehide cannot create a claim for a lunch-only tab');
    assert.equal((await saved(a)).frame, 900, 'a stale unclaimed tab cannot roll back the active run');

    const c = await tab();
    await openDaily(c);
    assert.equal((await saved(c, 'sessionStorage')).frame, 900, 'a new playing tab restores and claims the shared fallback');
    await openDaily(b);
    assert.equal((await saved(b, 'sessionStorage')).frame, 100, 'an existing tab owns its separate restored checkpoint');
    assert.equal((await saved(b)).frame, 900, 'claiming an older frame cannot overwrite the shared checkpoint');

    await restoreSession(a, checkpoint(runA, 1800, true));
    await restoreSession(b, checkpoint(runA, 1800, false));
    assert.equal((await saved(b, 'sessionStorage')).submitted, false);
    assert.equal((await saved(b)).submitted, true, 'a saved result cannot become unsubmitted in shared storage');

    await openDaily(b);
    await b.locator('#ant-result-message').filter({ hasText: 'Uložené:' }).waitFor();
    await b.locator('#ant-game [data-action=new-run]').click();
    assert.equal(await saved(b, 'sessionStorage'), null);
    assert.equal(await saved(b), null, 'discarding the matching completed run clears the shared checkpoint');
    await b.locator('#ant-game [data-action=start-daily]').click();
    await b.locator('#ant-daily-intro').waitFor({ state: 'hidden' });
    assert.equal((await saved(b)).run.id, runB, 'only an explicit successful start replaces the latest shared run');

    await a.reload();
    assert.equal((await saved(a, 'sessionStorage')).run.id, runA, 'reload prefers this tab over a different shared run');
    assert.equal((await saved(a)).run.id, runB, 'restoring another tab cannot overwrite the latest run');
    await openDaily(a);
    await a.locator('#ant-game [data-action=new-run]').click();
    assert.equal(await saved(a, 'sessionStorage'), null);
    assert.equal((await saved(a)).run.id, runB, 'clearing runA leaves runB intact');

    const expired = checkpoint('c'.repeat(32), 40);
    expired.run.expiresAt = 1;
    await restoreSession(a, expired);
    assert.equal(await saved(a, 'sessionStorage'), null, 'expiry clears only this tab\'s invalid checkpoint');
    assert.equal((await saved(a)).run.id, runB, 'expiry cannot clear another tab\'s latest run');
    await openDaily(a);
    assert.equal((await saved(a, 'sessionStorage')).run.id, runB, 'an expired session can use the valid shared fallback');

    await c.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await c.reload();
    assert.equal((await saved(c, 'sessionStorage')).run.id, runA);
    assert.equal((await saved(c, 'sessionStorage')).frame, 900);
    assert.equal((await saved(c)).run.id, runB, 'a stale third tab cannot replace a different latest run');
    assert.deepEqual(errors, []);
    console.log('PASS: independent tab restore, lunch-only tab isolation, monotonic shared frames, submitted flag, explicit latest-run replacement, matching-only clear and expiry.');
  } finally {
    await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 2000))]);
  }
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
