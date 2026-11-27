const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeLunches } = require('../lunch-statistics');

test('finálne objednávky, porcie a ceny sa rátajú samostatne, bez zrušených z histórie', async () => {
  const a = { meno: 'Jana Malá', jedlo: 'č.2 Rezeň', polievka: 'P1 Vývar', porcie: 2 };
  const b = { meno: 'Tomáš Veľký', jedlo: 'J3 Rezeň', polievka: 'P1 Vývar' };
  const stats = await summarizeLunches([
    { datum: '2026-11-01', orders: { a, b }, history: [{ akcia: 'ZRUSENIE' }] },
    { datum: 'Tue Oct 27 2026', orders: { b: { ...b, jedlo: 'J1 Losos', restaurantId: 'lupo' } } },
    { orders: {} },
  ]);
  assert.equal(stats.orders, 3);
  assert.equal(stats.portions, 4);
  assert.equal(stats.days, 2);
  assert.equal(stats.pricedOrders, 2);
  assert.equal(stats.cents, 1950);
  assert.equal(stats.pricedPortions, 3);
  assert.deepEqual(stats.months, [
    { month: '2026-10', orders: 1, pricedOrders: 0, cents: 0 },
    { month: '2026-11', orders: 2, pricedOrders: 2, cents: 1950 },
  ]);
  assert.deepEqual(stats.topDishes, [{ name: 'Rezeň', value: 3 }, { name: 'Losos', value: 1 }]);
  assert.deepEqual(stats.favourite, { names: ['Rezeň'], count: 1, value: 3 });
  assert.deepEqual(stats.buyer.names, ['Jana M.', 'Tomáš V.']);
  assert.deepEqual(stats.spender, { names: ['Jana M.'], count: 1, value: 1300 });
  assert.deepEqual(stats.people, [
    { name: 'Jana M.', portions: 2, cents: 1300 },
    { name: 'Tomáš V.', portions: 2, cents: 650 },
  ]);
  const unpriced = await summarizeLunches([{ orders: { a: { ...a, restaurantId: 'lupo' } } }]);
  assert.equal(unpriced.people[0].cents, null);
  assert.deepEqual(stats.regular, { names: ['Tomáš V.'], count: 1, value: 2 });
  assert.equal((await summarizeLunches([])).spender, null);
});
