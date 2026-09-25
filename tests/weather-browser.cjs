// Start the isolated fixture with PREVIEW_PORT=8767, then run this script.
// Set PLAYWRIGHT_MODULE to an existing Playwright module path when necessary.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8767';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  try {
    for (const mode of ['admin', 'slow-menu', 'retry']) {
      const page = await browser.newPage();
      let calls = 0, fail = mode === 'retry'; const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://api.open-meteo.com/**', route => {
        calls++;
        return route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(fail ? { error: true } : { current: { temperature_2m: 18.2, weather_code: 3 } }) });
      });
      if (mode === 'slow-menu') await page.route('**/api/menu', () => {});
      await page.goto(base + (mode === 'admin' ? '/admin' : '/'), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => ['ready', 'unavailable'].includes(document.getElementById('hdr-weather').dataset.weatherState));
      assert.equal(calls, 1);
      if (mode === 'retry') {
        assert.equal(await page.locator('#hw-temp').textContent(), '–°C');
        fail = false; await page.locator('#hdr-weather').click();
        await page.waitForFunction(() => document.getElementById('hdr-weather').dataset.weatherState === 'ready');
        assert.equal(calls, 2);
        fail = true; await page.locator('#hdr-weather').click();
        await page.waitForFunction(() => document.getElementById('hdr-weather').dataset.weatherState === 'stale');
        assert.match(await page.locator('#hdr-weather').getAttribute('title'), /Posledný údaj/);
      }
      assert.equal(await page.locator('#hw-temp').textContent(), '18°C');
      assert.deepEqual(errors, []);
      console.log('PASS:', mode);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
