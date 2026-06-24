# Changelog

Všetky podstatné zmeny v projekte **Fantozzi Objednávky** sú zdokumentované v tomto súbore.

Formát vychádza z [Keep a Changelog](https://keepachangelog.com/),
projekt používa [sémantické verzovanie](https://semver.org/lang/sk/).

## [1.11.0] — 2026-06-24

### Pridané
- **Modernejší odpočet do uzávierky** — číslice ako „flip-clock" kartičky s pop animáciou pri každej zmene, pulzujúca „LIVE" bodka, jemný svetelný prelet cez celý pruh, žiariaci progress bar a v posledných minútach dramatické červené pulzovanie.

### Opravené
- **Changelog v aplikácii sa teraz načítava priamo z `CHANGELOG.md`** (`GET /api/changelog`) — predtým bol napevno v HTML a zasekol sa na v1.4.0. Už netreba udržiavať na dvoch miestach.

## [1.10.1] — 2026-06-24

### Pridané
- **Náhľad e-mailu v admin paneli** — tlačidlo „👁️ Náhľad e-mailu" otvorí v novej karte vykreslený denný súhrnný e-mail (`GET /api/admin/email-preview`). Ak dnes ešte nikto neobjednal, zobrazí sa s ukážkovými dátami, nech je vidieť dizajn.

## [1.10.0] — 2026-06-24

### Zmenené
- **Nový moderný dizajn e-mailov** — súhrnný denný e-mail aj e-mail s QR platbou dostali svieži, responzívny vzhľad: gradientová hlavička, štatistické karty, avatary, farebné odznaky položiek (P/J/PZ/D), prehľadný súhrn počtov a upozornenie na cibuľu pri Gyros.

### Opravené
- **Easter eggy nefungovali pri otvorenom debug paneli** — debug panel sa odkazoval na premennú zo starého scroll-detektora (`_wheelDirChanges`), čo pri každom stlačení klávesy vyhodilo chybu a prerušilo spracovanie typing-eggov (napr. `jedlo`). Odkaz opravený a vykresľovanie panelu je teraz odolné voči chybám.

## [1.9.2] — 2026-06-23

### Pridané
- **Upozornenie na cibuľu pri „Gyros"** — pri každej položke s názvom obsahujúcim „gyros" (napr. Pizza Gyros) sa v menu aj v potvrdenej objednávke zobrazí výstraha „⚠️ Pozor: môže obsahovať cibuľu".

## [1.9.1] — 2026-06-23

### Zmenené
- **Súhrn počtov na stránke** — číselné koliesko pri položke teraz zobrazuje aj prefix podľa typu (P1, J3, PZ8 …) namiesto holého čísla. Koliesko sa prispôsobí 2–3 znakom.

## [1.9.0] — 2026-06-23

### Pridané
- **Nový easter egg „Všetko je Jedlo"** 🍔 — napíš `jedlo` a všetky písmená a čísla na stránke sa na 4 sekundy premenia na jedlo emoji 🍕🍔🌮.

### Opravené
- **Easter egg „Závrať"** 🌀 — predtým detekoval len koliesko myši, takže na mobile/tablete (a často aj na trackpade) vôbec nereagoval. Teraz deteguje rýchle zmeny smeru rolovania aj **dotykom** (touchmove), s malou deadzone proti chveniu.

## [1.8.1] — 2026-06-23

### Zmenené
- **Súhrn počtov** (v súhrnnom e-maile aj v push notifikácii) je teraz zoradený podľa typu: najprv **polievky**, potom **hlavné jedlá**, potom **pizze** (a nakoniec dezerty). V rámci skupiny zoradené podľa čísla položky (P1, P2, P3 …).

## [1.8.0] — 2026-06-23

### Opravené
- **Easter egg „Rozbité hodiny"** ⏰ — tikajúce hodiny prepisovali `🍕:🍕:🍕` takmer okamžite, takže to vyzeralo, že egg nefunguje. Počas eggu sa hodiny dočasne neprepisujú.
- **Easter egg „AI Analýza"** 🤖 — po 3-sekundovom podržaní tlačidla „Potvrdiť" sa pri pustení omylom odoslala objednávka. Následný klik je teraz potlačený.

### Pridané
- **3 nové easter eggy**: ☕ **Kávový dážď** (napíš `kava`), 🍺 **Pivný dážď** (`pivo`) a 🚀 **Štart rakety** (`raketa`) — rakety a hviezdy letia nahor.
- Zobrazovanie prefixu **P/J/PZ/D** aj pre staršie objednávky uložené vo formáte `č.N` (feed, potvrdená objednávka, e-maily aj push súhrny).

## [1.7.1] — 2026-06-23

### Zmenené
- **Poznámka v Pay by Square QR** obsahuje teraz vždy **meno objednávateľa + dátum** (napr. `Zofia Mullerova 23. 6. 2026`) a je **bez diakritiky**, aby ju bankové aplikácie spoľahlivo prečítali. Týka sa QR pri objednávke aj QR posielaného e-mailom; aj admin vlastná poznámka sa zbavuje diakritiky.

## [1.7.0] — 2026-06-23

### Zmenené
- **Nové označenie jedál a polievok** — namiesto `č.2 Zeleninova polievka` sa teraz používa `P2 Zeleninova` pre polievky a `J2 …` pre hlavné jedlá (pizza `PZ`, dezerty `D`). Zmena je premietnutá naprieč celým systémom: menu, číselné odznaky, admin tabuľky a grafy, e-maily, push notifikácie aj QR šablóny. Existujúce objednávky v starom formáte `č.N` zostávajú plne kompatibilné.

## [1.6.1] — 2026-06-19

### Opravené
- **Načítavanie menu z Fantozzi** — fantozzi.sk začalo vracať HTTP 403 (anti-bot). Scraper teraz posiela kompletnú sadu hlavičiek reálneho prehliadača (plný User-Agent Chrome, `Accept`, `Accept-Language`, `Sec-Fetch-*`, `Referer`…) a pri 403/429 spraví jeden retry.

### Pridané
- Admin diagnostický endpoint `GET /api/admin/menu-debug?adminPass=…` — čerstvý pokus o scrape (HTTP status, dĺžka HTML, počet sekcií) na overenie funkčnosti.

## [1.6.0] — 2026-06-19

### Pridané
- **Interaktívne lopty** ⚽ v téme FIFA — pribudlo ich viac (10) a po **kliknutí sa kopnú** náhodným smerom s rotáciou a vrátia sa späť. 5 kopnutí rýchlo za sebou spustí loptový dážď (GÓÓL!).
- **Ticker výsledkov FIFA 2026** v hlavičke — vlajky, tímy a skóre, auto-rotácia každých 5 s (klik = ďalší zápas). Dáta z TheSportsDB (free), s cache 5 min a ukážkovým fallbackom keď zdroj nie je dostupný.
- Backend endpoint `GET /api/fifa-scores` (TheSportsDB liga 4429 = MS, mapovanie krajín na vlajky, fallback sada zápasov).

## [1.5.0] — 2026-06-19

### Pridané
- **Téma „FIFA 2026"** ⚽ (futbalová edícia) — zelený trávnik s pruhmi pokoseného ihriska a čiarami štadióna, biele panely ako dres, zeleno-zlato-červené akcenty a tlačidlá vo farbách trávnika.
- **FIFA 2026 logo** v hlavičke a **dekoratívne plávajúce lopty** ⚽🏆🥅 v rohoch — zobrazené len v téme FIFA.
- **Easter egg „Loptový Dážď"** ⚽ — napíš `lopta` (mimo políčok) a spustí sa GÓÓL dážď futbalových lôpt, trofejí a kariet.
- Piata voľba v admin výbere tém (Klasický / Neon Cyber / Retro Trattoria / Galaxy Far Away / FIFA 2026).
- **Tlačidlo „Odhlásiť sa"** 🚪 v hornej hlavičke — viditeľné len pri prihlásenom používateľovi; vymaže prihlásenie a vyžiada nové meno.

## [1.4.0] — 2026-06-11

### Pridané
- **Téma „Galaxy Far Away"** 🌌 (Star Wars) — hlboký vesmír s animovaným hviezdnym poľom, galaktická hmlovina, ikonická SW žltá na nadpisy, hologramové panely so skenovacím prúžkom a tlačidlá ako svetelné meče (modrý/zelený glow).
- Štvrtá voľba v admin výbere tém (Klasický / Neon Cyber / Retro Trattoria / Galaxy Far Away).

## [1.3.0] — 2026-06-11

### Pridané
- **Téma „Retro Trattoria"** 🍝 — stará talianska osteria: kockovaný obrus v hlavičke, krémový papier, paradajková červená, olivová zelená, serifové písmo, karty ako listy jedálneho lístka.
- Admin záložka **Vzhľad** prerobená z prepínača na **výber z 3 tém** (Klasický / Neon Cyber / Retro Trattoria) s náhľadovými kartami.

### Zmenené
- Nastavenie vzhľadu sa ukladá ako názov témy (`tema`); pôvodný boolean `futuristicky` ostáva pre spätnú kompatibilitu.
- `GET /api/design` a `POST /api/admin/design` pracujú s parametrom `theme` (staré `futuristic` stále funguje).

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
