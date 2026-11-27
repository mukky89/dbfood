const { portions } = require('./public/menu-pricing');
const { vypocitajCenu } = require('./paysquare');

const clean = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const keyOf = value => value.normalize('NFC').toLocaleLowerCase('sk');
function publicName(name) {
  if (name.includes('@') || /\d{5}/.test(name)) return 'Objednávajúci';
  const [first, ...rest] = name.split(' ');
  return [first, ...rest.map(part => part[0] + '.')].join(' ');
}
function increment(map, name, amount) {
  const key = keyOf(name);
  const entry = map.get(key) || { name, value: 0 };
  entry.value += amount;
  map.set(key, entry);
}
function leaders(map, format = name => name) {
  const sorted = [...map.values()].sort((a,b) => b.value - a.value || a.name.localeCompare(b.name, 'sk'));
  if (!sorted.length) return null;
  const tied = sorted.filter(row => row.value === sorted[0].value);
  return { names: tied.slice(0, 3).map(row => format(row.name)), count: tied.length, value: sorted[0].value };
}
async function summarizeLunches(days, menus = new Map()) {
  const dishes = new Map(), purchases = new Map(), quantities = new Map(), spending = new Map();
  const stats = { orders: 0, portions: 0, days: 0, pricedOrders: 0, pricedPortions: 0, cents: 0 };
  for await (const day of days) {
    const before = stats.orders;
    for (const [owner, order] of Object.entries(day.orders || {})) {
      if (!order || !(order.jedlo || order.pizza || order.polievka || order.dezert)) continue;
      const count = portions(order.porcie);
      const name = clean(order.meno) || clean(owner);
      stats.orders++;
      stats.portions += count;
      increment(purchases, name, 1);
      increment(quantities, name, count);
      for (const dish of [order.jedlo, order.pizza]) {
        const label = clean(dish).replace(/^(?:č\.\s*|PZ|J)\d+\s*[.:–-]?\s*/i, '').split(' — ')[0].trim();
        if (label) increment(dishes, label, count);
      }
      const menu = menus.get(order.menuKey);
      const restaurant = order.restaurantId || 'fantozzi';
      if (!menu && restaurant !== 'fantozzi') continue;
      const historical = menu && { ...menu, restaurant: { id: restaurant } };
      const price = vypocitajCenu(order.polievka, order.jedlo, order.pizza, order.dezert, historical, count);
      if (!price || !Number.isFinite(price.celkom) || price.celkom <= 0) continue;
      const cents = Math.round(price.celkom * 100);
      stats.cents += cents;
      stats.pricedOrders++;
      stats.pricedPortions += count;
      increment(spending, name, cents);
    }
    if (stats.orders > before) stats.days++;
  }
  return { ...stats, favourite: leaders(dishes), buyer: leaders(quantities, publicName),
    regular: leaders(purchases, publicName), spender: leaders(spending, publicName) };
}

function registerLunchStatistics(app, Daily, Menu) {
  let result, pending, expires = 0;
  async function read() {
    const rows = await Menu.find({}, { key: 1, menu: 1, _id: 0 }).lean();
    const menus = new Map(rows.map(row => [row.key, row.menu]));
    result = await summarizeLunches(Daily.find({}, { orders: 1, _id: 0 }).lean().cursor(), menus);
    expires = Date.now() + 60000;
    return result;
  }
  app.get('/api/lunch-statistics', async (_req, res) => {
    try {
      if (!result || Date.now() >= expires) {
        pending ??= read().finally(() => { pending = null; });
        await pending;
      }
      res.set('Cache-Control', 'public, max-age=60').json(result);
    } catch {
      res.status(503).json({ error: 'Štatistiku sa nepodarilo načítať.' });
    }
  });
}
module.exports = { summarizeLunches, registerLunchStatistics };
