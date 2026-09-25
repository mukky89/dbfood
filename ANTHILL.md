# Živé mravenisko

Tému zapne administrátor v **Admin → Vzhľad → Živé mravenisko**. Existujúca téma sa pri nasadení automaticky nemení. Na stránke pribudne panel **Moja kolónia → Preskúmať mravenisko**. Hra nemení objednávky, platby ani prihlásenie.

## Ovládanie

- **Potrava:** vyber porciu a klikni/ťukni na voľný povrch. Tlačidlo „Položiť na voľný povrch“ poskytuje alternatívu ku canvasu. Prieskumníci objavia porciu, zberači ju fyzicky odnesú. Pizza potrebuje dvoch nosičov. Voda a ovocie dopĺňajú vodu.
- **Stavba:** vyber typ a vyznačené miesto; dostupný je aj zoznam miest. Cena sa odpočíta pri plánovaní. Priebeh závisí od kopáčov; stavbu možno pozastaviť alebo zrušiť za polovicu pôvodnej ceny. Hotové komory možno vylepšovať.
- **Mravce:** automaticky alebo ručne rozdeľ prácu. Náklad sa doručí pred zmenou úlohy. Vybraného mravca možno pomenovať, označiť ako obľúbeného a sledovať kamerou.
- **Rozvoj:** šesť vylepšení s tromi úrovňami. **Úlohy:** úvodné ciele odomykajú dekorácie.
- **Feromóny:** zobraz cesty, nakresli krátku stopu alebo vytvor stopu pri vstupe tlačidlom. Stopy sa vytrácajú, nástroj má obnovu.
- **Prekážky:** potiahni kameň alebo ho presuň tlačidlom vo Voľbách. Ťuknutie na mláčku alebo tlačidlo položí/odoberie listový most. Nové trasy rešpektujú prekážky.
- **Kamera:** potiahnutie prázdnej plochy, koliesko, tlačidlá priblíženia; po zaostrení canvasu aj šípky a +/−. Escape zruší nástroj alebo zavrie herný pohľad. Zoznamy v paneloch umožňujú výber objektov klávesnicou.

Na mobile zostáva herný svet nad samostatne posúvateľným ovládacím panelom. Pozadie nepreberá kliknutia stránky. Animáciu možno skryť, pozastaviť alebo nastaviť statické pozadie. Pri systémovom obmedzení pohybu sa pozadie nehýbe; otvorenie herného pohľadu je výslovným spustením hry. Zvuk je predvolene vypnutý.

## Dáta a simulácia

- `public/anthill-engine.js`: samostatný, deterministicky testovateľný model; prehliadač aj CommonJS.
- `public/anthill-theme.js`: Canvas 2D, prístupné HTML ovládanie, životný cyklus témy a uloženie.
- `public/anthill-theme.css`: izolovaný vzhľad a responzívny herný dialóg.
- Stav je v `localStorage` pod `fob_anthill_v1`, automaticky každých päť sekúnd a po interakciách. Pri obnove sa kontroluje schéma; poškodené uloženie vytvorí novú kolóniu. Náklad na ceste sa zachová a dopraví, pozície sa obnovia pri hniezde. Dočasné udalosti, stopy a pohybové trasy sa začnú nanovo.
- Zatvorená/skrytá karta nepridáva ani neodoberá zdroje. Zmena témy zastaví animačnú slučku a zatvorí dialóg. Žiadny offline trest ani neobmedzený offline zisk.
- Limit 40 robotníc, 10 porcií, 10 miest pre komory. Rozšírenia sa prichytávajú na pripravenú sieť tunelov. Ide o pokojnú simuláciu, bez boja a smrti kolónie.

## Overenie

```sh
npm ci
npm test
node tests/preview-server.cjs
```

Lokálny server na `http://127.0.0.1:8766` používa testovacie dáta, bez MongoDB, e-mailov a platieb. Heslo administrácie je `preview-only`.

V druhom termináli s dostupným Playwrightom:

```sh
node tests/anthill-browser.cjs
```

`PLAYWRIGHT_MODULE` môže odkazovať na existujúci modul Playwright. `BROWSER_CHANNEL` má predvolenú hodnotu `msedge`; hodnota `chromium` použije prehliadač nainštalovaný Playwrightom. `PREVIEW_URL` prepíše adresu lokálneho testovacieho servera. Tento test prepína tému cez testovacie admin API, preto má bežať výhradne proti fixture serveru.

Prehliadačový test pokrýva zásoby, stavbu, pomenovanie, role, most, obnovu postupu, pauzu, skrytú kartu, prepínanie tém, zachovanie rozpracovanej objednávky a dotykové ovládanie. Snímky desktopu a mobilu sú v ignorovanom priečinku `test-results/anthill/`.
