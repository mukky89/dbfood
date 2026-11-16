# Jedálne a overenie integrácie

Verzia 1.31.0, overené 16. 11. 2026. Produkčná MongoDB, objednávky, e-maily ani push správy neboli použité na testovanie.

## Zdroje a výsledky

| Dátum | LUPO: polievky / hlavné / dezerty | Nevädzka: polievky / hlavné |
|---|---|---|
| 16. 11. 2026 | 2 / 10 / 2 | 1 / 4 |
| 17. 11. 2026 | 2 / 9 / 1 | 1 / 4 |
| 18. 11. 2026 | 2 / 9 / 2 | 1 / 4 |
| 19. 11. 2026 | 2 / 9 / 2 | 1 / 4 |
| 20. 11. 2026 | 2 / 10 / 1 | 1 / 4 |

- LUPO: https://jedalenlupo.sk/ — HTTP 200, celé týždenné menu v HTML. Parser používa nadpisy s dátumom a zoznamy Elementor. Každá položka má vlastnú cenu; prílohy, šaláty a pochutiny sú oddelené od hlavných jedál. Pri názve „príloha“ sa vyberá konkrétna príloha zo zoznamu daného dňa.
- Nevädzka: https://www.menucka.sk/denne-menu/bratislava/jedalen-nevaedzka — HTML v prehliadači obsahuje päť dní. Parser používa `.day-title`, riadky `.col-xs-10.col-sm-10`, rímske čísla I–IV a spoločný cenník. Minútky nemajú cenu a nie sú zaradené do platenej ponuky. Priamy Axios, natívny Node fetch aj PDF endpoint pri overení vracali HTTP 403 Cloudflare. Z toho nemožno vyvodiť, že Railway bude fungovať alebo nebude fungovať: overí to admin tlačidlom „Overiť automatické načítanie“ po nasadení.

Parsery vyberajú dátum, nie iba názov dňa. Na víkend, nezverejnený budúci týždeň alebo pri stránke bez dátumov nevrátia predchádzajúce menu.

## Ceny

- LUPO: bežné menu s polievkou 8,00 €, pondelkový teľací paprikáš 8,90 €, štvrtková kačka 9,50 €. Bez polievky mínus 1,00 €, samostatná polievka 2,80 €, dezerty podľa položky. Ceny sa parsujú zo zdroja. Poplatok za prípravu a expedíciu 0,50 € a prípadná doprava sú zobrazené ako upozornenie a nie sú započítané do odhadu; firemné podmienky treba overiť s jedálňou.
- Nevädzka: hlavné jedlo 7,40 €, polievka k jedlu 0,60 €, spolu 8,00 €, polievka samostatne 2,50 €. Ceny sa čítajú zo spoločného cenníka, nie z prázdnych cenových polí pri položkách.
- Nové jedálne pri chýbajúcej cene nevytvoria QR podľa starého Fantozzi cenníka. Frontend a backend používajú rovnaký výpočet v `public/menu-pricing.js`.
- Existujúce nastavenie príjemcu e-mailov, účtu a uzávierky ostáva spoločné pre aplikáciu. Pri prepnutí jedálne sa automaticky nemení účet príjemcu platby ani neodosiela objednávka jedálni.

## Administrácia a import

V Admin → Výber jedálne vyberte podnik a uložte voľbu pred prvou objednávkou. Názov sa zmení v hlavičke, kontaktoch, titulku stránky, dennom menu a súhrnnom e-maile. Otvorené stránky overujú zmenu každých 30 sekúnd; server kontroluje zdroj pri každej novej objednávke.

Voľba je uložená v `RestaurantSettings` pod unikátnym kľúčom `restaurant`. Cache je viazaná na jedáleň, revíziu nastavenia a dátum v Bratislave. Prepnutie späť na pôvodnú jedáleň zvýši revíziu a zneplatní staré formuláre. Existujúce objednávky sa neodstraňujú. Prepínanie a ukladanie nových objednávok používajú spoločnú frontu v jednom Node procese. Produkcia má aktuálne jednu repliku; pred nasadením viacerých replík treba nahradiť túto frontu distribuovaným zámkom alebo transakciou.

Pri HTTP 403 otvorte web jedálne v bežnom prehliadači a uložte stránku ako HTML cez Ctrl+S. V administrácii rozbaľte import a nahrajte `.html` súbor (max. 550 kB). Server použije parser vybranej jedálne a importuje iba dnešný dátum. Import je uložený v `ManualRestaurantMenu` a zostáva platný po reštarte; po zmene jedálne alebo dátumu sa nepoužije. Nie je potrebné kopírovať jedlá ručne do JSON. Súbor s Cloudflare výzvou sa odmietne.

## Opakovanie testov

```
npm ci --ignore-scripts
npm test
```

Nové testy pokrývajú všetkých desať kombinácií jedáleň/dátum, číslovanie, alergény, ceny, chýbajúce menu, cache, trvalé ručné menu, autentifikáciu admina, whitelist jedální, zachovanie objednávok, revízie a odmietnutie starého výberu. Pôvodné testy zostávajú súčasťou celej sady.

Lokálny náhľad skutočných parserov s testovacími objednávkami v pamäti:

```powershell
$env:RESTAURANT_PREVIEW='1'
$env:PREVIEW_PORT='8768'
node tests/preview-server.cjs
```

Admin: http://127.0.0.1:8768/admin, heslo `preview-only`. Náhľad používa menu zachytené 16. 11. 2026. Nespája sa s MongoDB ani neposiela e-maily, push správy či platby. HTML fixtures sú očistené výrezy skutočných zdrojov; nie sú náhradou za test aktuálnej dostupnosti servera.
