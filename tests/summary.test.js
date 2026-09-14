const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const renderer = html.slice(html.indexOf('function renderSummary('), html.indexOf('// ── Admin ─'));
const escape = html.slice(html.indexOf('function esc(s)'), html.indexOf('// ── Odysea — filmový'));
function render(entries, topJedlo = '') {
  const element = { innerHTML: '' };
  const context = { document: { getElementById: () => element }, entries, topJedlo };
  vm.runInNewContext(escape + renderer + '\nrenderSummary(entries);', context);
  return cheerio.load(element.innerHTML);
}
test('summary sorts each category by numeric code, not count, including J2 before J10', () => {
  const entries = [
    { polievka: 'P3 Frankfurtská', jedlo: 'J10 Rezeň', pizza: 'PZ12 Salámová', dezert: 'D11 Veterník' },
    { polievka: 'P3 Frankfurtská', jedlo: 'J10 Rezeň' },
    { polievka: 'P2 Paradajková', jedlo: 'J5 Syr', pizza: 'PZ2 Syrová', dezert: 'D2 Koláč' },
    { polievka: 'P1 Slepačia', jedlo: 'j2 Ryža' },
    { polievka: 'P3 Frankfurtská', jedlo: 'J1 Guľáš' }
  ];
  const $ = render(entries, 'J10 Rezeň');
  assert.deepEqual($('.summary-num').map((_, el) => $(el).text()).get(), ['P1', 'P2', 'P3', 'J1', 'J2', 'J5', 'J10', 'PZ2', 'PZ12', 'D2', 'D11']);
  assert.equal($('.hot-row .summary-num').text(), 'J10');
  assert.equal($('.hot-row .summary-count').text(), '2×');
  assert.equal($('.summary-total-row .summary-count').text(), '5');
});
test('legacy codes and variants sort deterministically; unnumbered dishes follow numbered ones', () => {
  const $ = render([{ jedlo: 'č.10 Syr' }, { jedlo: 'J2 Rezeň (kurací)' }, { jedlo: 'J2 Rezeň (bravčový)' }, { jedlo: 'Denný špeciál' }]);
  assert.deepEqual($('.summary-num').map((_, el) => $(el).text()).get(), ['J2', 'J2', 'J10', 'J?']);
  assert.deepEqual($('.summary-item-name strong').map((_, el) => $(el).text()).get(), ['Rezeň (bravčový)', 'Rezeň (kurací)', 'Syr', 'Denný špeciál']);
});
test('notes are attached to the correct dish, with every author and separate pizza instructions', () => {
  const $ = render([
    { meno: 'Anna', polievka: 'P1 Slepačia', jedlo: 'J2 Rezeň', pizza: 'PZ7 Pizza', poznamka: '🍽️ Bez cibule | 🍕 Bez syra' },
    { meno: 'Boris', jedlo: 'J2 Rezeň', poznamka: '🍽 Omáčku zvlášť | prosím dobre prepiecť' },
    { meno: 'Cyril', jedlo: 'J2 Rezeň', poznamka: '   ' }
  ]);
  const notes = $('.summary-note-row');
  assert.equal(notes.length, 2);
  assert.match($(notes[0]).text(), /Poznámky k J2/);
  assert.match($(notes[0]).text(), /Anna: Bez cibule/);
  assert.match($(notes[0]).text(), /Boris: Omáčku zvlášť \| prosím dobre prepiecť/);
  assert.doesNotMatch($(notes[0]).text(), /Bez syra|Cyril/);
  assert.match($(notes[1]).text(), /Poznámky k PZ7/);
  assert.match($(notes[1]).text(), /Anna: Bez syra/);
  assert.equal($(notes[0]).prev().find('.summary-count').text(), '3×');
  assert.equal($('.summary-note-flag').length, 2);
});
test('untagged and unmatched legacy notes remain visible without guessing their dish', () => {
  const $ = render([
    { meno: 'Dana', polievka: 'P1 Vývar', jedlo: 'J5 Syr', poznamka: 'Zabaliť zvlášť' },
    { meno: 'Eva', jedlo: 'J2 Rezeň', poznamka: '🍕 Chýbajúca pizza' }
  ]);
  assert.equal($('.summary-note-row').length, 0);
  const text = $('.summary-general-notes').text();
  assert.match(text, /Objednávka: P1, J5/);
  assert.match(text, /Dana: Zabaliť zvlášť/);
  assert.match(text, /Eva: 🍕 Chýbajúca pizza/);
});
test('names, dish names and note text are escaped before rendering', () => {
  const $ = render([{ meno: '<img src=x onerror=alert(1)>', jedlo: 'J1 <script>bad()</script>', poznamka: '🍽️ <svg onload=alert(1)> & "extra"' }]);
  assert.equal($('script,img,svg').length, 0);
  assert.match($('.summary-note').text(), /<svg onload=alert\(1\)> & "extra"/);
  assert.equal($('.summary-item-name strong').text(), '<script>bad()</script>');
});
test('empty summary and dishes without notes have no warning', () => {
  assert.equal(render([])('.empty-state').text(), 'Zatiaľ žiadne');
  assert.equal(render([{ jedlo: 'J1 Guľáš', meno: 'Anna' }])('.summary-note').length, 0);
});
