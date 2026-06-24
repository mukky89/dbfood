const nodemailer = require('nodemailer');
const axios = require('axios');
const config = require('./config');

// Vzdy zobrazi spravny prefix podla typu (P/J/PZ/D), aj pre stare "č.N" objednavky
function relabel(val, prefix) {
  if (!val) return val;
  const m = val.match(/^(?:č\.|PZ|[PJD])(\d+)\s*/);
  if (!m) return val;
  return `${prefix}${m[1]} ${val.slice(m[0].length)}`;
}

function createTransporter() {
  // Ak je v config nastaveny vlastny SMTP (napr. Brevo), pouzi ho
  if (config.smtpHost) {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort || 587,
      secure: false,
      auth: {
        user: config.smtpUser || config.emailSender,
        pass: config.emailPassword
      }
    });
  }
  // Fallback: Gmail
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.emailSender,
      pass: config.emailPassword
    }
  });
}

function formatEmail(orders, menu) {
  const dnes = menu ? menu.datum : new Date().toLocaleDateString('sk-SK');
  const zoznam = Object.values(orders);

  if (zoznam.length === 0) {
    return {
      subject: `Objednavky Fantozzi - ${dnes}`,
      text: `Dnes (${dnes}) nikto neobjednal.`,
      html: `<p>Dnes (${dnes}) nikto neobjednal.</p>`
    };
  }

  // Pocty od kazdeho jedla — zoskupene podla typu: polievky → jedla → pizze → dezerty
  const mapPol = {}, mapJedlo = {}, mapPizza = {}, mapDezert = {};
  zoznam.forEach(o => {
    if (o.polievka) {
      const k = relabel(o.polievka, 'P');
      mapPol[k] = (mapPol[k] || 0) + 1;
    }
    if (o.pizza) {
      const k = `🍕 ${relabel(o.pizza, 'PZ')}`;
      mapPizza[k] = (mapPizza[k] || 0) + 1;
    } else if (o.jedlo) {
      const k = relabel(o.jedlo, 'J');
      mapJedlo[k] = (mapJedlo[k] || 0) + 1;
    }
    if (o.dezert) {
      const k = `🍮 ${relabel(o.dezert, 'D')}`;
      mapDezert[k] = (mapDezert[k] || 0) + 1;
    }
  });
  // V ramci skupiny zoradene podla cisla polozky (P1, P2, … / J2, J3, J5 …)
  const sortByNum = map => Object.entries(map).sort((a, b) => {
    const na = parseInt((a[0].match(/(\d+)/) || [])[1] || 0, 10);
    const nb = parseInt((b[0].match(/(\d+)/) || [])[1] || 0, 10);
    return na - nb;
  });
  const pocty = [...sortByNum(mapPol), ...sortByNum(mapJedlo), ...sortByNum(mapPizza), ...sortByNum(mapDezert)];

  // Plain text verzia
  let text = `OBJEDNAVKY FANTOZZI - ${dnes}\n`;
  text += `${'='.repeat(50)}\n\n`;
  text += `Celkovy pocet objednavok: ${zoznam.length}\n\n`;
  text += `ZOZNAM:\n`;
  zoznam.forEach((o, i) => {
    text += `${i + 1}. ${o.meno.padEnd(15)} `;
    text += `Polievka: ${o.polievka ? relabel(o.polievka, 'P') : '-'} | `;
    text += `Jedlo: ${o.pizza ? `Pizza: ${relabel(o.pizza, 'PZ')}` : (o.jedlo ? relabel(o.jedlo, 'J') : '-')}`;
    if (o.dezert) text += ` | Dezert: ${relabel(o.dezert, 'D')}`;
    if (o.poznamka) text += ` | Poznamka: ${o.poznamka}`;
    text += '\n';
  });
  text += `\nSUHRN POCTY:\n`;
  pocty.forEach(([jedlo, pocet]) => {
    text += `  ${jedlo}: ${pocet}x\n`;
  });

  // ── HTML verzia (moderný dizajn) ──────────────────────────────────────
  const pocetPol    = zoznam.filter(o => o.polievka).length;
  const pocetHlavne = zoznam.filter(o => o.jedlo || o.pizza).length;
  const pocetDezert = zoznam.filter(o => o.dezert).length;

  // Vykreslí "P2 Názov" → farebný odznak + text
  const badgeCell = (val, color) => {
    if (!val) return '<span style="color:#aeb6c0">—</span>';
    const m = val.match(/^((?:PZ|[PJD])\d+)\s+([\s\S]*)$/);
    const badge = m ? m[1] : '';
    const rest  = m ? m[2] : val;
    const chip = badge
      ? `<span style="display:inline-block;background:${color};color:#fff;font-size:11px;font-weight:800;padding:2px 8px;border-radius:7px;margin-right:7px;letter-spacing:.3px">${badge}</span>`
      : '';
    return `${chip}<span style="color:#2b2f36">${rest}</span>`;
  };

  const avatarColors = ['#e74c3c','#3498db','#16a34a','#9b59b6','#f39c12','#1abc9c','#e67e22','#e91e63'];
  const riadkyHtml = zoznam.map((o, i) => {
    const initials = (o.meno || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const av = avatarColors[(o.meno || '').charCodeAt(0) % avatarColors.length];
    const hlavne = o.pizza ? badgeCell(`🍕 ${relabel(o.pizza, 'PZ')}`, '#e67e22') : badgeCell(o.jedlo ? relabel(o.jedlo, 'J') : '', '#c0392b');
    const gyros  = o.pizza && /gyros/i.test(o.pizza)
      ? `<div style="margin-top:4px;font-size:11px;font-weight:700;color:#b23827">⚠️ Pozor: môže obsahovať cibuľu</div>` : '';
    return `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fafbfc'}">
      <td style="padding:13px 16px;border-bottom:1px solid #eef1f4;vertical-align:top;width:38px">
        <span style="display:inline-block;width:30px;height:30px;line-height:30px;border-radius:50%;background:${av};color:#fff;font-weight:800;font-size:12px;text-align:center">${initials}</span>
      </td>
      <td style="padding:13px 8px;border-bottom:1px solid #eef1f4;vertical-align:top">
        <div style="font-weight:700;color:#1b1f24;font-size:14px;margin-bottom:5px">${o.meno}</div>
        <div style="font-size:13px;margin-bottom:3px">${badgeCell(o.polievka ? relabel(o.polievka, 'P') : '', '#1565c0')}</div>
        <div style="font-size:13px">${hlavne}</div>
        ${o.dezert ? `<div style="font-size:13px;margin-top:3px">${badgeCell(relabel(o.dezert, 'D'), '#8e44ad')}</div>` : ''}
        ${gyros}
        ${o.poznamka ? `<div style="margin-top:5px;font-size:12px;color:#8a6d3b;background:#fff8e6;border-radius:7px;padding:4px 9px;display:inline-block">📝 ${o.poznamka}</div>` : ''}
      </td>
    </tr>`;
  }).join('');

  // Súhrn počtov — zoskupený podľa typu
  const suhrnGroups = [
    { title: 'Polievky',     map: mapPol,    color: '#1565c0' },
    { title: 'Hlavné jedlá', map: mapJedlo,  color: '#c0392b' },
    { title: 'Pizza',        map: mapPizza,  color: '#e67e22' },
    { title: 'Dezerty',      map: mapDezert, color: '#8e44ad' },
  ];
  const poctyHtml = suhrnGroups.map(g => {
    const rows = sortByNum(g.map);
    if (!rows.length) return '';
    const head = `<tr><td colspan="2" style="padding:16px 16px 6px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:${g.color}">${g.title}</td></tr>`;
    const body = rows.map(([k, v]) => `
      <tr>
        <td style="padding:8px 16px;border-bottom:1px solid #eef1f4;font-size:14px;color:#2b2f36">${k}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #eef1f4;text-align:right;white-space:nowrap">
          <span style="display:inline-block;min-width:22px;background:${g.color};color:#fff;font-weight:800;font-size:13px;padding:3px 10px;border-radius:999px;text-align:center">${v}×</span>
        </td>
      </tr>`).join('');
    return head + body;
  }).join('');

  const statCard = (num, label, color) => `
    <td width="33.33%" style="padding:6px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fb;border:1px solid #eef1f4;border-radius:14px">
        <tr><td style="padding:14px 10px;text-align:center">
          <div style="font-size:26px;font-weight:800;color:${color};line-height:1">${num}</div>
          <div style="font-size:11px;color:#8a93a0;text-transform:uppercase;letter-spacing:.5px;margin-top:5px">${label}</div>
        </td></tr>
      </table>
    </td>`;

  const html = `<!DOCTYPE html>
<html lang="sk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f4;-webkit-font-smoothing:antialiased">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:26px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px rgba(20,30,50,.10)">

        <!-- Hlavička -->
        <tr><td style="background:#16a34a;background:linear-gradient(135deg,#0f7a3d 0%,#16a34a 55%,#22c55e 100%);padding:32px 30px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle">
              <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.75)">Denný súhrn objednávok</div>
              <div style="font-size:26px;font-weight:800;color:#ffffff;margin-top:6px">🍕 Fantozzi Objednávky</div>
              <div style="font-size:14px;color:rgba(255,255,255,.85);margin-top:4px">${dnes}</div>
            </td>
            <td style="vertical-align:middle;text-align:right;white-space:nowrap">
              <span style="display:inline-block;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:8px 16px;color:#fff;font-weight:800;font-size:15px">${zoznam.length} ${zoznam.length === 1 ? 'objednávka' : (zoznam.length < 5 ? 'objednávky' : 'objednávok')}</span>
            </td>
          </tr></table>
        </td></tr>

        <!-- Štatistické karty -->
        <tr><td style="padding:18px 18px 2px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            ${statCard(zoznam.length, 'Objednávok', '#16a34a')}
            ${statCard(pocetPol, 'Polievok', '#1565c0')}
            ${statCard(pocetHlavne, 'Hlavných jedál', '#c0392b')}
          </tr></table>
        </td></tr>

        <!-- Zoznam objednávok -->
        <tr><td style="padding:18px 24px 4px">
          <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#9aa3af;margin-bottom:8px">👥 Kto si čo objednal</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef1f4;border-radius:14px;overflow:hidden">
            ${riadkyHtml}
          </table>
        </td></tr>

        <!-- Súhrn počtov -->
        <tr><td style="padding:18px 24px 6px">
          <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#9aa3af;margin-bottom:8px">📊 Súhrn počtov</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef1f4;border-radius:14px;overflow:hidden">
            ${poctyHtml}
            <tr style="background:#f7f9fb">
              <td style="padding:12px 16px;font-weight:800;color:#16a34a;font-size:14px">Spolu objednávok</td>
              <td style="padding:12px 16px;text-align:right"><span style="display:inline-block;background:#16a34a;color:#fff;font-weight:800;font-size:14px;padding:4px 12px;border-radius:999px">${zoznam.length}</span></td>
            </tr>
          </table>
        </td></tr>

        <!-- Pätička -->
        <tr><td style="padding:18px 24px 28px;text-align:center">
          <div style="font-size:12px;color:#aab2bd">Odoslané automaticky o 10:00 · <strong style="color:#8a93a0">Fantozzi Objednávkový Systém</strong></div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    subject: `Objednavky Fantozzi - ${dnes} (${zoznam.length}x)`,
    text,
    html
  };
}

// Brevo/nodemailer ocakava prijemcov ako pole alebo ciarkou oddeleny zoznam.
// Config moze obsahovat oddelovac ';' aj ',' (a medzery) - znormalizujeme.
function parseRecipients(value) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : String(value).split(/[;,]/);
  return arr.map(e => String(e).trim()).filter(Boolean);
}

// Odoslanie cez Brevo HTTP API (HTTPS/443) - funguje aj tam, kde je SMTP blokovany (napr. Railway).
async function sendViaBrevoApi({ to, subject, html, text, attachments }) {
  const payload = {
    sender: { name: 'Fantozzi Objednavky', email: config.emailSender },
    to: to.map(email => ({ email })),
    subject
  };
  if (html) payload.htmlContent = html;
  if (text) payload.textContent = text;
  // Brevo API nepodporuje inline (cid) obrazky - posielaju sa ako bezne prilohy.
  if (attachments && attachments.length) {
    payload.attachment = attachments.map(a => ({
      name: a.filename || a.name,
      content: a.content
    }));
  }
  const res = await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
    headers: {
      'api-key': config.brevoApiKey,
      'Content-Type': 'application/json',
      accept: 'application/json'
    },
    timeout: 20000
  });
  return { ok: true, messageId: res.data && res.data.messageId };
}

// Zjednotene odoslanie mailu: ak je nastaveny BREVO_API_KEY, pouzije HTTP API,
// inak fallback na SMTP cez nodemailer.
async function sendMail({ to, subject, html, text, attachments }) {
  const recipients = parseRecipients(to);
  if (recipients.length === 0) {
    console.error('[Mailer] Ziadny prijemca - EMAIL_RECIPIENT/to nie je nastaveny');
    return { ok: false, error: 'Ziadny prijemca' };
  }

  if (config.brevoApiKey) {
    try {
      const r = await sendViaBrevoApi({ to: recipients, subject, html, text, attachments });
      console.log('[Mailer] Email odoslany cez Brevo API:', r.messageId);
      return r;
    } catch (err) {
      const detail = err.response && err.response.data
        ? JSON.stringify(err.response.data)
        : err.message;
      console.error('[Mailer] Brevo API chyba:', detail);
      return { ok: false, error: detail };
    }
  }

  // Fallback: SMTP
  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: `"Fantozzi Objednavky" <${config.emailSender}>`,
      to: recipients,
      subject,
      text,
      html,
      attachments
    });
    console.log('[Mailer] Email odoslany cez SMTP:', info.messageId);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Mailer] SMTP chyba:', err.message);
    return { ok: false, error: err.message };
  }
}

async function sendEmail(orders, menu) {
  const { subject, text, html } = formatEmail(orders, menu);
  return sendMail({ to: config.emailRecipient, subject, text, html });
}

module.exports = { sendEmail, sendMail, createTransporter, formatEmail };
