const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeLunches } = require('../lunch-statistics');

test('finálne objednávky, porcie a ceny sa rátajú samostatne, bez zrušených z histórie', async () => {
  const a = { meno: 'Jana Malá', jedlo: 'č.2 Rezeň', polievka: 'P1 Vývar', porcie: 2 };
  const b = { meno: 'Tomáš Veľký', jedlo: 'J3 Rezeň', polievka: 'P1 Vývar' };
  const stats = await summarizeLunches([
    { orders: { a, b }, history: [{ akcia: 'ZRUSENIE' }] },
    { orders: { b: { ...b, jedlo: 'J1 Losos', restaurantId: 'lupo' } } },
    { orders: {} },
  ]);
  assert.equal(stats.orders, 3);
  assert.equal(stats.portions, 4);
  assert.equal(stats.days, 2);
  assert.equal(stats.pricedOrders, 2);
  assert.equal(stats.cents, 1950);
  assert.equal(stats.pricedPortions, 3);
  assert.deepEqual(stats.favourite, { names: ['Rezeň'], count: 1, value: 3 });
  assert.deepEqual(stats.buyer.names, ['Jana M.', 'Tomáš V.']);
  assert.deepEqual(stats.spender, { names: ['Jana M.'], count: 1, value: 1300 });
  assert.deepEqual(stats.regular, { names: ['Tomáš V.'], count: 1, value: 2 });
  assert.equal((await summarizeLunches([])).spender, null);
});
