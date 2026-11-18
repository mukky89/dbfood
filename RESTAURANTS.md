# Jedálne a overenie integrácie

Verzia 1.32.4, 16. 11. 2026. Testy objednávok používajú izolované úložiská. Overenie cien a QR na Railway nevytvára objednávky, neodosiela správy ani nevykonáva platby.

## Zdroje a výsledky

| Dátum | LUPO: polievky / hlavné / dezerty | Nevädzka: polievky / hlavné |
|---|---|---|
| 16. 11. 2026 | 2 / 10 / 2 | 1 / 4 |
| 17. 11. 2026 | 2 / 9 / 1 | 1 / 4 |
| 18. 11. 2026 | 2 / 9 / 2 | 1 / 4 |
| 19. 11. 2026 | 2 / 9 / 2 | 1 / 4 |
| 20. 11. 2026 | 2 / 10 / 1 | 1 / 4 |

- LUPO: https://jedalenlupo.sk/ — celé týždenné menu je v HTML aj vo verejnom WordPress API `/wp-json/wp/v2/pages/14?_fields=content`. Primárny zdroj je API; zálohy sú priama stránka a Jina Reader s JSON textom z API. Parser používa nadpisy s dátumom a zoznamy Elementor. Každá položka má vlastnú cenu; prílohy, šaláty a pochutiny sú oddelené od hlavných jedál. Pri názve „príloha“ sa vyberá konkrétna príloha zo zoznamu daného dňa.
- Nevädzka: https://www.menucka.sk/denne-menu/bratislava/jedalen-nevaedzka — obsahuje päť dní. Parser používa `.day-title`, riadky `.col-xs-10.col-sm-10`, rímske čísla I–IV a spoločný cenník. Minútky nemajú cenu a nie sú zaradené do platenej ponuky. Pri HTTP chybe alebo neplatnom obsahu priamej stránky aplikácia automaticky skúsi čerstvé HTML cez Jina Reader.

## Automatické načítanie pri blokovaní

Priamy prístup z Railway v pôvodnej verzii vracal HTTP 403 pre oba weby. `menu-source.js` používa viac zdrojov a overí, že odpoveď obsahuje datované hlavné jedlá. Stránka s antirobot výzvou sa odmietne aj pri HTTP 200. Reader sa žiada o HTML pre Nevädzku a o JSON text verejného WordPress API pre LUPO, s `X-No-Cache: true`. Nepoužíva sa generovanie jedál modelom ani OCR.

Do Readeru sa odosielajú iba dve pevné verejné URL; žiadne používateľské údaje, admin heslá, objednávky, cookies ani platobné nastavenia. Voliteľný kľúč je v `MENU_READER_API_KEY`, nikdy v repozitári. Bez kľúča služba funguje s nižším limitom. `MENU_READER_ENABLED=0` externý záložný zdroj vypne. Dokumentácia služby: https://docs.jina.ai/api.md.

Menu sa cachuje 30 minút pre konkrétnu jedáleň, revíziu a dátum. Súbežné požiadavky zdieľajú načítanie aj preklad. Po polnoci alebo zmene jedálne sa načíta nový dátum automaticky pri otvorení aplikácie. Výpadok všetkých zdrojov môže použiť označenú cache iba z rovnakého dňa a jedálne. Ručný HTML import zostáva núdzová možnosť.

Parsery vyberajú dátum, nie iba názov dňa. Na víkend, nezverejnený budúci týždeň alebo pri stránke bez dátumov nevrátia predchádzajúce menu.

## Ceny

- LUPO: bežné menu s polievkou 8,00 €, pondelkový teľací paprikáš 8,90 €, štvrtková kačka 9,50 €. K obedu sa pripočíta poplatok za prípravu a expedíciu 0,50 €, teda výsledné sumy sú 8,50 € / 9,40 € / 10,00 €. Poplatok sa účtuje raz za obed, nie osobitne za polievku či dezert. Bez polievky sa od ceny menu odpočíta 1,00 €; samostatná polievka 2,80 €, dezerty podľa položky. Doprava 1 € je podľa webu pri aspoň dvoch obedoch na jednu adresu zdarma a do individuálnej QR platby sa nepripočítava. Predbežný súčet aj QR používajú rovnaké pravidlo; pri viacerých porciách sa násobí celá suma vrátane prípravy a expedície.
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

## Automatické odhady alergénov vo všetkých jedálňach

Každá položka prechádza odhadom bežných variantov receptúry s pomenovaním hypotetickej prísady a jej alergénov. Server zjednotí iba validované čísla z týchto variantov; dôvody ukáže v nápovede ikoniek. Nejde o tvrdenie, že jedáleň danú prísadu naozaj použila. Čísla alergénov nie sú uložené napevno podľa názvu či čísla jedla. Platí pre Fantozzi, LUPO aj Nevädzku, pre polievky, hlavné jedlá, pizzu a dezerty vrátane príloh. Zdrojové údaje sa nemenia; dodatočné možné alergény sa zobrazia samostatne bez duplicít.

Nastav `OPENAI_API_KEY` iba v serverových Variables Railway služby dbfood. Predvolený model je `gpt-4.1-mini`; zmena cez `OPENAI_ALLERGEN_MODEL`. Vypnutie: `AI_ALLERGENS_ENABLED=0` alebo odstránenie kľúča. Kľúč sa neposiela do prehliadača ani neukladá do repozitára.

Pri `/api/menu` sa spracujú všetky položky vrátane tých s alergénmi od zdroja. Denne o 7:00 Europe/Bratislava sa predpripraví aktívna jedáleň; načítanie či prepnutie menu funguje aj mimo tohto času. Cache je oddelená podľa jedálne a dátumu, takže nový deň alebo nová jedáleň spustí nový odhad aj pri rovnakých názvoch. Veľké menu sa rozdelí na dávky po 20 položiek; odlišné súbežné menu počká vo fronte namiesto preskočenia.

Ceny, platby, objednávanie a súhrnné e-maily OpenAI nevolajú. Posielajú sa iba názvy jedál, sekcií, príloh a verejne uvedené čísla alergénov, bez používateľských dát. Responses API používa `store:false` a prísnu JSON schému. Odhady nie sú potvrdením receptúry ani bezpečnosti jedla a v UI sú odlíšené od údajov jedálne. Neurčitý názov môže zostať bez odhadu; chýbajúci či prázdny výsledok nikdy neznamená neprítomnosť alergénov.

Pamäťová cache drží najviac 128 výsledkov podľa dňa, jedálne, obsahu, modelu a verzie promptu na 7 dní. Prázdne odhady automaticky prejdú jednou druhou kontrolou receptúry (timeout 8 sekúnd); ak zostanú neurčené, cache sa obnoví pri načítaní po hodine. Reštart služby ju vyprázdni. Súbežné požiadavky zdieľajú volanie; po chybe prvého volania sa ďalšie volania pozastavia na 10 minút. Limit odpovede je 4 000 až 8 000 tokenov podľa veľkosti dávky, timeout prvého volania 20 sekúnd. Po chybe prvého volania sa zobrazí pôvodné menu bez odhadu; chyba druhej kontroly zachová prvé odhady. Funkcia nevytvára žiadne kolekcie či dokumenty v MongoDB a nevyžaduje zväčšenie disku.
