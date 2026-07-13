# CLAUDE.md — dbfood (Fantozzi Objednávky)

Objednávkový systém obedov z reštaurácie Fantozzi. Node.js/Express monolit, nasadený na Railway.

## Stack
- Node.js ≥20, Express — `server.js` je hlavný súbor (~1200 riadkov)
- MongoDB cez Mongoose
- Platby: Stripe + bysquare (slovenský Pay-by-Square QR)
- Scraping denného menu: cheerio + axios — `scraper.js` (zdroj: fantozzi.sk/dennemenu)
- E-mail: nodemailer cez Brevo SMTP — `mailer.js`
- Notifikácie: ntfy — `notifier.js`
- Preklad menu SK→EN/FR: MyMemory API — `translator.js`, cachované, beží 1×/deň
- Obrázky/QR: jimp, qrcode
- Plánovanie: node-cron
- Frontend: jeden statický `public/index.html`, žiadny build krok

## Konfigurácia
Všetko cez env premenné, viď `config.js` — `MONGO_URI`, `SMTP_*`, `BREVO_API_KEY`, `PLATBA_IBAN/BIC/MENO/VS/REVOLUT`, `ADMIN_PASSWORD`, `ORDER_DEADLINE`, `ALLOWED_EMAILS`, `NTFY_*`, `MYMEMORY_EMAIL`.
**Skutočné hodnoty nikdy necommituj** — patria len do Railway env premenných.

## Pravidlá pri práci
- `server.js` je veľký monolit — pred pridaním novej route/handlera over, či podobná už neexistuje (veľa admin endpointov na `/api/admin/...`).
- Objednávky sa ukladajú aj do denných JSON snapshotov (`orders_YYYY-MM-DD.json`) — pri zmene dátového modelu mysli na spätnú kompatibilitu s existujúcimi súbormi.
- Ceny, hmotnosti a čísla objednávok (P1…, J2…) sa **nikdy neprekladajú** — `translator.js` prekladá len text jedál/sekcií.
- Vlajky pre prepínač jazykov sú inline SVG (nie emoji) — kvôli spoľahlivému zobrazeniu na Windowse, nemeň späť na emoji.
- Po funkčnej zmene: záznam do `CHANGELOG.md` (Keep a Changelog, slovenčina) + bump verzie v `package.json` (zobrazuje sa v appke).
- Nasadenie je na Railway (`railway.json`) — over, že zmena funguje aj bez lokálneho `.env` (fallbacky v `config.js`).

## Časté príkazy
```
npm start
node test-qr-versions.mjs
```
