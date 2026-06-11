# Changelog

Všetky podstatné zmeny v projekte **Fantozzi Objednávky** sú zdokumentované v tomto súbore.

Formát vychádza z [Keep a Changelog](https://keepachangelog.com/),
projekt používa [sémantické verzovanie](https://semver.org/lang/sk/).

## [1.2.0] — 2026-06-11

### Pridané
- **Futuristický dizajn „Neon Cyber"** — voliteľná neónová téma (glassmorphism, animovaná aurora, žiariace prvky).
  - Globálne **prepínateľná v admin paneli** (nová záložka 🎨 Vzhľad) cez prepínač.
  - Stav sa ukladá v DB a aplikuje sa všetkým návštevníkom; klasický dizajn ostáva predvolený.
  - Téma sa nasadzuje cez triedu `.theme-futuristic` (override CSS premenných) — bez duplikácie markupu.
  - Endpointy `GET /api/design` a `POST /api/admin/design`.

## [1.1.0] — 2026-06-11

### Pridané
- **Platba cez Revolut** ako ďalšia možnosť popri QR kóde (Pay by Square).
  - Nové konfigurovateľné pole `revolut` v nastaveniach platby (DB + ENV `PLATBA_REVOLUT`).
  - V admin paneli (Platba) pribudlo pole pre `revolut.me` meno — znesie aj vložený celý odkaz alebo `@tag`, automaticky sa normalizuje.
  - V platobnom okne sa zobrazí tlačidlo **Zaplatiť cez Revolut** s predvyplnenou sumou (`revolut.me/<meno>/<suma>eur`).
- **Zobrazenie verzie aplikácie** v pätičke stránky (`/api/version`).
- **Changelog** dostupný priamo zo stránky (kliknutím na verziu) a v súbore `CHANGELOG.md`.

## [1.0.1] — 2026-06-10

### Zmenené
- Prechod na **Brevo HTTP API** pre odosielanie e-mailov (Railway blokuje odchádzajúci SMTP).
- Trvalé presmerovanie (301) zo starej EvenNode domény na Railway — zachováva cestu aj query.

### Opravené
- Normalizácia príjemcov e-mailov pri odosielaní cez Brevo.
- Synchronizácia `package-lock.json` s `package.json` (mongoose) pre úspešný deploy.
- Všeobecná aktualizácia podľa aktuálneho stavu projektu.

## [1.0.0] — 2026-05-22

### Pridané
- Prvé vydanie objednávkového systému obedov z reštaurácie Fantozzi:
  - Automatické načítanie denného menu (scraping).
  - Zadávanie, úprava a rušenie objednávok s uzávierkou.
  - Platba cez QR kód (Pay by Square) + odoslanie QR na e-mail.
  - Admin panel — nastavenia platby, uzávierka, blokované obdobia, manuálne menu.
  - Notifikácie cez e-mail a ntfy (push).
