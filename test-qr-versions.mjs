/**
 * Test script: generate Pay by Square QR codes in v1.0.0 and v1.1.0
 * and save them to Desktop for scanning.
 * Run: node test-qr-versions.mjs
 */
import { encode, PaymentOptions } from 'bysquare/pay';
import { Version } from 'bysquare';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const IBAN = 'SK4311000000002915610113';
const MENO = 'Filip Svolik';
const SUMA = 6.50;

async function makeQR(version, label, withBeneficiary) {
  const model = {
    payments: [{
      type: PaymentOptions.PaymentOrder,
      amount: SUMA,
      currencyCode: 'EUR',
      paymentNote: 'Fantozzi obed',
      bankAccounts: [{ iban: IBAN }],
      ...(withBeneficiary ? { beneficiary: { name: MENO } } : {}),
    }]
  };

  const opts = { deburr: true, validate: false, version };
  const qrString = encode(model, opts);

  console.log(`\n--- ${label} ---`);
  console.log('QR string:', qrString);
  console.log('First 8 chars (header):', qrString.substring(0, 8));

  const b64 = await QRCode.toDataURL(qrString, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    margin: 2,
    width: 300,
  });

  const outPath = path.join('C:\\Users\\mmucka\\Desktop', `test-${label}.png`);
  const buf = Buffer.from(b64.split(',')[1], 'base64');
  fs.writeFileSync(outPath, buf);
  console.log('Saved to:', outPath);
  return qrString;
}

console.log('IBAN:', IBAN);
console.log('Suma:', SUMA, 'EUR');

await makeQR(Version['1.0.0'], 'v100-no-beneficiary', false);
await makeQR(Version['1.1.0'], 'v110-with-beneficiary', true);
await makeQR(Version['1.1.0'], 'v110-no-beneficiary', false);

console.log('\nHotovo. Skenujem v bankovej appke:');
console.log('  v100: najstarssi format (2013), najkompatibilnejsi');
console.log('  v110: format 2015, pridane meno prijemcu');
