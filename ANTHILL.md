# Živé mravenisko

Téma sa zapína cez **Admin → Vzhľad → Živé mravenisko**. Jej hlavnou funkciou je autonómne pozadie stránky s jedlom. Nie je potrebné otvárať hru ani čokoľvek obsluhovať.

Kolónia sama:
- objavuje potravu a vodu, ktoré sa priebežne objavujú v okolí;
- vytvára cesty a prenáša náklady do zásobárne;
- rozdeľuje zber, prieskum, kopanie a starostlivosť podľa potreby;
- buduje komory, vychováva nové robotnice a neskôr vylepšuje hniezdo;
- spotrebúva zásoby, oddychuje a reaguje na príležitostné udalosti.

Zdroje pribúdajú iba fyzickým doručením. Stavby vznikajú prácou kopáčov; nová robotnica spotrebuje jedlo a vodu. Nedostatok spomalí rast, ale nespôsobuje smrť kolónie. Po dosiahnutí limitu 40 robotníc zber a život v hniezde pokračujú.

## Zobrazenie

Na desktope sa komory a mravce vykresľujú do voľných okrajov okolo hlavného obsahu. Pozadie nezachytáva kliknutia a nepriehľadné karty chránia čitateľnosť menu. Zbalený prvok **Živé pozadie** obsahuje len pauzu, skrytie a **Pozorovať zblízka**. Detailný pohľad umožňuje posun a priblíženie, bez herných úloh a ručného riadenia.

## Uloženie a výkon

Stav zostáva v localStorage pod fob_anthill_v1, ukladá sa každých päť sekúnd a pri odchode. Staré kolónie sa zachovajú; automatické riadenie prevezme rozdelenie práce a pokračuje v rozostavaných komorách. Voľby pauzy a skrytia sa rešpektujú. Počas neprítomnosti sa zdroje nemenia.

Pri systémovom obmedzení pohybu je pozadie statické, detailný pohľad sa spustí až na požiadanie. Skrytá karta aj zmena témy zastavia slučku. Vykresľovanie je obmedzené na 30 snímok za sekundu, populácia na 40 jedincov.

## Overenie

Jednotkové testy: node --test tests/*.test.js

Lokálny server bez produkčných dát: node tests/preview-server.cjs

Prehliadačové testy: node tests/anthill-browser.cjs (Playwright, predvolený kanál msedge; PLAYWRIGHT_MODULE môže ukazovať na existujúci modul). Test používa len lokálny fixture server a prepne jeho tému. Overuje samostatný chod na pozadí, objednávkový formulár, pauzu, mobil, obnovu stavu a zastavenie pri zmene témy. Snímky sú v test-results/anthill/.
