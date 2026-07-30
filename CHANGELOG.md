# Changelog

Všetky podstatné zmeny v projekte **Fantozzi Objednávky** sú zdokumentované v tomto súbore.

Formát vychádza z [Keep a Changelog](https://keepachangelog.com/),
projekt používa [sémantické verzovanie](https://semver.org/lang/sk/).

## [1.20.0] — 2026-07-30

### Pridané
- **Odysea 🏛️ — kino, tržby a činčila** — filmový plagát v téme Odysea má teraz **odkaz do kina CineMax IMAX** („🎟️ CineMax IMAX — kúpiť lístok", otvára sa v novom okne) a **živé počítadlo tržieb v kinách** („🎬 Tržby v kinách"), ktoré po prepnutí témy vyskočí zo `$0` na svetovú tržbu a ďalej pomaly rastie. Do skinu pribudla **jedna kino-činčila uvádzačka** 🐭🍿 (vľavo dole), ktorá po kliknutí vydáva roztomilé zvuky (zdieľa WebAudio z témy Činčily) a ukazuje filmové bublinky. Činčila **zapíska aj po úspešnom odoslaní objednávky obeda** (v téme Odysea aj Činčily).

### Odstránené
- **FIFA výsledky (ticker v hlavičke)** — z celého webu bol odstránený výsledkový ticker MS 2026, ktorý sa zobrazoval v hlavičke naprieč všetkými témami: vrátane frontend widgetu, jeho štýlov a auto-rotácie, backend endpointu `GET /api/fifa-scores` (zdroj TheSportsDB, cache, ukážkové dáta a mapovanie vlajok) aj nepoužívaného importu `axios` v `server.js`. Vizuálna **téma FIFA 2026** (futbalový skin, logo v hlavičke, plávajúce lopty aj easter egg „lopta") **ostáva zachovaná**.

## [1.19.0] — 2026-07-17

### Pridané
- **Plávajúce okno na feedback 💬** — vľavo dole pribudla bublina „Napíš nám": nápad na zlepšenie stránky, nahlásenie chyby, alebo len tak pokec. Správa sa odošle s menom prihláseného používateľa (inak ako Anonym) a uloží sa do databázy (`POST /api/feedback`). Okno sa farebne prispôsobuje všetkým témam.
- **Admin → Feedback** — nový tab v admin paneli so zoznamom prijatých správ (typ, meno, čas, text) a možnosťou mazania.

### Zmenené
- **Krajší súhrn objednávok** — názvy jedál sa už neorezávajú v strede slova, zmizla nadbytočná hlavička tabuľky „Položka/Počet" aj zebra pruhovanie. Sekcie (🍲 Polievky, 🍽️ Hlavné jedlá…) majú farebné nadpisy s jemnou linkou, počty sú kompaktné pilulky „2×" vo farbe sekcie a riadok „Celkom objednávok" je oddelený. Najobjednávanejšie jedlo 🔥 má jemné jantárové podfarbenie.

## [1.18.1] — 2026-07-17

### Zmenené
- **Optimalizácia horného menu** — všetky prvky hlavičky (počasie, telefón, Discord kontakt, vajíčko, používateľ, FIFA ticker) majú teraz **jednotnú výšku 34 px** a konzistentný „pill" tvar. Discord karta je kompaktnejšia (label „Hlavný kontakt" sa presunul do tooltipu) a v téme Odysea je zladená do tmavo-zlatej namiesto modrej. Z počasia zmizol nadbytočný text „Ružinov" (ostáva v tooltipe). „Odhlásiť sa" sa už nezalamuje na dva riadky.
- **Hlavička sa prispôsobuje šírke okna** — na užších oknách sa postupne skrývajú najmenej dôležité prvky (popis počasia → text Discord karty → vajíčko → text „Odhlásiť sa" → kino/FIFA odznak → Discord karta), takže Admin a odhlásenie už nikdy nepretečú mimo obrazovku; FIFA ticker sa pružne skracuje.

## [1.18.0] — 2026-07-17

### Pridané
- **Nová téma „Odysea" 🏛️** — filmové promo v duchu eposu *Odysea* Christophera Nolana, ako plagát v kine: nočné búrlivé more (Ajvazovského *Deviata vlna* ako pozadie s filmovým „letterbox" stmavením), pergamenové karty s bronzovo-zlatými akcentmi, serifová typografia, kino odznak „ODYSEA — už v kinách" v hlavičke a **filmový plagát** vpravo dole s reálnymi public domain maľbami z Wikimedia Commons (Draper, Waterhouse, Ajvazovskij — klik strieda zábery), s premiérou „17. júla 2026 • Len v kinách • IMAX". Prepína sa v Admin → Vzhľad.

### Opravené
- **Vlajky vo FIFA tickeri sa nezobrazovali na Windowse** — výsledkové okno FIFA 2026 v hlavičke používalo emoji vlajky krajín (🇲🇽 🇺🇸 …), ktoré Windows nevykresľuje (ukazoval len písmená „MX/US"). Emoji sa teraz automaticky dekóduje na ISO kód krajiny a vykreslí sa ako **SVG vlajka** (flagcdn.com) pre všetkých ~50 účastníkov MS; ak sa obrázok nenačíta, zobrazí sa pôvodné emoji.

## [1.17.1] — 2026-07-12

### Opravené
- **Vlajky sa nezobrazovali na Windowse** — emoji vlajky (🇸🇰 🇬🇧 🇫🇷) Windows nevykresľuje a namiesto nich ukazoval len písmená „SK / GB / FR". Vlajky sú teraz nakreslené ako **inline SVG** (slovenská trikolóra so znakom, britský Union Jack, francúzska trikolóra), takže sa zobrazia spoľahlivo na Windowse, macOS, Androide aj iOS. Neaktívne vlajky sú stlmené do šeda, aktívna je farebná so zvýraznením.

## [1.17.0] — 2026-07-12

### Pridané
- **Animovaný prepínač jazykov** — vlajky 🇸🇰 🇬🇧 🇫🇷 sú teraz vycentrované do výrazného „pill" prepínača s glóbusom 🌐. Pri prvom zobrazení prepínač vyskočí (bounce), krátko sa rozžiari a neaktívne vlajky poskočia (staggered), aby si preklad hneď všimol. Aktívna vlajka je farebne zvýraznená a pri kliknutí „popne". Rešpektuje `prefers-reduced-motion`.
- **Preklad alergénov, poznámok a označenia „výber"** — do EN/FR sa teraz prekladajú aj názvy alergénov (chipy pri jedle aj legenda „Zoznam alergénov", vrátane popisu po najazdení), placeholder poznámky k položke („note for this item…" / „note pour ce plat…"), label výberu druhu pri špeciálnych jedlách („🎨 Choose a variant…"), štítok „výber"/„choice"/„choix" a upozornenie na cibuľu pri gyrose. Fixné UI reťazce sú preložené staticky (kvalitne a bez API volaní).

### Opravené
- **Vlajky už nemiznú pri jednom problematickom názve** — jazyk sa zobrazí, ak sa preloží aspoň polovica textov; nepreložené položky (napr. netypický dátum) padnú na slovenčinu namiesto skrytia celého jazyka.

## [1.16.0] — 2026-07-12

### Pridané
- **Preklad jedálneho listka do angličtiny a francúzštiny** — pri každom novom jedálničku sa názvy sekcií, jedál aj dátum automaticky preložia cez **MyMemory** (SK → EN/FR) a uložia sa spolu s menu do cache (preklad prebehne raz denne, nezaťažuje bežné načítanie stránky). V jedálnom listku pribudol prepínač s **vlajkami 🇸🇰 🇬🇧 🇫🇷** — prepína iba zobrazený text jedál; ceny, hmotnosti, čísla a hodnoty objednávok (P1…, J2…) zostávajú nezmenené. Zvolený jazyk sa pamätá (localStorage). Funguje **bez API kľúča** (limit ~5000 slov/deň); voliteľne sa dá zdvihnúť limit na ~50 000 slov/deň nastavením `MYMEMORY_EMAIL` v premenných prostredia. Ak preklad zlyhá alebo sa vyčerpá limit, položka sa zobrazí v origináli (SK) a vlajky sa nezobrazia.

## [1.15.0] — 2026-07-08

### Pridané
- **Úprava detailu objednávok cez admin prostredie** — v admin paneli pribudlo pri každej objednávke tlačidlo „✏️ Upraviť" (v karte „Ľudia dnes" aj v detailnej tabuľke). Otvorí okno s výberom polievky, hlavného jedla, pizze a dezertu z aktuálneho menu, plus počet porcií a poznámku. Admin môže objednávku upraviť **bez ohľadu na uzávierku**; zmena sa zapíše do histórie ako „✏️ Úprava" (`PUT /api/admin/orders/:meno`).

### Zmenené
- **Krajšie nakreslené činčily** — činčily v téme „🐭 Činčily" dostali nový, roztomilejší dizajn: veľké ligotavé očká so srdiečkovým leskom, nadýchané uši s ružovým vnútrom, chĩchol na hlave, ružové líčka a huňatý stočený chvost.
- **Nové zvuky činčily po kliknutí** — namiesto jedného pišťania sa teraz náhodne prehrá jeden z piatich zvukov (veselý trilkot, zvedavé „bwoop", chichot, spokojné pradenie a klasické pišťanie), takže každé pohladenie znie inak.

## [1.14.0] — 2026-07-07

### Pridané
- **Predpoveď počasia pre Bratislavu Ružinov v hlavičke** — nový widget zobrazuje aktuálnu teplotu a stav počasia (emoji + slovenský popis, napr. „⛅ 24°C · Polojasno"). Dáta sa načítavajú z Open-Meteo (bez API kľúča) a obnovujú sa každých 15 minút. Widget je štýlovaný nezávisle od tém, takže zostáva zobrazený aj pri zmene vzhľadu.

### Odstránené
- **Easter egg „🌀 Závrať" bol vypnutý** — detekcia rýchleho rolovania (kolieskom myši aj dotykom) je deaktivovaná a egg je odstránený zo zoznamu tajných easter eggov (už sa nezapočítava do počtu objavených).

## [1.13.0] — 2026-06-30

### Pridané
- **Nová téma „🐭 Činčily"** — mäkký sivo-levanduľový „fluffy" vzhľad (zaoblené karty, levanduľová hlavička, jemné pozadie). Súčasťou sú **nakreslené činčily** (SVG): maskot vpravo dole + dve menšie, ktoré peknú z rohov. **Po kliknutí na činčilu vydávajú zvuky** — pišťanie syntetizované cez WebAudio — a zobrazí sa bublina (napr. „Pip pip! 🐭"). Pri zapnutí témy zaznie privítacie pišťanie. Téma sa vyberá v admin paneli → Vzhľad (globálne pre všetkých návštevníkov).

## [1.12.1] — 2026-06-30

### Opravené
- **Horné tlačidlo „Prihlásiť" naozaj funguje** — skutočnou príčinou bolo predčasné naviazanie `click` poslucháča na `#konami-overlay`, ktorý v DOM existuje až za koncom skriptu. `getElementById` vracal `null`, `.addEventListener` vyhodil chybu a prerušil zvyšok skriptu, takže `userBadgeClick` (a ďalšie funkcie) zostali nefunkčné. Naviazanie je teraz odložené po `DOMContentLoaded`.

### Zmenené
- **Poznámky k jedlám sú teraz priradené priamo k číslu jedla/pizze** — v súhrnnej notifikácii aj v e-maile sa poznámka zobrazí pod príslušnou položkou (napr. pod „J3 …" → „📝 bez ryže (Marek)"), namiesto samostatného zoznamu podľa mien.

## [1.12.0] — 2026-06-30

### Opravené
- **Prihlásenie cez horné tlačidlo „Prihlásiť"** — klik na odznak používateľa v hlavičke, keď nie si prihlásený, otvorí prihlasovacie okno namiesto pokusu o odhlásenie (`Odhlásiť sa ako null?`).

### Pridané
- **Poznámky k jedlám aj v notifikácii a e-maile** — súhrnný push (po uzávierke) a denný e-mail teraz obsahujú poznámky k jedlám.

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
