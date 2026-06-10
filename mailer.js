const nodemailer = require('nodemailer');
const config = require('./config');

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

  // Pocty od kazdeho jedla
  const pocty = {};
  zoznam.forEach(o => {
    if (o.polievka) {
      pocty[o.polievka] = (pocty[o.polievka] || 0) + 1;
    }
    if (o.pizza) {
      pocty[`🍕 ${o.pizza}`] = (pocty[`🍕 ${o.pizza}`] || 0) + 1;
    } else if (o.jedlo) {
      pocty[o.jedlo] = (pocty[o.jedlo] || 0) + 1;
    }
    if (o.dezert) {
      pocty[`🍮 ${o.dezert}`] = (pocty[`🍮 ${o.dezert}`] || 0) + 1;
    }
  });

  // Plain text verzia
  let text = `OBJEDNAVKY FANTOZZI - ${dnes}\n`;
  text += `${'='.repeat(50)}\n\n`;
  text += `Celkovy pocet objednavok: ${zoznam.length}\n\n`;
  text += `ZOZNAM:\n`;
  zoznam.forEach((o, i) => {
    text += `${i + 1}. ${o.meno.padEnd(15)} `;
    text += `Polievka: ${o.polievka || '-'} | `;
    text += `Jedlo: ${o.pizza ? `Pizza: ${o.pizza}` : (o.jedlo || '-')}`;
    if (o.dezert) text += ` | Dezert: ${o.dezert}`;
    if (o.poznamka) text += ` | Poznamka: ${o.poznamka}`;
    text += '\n';
  });
  text += `\nSUHRN POCTY:\n`;
  Object.entries(pocty).forEach(([jedlo, pocet]) => {
    text += `  ${jedlo}: ${pocet}x\n`;
  });

  // HTML verzia
  const riadkyHtml = zoznam.map((o, i) => `
    <tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#ffffff'}">
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:bold">${o.meno}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${o.polievka || '<em style="color:#999">-</em>'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${o.pizza ? `🍕 ${o.pizza}` : (o.jedlo || '<em style="color:#999">-</em>')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;font-size:13px">${o.poznamka || ''}</td>
    </tr>
  `).join('');

  const poctyHtml = Object.entries(pocty).map(([jedlo, pocet]) => `
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

async function sendEmail(orders, menu) {
  const transporter = createTransporter();
  const { subject, text, html } = formatEmail(orders, menu);

  try {
    const info = await transporter.sendMail({
      from: `"Fantozzi Objednavky" <${config.emailSender}>`,
      to: config.emailRecipient,
      subject,
      text,
      html
    });
    console.log('[Mailer] Email uspesne odoslany:', info.messageId);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Mailer] Chyba pri odosielani emailu:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendEmail, createTransporter };
