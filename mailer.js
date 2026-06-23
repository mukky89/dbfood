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

  // HTML verzia
  const riadkyHtml = zoznam.map((o, i) => `
    <tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#ffffff'}">
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:bold">${o.meno}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${o.polievka ? relabel(o.polievka, 'P') : '<em style="color:#999">-</em>'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${o.pizza ? `🍕 ${relabel(o.pizza, 'PZ')}` : (o.jedlo ? relabel(o.jedlo, 'J') : '<em style="color:#999">-</em>')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;font-size:13px">${o.poznamka || ''}</td>
    </tr>
  `).join('');

  const poctyHtml = pocty.map(([jedlo, pocet]) => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${jedlo}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:bold;color:#e74c3c">${pocet}x</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#333">
      
      <div style="background:#2c3e50;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="margin:0;font-size:22px">🍕 Objednávky Fantozzi</h1>
        <p style="margin:6px 0 0;opacity:0.8;font-size:14px">${dnes}</p>
      </div>

      <div style="background:#e74c3c;color:white;padding:10px 24px">
        <strong>Celkový počet objednávok: ${zoznam.length}</strong>
      </div>

      <div style="border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px;padding:20px">
        
        <h2 style="color:#2c3e50;font-size:16px;margin-top:0">Zoznam objednávok</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead>
            <tr style="background:#2c3e50;color:white">
              <th style="padding:10px 12px;text-align:left">Meno</th>
              <th style="padding:10px 12px;text-align:left">Polievka</th>
              <th style="padding:10px 12px;text-align:left">Jedlo / Pizza</th>
              <th style="padding:10px 12px;text-align:left">Poznámka</th>
            </tr>
          </thead>
          <tbody>${riadkyHtml}</tbody>
        </table>

        <h2 style="color:#2c3e50;font-size:16px;margin-top:24px">Súhrn počtov</h2>
        <table style="width:50%;border-collapse:collapse;font-size:14px">
          <thead>
            <tr style="background:#ecf0f1">
              <th style="padding:8px 12px;text-align:left">Položka</th>
              <th style="padding:8px 12px;text-align:left">Počet</th>
            </tr>
          </thead>
          <tbody>${poctyHtml}</tbody>
        </table>

      </div>

      <p style="font-size:12px;color:#999;margin-top:16px;text-align:center">
        Odoslané automaticky o 10:00 • Fantozzi Objednávkový Systém
      </p>
    </body>
    </html>
  `;

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

module.exports = { sendEmail, sendMail, createTransporter };
