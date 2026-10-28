# Sylex Tower Defence

Voliteľná téma existujúceho obedového systému. V administrácii v nastaveniach vzhľadu vyber **Sylex Tower Defence**, potom **Brániť Sylex**. Nasledujúce vizuálne pravidlá platia iba pre túto tému.

- `public/sylex-engine.js`: samostatná simulácia, ekonomika, vlny, útoky a vylepšenia.
- `public/sylex-3d.js`: WebGL scéna s lokálne dodaným Three.js 0.180.0, perspektívnou kamerou, materiálmi a výberom cez raycasting.
- `public/sylex-renderer.js`: záložné 2D canvas vykresľovanie a ikony veží.
- `public/sylex-theme.js`, `public/sylex-theme.css`: integrácia, ovládanie, životný cyklus hry a izolované štýly témy.
- `public/sylex-score.js`: spoločný výpočet skóre a deterministické prehratie záznamu na serveri.
- `sylex-api.js`: API hier, overenie výsledkov a spoločný rebríček v MongoDB.
- `public/index.html`, `server.js`: registrácia témy a API, uloženie témy cez existujúcu administráciu.

Spustenie: `npm start` s existujúcou konfiguráciou aplikácie a MongoDB. Testy: `npm test`. Scénu otváraj cez HTTP server aplikácie; používa JavaScript moduly a lokálne textúry.

Hra začína s 210 kreditmi. Veže stoja 70 / 90 / 120 kreditov. Zastavený zombík prinesie 12 kreditov a 10 bodov; dokončená vlna 35 kreditov a 100 bodov. Prienik uberie 10 zo 100 bodov odolnosti. Maximálna úroveň veže je 3. Vylepšenie pridáva dosah a poškodenie. WebGL mení zobrazenie, simulácia zostáva zdrojom herného stavu.

Miesto vyber kliknutím na podstavec alebo vežu v 3D scéne, tlačidlami miest alebo klávesmi 1–9. Potiahnutie areálu otáča kameru v obmedzenom rozsahu. Tlačidlá **+** a **−** ovládajú priblíženie, **Detail** obnoví blízky predvolený pohľad (zoom 1,6), **Celý areál** širší pohľad (1,2). Tab a Enter sprístupňujú akcie klávesnicou, Escape sa vráti k obedom.

Skutočný 3D canvas tvorí pevné pozadie stránky. Spustenie hry zobrazí ovládací HUD nad tým istým svetom pomocou nemodálneho `dialog.show()`; obedové rozhranie je počas hry skryté a neinteraktívne (`inert`). Návrat k obedom obnoví rozhranie a pôvodné hodnoty `inert`, hru pozastaví a ponechá areál v pozadí bez priebežnej animácie. Skrytie karty alebo vypnutie témy tiež pozastaví hru. Postup zostáva v pamäti stránky; obnovenie stránky začína novú hru.

Primárne zobrazenie je 3D WebGL scéna s perspektívou. Herné súradnice 960 × 540 sa mapujú na vodorovnú rovinu sveta. Budova má svetlú striebornú fasádu, väčšie presklenie a vyššie podlažia. Budova, autá, zombíki a otáčajúce sa veže sú priestorové mesh modely; lístie tvoria inštancované plochy s lokálne vytvorenou priehľadnou textúrou. Budova je štylizovaná, nie presná reprodukcia skutočného sídla.

Fotografické PBR textúry trávy, asfaltu, betónu, kôry a kovového obkladu používajú farebné, normálové a drsnostné mapy. Scénu osvetľuje hemisférické svetlo a smerové slnko s tieňmi; odrazy využívajú lokálne generované prostredie. Ovládanie zachováva tmavomodrú (#152e3a), tyrkysovú obranu a žltú akciu (#e8c979).

Pri zlyhaní inicializácie WebGL, načítania scény alebo pri strate WebGL kontextu sa zobrazí 2D canvas renderer a vypnú sa tlačidlá kamery. Hra aj výber miest zostávajú dostupné bez zmeny simulácie.

Spoločný rebríček zobrazuje najlepší výsledok každej identity prehliadača, najviac 20 hráčov. Identitu určuje náhodná HttpOnly cookie `sylex_player`, nie prihlásený účet; prezývka je verejná. Cookie má SameSite=Lax a príznak Secure pri HTTPS alebo `NODE_ENV=production`. Model `SylexRun` uchováva rozbehnuté hry s dvojhodinovým TTL, `SylexResult` uchováva výsledky trvalo. Vymazanie cookie alebo iný prehliadač znamená inú identitu.

Prvá vlna vyžaduje prezývku a úspešné vytvorenie hry na serveri. Výsledok sa odosiela tlačidlom **Ukončiť a zapísať skóre**, automaticky pri prehre alebo po dosiahnutí časového limitu. Simulácia a serverové prehratie používajú pevný krok 30 Hz, najviac 54 000 krokov (30 herných minút) a 1 500 akcií. Server skóre vypočíta zo záznamu a overí platnosť akcií aj čas: najviac dvojnásobok uplynutého času s toleranciou 120 krokov. Opakované odoslanie už uloženého výsledku je idempotentné; pri chybe možno uloženie zopakovať.

API:

- `GET /api/sylex`: spoločný rebríček.
- `POST /api/sylex/runs`: vytvorenie hry s prezývkou.
- `POST /api/sylex/runs/:id/finish`: overenie záznamu a uloženie výsledku.

Limity za minútu sú 30 POST a 90 GET požiadaviek na identitu prehliadača; širšie limity na IP (1 200 POST, 3 000 GET) zohľadňujú spoločnú firemnú sieť alebo reverzný proxy. Pri nedostupnej databáze API vracia chybu dostupnosti, namiesto predstierania úspešného uloženia.

Three.js aj všetkých 15 JPG máp sa načítavajú z aplikácie; vykresľovanie nepotrebuje externú sieťovú službu ani CDN. Textúry pri prvom načítaní predstavujú približne 9,8 MB (bez knižnice a ostatných súborov). Pochádzajú z Poly Haven pod licenciou CC0. Presné zdroje a licencie sú v [prehľade assetov](public/assets/sylex/README.md), [sources.json](public/assets/sylex/sources.json) a [licencii Three.js](public/vendor/three/LICENSE).

Overenie: celá sada `npm test` prešla (90 testov: 84 pôvodných a 6 testov skóre/API). Prehliadačové kontroly cez HTTP server overili uloženie výsledku, jeho čítanie z iného kontextu, raycasting a obnovenie objednávkového rozhrania. Produkčné MongoDB ani nasadenie neboli testované; kontroly nepotvrdzujú výkon na konkrétnych GPU.

