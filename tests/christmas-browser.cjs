// Iba lokálny náhľadový server; nikdy produkčné API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8768';
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base));
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.request.post(base + '/api/admin/design', { data: { adminPass: 'preview-only', theme: 'christmas' } });
    await page.goto(base);
    const button = page.locator('.christmas-bakery');
    await button.waitFor();
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    await page.waitForTimeout(3500);
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    assert.ok(!(await button.textContent()).includes('nie je dostupný'));
    await button.focus();
    await page.keyboard.press('Enter');
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Space');
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    await button.click();
    await page.evaluate(() => applyTheme('classic'));
    await button.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.oblatky-promo > img').count(), 1);
    await page.evaluate(() => applyTheme('christmas'));
    await button.waitFor();
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    assert.equal(await button.count(), 1);
    fs.mkdirSync('test-results/christmas', { recursive: true });
    await page.locator('.oblatky-promo').screenshot({ path: 'test-results/christmas/steam-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('.oblatky-promo').screenshot({ path: 'test-results/christmas/steam-mobile.png' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.bakery-steam').evaluate(el => getComputedStyle(el).display), 'none');
    assert.deepEqual(errors, []);
    console.log('PASS: MP3 playback, keyboard, stop, theme lifecycle, mobile, reduced motion.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
