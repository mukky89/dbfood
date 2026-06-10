const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cron = require('node-cron');
const config = require('./config');
const { fetchMenu, setManualMenu, clearCache } = require('./scraper');
const { sendEmail, sendMail } = require('./mailer');
const { generatePayBySquareQR, vypocitajCenu } = require('./paysquare');
const { notifyNovaObjednavka, notifyUpravaObjednavky, notifyZrusenieObjednavky, notifyPripomienka, notifySuhrn, notifyTestPush } = require('./notifier');

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
  vs:   { type: String, default: '' }
});
const NastaveniaPlatby = mongoose.model('NastaveniaPlatby', nastaveniaPlatbySchema);

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
      vs:    doc?.vs   || config.platbaVS    || ''
    };
  } catch(e) {
    _platbaCache = {
      iban: (config.platbaIban || '').replace(/\s/g, ''),
      bic:  (config.platbaBic  || '').replace(/\s/g, ''),
      meno:  config.platbaMeno || 'Fantozzi',
      vs:    config.platbaVS   || ''
    };
  }
  return _platbaCache;
}
function clearPlatbaCache() { _platbaCache = null; }

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
app.post('/api/manual-menu', (req, res) => {
  const { adminPass, menu } = req.body;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false, error: 'Nespravne heslo' });
  setManualMenu(menu);
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

// POST /api/qr
app.post('/api/qr', async (req, res) => {
  const { polievka, jedlo, pizza, dezert } = req.body;
  const platba = await getPlatba();
  if (!platba.iban) return res.status(400).json({ ok: false, error: 'IBAN nie je nastavený — nastav ho v Admin → Platba' });
  try {
    const menu = await fetchMenu();
    const cena = vypocitajCenu(polievka, jedlo, pizza, dezert, menu);
    if (!cena) return res.status(400).json({ ok: false, error: 'Nepodarilo sa vypocitat cenu' });
    const sprava = `Obed Fantozzi ${new Date().toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava' })}`;
    const qrBase64 = await generatePayBySquareQR({
      iban: platba.iban, bic: platba.bic,
      suma: cena.celkom, sprava,
      meno: platba.meno, variabilnySymbol: platba.vs
    });
    res.json({ ok: true, qr: qrBase64, suma: cena.celkom, detail: cena.detail, iban: platba.iban, sprava });
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

    const sprava = `Obed Fantozzi ${new Date().toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava' })}`;
    const qrBase64 = await generatePayBySquareQR({
      iban: platba.iban, bic: platba.bic,
      suma: cena.celkom, sprava,
      meno: platba.meno, variabilnySymbol: platba.vs
    });

    const datumStr = new Date().toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    const items = [
      polievka ? `🍲 ${polievka}` : null,
      jedlo    ? `🍽️ ${jedlo}`   : null,
      pizza    ? `🍕 ${pizza}`   : null,
      dezert   ? `🍮 ${dezert}`  : null,
    ].filter(Boolean);
    const base64Data = qrBase64.replace(/^data:image\/png;base64,/, '');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#333">
  <div style="background:#2c3e50;color:white;padding:20px 24px;border-radius:8px 8px 0 0;text-align:center">
    <div style="font-size:36px">🍕</div>
    <h2 style="margin:8px 0 0">Fantozzi — QR platba</h2>
    <p style="margin:4px 0 0;opacity:.8;font-size:14px">${datumStr}</p>
  </div>
  <div style="border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px;padding:24px">
    ${meno ? `<p style="font-size:15px;margin-top:0">Ahoj <strong>${meno}</strong>! Tu je tvoj QR kód pre platbu obeda.</p>` : ''}
    <div style="text-align:center;margin:16px 0">
      <div style="font-size:32px;font-weight:900;color:#e74c3c;margin:10px 0">${cena.celkom.toFixed(2)} €</div>
      <div style="font-size:13px;color:#666;margin:8px 0">📎 QR kód pre platbu nájdeš v prílohe (<strong>qr-platba.png</strong>)</div>
      <div style="font-size:12px;color:#999;font-family:monospace;background:#f5f5f5;padding:6px 12px;border-radius:6px;display:inline-block">IBAN: ${platba.iban}</div>
    </div>
    <div style="background:#f9f9f9;border-radius:8px;padding:14px;margin-top:16px">
      <div style="font-size:12px;font-weight:700;color:#999;text-transform:uppercase;margin-bottom:8px">Objednávka</div>
      ${items.map(i => `<div style="font-size:14px;padding:3px 0">${i}</div>`).join('')}
      ${poznamka ? `<div style="font-size:13px;color:#f39c12;margin-top:6px;font-style:italic">📝 ${poznamka}</div>` : ''}
    </div>
    <p style="font-size:12px;color:#999;margin-top:20px;text-align:center">Naskenuj QR kód v banking appke (SLSP, VÚB, Tatra, ČSOB, mBank, Raiffeisen)</p>
  </div>
</body></html>`;

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

    const spravaText = sprava || `Obed Fantozzi ${new Date().toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava' })}`;
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
    const platba = await getPlatba();
    res.json({
      ok: true,
      // Current DB-saved values (what's in the edit form)
      iban: dbIban, bic: dbBic, meno: dbMeno, vs: dbVs,
      // Env var fallbacks (shown as hints)
      envIban: config.platbaIban || '', envBic: config.platbaBic || '',
      envMeno: config.platbaMeno || '', envVs:  config.platbaVS  || '',
      // Effective merged values
      effective: platba
    });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/admin/platba-config
app.post('/api/admin/platba-config', async (req, res) => {
  const { adminPass, iban, bic, meno, vs } = req.body;
  if (adminPass !== config.adminPassword) return res.status(401).json({ ok: false });
  try {
    await NastaveniaPlatby.findOneAndUpdate(
      {},
      { $set: {
        iban: (iban || '').replace(/\s/g, '').toUpperCase(),
        bic:  (bic  || '').replace(/\s/g, '').toUpperCase(),
        meno: (meno || '').trim(),
        vs:   (vs   || '').trim()
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
