const express = require('express');
const { restaurants, getRestaurant, todaySK } = require('./restaurants');

// Jedna fronta chráni prepnutie aj zápis objednávky v tomto procese.
function createRestaurantState({ store, loadOrders, adminPassword, clearCache }) {
  let tail = Promise.resolve();
  function exclusive(fn) {
    const next = tail.then(fn); tail = next.catch(() => {}); return next;
  }
  async function selection() {
    const doc = await store.findOne({ key: 'restaurant' });
    return { ...getRestaurant(doc?.restaurantId || 'fantozzi'), revision: doc?.revision || 0 };
  }
  async function context() {
    const restaurant = await selection(), date = todaySK();
    return { restaurant, date, key: `${restaurant.id}:${restaurant.revision}:${date}` };
  }
  const router = express.Router();
  router.get('/restaurant', async (_, res) => {
    try { res.json({ ok: true, ...(await context()), restaurants }); }
    catch { res.status(503).json({ ok: false, error: 'Nastavenie jedálne nie je dostupné' }); }
  });
  router.post('/admin/restaurant', async (req, res) => {
    if (req.body.adminPass !== adminPassword) return res.status(401).json({ ok: false });
    try {
      getRestaurant(req.body.restaurantId);
      await exclusive(async () => {
        const old = await selection();
        if (old.id !== req.body.restaurantId) {
          if (Object.keys(await loadOrders()).length) return res.status(409).json({ ok: false, error: 'Dnes už existujú objednávky. Jedáleň zmeň pred prvou objednávkou; existujúce objednávky sa automaticky nemažú.' });
          await store.findOneAndUpdate({ key: 'restaurant' }, { $set: { restaurantId: req.body.restaurantId }, $inc: { revision: 1 } }, { upsert: true });
          clearCache();
        }
        res.json({ ok: true, ...(await context()), restaurants });
      });
    } catch (e) { res.status(e.message === 'Neznáma jedáleň' ? 400 : 503).json({ ok: false, error: e.message }); }
  });
  return { router, selection, context, exclusive };
}
module.exports = { createRestaurantState };
