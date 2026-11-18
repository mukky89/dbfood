const express = require('express');
const { getRestaurant, todaySK } = require('./restaurants');

function createMenuCheckRouter({ adminPassword, fetchAutomaticMenu, enrichMenuAllergens, now = () => new Date() }) {
  const router = express.Router();
  // Náhľad nemení výber jedálne, objednávky ani dátum servera. Heslo nie je v URL.
  router.post('/admin/menu-check', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.body.adminPass !== adminPassword) return res.status(401).json({ ok:false });
    let restaurant, date;
    try {
      restaurant = getRestaurant(req.body.restaurantId);
      date = req.body.date;
      const time = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? Date.parse(date + 'T12:00:00Z') : NaN;
      const current = Date.parse(todaySK(now()) + 'T12:00:00Z');
      if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== date || Math.abs(time-current)>7*86400000) throw Error();
    } catch { return res.status(400).json({ ok:false,error:'Vyber známu jedáleň a platný dátum v rozsahu 7 dní od dneška.' }); }
    try {
      const context = { restaurant, date, key:`${restaurant.id}:check:${date}` };
      const loaded = await fetchAutomaticMenu(context);
      const count = loaded.menu.sekcie.reduce((n,s)=>n+s.polozky.length,0);
      const menu = count ? await enrichMenuAllergens(loaded.menu) : loaded.menu;
      res.json({ ok:true,readOnly:true,available:count>0,availableDates:loaded.availableDates,
        sourceDate:loaded.availableDates.includes(date)?date:null,menu,
        reviewComplete:count>0 && menu.allergenReview?.processed===count });
    } catch { res.status(502).json({ ok:false,error:'Automatický zdroj alebo kontrola menu nie je dostupná.' }); }
  });
  return router;
}
module.exports = { createMenuCheckRouter };
