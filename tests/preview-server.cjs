// Local UI fixture: never connects to MongoDB, mail, payments or production APIs.
// Run: node tests/preview-server.cjs  (admin password: preview-only)
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = express();
app.use(express.json());
let appearance = { tema: 'rc', designVersion: 2 }, orders = {};
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
app.listen(8766, '127.0.0.1', () => console.log('Local fixture at http://127.0.0.1:8766 — admin: preview-only'));
