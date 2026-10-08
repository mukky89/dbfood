# AGENTS.md — Fantozzi Objednávky (dbfood)

Objednávkový systém obedov z reštaurácie Fantozzi. Zamestnanci si cez webovú
stránku vyberú jedlo z denného menu; po uzávierke server pošle súhrn emailom
a push notifikáciou a ponúkne platbu cez PAY by square QR.

Produkcia beží na Railway (`https://dbfood-production.up.railway.app`); stará
EvenNode doména sa presmerúva 301. Repo je **verejné**.

## Stack

- Node.js ≥ 20, Express 4, Mongoose 8 (MongoDB), `node-cron`
- Frontend: jedna stránka `public/index.html` + samostatné JS/CSS témy v `public/`,
  bez buildu a bez frameworku
- Testy: vstavaný `node --test`; prehliadačové testy cez Playwright (`*.cjs`)

## Štruktúra

- `server.js` — Express app, Mongoose modely, všetky `/api/*` routes, cron úlohy
- `config.js` — konfigurácia výhradne z env premenných
- `scraper.js` — sťahovanie denného menu z webu reštaurácie (cheerio), cache
- `mailer.js` — súhrnné emaily (SMTP/Brevo)
- `notifier.js` — push notifikácie cez ntfy
- `paysquare.js` — PAY by square QR a výpočet ceny
- `translator.js` — preklad menu (MyMemory)
- `colony-api.js`, `colony-store.js` — API a úložisko hry Mravenisko
  (detaily v [ANTHILL.md](ANTHILL.md))
- `public/*-theme.{js,css}` — voliteľné vzhľady (anthill, blocks, rc, spiderman, …)
- `tests/` — `*.test.js` jednotkové/API testy, `*.cjs` prehliadačové testy
  a lokálny náhľadový server

## Príkazy

```
npm install
npm test                          # node --test tests/*.test.js
node tests/preview-server.cjs     # lokálny náhľad bez MongoDB, emailov a platieb
npm start                         # produkčný server (vyžaduje MONGO_URI)
```

Prehliadačové testy (`tests/*-browser.cjs`, `tests/colony-multitab.cjs`) bežia
proti náhľadovému serveru; postup je v [ANTHILL.md](ANTHILL.md#overenie).

## Konfigurácia

Všetko ide cez env premenné v `config.js` (`MONGO_URI`, `ORDER_DEADLINE`,
`ADMIN_PASSWORD`, SMTP/Brevo, `PLATBA_*`, `NTFY_*`, `ALLOWED_EMAILS`, …).
Lokálne v `.env`, ktorý je v `.gitignore`. Do repa nikdy necommituj heslá,
API kľúče, IBAN ani reálne objednávky či emaily používateľov.

## Pravidlá pri práci

- Časové pásmo je vždy `Europe/Bratislava` (uzávierka, cron, história, rebríček).
- Uzávierka sa plánuje z `ORDER_DEADLINE`; pri zmene cron logiky zachovaj
  `setupCrons()` volateľné opakovane (admin mení uzávierku za behu).
- Text v QR platbe musí byť bez diakritiky (`bezDiakritiky`).
- Admin endpointy overujú `adminPass` proti `config.adminPassword`; nové admin
  routes musia mať rovnakú kontrolu.
- Testy a náhľad nesmú siahať na produkčnú MongoDB ani posielať emaily, push
  či platby — používaj pamäťové úložiská a náhľadový server.
- Pri zmene pravidiel dennej výzvy Mraveniska zvýš `VERSION` v `colony-api.js`.
- Nové témy pridávaj ako samostatný pár `public/<nazov>-theme.{js,css}`; téma sa
  musí vedieť čisto zastaviť pri prepnutí a rešpektovať obmedzený pohyb.

## Verzie a changelog

- Verzia je v `package.json` (sémantické verzovanie) a server ju vystavuje cez
  `/api/version` a `/api/changelog`.
- Po každej používateľsky viditeľnej zmene pridaj záznam do `CHANGELOG.md`
  (Keep a Changelog, po slovensky) a zvýš verziu v `package.json`.
- Texty v UI, CHANGELOG a dokumentácii píš po slovensky.

## Nasadenie

Railway buildí podľa `railway.json` (`npm install`, `node server.js`). Ak je
zapnutý auto-deploy z `main`, push na `main` znamená nasadenie do produkcie —
commituj tam iba overené zmeny.
