const QRCode = require('qrcode');

/**
 * Generuje Pay by Square QR kód ako base64 PNG
 * Používa bysquare balík pre správne LZMA + CRC32 + Base32 enkódovanie
 * podľa BySquare Technical Specification v1.1.0
 */
async function generatePayBySquareQR(params, opts = {}) {
  const { iban, bic = '', suma, sprava, meno = '', variabilnySymbol = '' } = params;
  const validate = opts.validate !== false; // default true, false pre admin test

  const { encode, PaymentOptions } = await import('bysquare/pay');
  const { Version } = await import('bysquare');

  const ibanClean = iban.replace(/[\s\-]/g, '').toUpperCase();
  const bicClean  = bic.replace(/\s/g, '').toUpperCase() || undefined;

  // VS musi byt max 10 cislic, inak bankova appka odmietne QR
  const vsClean = /^\d{1,10}$/.test(variabilnySymbol) ? variabilnySymbol : undefined;

  const qrString = encode({
    payments: [{
      type: PaymentOptions.PaymentOrder,
      amount: parseFloat(suma.toFixed(2)),
      currencyCode: 'EUR',
      variableSymbol: vsClean,
      paymentNote: sprava || undefined,
      bankAccounts: [{ iban: ibanClean, bic: bicClean }],
      beneficiary: meno ? { name: meno } : undefined,
    }]
  }, { deburr: true, validate, version: Version['1.0.0'] });

  try {
    const qrBase64 = await QRCode.toDataURL(qrString, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 1,
      margin: 2,
      width: 300,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrBase64;
  } catch (err) {
    console.error('[PayBySquare] Chyba pri generovani QR:', err.message);
    throw err;
  }
}

function parseCena(str) {
  if (!str) return null;
  const m = str.match(/(\d+)[.,](\d{2})/);
  if (m) return parseFloat(m[1] + '.' + m[2]);
  const m2 = str.match(/(\d+)/);
  return m2 ? parseFloat(m2[1]) : null;
}

function getCenaZMenu(menu, typ) {
  if (!menu?.sekcie) return null;
  const sekcia = menu.sekcie.find(s => s.nazov.toLowerCase().includes(typ));
  return sekcia?.cena ? parseCena(sekcia.cena) : null;
}

function vypocitajCenu(polievka, jedlo, pizza, dezert, menu) {
  let celkom = 0;
  const detail = [];

  const cenaJedlo  = (menu ? getCenaZMenu(menu, 'hlavné') : null) || 6.50;
  const cenaPizza  = (menu ? getCenaZMenu(menu, 'pizza')  : null) || 6.70;
  const cenaDezert = (menu ? getCenaZMenu(menu, 'dezert') : null) || 1.50;
  const cenaPolSam = 1.90;

  if (jedlo && polievka) {
    celkom += cenaJedlo;
    detail.push(`Polievka + Hlavné jedlo: ${cenaJedlo.toFixed(2)} €`);
  }

  if (pizza && polievka && !jedlo) {
    celkom += cenaPizza;
    detail.push(`Polievka + Pizza: ${cenaPizza.toFixed(2)} €`);
  }

  if (pizza && !polievka) {
    celkom += cenaPizza;
    detail.push(`Pizza: ${cenaPizza.toFixed(2)} €`);
  }

  if (polievka && !jedlo && !pizza) {
    celkom += cenaPolSam;
    detail.push(`Polievka: ${cenaPolSam.toFixed(2)} €`);
  }

  if (jedlo && polievka && pizza) {
    celkom += cenaPizza;
    detail.push(`+ Pizza: ${cenaPizza.toFixed(2)} €`);
  }

  if (dezert) {
    celkom += cenaDezert;
    detail.push(`Dezert: ${cenaDezert.toFixed(2)} €`);
  }

  if (celkom === 0) return null;
  return { celkom: Math.round(celkom * 100) / 100, detail };
}

module.exports = { generatePayBySquareQR, vypocitajCenu };
