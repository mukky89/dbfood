// Local UI fixture: never connects to MongoDB, mail, payments or production APIs.
// Run: node tests/preview-server.cjs  (admin password: preview-only)
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createColonyRouter } = require('../colony-api');
const { MemoryColonyStore } = require('../colony-store');
const app = express();
app.use('/api/colony', createColonyRouter({ store: new MemoryColonyStore() }));
const { createSylexRouter, MemorySylexStore } = require('../sylex-api');
app.use('/api/sylex', createSylexRouter({ store: new MemorySylexStore(), rateLimits: false, contest: { endsAt: '2026-12-01T00:00:00+01:00', prize: 'Balíček vianočných trubičiek (25 ks)' } }));
app.use(express.json());
let appearance = { tema: 'rc', designVersion: 2 }, orders = {};
const { createRestaurantState } = require('../restaurant-state');
const { parseLupo, parseNevadzka, selectDay } = require('../menu-parsers');
let restaurantDoc = null;
const restaurantState = createRestaurantState({
  store: { findOne: async () => restaurantDoc, findOneAndUpdate: async (_, u) => { restaurantDoc = { ...restaurantDoc, ...u.$set, revision: (restaurantDoc?.revision || 0) + (u.$inc?.revision || 0) }; } },
  loadOrders: async () => orders, adminPassword: 'preview-only', clearCache: () => {}
});
app.use('/api', restaurantState.router);
if (process.env.RESTAURANT_PREVIEW === '1') {
  let imported = null;
  async function fixtureMenu() {
    const ctx = await restaurantState.context();
    if (imported?.key === ctx.key) return imported;
    const id = ctx.restaurant.id;
    if (id === 'fantozzi') return { ...ctx, datum: ctx.date, sekcie: [{ nazov:'Polievka',polozky:[{cislo:1,nazov:'Testovacia polievka',hmotnost:'0,33l'}] }, { nazov:'Hlavné jedlo',cena:'6.50 €',polozky:[{cislo:1,nazov:'Testovacie jedlo',hmotnost:'120g'}] }] };
    const days = (id === 'lupo' ? parseLupo : parseNevadzka)(fs.readFileSync(path.join(__dirname, 'fixtures', id + '.html'), 'utf8'));
    return { ...selectDay(days, '2026-11-16'), ...ctx };
  }
  app.get('/api/menu', async (_, res) => res.json({ok:true,menu:await fixtureMenu()}));
  const routeSandbox = {
    app, restaurantState, config:{adminPassword:'preview-only'}, parseLupo,parseNevadzka,selectDay,
    validSelection:require('../menu-selection').validSelection,fetchMenu:fixtureMenu,
    isTodayBlocked:async()=>({blocked:false}),isOrderingOpen:()=>true,loadOrders:async()=>orders,
    loadTodayHistory:async()=>[],getCasSK:()=> '09:00',saveOrders:async o=>{orders=o;},
    setManualMenu:async menu=>{imported={...menu,...await restaurantState.context()};}
  };
  vm.createContext(routeSandbox);
  const productionSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  vm.runInContext(productionSource.slice(productionSource.indexOf("app.post('/api/admin/menu-import'"), productionSource.indexOf('// Feedback od používateľov')),routeSandbox);
  vm.runInContext(productionSource.slice(productionSource.indexOf("app.post('/api/orders'"), productionSource.indexOf('// DELETE /api/orders/:meno')),routeSandbox);
  app.get('/api/admin/menu-debug',(_,res)=>res.json({ok:true,httpStatus:200,availableDates:['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20']}));
}
const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const sandbox = {
  app, config: { adminPassword: 'preview-only' }, NastaveniaVzhlad: {
    findOne: async () => ({ ...appearance }),
    findOneAndUpdate: async (_, update) => { appearance = { ...appearance, ...update.$set }; return appearance; }
  }
};
vm.createContext(sandbox);
vm.runInContext(source.slice(source.indexOf('const PLATNE_TEMY'), source.indexOf('async function loadOrders')), sandbox);
vm.runInContext(source.slice(source.indexOf("app.get('/api/design'"), source.indexOf('// POST /api/qr')), sandbox);
app.post('/api/admin/login', (req, res) => res.status(req.body.adminPass === 'preview-only' ? 200 : 401).json({ ok: req.body.adminPass === 'preview-only' }));
app.get('/api/status', (_, res) => res.json({ open: true, blocked: false, deadline: '23:59' }));
app.get('/api/menu', (_, res) => res.json({ ok: true, menu: { datum: 'Testovacie menu — iba lokálne', sekcie: [
  { nazov: 'Polievka', polozky: [{ cislo: 1, nazov: 'Slepačia s rezancami', hmotnost: '0,33 l (1,3,9)' }, { cislo: 2, nazov: 'Hrachová s krutónom', hmotnost: '0,33 l (1)' }] },
  { nazov: 'Hlavné jedlo', cena: '6.50 €', polozky: [{ cislo: 1, nazov: 'Maďarský guľáš, domáca knedľa', hmotnost: '130 g, 200 g (1,3,7)' }, { cislo: 2, nazov: 'Kurací rezeň s ryžou', hmotnost: '150 g, 200 g (1,3,7)' }] },
  { nazov: 'Pizza', cena: '6.70 €', polozky: [{ cislo: 7, nazov: 'Pizza Margarita', hmotnost: '450 g (1,7)' }] }
] } }));
app.get('/api/orders', (_, res) => res.json({ ok: true, orders, count: Object.keys(orders).length, history: [] }));
app.post('/api/orders', (req, res) => {
  orders[req.body.meno] = { ...req.body, cas: '12:00' };
  res.json({ ok: true, orders });
});
app.get('/api/history', (_, res) => res.json({ ok: true, history: [] }));
app.get('/api/long-history', (_, res) => res.json({ ok: true, days: [], history: [] }));
app.get('/api/users', (_, res) => res.json({ ok: true, users: [] }));
app.get('/api/version', (_, res) => res.json({ version: '1.21.0' }));
app.get('/api/admin/config-info', (_, res) => res.json({ ok: true, orderDeadline: '23:59' }));
app.get('/api/easter-stats', (_, res) => res.json({ ok: true, stats: {}, total: 0 }));
app.get('/api/weather', (_, res) => res.json({ ok: false }));
app.use('/api', (_, res) => res.status(404).json({ ok: false, error: 'Not available in local fixture' }));
app.use(express.static(path.join(__dirname, '../public')));
app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
const previewPort = Number(process.env.PREVIEW_PORT || 8766);
app.listen(previewPort, '127.0.0.1', () => console.log(`Local fixture at http://127.0.0.1:${previewPort} — admin: preview-only`));
