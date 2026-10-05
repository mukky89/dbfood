# Mravenisko

Hra sa otvára tlačidlom **Mravenisko** v hlavičke stránky, pri každej téme. Zobrazuje bočný rez teráriom s pieskom, koreňmi, nepravidelnými chodbami a komorami. Robotnice nosia potravu do zásobárne, starajú sa o liaheň a pohybujú sa okolo kráľovnej. Zatvorením hry sa hráč vráti k objednávkam.

Herná plocha používa vygenerovanú textúru terénu a živé vykresľovanie mravcov, jedla, vody a komôr. Geometria chodieb je spoločná pre kreslenie aj pohyb robotníc. Zdroj a stručný opis zadania obrázka sú v [ASSETS.md](public/assets/colony/ASSETS.md).

## Hranie

V **Sandboxe** možno pridávať jedlo a vodu, plánovať kopanie komôr, viesť robotnice stopou a pozorovať jednotlivé časti hniezda. Čas možno pozastaviť. Mravce si samy rozdeľujú zber, prieskum, kopanie a starostlivosť; hráč ovplyvňuje podmienky, v ktorých pracujú. Sandbox sa nezapočítava do spoločného rebríčka.

Zdroje pribúdajú až po fyzickom doručení do hniezda, nie položením porcie na povrch. Stavba spotrebuje zásoby a vyžaduje prácu kopáčov. Nová robotnica potrebuje miesto v liahni, jedlo a vodu. Populácia má limit 40 jedincov. Nedostatok zásob spomaľuje rast.

**Denná výzva** je samostatný pokus na 180 sekúnd herného času. Všetci hráči majú v daný deň rovnaký počiatočný stav a priebeh náhodných udalostí. Na povrchu začínajú tri zdroje; hráč môže položiť ďalších šesť porcií jedla alebo vody. Platí rovnaká čakacia doba medzi porciami a rovnaké náklady stavieb pre všetkých. Denná výzva beží normálnou rýchlosťou; pozastavenie predĺži čas potrebný na dokončenie.

Skóre dennej výzvy:

- **10 bodov** za jednotku jedla prijatú do zásobárne;
- **5 bodov** za jednotku doručenej vody;
- **250 bodov** jednorazovo za splnenie misie: doručiť aspoň 40 jednotiek jedla.

Denná výzva nepreberá zásoby ani vylepšenia zo sandboxu. Po návrate do sandboxu zostáva vlastná kolónia zachovaná.

## Spoločný rebríček

Rebríček zobrazuje skutočne odoslané výsledky hráčov. Prázdny rebríček neobsahuje ukážkové mená. Za deň sa započítava najlepší výsledok hráča; opakované pokusy sa nesčítavajú. Týždenné skóre je súčet denných rekordov od pondelka. Deň aj týždeň používajú časové pásmo **Europe/Bratislava**. Pokus prechádzajúci cez polnoc patrí dňu, v ktorom sa začal.

Identitou hráča je náhodná súkromná cookie pre konkrétny prehliadač, oddelená od mena používaného pri objednávkach. Vzniká až pri začatí prvého pokusu; samotné čítanie rebríčka cookie nevytvára ani nemení. Meno je iba zobrazovaný popis. Nové zariadenie, iný prehliadač alebo zmazanie cookie vytvoria samostatnú identitu. Rovnaké mená preto nemusia patriť rovnakému hráčovi.

Server prijíma záznam zásahov a celý pokus znovu odsimuluje. Klientské skóre neprijíma. Kontroluje poradie a platnosť zásahov, dostupné zdroje, limity porcií a uplynutie aspoň 180 skutočných sekúnd. Dokončený pokus sa nedá započítať druhýkrát. Pri nedostupnom rebríčku zostáva sandbox dostupný.

## Živé pozadie

Pôvodná téma **Admin → Vzhľad → Živé mravenisko** zostáva samostatným autonómnym pozadím objednávkovej stránky. Potravu objavuje a komory rozvíja bez zásahov hráča. Zdroje sa objavujú priebežne a kolónia reaguje na udalosti. Pozadie nezachytáva kliknutia na objednávkový formulár; jeho ovládanie umožňuje pauzu, skrytie a pozorovanie zblízka.

Pôvodné uloženie pod `fob_anthill_v1` zostáva zachované. Herný sandbox a denná výzva majú samostatný stav. Počas neprítomnosti sa neudeľujú dodatočné body ani zásoby. Pri systémovej voľbe obmedzeného pohybu sa pohyb spúšťa až na požiadanie.

Každá hrajúca karta obnovuje denný pokus zo svojho `sessionStorage`; spoločný checkpoint v `localStorage` slúži novým kartám a staršia karta ho nesmie vrátiť späť ani prepísať iným pokusom.

## Server a dáta

- `public/anthill-engine.js`: spoločná simulácia a geometria hniezda.
- `public/colony-challenge.js`: deterministická denná výzva, použiteľná v prehliadači aj v Node.js; pevný krok 0,1 sekundy a 1 800 krokov na pokus.
- `colony-api.js`: `GET /api/colony?period=day|week`, `POST /api/colony/runs` s menom a `POST /api/colony/runs/:id/finish` so záznamom zásahov.
- `colony-store.js`: produkčné MongoDB úložisko a pamäťové úložisko pre lokálny náhľad a testy.

MongoDB kolekcie `ColonyRun` a `ColonyDailyBest` uchovávajú pokusy a denné rekordy. Pokusy prežijú reštart servera a majú platnosť 30 minút od vytvorenia; ich záznamy následne odstraňuje TTL index. Denný rekord má jedinečný index podľa prehliadačovej identity a dňa. Súbežné odoslania nesmú prepísať lepší výsledok horším.

API obmedzuje veľkosť JSON na 64 KiB a záznam na 120 zásahov. Za desať minút povoľuje najviac šesť začatí a osemnásť pokusov o odoslanie na prehliadač, s dodatočným limitom podľa IP. Cookie je `HttpOnly`, `SameSite=Strict` a na HTTPS aj `Secure`. Identifikátory hráčov sa neposielajú v rebríčku.

Pri zmene pravidiel dennej výzvy treba zmeniť aj `VERSION` v `colony-api.js`, aby server odmietol rozbehnuté pokusy podľa nekompatibilných pravidiel.

## Overenie

Jednotkové a API testy: `npm test` alebo `node --test tests/*.test.js`.

Samostatné testy dennej výzvy a rebríčka: `node --test tests/colony-challenge.test.js tests/colony-api.test.js`. Overujú rovnaký výsledok v prehliadačovom a serverovom prostredí, pravidlá skórovania, odmietnutie neplatných záznamov, súbežné odoslania, denné rekordy, týždne, zmeny času a nedostupnosť úložiska. API testy používajú izolované pamäťové dáta, bez produkčnej databázy.

Lokálny náhľad: `node tests/preview-server.cjs`. Používa rovnaké API s pamäťovým rebríčkom, ktorý sa po reštarte náhľadu vymaže. Nepripája MongoDB a neposiela emaily ani platby.

Regresné testy živého pozadia: `node tests/anthill-browser.cjs` (Playwright, predvolený kanál `msedge`; `PLAYWRIGHT_MODULE` môže ukazovať na existujúci modul). Používajú lokálny náhľad a overujú aj objednávkový formulár, pauzu, mobil, obnovu stavu a zastavenie pozadia pri zmene témy. Snímky sú v `test-results/anthill/`.

Herné prehliadačové testy: `node tests/colony-browser.cjs`. Overujú klávesnicové umiestňovanie jedla a vody, prácu kopáčov, priblíženie kráľovnej, zachovanie sandboxu, dokončenie a obnovu výzvy, opakovanie neúspešného uloženia a mobilné šírky 320 a 390 px. Testy odoslania používajú kontrolované odpovede a spoločné serverové prehratie záznamu; samostatné API testy overujú skutočné endpointy vrátane časového limitu.

Lokálnu hru možno otvoriť priamo cez `http://127.0.0.1:8766/?colony=1`, keď beží náhľadový server.
