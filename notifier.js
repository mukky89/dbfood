const axios  = require('axios');
const config = require('./config');

const NTFY_URL   = config.ntfyUrl   || 'https://ntfy.sh';
const NTFY_TOPIC = config.ntfyTopic || null;

async function sendPush({ title, message, priority = 'default', tags = '' }) {
  if (!NTFY_TOPIC) {
    console.log('[Ntfy] ntfyTopic nie je nastaveny — preskakujem push');
    return { ok: false, error: 'ntfyTopic not configured' };
  }

  const url = `${NTFY_URL}/${NTFY_TOPIC}`;
  try {
    await axios.post(url, message, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Title':    title,
        'Priority': priority,
        ...(tags ? { 'Tags': tags } : {})
      },
      timeout: 8000
    });
    console.log(`[Ntfy] Push odoslany: "${title}"`);
    return { ok: true };
  } catch(err) {
    const status = err.response?.status;
    const detail = err.response?.data || err.message;
    console.error(`[Ntfy] Chyba (${status}):`, detail);
    return { ok: false, error: status ? `HTTP ${status}: ${detail}` : err.message };
  }
}

async function notifyNovaObjednavka(meno, polievka, jedlo, pizza, poznamka) {
  const pSkrat = polievka ? polievka.replace(/^(?:č\.|PZ|[PJD])\d+\s*/, '') : '-';
  const hlavne = pizza || jedlo;
  const jSkrat = hlavne ? hlavne.replace(/^(?:č\.|PZ|[PJD])\d+\s*/, '') : '-';
  let msg = `Polievka: ${pSkrat}\n${pizza ? '🍕 Pizza' : 'Jedlo'}: ${jSkrat}`;
  if (poznamka) msg += `\nPoznamka: ${poznamka}`;
  return sendPush({ title: `${meno} objednal/a obed`, message: msg, priority: 'default', tags: 'pizza,white_check_mark' });
}

async function notifyUpravaObjednavky(meno, jedlo) {
  const jSkrat = jedlo ? jedlo.replace(/^(?:č\.|PZ|[PJD])\d+\s*/, '') : '-';
  return sendPush({ title: `${meno} upravil/a objednavku`, message: `Nove jedlo: ${jSkrat}`, priority: 'low', tags: 'pencil' });
}

async function notifyZrusenieObjednavky(meno) {
  return sendPush({ title: `${meno} zrusil/a objednavku`, message: 'Objednavka bola odstranena.', priority: 'low', tags: 'wastebasket' });
}

function safeDatum() {
  const d = new Date();
  const days = ['Nedela','Pondelok','Utorok','Streda','Stvrtok','Piatok','Sobota'];
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  return `${days[d.getDay()]} ${dd}.${mm}.${yyyy}`;
}

// Vzdy zobrazi spravny prefix podla typu (P/J/PZ/D), aj pre stare "č.N" objednavky
function relabel(val, prefix) {
  if (!val) return val;
  const m = val.match(/^(?:č\.|PZ|[PJD])(\d+)\s*/);
  if (!m) return val;
  return `${prefix}${m[1]} ${val.slice(m[0].length)}`;
}

function countItems(entries, getter, prefix) {
  const map = {};
  entries.forEach(o => {
    const val = getter(o);
    if (!val) return;
    const labeled = relabel(val, prefix);
    const m = labeled.match(/^((?:č\.|PZ|[PJD])\d+)/i);
    const key = m ? m[1] : labeled.trim();
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}

function formatSection(title, map) {
  const keys = Object.keys(map);
  if (keys.length === 0) return '';
  const lines = keys
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, '')) || 0;
      const nb = parseInt(b.replace(/\D/g, '')) || 0;
      return na - nb;
    })
    .map(k => `${map[k]}x ${k}`)
    .join('\n');
  return `\n${title}\n${lines}`;
}

async function notifySuhrn(orders, menu) {
  const entries = Object.values(orders);
  if (entries.length === 0) return;
  const datum = safeDatum();

  const jedlaMap    = countItems(entries, o => o.jedlo, 'J');
  const pizzaMap    = countItems(entries, o => o.pizza, 'PZ');
  const polievkaMap = countItems(entries, o => o.polievka, 'P');
  const dezertMap   = countItems(entries, o => o.dezert, 'D');

  let msg = `Celkom objednavok ${entries.length}\n`;
  msg += `\nSuhrn\n-------------`;
  msg += formatSection('Polievka:', polievkaMap);
  msg += formatSection('\nJedlo:', jedlaMap);
  msg += formatSection('\nPizza:', pizzaMap);
  msg += formatSection('\nDezert:', dezertMap);

  return sendPush({ title: `Objednavky uzavrete - ${datum}`, message: msg, priority: 'high', tags: 'bell,memo' });
}

async function notifyPripomienka(orders, deadline) {
  const entries = Object.values(orders);
  const pocet = entries.length;
  let msg = pocet > 0
    ? `Uz objednalo ${pocet} ludi:\n` + entries.map(o => `- ${o.meno}`).join('\n')
    : 'Este nikto neobjednal.';
  msg += `\n\nUzavierka objednavok: ${deadline}`;
  return sendPush({
    title: 'Objednaj si obed! Fantozzi',
    message: msg,
    priority: 'high',
    tags: 'fork_and_knife,bell'
  });
}

async function notifyTestPush() {
  return sendPush({ title: 'Fantozzi - test notifikacie', message: 'ntfy.sh funguje spravne! Notifikacie su aktivne.', priority: 'default', tags: 'white_check_mark' });
}

module.exports = { sendPush, notifyNovaObjednavka, notifyUpravaObjednavky, notifyZrusenieObjednavky, notifySuhrn, notifyPripomienka, notifyTestPush };
