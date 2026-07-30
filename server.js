const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const config = require('./config');
const { fetchMenu, setManualMenu, clearCache, debugFetch } = require('./scraper');
const { sendEmail, sendMail, formatEmail } = require('./mailer');
const { generatePayBySquareQR, vypocitajCenu } = require('./paysquare');
const { notifyNovaObjednavka, notifyUpravaObjednavky, notifyZrusenieObjednavky, notifyPripomienka, notifySuhrn, notifyTestPush } = require('./notifier');
const pkg = require('./package.json');

// Odstrani diakritiku (á→a, č→c, …) — pay by square poznamka inak nemusi fungovat
function bezDiakritiky(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Vzdy zobrazi spravny prefix podla typu (P/J/PZ/D), aj pre stare "č.N" objednavky
function relabel(val, prefix) {
  if (!val) return val;
  const m = val.match(/^(?:č\.|PZ|[PJD])(\d+)\s*/);
  if (!m) return val;
  return `${prefix}${m[1]} ${val.slice(m[0].length)}`;
}

// Poznamka do QR platby: vzdy meno + datum, bez diakritiky
function qrSprava(meno) {
  const datum = new Date().toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava' });
  const text = meno && meno.trim() ? `${meno.trim()} ${datum}` : `Obed Fantozzi ${datum}`;
  return bezDiakritiky(text);
}

const app = express();

// Presmerovanie zo starej EvenNode domeny na Railway (trvale, 301).
// Zachova cestu aj query (napr. /admin -> .../admin).
const REDIRECT_TARGET = process.env.REDIRECT_TARGET || 'https://dbfood-production.up.railway.app';
app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase();
  if (host.includes('evennode.com')) {
    return res.redirect(301, REDIRECT_TARGET + req.originalUrl);
  }
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── MongoDB schemas ──────────────────────────────────────────────────────────
const denneObjednavkySchema = new mongoose.Schema({
  datum: { type: String, required: true, unique: true },
  orders: { type: mongoose.Schema.Types.Mixed, default: {} },
  history: { type: Array, default: [] }
});
const DenneObjednavky = mongoose.model('DenneObjednavky', denneObjednavkySchema);

const userSchema = new mongoose.Schema({
  meno: { type: String, required: true, unique: true },
  email: { type: String, default: '' },
  registrovany: { type: String },
  poslednyLogin: { type: String }
});
const User = mongoose.model('User', userSchema);

const blokovaneObdobieSchema = new mongoose.Schema({
  od:        { type: String, required: true },
  do:        { type: String, required: true },
  dovod:     { type: String, default: 'Neprítomnosť' },
  vytvorene: { type: String, default: () => new Date().toISOString() }
});
const BlokovaneObdobie = mongoose.model('BlokovaneObdobie', blokovaneObdobieSchema);

const easterEggTriggerSchema = new mongoose.Schema({
  egg:  { type: String, required: true },
  meno: { type: String, default: 'Neznámy' },
  cas:  { type: String }
});
const EasterEggTrigger = mongoose.model('EasterEggTrigger', easterEggTriggerSchema);

const nastaveniaPlatbySchema = new mongoose.Schema({
  iban: { type: String, default: '' },
  bic:  { type: String, default: '' },
  meno: { type: String, default: '' },
  vs:   { type: String, default: '' },
  revolut: { type: String, default: '' }
});
const NastaveniaPlatby = mongoose.model('NastaveniaPlatby', nastaveniaPlatbySchema);

// Nastavenia vzhladu (vyber temy; futuristicky boolean ostava pre spatnu kompatibilitu)
const nastaveniaVzhladSchema = new mongoose.Schema({
  futuristicky: { type: Boolean, default: false },
  tema: { type: String, default: '' }
});
const NastaveniaVzhlad = mongoose.model('NastaveniaVzhlad', nastaveniaVzhladSchema);

// Feedback od používateľov (💬 plávajúce okno na stránke)
const feedbackSchema = new mongoose.Schema({
  meno:   { type: String, default: 'Anonym' },
  typ:    { type: String, default: 'pokec' }, // napad | chyba | pokec
  sprava: { type: String, required: true },
  cas:    { type: String, default: () => new Date().toISOString() }
});
const Feedback = mongoose.model('Feedback', feedbackSchema);


mongoose.connect(config.mongoUri)
  .then(() => console.log('[DB] Pripojeny na MongoDB'))
  .catch(err => { console.error('[DB] Chyba pripojenia:', err.message); process.exit(1); });

// ── Pomocne funkcie ──────────────────────────────────────────────────────────
function getCasSK() {
  return new Date().toLocaleTimeString('sk-SK', { timeZone: 'Europe/Bratislava', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function isOrderingOpen() {
  const now = new Date();
  const [hh, mm] = config.orderDeadline.split(':').map(Number);
  const nowSK = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Bratislava' }));
  const deadline = new Date(nowSK);
  deadline.setHours(hh, mm, 0, 0);
  return nowSK < deadline;
}

function getTodaySK() {
  const sk = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Bratislava' }));
  return `${sk.getFullYear()}-${String(sk.getMonth()+1).padStart(2,'0')}-${String(sk.getDate()).padStart(2,'0')}`;
}

async function isTodayBlocked() {
  try {
    const dnes = getTodaySK();
    const found = await BlokovaneObdobie.findOne({ od: { $lte: dnes }, do: { $gte: dnes } });
    return found ? { blocked: true, dovod: found.dovod } : { blocked: false };
  } catch(e) { return { blocked: false }; }
}

// ── Nastavenia platby (DB override cez env vars) ──────────────────────────
let _platbaCache = null;
async function getPlatba() {
  if (_platbaCache) return _platbaCache;
  try {
    const doc = await NastaveniaPlatby.findOne({});
    _platbaCache = {
      iban: ((doc?.iban || config.platbaIban || '')).replace(/\s/g, ''),
      bic:  ((doc?.bic  || config.platbaBic  || '')).replace(/\s/g, ''),
      meno:  doc?.meno || config.platbaMeno  || 'Fantozzi',
      vs:    doc?.vs   || config.platbaVS    || '',
      revolut: doc?.revolut || config.platbaRevolut || ''
    };
  } catch(e) {
    _platbaCache = {
      iban: (config.platbaIban || '').replace(/\s/g, ''),
      bic:  (config.platbaBic  || '').replace(/\s/g, ''),
      meno:  config.platbaMeno || 'Fantozzi',
      vs:    config.platbaVS   || '',
      revolut: config.platbaRevolut || ''
    };
  }
  return _platbaCache;
}
function clearPlatbaCache() { _platbaCache = null; }

// ── Nastavenia vzhladu ─────────────────────────────────────────────────────
const PLATNE_TEMY = ['classic', 'futuristic', 'trattoria', 'starwars', 'fifa', 'chinchilla', 'odysea'];
let _vzhladCache = null;
async function getVzhlad() {
  if (_vzhladCache) return _vzhladCache;
  try {
    const doc = await NastaveniaVzhlad.findOne({});
    // Novsie pole 'tema' ma prednost; stary boolean 'futuristicky' je fallback
    const tema = (doc?.tema && PLATNE_TEMY.includes(doc.tema))
      ? doc.tema
      : (doc?.futuristicky ? 'futuristic' : 'classic');
    _vzhladCache = { tema };
  } catch(e) {
    _vzhladCache = { tema: 'classic' };
  }
  return _vzhladCache;
}
function clearVzhladCache() { _vzhladCache = null; }

async function loadOrders() {
  const dnes = new Date().toDateString();
  const doc = await DenneObjednavky.findOne({ datum: dnes });
  return doc ? (doc.orders || {}) : {};
}

async function loadTodayHistory() {
  const dnes = new Date().toDateString();
  const doc = await DenneObjednavky.findOne({ datum: dnes });
  return doc ? (doc.history || []) : [];
}

async function saveOrders(orders, history) {
  const dnes = new Date().toDateString();
  await DenneObjednavky.findOneAndUpdate(
    { datum: dnes },
    { $set: { orders, history }, $setOnInsert: { datum: dnes } },
    { upsert: true }
  );
}

// ── Pouzivatelia ─────────────────────────────────────────────────────────────
async function loadUsers() {
  const users = await User.find({});
  const map = {};
  users.forEach(u => {
    map[u.meno] = { meno: u.meno, email: u.email || '', registrovany: u.registrovany, poslednyLogin: u.poslednyLogin };
  });
  return map;
}

async function saveUsers(users) {
  const existingDocs = await User.find({}, { meno: 1 });
  const existingMenos = existingDocs.map(u => u.meno);
  const newMenos = Object.keys(users);

  const toDelete = existingMenos.filter(m => !newMenos.includes(m));
  if (toDelete.length > 0) await User.deleteMany({ meno: { $in: toDelete } });

  const ops = Object.values(users).map(u => ({
    updateOne: { filter: { meno: u.meno }, update: { $set: u }, upsert: true }
  }));
  if (ops.length > 0) await User.bulkWrite(ops);
}

async function archiveAndClearOrders() {
  await saveOrders({}, []);
  clearCache();
  console.log('[Server] Objednavky vymazane, cache resetovana');
}

// ── API ───────────────────────────────────────────────────────────────────────

// GET /api/status
app.get('/api/status', async (req, res) => {
  const blok = await isTodayBlocked();
  res.json({
    open: blok.blocked ? false : isOrderingOpen(),
    deadline: config.orderDeadline,
    blocked: blok.blocked,
    blokovanyDovod: blok.dovod || null
  });
});

// GET /api/menu
app.get('/api/menu', async (req, res) => {
  try {
    const menu = await fetchMenu();
    if (!menu) return res.json({ ok: false, error: 'Menu sa nepodarilo nacitat', menu: null });
    res.json({ ok: true, menu });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/admin/menu-debug — diagnostika scrapovania (cerstvy pokus, bez cache)
app.get('/api/admin/menu-debug', async (req, res) => {
  if (req.query.adminPass !== config.adminPassword) return res.status(401).json({ ok: false });
  const result = await debugFetch();
  res.json(result);
});

// GET /api/admin/email-preview — náhľad denného súhrnného e-mailu (HTML)
// Pri prázdnom dni zobrazí ukážkové dáta, nech je vidieť dizajn.
app.get('/api/admin/email-preview', async (req, res) => {
  if (req.query.adminPass !== config.adminPassword) {
    return res.status(401).send('<h2 style="font-family:sans-serif">Nesprávne heslo</h2>');
  }
  try {
    let orders = await loadOrders();
    let menu = null;
    try { menu = await fetchMenu(); } catch (e) { /* menu nie je nutné pre náhľad */ }
    const isSample = !orders || Object.keys(orders).length === 0;
    if (isSample) {
      orders = {
        'Šutaj Eštok':       { meno: 'Šutaj Eštok', polievka: 'č.1 Slepačia s mäsom, zeleninou a rezancami', jedlo: 'č.3 Pečené kuracie stehno 240g, prírodná omáčka, ryža, kompót', cas: '07:45' },
        'Júlia Vavrinčíková':{ meno: 'Júlia Vavrinčíková', polievka: 'P3 Šošovicová s klobásou a zemiakmi', jedlo: 'J5 Vyprážané rybie file, varené zemiaky, tatárska omáčka', poznamka: 'bez cibule prosím', cas: '07:49' },
        'The Chosen One':    { meno: 'The Chosen One', polievka: 'P2 Zeleninový vývar s haluškami', pizza: 'PZ8 Pizza- Gyros', cas: '07:24' },
        'Marek Kováč':       { meno: 'Marek Kováč', polievka: 'P1 Slepačia s mäsom', jedlo: 'J2 Reštovaná hydinová pečeň, dusená ryža', dezert: 'D1 Domáce dukátové buchtičky', cas: '08:01' },
      };
    }
    const { html } = formatEmail(orders, menu);
    const banner = isSample
      ? `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#fff8e6;color:#8a6d3b;padding:10px 16px;text-align:center;font-size:13px;border-bottom:1px solid #f0e2bd">👁️ Náhľad s <strong>ukážkovými</strong> dátami — dnes ešte nikto neobjednal.</div>`
      : `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#eaf7ee;color:#15803d;padding:10px 16px;text-align:center;font-size:13px;border-bottom:1px solid #c9ebd3">👁️ Náhľad s <strong>dnešnými</strong> objednávkami (${Object.keys(orders).length}).</div>`;
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(banner + html);
  } catch (err) {
    res.status(500).send('<pre>' + err.message + '</pre>');
  }
});

// GET /api/orders
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await loadOrders();
    const history = await loadTodayHistory();
    res.json({ ok: true, orders, history, count: Object.keys(orders).length });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/orders
app.post('/api/orders', async (req, res) => {
  const blok = await isTodayBlocked();
  if (blok.blocked) return res.status(403).json({ ok: false, error: `Objednávanie je zablokované: ${blok.dovod}` });
  if (!isOrderingOpen()) return res.status(403).json({ ok: false, error: 'Objednavanie je uzavrete (po 10:00)' });

  const { meno, polievka, jedlo, pizza, dezert, poznamka, porcie, editMode } = req.body;
  if (!meno?.trim()) return res.status(400).json({ ok: false, error: 'Meno je povinne' });
  if (!polievka) return res.status(400).json({ ok: false, error: 'Polievka je povinná' });
  if (!jedlo && !pizza) return res.status(400).json({ ok: false, error: 'Musíš vybrať hlavné jedlo alebo pizzu' });

  try {
    const orders = await loadOrders();
    const history = await loadTodayHistory();
    const menoKey = meno.trim();
    const cas = getCasSK();

    if (orders[menoKey] && !editMode) return res.status(409).json({ ok: false, error: 'Objednavka uz existuje', existing: orders[menoKey] });

    if (orders[menoKey] && editMode) {
      history.push({ meno: menoKey, cas, akcia: 'UPRAVA',
        predtym: { polievka: orders[menoKey].polievka, jedlo: orders[menoKey].jedlo, poznamka: orders[menoKey].poznamka },
        potom: { polievka: polievka || null, jedlo: jedlo || null, poznamka: poznamka || '' }
      });
    } else {
      history.push({ meno: menoKey, cas, akcia: 'NOVA',
        potom: { polievka: polievka || null, jedlo: jedlo || null, poznamka: poznamka || '' }
      });
    }

    orders[menoKey] = {
      meno: menoKey,
      polievka: polievka || null,
      jedlo: jedlo || null,
      pizza: pizza || null,
      dezert: dezert || null,
      porcie: parseInt(porcie) || 1,
      poznamka: poznamka || '',
      cas, locked: true,
      editCount: (orders[menoKey]?.editCount || 0) + (editMode ? 1 : 0)
    };

    await saveOrders(orders, history);
    res.json({ ok: true, message: editMode ? 'Objednavka upravena' : 'Objednavka ulozena' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// DELETE /api/orders/:meno
app.delete('/api/orders/:meno', async (req, res) => {
  const { adminPass } = req.query;
  const meno = decodeURIComponent(req.params.meno);
  const isSelf = adminPass === '__user__';
  const isAdminPass = adminPass === config.adminPassword;

  if (!isSelf && !isAdminPass) return res.status(401).json({ ok: false, error: 'Nespravne heslo' });
  if (isSelf && !isOrderingOpen()) return res.status(403).json({ ok: false, error: 'Po 10:00 sa objednavka neda zrusit' });

  try {
    const orders = await loadOrders();
    const history = await loadTodayHistory();
    if (!orders[meno]) return res.status(404).json({ ok: false, error: 'Objednavka nenajdena' });

    history.push({ meno, cas: getCasSK(), akcia: 'ZRUSENIE',
      predtym: { polievka: orders[meno].polievka, jedlo: orders[meno].jedlo, poznamka: orders[meno].poznamka },
      potom: null
    });

    delete orders[meno];
    await saveOrders(orders, history);
    res.json({ ok: true, message: `Objednavka ${meno} zmazana` });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// PUT /api/admin/orders/:meno — admin uprava detailu objednavky (bez ohladu na uzavierku)
app.put('/api/admin/orders/:meno', async (req, res) => {
  const { adminPass } = req.body;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false, error: 'Nespravne heslo' });

  const meno = decodeURIComponent(req.params.meno);
  const { polievka, jedlo, pizza, dezert, poznamka, porcie } = req.body;
  if (!jedlo && !pizza) return res.status(400).json({ ok: false, error: 'Musí zostať hlavné jedlo alebo pizza' });

  try {
    const orders = await loadOrders();
    const history = await loadTodayHistory();
    if (!orders[meno]) return res.status(404).json({ ok: false, error: 'Objednavka nenajdena' });

    const cas = getCasSK();
    history.push({ meno, cas, akcia: 'UPRAVA',
      predtym: { polievka: orders[meno].polievka, jedlo: orders[meno].jedlo, poznamka: orders[meno].poznamka },
      potom: { polievka: polievka || null, jedlo: jedlo || null, poznamka: poznamka || '' }
    });

    orders[meno] = {
      ...orders[meno],
      meno,
      polievka: polievka || null,
      jedlo: jedlo || null,
      pizza: pizza || null,
      dezert: dezert || null,
      porcie: parseInt(porcie) || 1,
      poznamka: poznamka || '',
      editCount: (orders[meno].editCount || 0) + 1
    };

    await saveOrders(orders, history);
    res.json({ ok: true, message: `Objednavka ${meno} upravena` });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Auth - OTP cez email ──────────────────────────────────────────────────────
const otpStore = {};

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOTPEmail(email, meno, otp) {
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#333">
      <div style="background:#2c3e50;color:white;padding:20px 24px;border-radius:8px 8px 0 0;text-align:center">
        <div style="font-size:32px">🍕</div>
        <h2 style="margin:8px 0 0">Fantozzi Objednávky</h2>
      </div>
      <div style="border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px;padding:24px;text-align:center">
        <p style="font-size:15px">Ahoj <strong>${meno}</strong>! Tu je tvoj prihlasovací kód:</p>
        <div style="font-size:48px;font-weight:900;letter-spacing:12px;color:#e74c3c;margin:20px 0;font-family:monospace">${otp}</div>
        <p style="color:#999;font-size:13px">Kód je platný <strong>10 minút</strong>.<br>Ak si nepožiadal/a o prihlásenie, ignoruj tento email.</p>
      </div>
    </body></html>`;

  const result = await sendMail({
    to: email,
    subject: `${otp} — tvoj prihlasovací kód do Fantozzi`,
    text: `Tvoj prihlasovací kód: ${otp}\nKód je platný 10 minút.`,
    html
  });
  if (!result.ok) throw new Error(result.error || 'Odoslanie OTP zlyhalo');
}

// POST /api/auth/request-otp
app.post('/api/auth/request-otp', async (req, res) => {
  const { email, meno } = req.body;
  if (!email?.trim() || !meno?.trim()) {
    return res.status(400).json({ ok: false, error: 'Email a meno sú povinné' });
  }

  const emailLower = email.trim().toLowerCase();

  if (config.allowedEmails && config.allowedEmails.length > 0) {
    if (!config.allowedEmails.map(e => e.toLowerCase()).includes(emailLower)) {
      return res.status(403).json({ ok: false, error: 'Tento email nie je povolený. Kontaktuj admina.' });
    }
  }

  const otp = generateOTP();
  otpStore[emailLower] = { code: otp, meno: meno.trim(), expires: Date.now() + 10 * 60 * 1000 };

  try {
    await sendOTPEmail(emailLower, meno.trim(), otp);
    console.log(`[Auth] OTP odoslany na ${emailLower}`);
    res.json({ ok: true, message: 'Kód odoslaný na email' });
  } catch(err) {
    console.error('[Auth] Chyba odosielania OTP:', err.message);
    delete otpStore[emailLower];
    res.status(500).json({ ok: false, error: 'Nepodarilo sa odoslať email: ' + err.message });
  }
});

// POST /api/auth/verify-otp
app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, code } = req.body;
  if (!email?.trim() || !code?.trim()) {
    return res.status(400).json({ ok: false, error: 'Email a kód sú povinné' });
  }

  const emailLower = email.trim().toLowerCase();
  const stored = otpStore[emailLower];

  if (!stored) return res.status(400).json({ ok: false, error: 'Kód nebol vygenerovaný. Požiadaj o nový.' });
  if (Date.now() > stored.expires) {
    delete otpStore[emailLower];
    return res.status(400).json({ ok: false, error: 'Kód vypršal. Požiadaj o nový.' });
  }
  if (stored.code !== code.trim()) {
    return res.status(400).json({ ok: false, error: 'Nesprávny kód. Skús znova.' });
  }

  delete otpStore[emailLower];

  try {
    const users = await loadUsers();
    const menoKey = stored.meno;
    const isNew = !users[menoKey];
    users[menoKey] = {
      meno: menoKey,
      email: emailLower,
      registrovany: users[menoKey]?.registrovany || new Date().toISOString(),
      poslednyLogin: new Date().toISOString()
    };
    await saveUsers(users);
    console.log(`[Auth] Uspesne prihlasenie: ${menoKey} (${emailLower})`);
    res.json({ ok: true, meno: menoKey, email: emailLower, isNew });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/auth/check-email
app.get('/api/auth/check-email', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.json({ ok: false });
  try {
    const users = await loadUsers();
    const user = Object.values(users).find(u => u.email?.toLowerCase() === email.toLowerCase());
    res.json({ ok: !!user, user: user || null });
  } catch(e) { res.json({ ok: false }); }
});

// ── Pouzivatelia API ──────────────────────────────────────────────────────────

// POST /api/users/register
app.post('/api/users/register', async (req, res) => {
  const { meno, email } = req.body;
  if (!meno?.trim()) return res.status(400).json({ ok: false, error: 'Meno je povinne' });
  try {
    const users = await loadUsers();
    const menoKey = meno.trim();
    const isNew = !users[menoKey];
    users[menoKey] = {
      meno: menoKey,
      email: email?.trim() || users[menoKey]?.email || '',
      registrovany: users[menoKey]?.registrovany || new Date().toISOString(),
      poslednyLogin: new Date().toISOString()
    };
    await saveUsers(users);
    res.json({ ok: true, user: users[menoKey], isNew });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/users
app.get('/api/users', async (req, res) => {
  const { adminPass } = req.query;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false, error: 'Nespravne heslo' });
  try {
    res.json({ ok: true, users: await loadUsers() });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// DELETE /api/users/:meno
app.delete('/api/users/:meno', async (req, res) => {
  const { adminPass } = req.query;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false, error: 'Nespravne heslo' });
  try {
    const users = await loadUsers();
    const meno = decodeURIComponent(req.params.meno);
    delete users[meno];
    await saveUsers(users);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Feedback ──────────────────────────────────────────────────────────────────

// POST /api/feedback — verejné odoslanie správy z plávajúceho okna
app.post('/api/feedback', async (req, res) => {
  try {
    const { meno, typ, sprava } = req.body || {};
    const text = String(sprava || '').trim();
    if (!text) return res.status(400).json({ ok: false, error: 'Prázdna správa' });
    if (text.length > 2000) return res.status(400).json({ ok: false, error: 'Správa je pridlhá (max 2000 znakov)' });
    const TYPY = ['napad', 'chyba', 'pokec'];
    await Feedback.create({
      meno: String(meno || 'Anonym').trim().slice(0, 60) || 'Anonym',
      typ: TYPY.includes(typ) ? typ : 'pokec',
      sprava: text
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/feedback — zoznam pre admina (najnovšie prvé)
app.get('/api/feedback', async (req, res) => {
  if (req.query.adminPass !== config.adminPassword) return res.status(401).json({ ok: false, error: 'Nespravne heslo' });
  try {
    const items = await Feedback.find().sort({ cas: -1 }).limit(300).lean();
    res.json({ ok: true, items });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// DELETE /api/feedback/:id — zmazanie správy adminom
app.delete('/api/feedback/:id', async (req, res) => {
  if (req.query.adminPass !== config.adminPassword) return res.status(401).json({ ok: false, error: 'Nespravne heslo' });
  try {
    await Feedback.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Admin API ─────────────────────────────────────────────────────────────────

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
  const { adminPass } = req.body;
  if (adminPass === config.adminPassword) res.json({ ok: true });
  else res.status(401).json({ ok: false, error: 'Nespravne heslo' });
});

// GET /api/admin/config-info
app.get('/api/admin/config-info', (req, res) => {
  const { adminPass } = req.query;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false });
  res.json({
    ok: true,
    emailRecipient: config.emailRecipient || '(nenastavené)',
    emailSender: config.emailSender || '(nenastavené)',
    odosielanie: config.brevoApiKey ? 'Brevo HTTP API' : 'SMTP',
    brevoApiKey: config.brevoApiKey ? '(nastavený)' : '(nenastavený)',
    smtpHost: config.smtpHost || 'Gmail fallback',
    smtpUser: config.smtpUser || config.emailSender || '(nenastavené)',
    ntfyTopic: config.ntfyTopic || '(vypnuté)',
    ntfyUrl: config.ntfyUrl || 'https://ntfy.sh',
    orderDeadline: config.orderDeadline
  });
});

// POST /api/send-email
app.post('/api/send-email', async (req, res) => {
  const { adminPass } = req.body;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false, error: 'Nespravne heslo' });
  try {
    const orders = await loadOrders();
    const menu = await fetchMenu();
    const result = await sendEmail(orders, menu);
    res.json(result);
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/manual-menu
app.post('/api/manual-menu', async (req, res) => {
  const { adminPass, menu } = req.body;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false, error: 'Nespravne heslo' });
  await setManualMenu(menu);
  res.json({ ok: true, message: 'Manualne menu nastavene' });
});

// POST /api/clear-orders
app.post('/api/clear-orders', async (req, res) => {
  const { adminPass } = req.body;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false, error: 'Nespravne heslo' });
  try {
    await saveOrders({}, []);
    res.json({ ok: true, message: 'Objednavky vymazane' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/version — verzia aplikacie (z package.json)
app.get('/api/version', (req, res) => {
  res.json({ ok: true, version: pkg.version });
});

// GET /api/changelog — parsovany CHANGELOG.md (aby sa changelog v appke nemusel
// udrziavat na dvoch miestach)
let _changelogCache = null;
app.get('/api/changelog', (req, res) => {
  try {
    if (!_changelogCache) {
      const md = fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf8');
      const versions = [];
      let cur = null, sec = null;
      md.split('\n').forEach(line => {
        const vm = line.match(/^##\s*\[([^\]]+)\]\s*[—–-]\s*(.+?)\s*$/);
        if (vm) { cur = { version: vm[1], date: vm[2].trim(), sections: [] }; versions.push(cur); sec = null; return; }
        const sm = line.match(/^###\s+(.+?)\s*$/);
        if (sm && cur) { sec = { title: sm[1].trim(), items: [] }; cur.sections.push(sec); return; }
        const im = line.match(/^\s*[-*]\s+(.+?)\s*$/);
        if (im && cur) {
          if (!sec) { sec = { title: '', items: [] }; cur.sections.push(sec); }
          sec.items.push(im[1].trim());
        }
      });
      _changelogCache = versions;
    }
    res.json({ ok: true, versions: _changelogCache });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// GET /api/design — aktualny vzhlad (verejne, pre prepnutie temy)
app.get('/api/design', async (req, res) => {
  const vzhlad = await getVzhlad();
  // 'futuristic' boolean ostava pre spatnu kompatibilitu klientov
  res.json({ ok: true, theme: vzhlad.tema, futuristic: vzhlad.tema === 'futuristic' });
});

// POST /api/admin/design — vyber temy (classic / futuristic / trattoria)
app.post('/api/admin/design', async (req, res) => {
  const { adminPass, theme, futuristic } = req.body;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false });
  // Novy klient posiela 'theme'; stary boolean 'futuristic' je fallback
  const tema = theme || (typeof futuristic !== 'undefined' ? (futuristic ? 'futuristic' : 'classic') : '');
  if (!PLATNE_TEMY.includes(tema)) return res.status(400).json({ ok: false, error: 'Neznáma téma' });
  try {
    await NastaveniaVzhlad.findOneAndUpdate(
      {}, { $set: { tema, futuristicky: tema === 'futuristic' } }, { upsert: true, new: true }
    );
    clearVzhladCache();
    const vzhlad = await getVzhlad();
    res.json({ ok: true, theme: vzhlad.tema, futuristic: vzhlad.tema === 'futuristic' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/qr
app.post('/api/qr', async (req, res) => {
  const { meno, polievka, jedlo, pizza, dezert } = req.body;
  const platba = await getPlatba();
  if (!platba.iban) return res.status(400).json({ ok: false, error: 'IBAN nie je nastavený — nastav ho v Admin → Platba' });
  try {
    const menu = await fetchMenu();
    const cena = vypocitajCenu(polievka, jedlo, pizza, dezert, menu);
    if (!cena) return res.status(400).json({ ok: false, error: 'Nepodarilo sa vypocitat cenu' });
    const sprava = qrSprava(meno);
    const qrBase64 = await generatePayBySquareQR({
      iban: platba.iban, bic: platba.bic,
      suma: cena.celkom, sprava,
      meno: platba.meno, variabilnySymbol: platba.vs
    });
    res.json({ ok: true, qr: qrBase64, suma: cena.celkom, detail: cena.detail, iban: platba.iban, sprava, revolut: platba.revolut });
  } catch(err) { res.status(500).json({ ok: false, error: err.message }); }
});

// GET /api/easter-qr
app.get('/api/easter-qr', async (req, res) => {
  const platba = await getPlatba();
  if (!platba.iban) return res.status(400).json({ ok: false });
  try {
    const qr = await generatePayBySquareQR({
      iban: platba.iban, bic: platba.bic,
      suma: 3.00, sprava: 'Poplatok za predlzenie objednavok',
      meno: platba.meno, variabilnySymbol: ''
    });
    res.json({ ok: true, qr });
  } catch(err) { res.status(500).json({ ok: false, error: err.message }); }
});

// POST /api/send-qr-email
app.post('/api/send-qr-email', async (req, res) => {
  const { email, meno, polievka, jedlo, pizza, dezert, poznamka } = req.body;
  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ ok: false, error: 'Neplatný email' });
  }
  const platba = await getPlatba();
  if (!platba.iban) return res.status(400).json({ ok: false, error: 'IBAN nie je nastavený — nastav ho v Admin → Platba' });

  try {
    const menu = await fetchMenu();
    const cena = vypocitajCenu(polievka, jedlo, pizza, dezert, menu);
    if (!cena) return res.status(400).json({ ok: false, error: 'Nepodarilo sa vypočítať cenu' });

    const sprava = qrSprava(meno);
    const qrBase64 = await generatePayBySquareQR({
      iban: platba.iban, bic: platba.bic,
      suma: cena.celkom, sprava,
      meno: platba.meno, variabilnySymbol: platba.vs
    });

    const datumStr = new Date().toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    const base64Data = qrBase64.replace(/^data:image\/png;base64,/, '');

    // "P2 Názov" → farebný odznak + text
    const itemRow = (val, emoji, color) => {
      const m = val.match(/^((?:PZ|[PJD])\d+)\s+([\s\S]*)$/);
      const badge = m ? m[1] : '';
      const rest  = m ? m[2] : val;
      return `<tr>
        <td style="padding:9px 0;border-bottom:1px solid #eef1f4;font-size:14px;color:#2b2f36">
          <span style="display:inline-block;width:22px">${emoji}</span>
          ${badge ? `<span style="display:inline-block;background:${color};color:#fff;font-size:11px;font-weight:800;padding:2px 8px;border-radius:7px;margin:0 7px 0 2px">${badge}</span>` : ''}${rest}
        </td></tr>`;
    };
    const itemsHtml = [
      polievka ? itemRow(relabel(polievka, 'P'), '🍲', '#1565c0') : '',
      jedlo    ? itemRow(relabel(jedlo, 'J'), '🍽️', '#c0392b') : '',
      pizza    ? itemRow(relabel(pizza, 'PZ'), '🍕', '#e67e22') : '',
      dezert   ? itemRow(relabel(dezert, 'D'), '🍮', '#8e44ad') : '',
    ].join('');
    const gyrosWarn = pizza && /gyros/i.test(pizza)
      ? `<tr><td style="padding:8px 0 0"><span style="display:inline-block;font-size:12px;font-weight:700;color:#b23827;background:#fdecea;border:1px solid #f5c6bf;border-radius:8px;padding:3px 10px">⚠️ Pozor: môže obsahovať cibuľu</span></td></tr>`
      : '';
    const detailRow = (label, value) => `
      <tr>
        <td style="padding:7px 0;font-size:13px;color:#8a93a0;width:96px">${label}</td>
        <td style="padding:7px 0;font-size:13px;color:#2b2f36;font-family:'SF Mono',Menlo,Consolas,monospace;word-break:break-all">${value}</td>
      </tr>`;

    const html = `<!DOCTYPE html>
<html lang="sk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f4;-webkit-font-smoothing:antialiased">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:26px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px rgba(20,30,50,.10)">

        <!-- Hlavička -->
        <tr><td style="background:#16a34a;background:linear-gradient(135deg,#0f7a3d 0%,#16a34a 55%,#22c55e 100%);padding:30px 28px;text-align:center">
          <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.78)">QR platba za obed</div>
          <div style="font-size:24px;font-weight:800;color:#fff;margin-top:6px">🍕 Fantozzi</div>
          <div style="font-size:13px;color:rgba(255,255,255,.85);margin-top:4px">${datumStr}</div>
        </td></tr>

        <tr><td style="padding:24px 28px 6px">
          ${meno ? `<p style="font-size:15px;margin:0 0 16px;color:#2b2f36">Ahoj <strong>${meno}</strong>! 👋 Tu je tvoja platba za obed.</p>` : ''}

          <!-- Suma -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;border-radius:16px">
            <tr><td style="padding:20px;text-align:center">
              <div style="font-size:12px;color:#15803d;font-weight:700;text-transform:uppercase;letter-spacing:.6px">Suma na úhradu</div>
              <div style="font-size:38px;font-weight:800;color:#15803d;line-height:1;margin-top:8px">${cena.celkom.toFixed(2)} €</div>
            </td></tr>
          </table>

          <!-- QR príloha -->
          <div style="text-align:center;margin:18px 0 6px">
            <span style="display:inline-block;background:#eff6ff;color:#1d4ed8;font-size:13px;font-weight:600;padding:9px 16px;border-radius:999px">📎 QR kód nájdeš v prílohe <strong>qr-platba.png</strong></span>
          </div>
        </td></tr>

        <!-- Platobné údaje -->
        <tr><td style="padding:10px 28px 4px">
          <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#9aa3af;margin-bottom:4px">Platobné údaje</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fb;border:1px solid #eef1f4;border-radius:14px;padding:6px 16px">
            ${detailRow('IBAN', platba.iban)}
            ${platba.vs ? detailRow('VS', platba.vs) : ''}
            ${detailRow('Poznámka', sprava)}
          </table>
        </td></tr>

        <!-- Objednávka -->
        <tr><td style="padding:16px 28px 4px">
          <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#9aa3af;margin-bottom:4px">Tvoja objednávka</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #eef1f4;border-radius:14px;padding:4px 16px">
            ${itemsHtml}
            ${gyrosWarn}
            ${poznamka ? `<tr><td style="padding:8px 0 2px"><span style="display:inline-block;font-size:13px;color:#8a6d3b;background:#fff8e6;border-radius:8px;padding:4px 10px">📝 ${poznamka}</span></td></tr>` : ''}
          </table>
        </td></tr>

        <!-- Pätička -->
        <tr><td style="padding:18px 28px 28px;text-align:center">
          <div style="font-size:12px;color:#aab2bd;line-height:1.6">Naskenuj QR kód v bankovej aplikácii<br><span style="color:#8a93a0">SLSP · VÚB · Tatra banka · ČSOB · mBank · Raiffeisen</span></div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const result = await sendMail({
      to: email.trim(),
      subject: `QR platba Fantozzi — ${new Date().toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava' })}`,
      html,
      attachments: [{ filename: 'qr-platba.png', content: base64Data, encoding: 'base64', cid: 'qrcode' }]
    });
    if (!result.ok) throw new Error(result.error || 'Odoslanie zlyhalo');

    console.log(`[QR Email] Odoslany na ${email}`);
    res.json({ ok: true });
  } catch(err) {
    console.error('[QR Email] Chyba:', err.message);
    res.status(500).json({ ok: false, error: 'Nepodarilo sa odoslať email: ' + err.message });
  }
});

// POST /api/admin/set-deadline
app.post('/api/admin/set-deadline', (req, res) => {
  const { adminPass, deadline } = req.body;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false, error: 'Nespravne heslo' });
  if (!deadline || !/^\d{2}:\d{2}$/.test(deadline)) return res.status(400).json({ ok: false, error: 'Neplatny format casu (HH:MM)' });
  const [hh, mm] = deadline.split(':').map(Number);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return res.status(400).json({ ok: false, error: 'Neplatny cas' });

  config.orderDeadline = deadline;
  setupCrons();
  res.json({ ok: true, deadline, message: `Uzavierka nastavena na ${deadline}` });
});

// POST /api/test-push
app.post('/api/test-push', async (req, res) => {
  const { adminPass } = req.body;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false, error: 'Nespravne heslo' });
  const result = await notifyTestPush();
  res.json(result);
});

// POST /api/admin/qr-test
app.post('/api/admin/qr-test', async (req, res) => {
  const { adminPass, polievka, jedlo, pizza, dezert, sumaOverride, ibanOverride, bicOverride, sprava } = req.body;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false, error: 'Nespravne heslo' });

  const platba = await getPlatba();
  const iban = (ibanOverride || platba.iban || '').replace(/\s/g, '');
  if (!iban) return res.status(400).json({ ok: false, error: 'IBAN nie je nastavený — nastav ho v Admin → Platba' });
  const bic = (bicOverride !== undefined ? bicOverride : platba.bic || '').replace(/\s/g, '');

  try {
    const menu = await fetchMenu();
    let suma, detail;

    if (sumaOverride && sumaOverride > 0) {
      suma   = Math.round(sumaOverride * 100) / 100;
      detail = [`Manuálna suma: ${suma.toFixed(2)} €`];
    } else {
      const cena = vypocitajCenu(polievka, jedlo, pizza, dezert, menu);
      if (!cena) return res.status(400).json({ ok: false, error: 'Neviem vypočítať cenu' });
      suma   = cena.celkom;
      detail = cena.detail;
    }

    const spravaText = bezDiakritiky(sprava || `Obed Fantozzi ${new Date().toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava' })}`);
    const qrBase64   = await generatePayBySquareQR({
      iban, bic, suma, sprava: spravaText,
      meno: platba.meno || 'Fantozzi',
      variabilnySymbol: platba.vs || ''
    }, { validate: false });

    res.json({ ok: true, qr: qrBase64, suma, detail, iban, bic: bic || '(žiadny)', sprava: spravaText });
  } catch(err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/admin/test-deadline
app.post('/api/admin/test-deadline', async (req, res) => {
  const { adminPass } = req.body;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false, error: 'Nespravne heslo' });
  console.log('[Admin] Manualne spustenie runDeadlineActions...');
  const result = await runDeadlineActions();
  res.json({ ok: true, ...result });
});

// GET /api/long-history (admin) - derivuje z MongoDB
app.get('/api/long-history', async (req, res) => {
  const { adminPass } = req.query;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false, error: 'Nespravne heslo' });
  try {
    const docs = await DenneObjednavky.find({}, { datum: 1, orders: 1 })
      .sort({ _id: -1 }).limit(90);
    const history = docs
      .filter(doc => Object.keys(doc.orders || {}).length > 0)
      .map(doc => {
        const entries = Object.values(doc.orders || {});
        let celkovaCena = 0;
        entries.forEach(o => {
          if (o.pizza && o.polievka) celkovaCena += 6.70;
          else if (o.jedlo && o.polievka) celkovaCena += 6.50;
        });
        return {
          datum: doc.datum,
          pocet: entries.length,
          celkovaCena: Math.round(celkovaCena * 100) / 100,
          objednavky: entries.map(o => ({ meno: o.meno, polievka: o.polievka, jedlo: o.jedlo, poznamka: o.poznamka }))
        };
      });
    res.json({ ok: true, history });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/history - zoznam dni s objednavkami (pre frontend navigaciu)
app.get('/api/history', async (req, res) => {
  try {
    const docs = await DenneObjednavky.find({}, { datum: 1, orders: 1 })
      .sort({ _id: -1 }).limit(60);
    const history = docs
      .filter(doc => Object.keys(doc.orders || {}).length > 0)
      .map(doc => ({ datum: doc.datum, count: Object.keys(doc.orders || {}).length }));
    res.json({ ok: true, history });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/history/:datum - objednavky pre konkretny den
app.get('/api/history/:datum', async (req, res) => {
  try {
    const datum = decodeURIComponent(req.params.datum);
    const doc = await DenneObjednavky.findOne({ datum });
    if (!doc) return res.json({ ok: true, orders: {}, count: 0, datum });
    res.json({ ok: true, orders: doc.orders || {}, count: Object.keys(doc.orders || {}).length, datum: doc.datum });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Nastavenia platby ─────────────────────────────────────────────────────────

// GET /api/admin/platba-config
app.get('/api/admin/platba-config', async (req, res) => {
  const { adminPass } = req.query;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false });
  try {
    const doc = await NastaveniaPlatby.findOne({});
    // Separate DB values from env values so UI can show source
    const dbIban = doc?.iban || '';
    const dbBic  = doc?.bic  || '';
    const dbMeno = doc?.meno || '';
    const dbVs   = doc?.vs   || '';
    const dbRevolut = doc?.revolut || '';
    const platba = await getPlatba();
    res.json({
      ok: true,
      // Current DB-saved values (what's in the edit form)
      iban: dbIban, bic: dbBic, meno: dbMeno, vs: dbVs, revolut: dbRevolut,
      // Env var fallbacks (shown as hints)
      envIban: config.platbaIban || '', envBic: config.platbaBic || '',
      envMeno: config.platbaMeno || '', envVs:  config.platbaVS  || '',
      envRevolut: config.platbaRevolut || '',
      // Effective merged values
      effective: platba
    });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/admin/platba-config
app.post('/api/admin/platba-config', async (req, res) => {
  const { adminPass, iban, bic, meno, vs, revolut } = req.body;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false });
  try {
    // Normalizuj Revolut na cisty revtag/username (znesie aj vlozeny revolut.me odkaz alebo @tag)
    const revolutClean = (revolut || '').trim()
      .replace(/^@/, '')
      .replace(/^https?:\/\/(www\.)?revolut\.me\//i, '')
      .replace(/\/+$/, '')
      .replace(/\s/g, '');
    await NastaveniaPlatby.findOneAndUpdate(
      {},
      { $set: {
        iban: (iban || '').replace(/\s/g, '').toUpperCase(),
        bic:  (bic  || '').replace(/\s/g, '').toUpperCase(),
        meno: (meno || '').trim(),
        vs:   (vs   || '').trim(),
        revolut: revolutClean
      }},
      { upsert: true, new: true }
    );
    clearPlatbaCache();
    const platba = await getPlatba(); // Re-cache immediately
    res.json({ ok: true, effective: platba });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Blokované obdobia ─────────────────────────────────────────────────────────

// GET /api/admin/blokovane-obdobia
app.get('/api/admin/blokovane-obdobia', async (req, res) => {
  const { adminPass } = req.query;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false });
  try {
    const docs = await BlokovaneObdobie.find({}).sort({ od: 1 });
    res.json({ ok: true, obdobia: docs });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/admin/blokovane-obdobia
app.post('/api/admin/blokovane-obdobia', async (req, res) => {
  const { adminPass, od, do: do_, dovod } = req.body;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false });
  if (!od || !do_) return res.status(400).json({ ok: false, error: 'Chýba dátum od/do' });
  if (od > do_) return res.status(400).json({ ok: false, error: 'Dátum "od" musí byť pred dátumom "do"' });
  try {
    const doc = await BlokovaneObdobie.create({
      od, do: do_,
      dovod: (dovod || 'Neprítomnosť Filipa Švolíka').trim(),
      vytvorene: new Date().toISOString()
    });
    res.json({ ok: true, obdobie: doc });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// DELETE /api/admin/blokovane-obdobia/:id
app.delete('/api/admin/blokovane-obdobia/:id', async (req, res) => {
  const { adminPass } = req.query;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false });
  try {
    await BlokovaneObdobie.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Easter Egg Counters ───────────────────────────────────────────────────────

// POST /api/easter-trigger
app.post('/api/easter-trigger', async (req, res) => {
  const { egg, meno } = req.body;
  if (!egg) return res.status(400).json({ ok: false });
  try {
    await EasterEggTrigger.create({
      egg:  egg.trim(),
      meno: (meno || 'Neznámy').trim(),
      cas:  new Date().toISOString()
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/easter-stats
app.get('/api/easter-stats', async (req, res) => {
  try {
    const agg = await EasterEggTrigger.aggregate([
      { $group: { _id: { egg: '$egg', meno: '$meno' }, count: { $sum: 1 } } },
      { $group: { _id: '$_id.egg', total: { $sum: '$count' },
          users: { $push: { meno: '$_id.meno', count: '$count' } } } }
    ]);
    const stats = {};
    agg.forEach(e => {
      stats[e._id] = { total: e.total, users: e.users.sort((a, b) => b.count - a.count) };
    });
    res.json({ ok: true, stats });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Cron ──────────────────────────────────────────────────────────────────────
async function runDeadlineActions() {
  const orders = await loadOrders();
  if (Object.keys(orders).length === 0) {
    console.log('[Cron] Ziadne objednavky — email a push preskocene.');
    return { skipped: true };
  }
  console.log(`[Cron] ${Object.keys(orders).length} objednavok — odosielam email a push...`);
  const menu = await fetchMenu();
  const emailResult = await sendEmail(orders, menu);
  if (emailResult.ok) console.log('[Cron] Email odoslany:', emailResult.messageId);
  else console.error('[Cron] Email CHYBA:', emailResult.error);
  const pushResult = await notifySuhrn(orders, menu).catch(e => ({ ok: false, error: e.message }));
  if (pushResult?.ok === false) console.error('[Cron] Push CHYBA:', pushResult.error);
  return { emailResult, pushResult };
}

let cronTasks = [];

function setupCrons() {
  cronTasks.forEach(t => { try { t.stop(); } catch(e) {} });
  cronTasks = [];

  const [hh, mm] = config.orderDeadline.split(':').map(Number);
  const cronOpts = { timezone: 'Europe/Bratislava' };

  cronTasks.push(cron.schedule(`${mm} ${hh} * * *`, async () => {
    console.log(`[Cron] Uzavierka ${config.orderDeadline} (Bratislava) - spustam...`);
    await runDeadlineActions();
  }, cronOpts));

  // Kazdu noc o polnoci len cistim cache - data v MongoDB zostanu
  cronTasks.push(cron.schedule('0 0 * * *', () => {
    clearCache();
    console.log('[Cron] 00:00 - Cache vymazana');
  }, cronOpts));

  cronTasks.push(cron.schedule('0 7 * * 1-5', () => {
    clearCache();
    console.log('[Cron] 07:00 - Cache vymazana');
  }, cronOpts));

  console.log(`[Cron] Nastavene pre uzavierku: ${config.orderDeadline} (timezone: Europe/Bratislava)`);
}

setupCrons();

// ── Spustenie ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || process.env.port || config.port || 8124;

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  🍕 Fantozzi Objednavkovy System');
  console.log('  ================================');
  console.log(`  ✅ Server bezi na http://0.0.0.0:${PORT}`);
  console.log(`  ✅ Email: ${config.emailSender} → ${config.emailRecipient}`);
  console.log(`  ✅ Uzavierka: ${config.orderDeadline}`);
  if (config.ntfyTopic) console.log(`  ✅ Push: ${config.ntfyUrl || 'https://ntfy.sh'}/${config.ntfyTopic}`);
  else console.log(`  ⚠️  Push: VYPNUTE`);
  console.log('');
});
