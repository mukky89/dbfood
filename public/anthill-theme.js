(function () {
  'use strict';
  if (!window.Anthill) return;
  const { Game, FOODS, ROOMS, ROLES, UPGRADES, SLOTS, dist, clamp } = window.Anthill;
  const KEY = 'fob_anthill_v1', root = document.documentElement;
  let saved; try { saved = localStorage.getItem(KEY); } catch (_) { /* Storage can be unavailable in private mode. */ }
  let game = new Game(saved), active = false, raf = 0, last = 0, saveTime = 0, uiTime = 0;
  let tab = 'food', tool = null, selected = null, hover = null, drag = null, guidePoints = [], speed = 1, follow = null, audio = null;
  let zoom = 1, pan = { x: 0, y: 0 }, transform = { x: 0, y: 0, scale: 1 }, originFocus = null, lastSound = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const bg = document.createElement('canvas'); bg.id = 'ant-background'; bg.setAttribute('aria-hidden', 'true'); bg.hidden = true;
  const dock = document.createElement('section'); dock.id = 'ant-dock'; dock.setAttribute('aria-label', 'Moja kolónia');
  dock.innerHTML = '<strong>🐜 Moja kolónia</strong><span id="ant-dock-stats"></span><div class="ant-dock-actions"><button type="button" data-action="open">Preskúmať mravenisko ↗</button><button type="button" data-action="pause">Pauza</button><button type="button" data-action="hide">Skryť</button></div>';
  const dialog = document.createElement('dialog'); dialog.id = 'ant-game'; dialog.setAttribute('aria-labelledby', 'ant-title');
  dialog.innerHTML = `
    <div class="ant-top"><div><div class="ant-eyebrow">Malý svet pod tvojím obedom</div><div class="ant-title-line"><h2 id="ant-title">Živé mravenisko</h2><span class="ant-badge">Pokojná stratégia</span></div></div><button type="button" data-action="close" autofocus>Späť na menu ✕</button></div>
    <div class="ant-metrics" id="ant-metrics" aria-label="Stav kolónie"></div>
    <div class="ant-layout"><div class="ant-world"><div class="ant-scene-label">LÚKA Č. 01 / TVOJA KOLÓNIA</div><canvas id="ant-canvas" tabindex="0" aria-label="Interaktívne mravenisko" aria-describedby="ant-help">Interaktívna kolónia. Nástroje a zoznam objektov sú dostupné v bočnom paneli.</canvas><div class="ant-camera"><button type="button" data-action="zoom-out" aria-label="Oddialiť">−</button><button type="button" data-action="zoom-in" aria-label="Priblížiť">+</button><button type="button" data-action="center">Vycentrovať</button><button type="button" data-action="pause">Pauza</button><button type="button" data-action="speed">1×</button><button type="button" data-action="follow-off" hidden>Uvoľniť kameru</button></div></div>
    <aside class="ant-sidebar"><nav class="ant-tabs" aria-label="Nástroje kolónie">${[['food','Potrava'],['build','Stavba'],['colony','Mravce'],['upgrades','Rozvoj'],['tasks','Úlohy'],['settings','Voľby']].map(([key,label]) => `<button type="button" data-tab="${key}" aria-pressed="${key === tab}">${label}</button>`).join('')}</nav><section id="ant-panel"></section><section id="ant-detail" aria-label="Vybraný objekt"></section></aside></div>
    <div class="ant-bottom"><p id="ant-status" role="status" aria-live="polite">Vitaj! Vyber omrvinku a polož ju na lúku nad zemou.</p><button type="button" data-action="cancel" hidden>Zrušiť nástroj</button></div>`;
  document.body.append(bg, dock, dialog);
  const $ = id => document.getElementById('ant-' + id), canvas = $('canvas'), ctx = canvas.getContext('2d'), bgctx = bg.getContext('2d');
  if (!ctx || !bgctx) { dock.remove(); dialog.remove(); bg.remove(); return; }
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const button = (action, label, attrs = '') => `<button type="button" data-action="${action}" ${attrs}>${label}</button>`;
  const stateNames = { idle:'Pripravuje sa', explore:'Preskúmava lúku', gather:'Ide za potravou', waiting:'Čaká na druhého nosiča', deliver:'Nesie náklad', dig:'Kope komoru', dirt:'Vynáša zeminu', care:'Stará sa o potomstvo', rest:'Odpočíva', report:'Zanecháva feromónovú stopu', return:'Vracia sa do hniezda', clear:'Odstraňuje vetvičku' };
  function message(text) { $('status').textContent = text; }
  function persist() { try { localStorage.setItem(KEY, game.serialize()); } catch (_) { if (dialog.open) message('Prehliadač nepovolil uloženie. Kolónia zostane dostupná počas tejto návštevy.'); } }
  function result(error, success) { message(error || success); if (!error) { persist(); renderPanel(); renderDetail(); } draw(); updateStats(); }
  function setTool(value) { tool = value; guidePoints = []; selected = null; $('detail').replaceChildren(); dialog.querySelector('[data-action=cancel]').hidden = !value; renderPanel(); draw(); }
  function open() {
    if (dialog.open || !active) return;
    originFocus = document.activeElement; dialog.showModal(); dock.hidden = true;
    // An explicit play action permits motion even when the decorative background is static.
    resize(); renderPanel(); updateStats(); start();
  }
  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', () => { dock.hidden = false; tool = null; follow = null; persist(); if (originFocus?.isConnected) originFocus.focus(); sync(); });
  dialog.addEventListener('cancel', e => { if (tool) { e.preventDefault(); setTool(null); message('Nástroj zrušený.'); } });
  function renderPanel() {
    const s = game.s;
    dialog.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
    let html = '';
    if (tab === 'food') html = `<div class="ant-eyebrow">01 / zásoby z lúky</div><h3>Malé sústo. Veľká výprava.</h3><p class="ant-note">Vyber porciu a ťukni na povrch. Prieskumníci nájdu potravu a robotnice ju odnesú domov.</p><div class="ant-food-grid">${Object.entries(FOODS).map(([key,f]) => button('food:'+key, `<span>${f.icon}</span>${f.name}<small>${key === 'pizza' ? 'Dvaja nosiči spoločne' : key === 'water' ? 'Doplní vodu' : key === 'fruit' ? 'Jedlo aj voda' : key === 'seed' ? 'Pomalšie spracovanie' : key === 'cheese' ? 'Dvojnásobná výživa' : 'Ľahký náklad'}</small>`, `class="ant-food" aria-pressed="${tool === 'food:'+key}"`)).join('')}</div>
      <div class="ant-box"><strong>Bez myši?</strong><p class="ant-note">Vybranú porciu polož tlačidlom na najbližšie voľné miesto.</p>${button('place-food','Položiť na voľný povrch', `class="ant-wide" ${!tool?.startsWith('food:') ? 'disabled' : ''}`)}</div>
      ${button('paths', `${s.settings.paths ? '●' : '○'} Feromónové cesty`, `class="ant-wide" aria-pressed="${s.settings.paths}"`)}${button('guide','Naviesť mravce — kresli stopu', `class="ant-wide" aria-pressed="${tool === 'guide'}"`)}
      ${button('guide-short','Vytvoriť stopu pri vstupe','class="ant-wide"')}<p class="ant-note">Stopa: max. 240 bodov, trvá 25 s, obnova 15 s. Porcie zdarma, obnova 3 s, najviac 10 naraz.</p>
      <label>Potrava na lúke<select id="ant-food-select"><option value="">Vyber porciu…</option>${s.foods.map(f => `<option value="${f.id}">${FOODS[f.type].name} · ${f.amount} ks · ${f.discovered ? 'objavené' : 'neobjavené'}</option>`).join('')}</select></label>`;
    if (tab === 'build') html = `<div class="ant-eyebrow">02 / priestor na rast</div><h3>Rozšír svoj malý svet.</h3><p class="ant-note">Vyber stavbu a voľné miesto pod zemou. Robotnice vykopú prístupový tunel aj komoru.</p>${Object.entries(ROOMS).map(([key,r]) => button('build:'+key, `${r.name} · ${r.cost} jedla<br><small>${r.benefit}</small>`, `class="ant-wide" aria-pressed="${tool === 'build:'+key}"`)).join('')}<label>Stavebné miesto<select id="ant-slot">${SLOTS.map((p,i) => i >= 4 && !s.rooms.some(r => r.slot === i) ? `<option value="${i}">Miesto ${i - 3} · ${p.x < 600 ? 'vľavo' : 'vpravo'} · ${p.y === 690 ? 'hlbšie' : 'vyššie'}</option>` : '').join('')}</select></label>${button('place-room','Potvrdiť stavbu na vybranom mieste', `class="ant-wide" ${!tool?.startsWith('build:') || s.rooms.length === 10 ? 'disabled' : ''}`)}<p class="ant-note">Zrušenie rozostavanej komory vráti 50 % pôvodnej ceny (zaokrúhlené nadol).</p><label>Existujúce komory<select id="ant-room-select"><option value="">Vyber komoru…</option>${s.rooms.map(r => `<option value="${r.id}">${ROOMS[r.type]?.name || 'Kráľovná'} · ${r.progress < 100 ? Math.floor(r.progress)+' %' : 'úroveň '+r.level}</option>`).join('')}</select></label>`;
    if (tab === 'colony') {
      const allocation = game.desired(), used = Object.values(allocation).reduce((a,b) => a+b,0);
      html = `<div class="ant-eyebrow">03 / spolu dokážeme viac</div><h3>Každý má svoju úlohu.</h3>${button('auto', s.auto ? '● Automatické rozdelenie' : 'Zapnúť automatické rozdelenie', `class="ant-wide" aria-pressed="${s.auto}"`)}${Object.entries(ROLES).map(([key,label]) => `<div class="ant-row"><span>${label}</span><div class="ant-row-controls">${button('role:'+key+':-1','−',`aria-label="Znížiť: ${label}" ${!allocation[key] ? 'disabled' : ''}`)}<b>${allocation[key]}</b>${button('role:'+key+':1','+',`aria-label="Zvýšiť: ${label}" ${used >= s.ants.length ? 'disabled' : ''}`)}</div></div>`).join('')}<p class="ant-note">Nepridelené robotnice: ${s.ants.length-used}. Najskôr zníž jednu úlohu, potom zvýš druhú. Mravce bezpečne dokončia transport.</p><label>Vybrať mravca<select id="ant-ant-select"><option value="">Vyber jedinca…</option>${s.ants.map(a => `<option value="${a.id}">${a.favorite ? '★ ' : ''}${escape(a.name)}</option>`).join('')}</select></label><div class="ant-box"><strong>Nová robotnica</strong><progress value="${s.brood}" max="30"></progress><p class="ant-note">Liaheň: ${s.ants.length}/${game.populationCapacity}. Rast potrebuje opatrovateľky, 8 jedla a 2 vody.</p></div>`;
    }
    if (tab === 'upgrades') html = `<div class="ant-eyebrow">04 / o kúsok šikovnejší</div><h3>Malé vylepšenia.</h3>${Object.entries(UPGRADES).map(([key,u]) => `<div class="ant-row"><div><strong>${u.name}</strong><small>${u.effect}<br>Úroveň ${s.upgrades[key]} / 3</small></div>${button('upgrade:'+key, s.upgrades[key] >= 3 ? 'Max.' : (u.cost*(s.upgrades[key]+1))+' 🍞', `${s.upgrades[key] >= 3 || s.food < u.cost*(s.upgrades[key]+1) ? 'disabled' : ''} aria-label="Vylepšiť: ${u.name}"`)}</div>`).join('')}<p class="ant-note">Každá úroveň pridá uvedený účinok. Cena rastie s úrovňou.</p>`;
    if (tab === 'tasks') {
      const tasks = { placed:'Polož prvú porciu', discovered:'Nechaj prieskumníka objaviť jedlo', delivered:'Doruč 10 jednotiek potravy', paths:'Zobraz feromónové cesty', built:'Dokonči novú komoru', named:'Pomenuj jedného mravca', pizza:'Doruč pizzu spoločnými silami' };
      html = `<div class="ant-eyebrow">05 / prvé dobrodružstvá</div><h3>Spoznaj svoju kolóniu.</h3>${Object.entries(tasks).map(([key,label]) => `<div class="ant-task ${s.tasks[key] ? 'done' : ''}"><span>${s.tasks[key] ? '✓' : '○'}</span><span>${label}</span></div>`).join('')}<div class="ant-box"><strong>Odmeny rastú s tebou</strong><p class="ant-note">Za doručenie 10 jednotiek vyrastie dekoratívna huba. Dokončená komora pridá kvety na lúku. Doručená pizza rozsvieti jantárové svetielka v hniezde.</p></div>`;
    }
    if (tab === 'settings') html = `<div class="ant-eyebrow">06 / tvoj spôsob hrania</div><h3>Pokoj podľa teba.</h3>${button('sound',s.settings.sound ? 'Zvuk: zapnutý' : 'Zvuk: vypnutý',`class="ant-wide" aria-pressed="${s.settings.sound}"`)}${button('static',s.settings.static ? 'Pozadie: statické' : 'Pozadie: animované',`class="ant-wide" aria-pressed="${s.settings.static}"`)}${button('hide',s.settings.hidden ? 'Zobraziť pozadie' : 'Skryť pozadie','class="ant-wide"')}<p class="ant-note">${reduced.matches ? 'Systém žiada obmedzený pohyb. Pozadie je statické; simulácia beží iba po otvorení hry.' : 'Statické pozadie zastaví simuláciu mimo herného pohľadu.'} Pri skrytej karte sa hra vždy pozastaví.</p><div class="ant-box"><strong>Priechodnosť lúky</strong><p class="ant-note">Presuň kameň na druhú polohu alebo polož list nad mláčku. Mravce použijú novú cestu pri ďalšej výprave.</p>${button('rock','Presunúť kameň','class="ant-wide"')}${button('bridge',s.bridge ? 'Odobrať listový most' : 'Položiť listový most','class="ant-wide"')}</div><p id="ant-help" class="ant-note">Potiahni prázdnu plochu: posun kamery. Koliesko: priblíženie. Šípky na ploche: posun. + / −: zoom. Escape: zrušiť nástroj / zavrieť hru. Všetky objekty možno vybrať aj zo zoznamov.</p><p class="ant-note">Postup sa ukladá v tomto prehliadači. Počas neprítomnosti sa zdroje nemenia. Herné jedlo nemá spojenie s objednávkami ani platbami.</p>${button('reset','Začať novú kolóniu…','class="ant-wide ant-danger"')}`;
    $('panel').innerHTML = html;
    if (!$('help')) canvas.setAttribute('aria-describedby','ant-status'); else canvas.setAttribute('aria-describedby','ant-help');
  }
  function renderDetail() {
    const area = $('detail'), s = game.s;
    if (!selected) { area.replaceChildren(); return; }
    let html = '';
    if (selected.kind === 'ant') {
      const a = s.ants.find(a => a.id === selected.id); if (!a) { selected = null; area.replaceChildren(); return; }
      html = `<h4>${escape(a.name)}</h4><p data-live-detail>${stateNames[a.state] || 'Pracuje'} · energia ${Math.round(a.energy)} %</p><label>Meno<input id="ant-name" maxlength="32" value="${escape(a.name)}"></label>${button('rename','Uložiť meno')} ${button('favorite',a.favorite ? '★ Obľúbený' : '☆ Obľúbiť',`aria-pressed="${a.favorite}"`)}${button('follow','Sledovať mravca','class="ant-wide"')}`;
    } else if (selected.kind === 'food') {
      const f = s.foods.find(f => f.id === selected.id); if (!f) { area.textContent = 'Táto porcia je už zozbieraná.'; return; }
      html = `<h4>${FOODS[f.type].icon} ${FOODS[f.type].name}</h4><p data-live-detail>${foodDescription(f)}</p>${button('remove-food','Odstrániť porciu','class="ant-wide"')}`;
    } else if (selected.kind === 'room') {
      const r = s.rooms.find(r => r.id === selected.id); if (!r) { area.replaceChildren(); return; }
      html = `<h4>${ROOMS[r.type]?.name || 'Komora kráľovnej'} · úroveň ${r.level}</h4><p data-live-detail>${roomDescription(r)}</p>${r.progress < 100 ? `<progress id="ant-build-progress" max="100" value="${r.progress}"></progress>${button('pause-room',r.paused ? 'Pokračovať v stavbe' : 'Pozastaviť stavbu','class="ant-wide"')}${button('cancel-room','Zrušiť · späť '+Math.floor(ROOMS[r.type].cost/2)+' jedla','class="ant-wide"')}` : ROOMS[r.type] && r.type !== 'tunnel' ? button('upgrade-room',r.level < 3 ? 'Vylepšiť · '+ROOMS[r.type].cost*r.level+' jedla' : 'Maximálna úroveň',`class="ant-wide" ${r.level >= 3 ? 'disabled' : ''}`) : ''}${r.type === 'store' ? '<p class="ant-note">Doteraz doručené: '+Object.entries(s.composition).filter(([,n]) => n > 0).map(([key,n]) => FOODS[key].name+' '+n).join(', ')+'</p>' : ''}`;
    } else if (selected.kind === 'entrance') html = '<h4>Vstup do kolónie</h4><p data-live-detail>'+entranceDescription()+'</p>';
    area.innerHTML = '<div class="ant-box">'+html+'</div>';
  }
  function foodDescription(f) { return `${f.amount} jednotiek · ${game.s.ants.filter(a => a.target === f.id).length} pridelených mravcov · ${!f.discovered ? 'neobjavené' : game.s.ants.some(a => a.target === f.id && a.state === 'waiting') ? 'čaká na nosičov' : 'zbiera sa'}`; }
  function roomDescription(r) { const n = game.s.ants.filter(a => dist(a,SLOTS[r.slot]) < 75).length; return r.progress < 100 ? `${Math.floor(r.progress)} % · ${r.paused ? 'pozastavené' : 'prebieha kopanie'} · ${game.s.ants.filter(a => a.target === 'room:'+r.id).length} kopáčov` : `${n} mravcov v komore · ${r.type === 'store' ? 'kapacita '+50*r.level+' jedla' : r.type === 'water' ? 'kapacita '+40*r.level+' vody' : r.type === 'nursery' ? 'miesto pre '+6*r.level+' robotníc' : r.type === 'rest' ? '+'+30*r.level+' % obnova energie' : r.type === 'tunnel' ? 'priame spojenie tejto úrovne' : 'srdce kolónie'}`; }
  function entranceDescription() { return game.s.ants.filter(a => dist(a,{x:600,y:180}) < 90).length+' mravcov pri vstupe · '+game.s.ants.filter(a => a.cargo).length+' nákladov na ceste'; }
  function updateStats() {
    const s = game.s;
    $('dock-stats').textContent = `${Math.floor(s.food)} jedla · ${s.ants.length} mravcov · úroveň ${game.level}`;
    $('metrics').innerHTML = `<span>🍞 Jedlo <b>${Math.floor(s.food)}/${game.capacity}</b></span><span>💧 Voda <b>${Math.floor(s.water)}/${game.waterCapacity}</b></span><span>🐜 Kolónia <b>${s.ants.length}/${game.populationCapacity}</b></span><span>☀ Energia <b>${Math.round(s.ants.reduce((n,a) => n+a.energy,0)/s.ants.length)} %</b></span><span>✦ Úroveň <b>${game.level}</b></span>`;
    for (const el of document.querySelectorAll('#ant-game [data-action=pause],#ant-dock [data-action=pause]')) { el.textContent = s.settings.paused ? 'Pokračovať' : 'Pauza'; el.setAttribute('aria-pressed',String(s.settings.paused)); }
    dock.querySelector('[data-action=hide]').textContent = s.settings.hidden ? 'Zobraziť' : 'Skryť';
    dialog.querySelector('[data-action=follow-off]').hidden = follow === null;
    const live = $('detail').querySelector('[data-live-detail]');
    if (live && selected) {
      if (selected.kind === 'ant') { const a=s.ants.find(a=>a.id===selected.id); if(a) live.textContent=`${stateNames[a.state]} · energia ${Math.round(a.energy)} %`; }
      if (selected.kind === 'food') { const f=s.foods.find(f=>f.id===selected.id); live.textContent=f ? foodDescription(f) : 'Porcia je zozbieraná.'; }
      if (selected.kind === 'room') { const r=s.rooms.find(r=>r.id===selected.id); if(r) { live.textContent=roomDescription(r); if($('build-progress')) { if(r.progress===100) renderDetail(); else $('build-progress').value=r.progress; } } }
      if (selected.kind === 'entrance') live.textContent=entranceDescription();
    }
    // Refresh dynamic prices/allocations without replacing focused controls.
    if (dialog.open && !dialog.querySelector('.ant-sidebar').contains(document.activeElement) && ['colony','upgrades','tasks'].includes(tab)) renderPanel();
  }
  function action(name) {
    const s = game.s;
    if (name === 'open') { open(); return; }
    if (name === 'close') { close(); return; }
    if (name.startsWith('food:') || name.startsWith('build:')) { setTool(name); message(name.startsWith('food:') ? 'Ťukni na voľné miesto na lúke. Porciu môžu objaviť prieskumníci.' : 'Vyber svetlo označené miesto pod zemou. Cena sa odpočíta po umiestnení.'); return; }
    if (name.startsWith('upgrade:')) { result(game.upgrade(name.split(':')[1]),'Vylepšenie dokončené.'); return; }
    if (name.startsWith('role:')) { const [,role,n]=name.split(':'); game.allocate(role,Number(n)); renderPanel(); }
    if (name === 'auto') { const desired=game.desired(); s.auto = !s.auto; if(!s.auto) s.allocation=desired; renderPanel(); }
    if (name === 'pause') { s.settings.paused=!s.settings.paused; message(s.settings.paused ? 'Simulácia je pozastavená.' : 'Kolónia opäť pracuje.'); start(); }
    if (name === 'hide') { s.settings.hidden=!s.settings.hidden; sync(); renderPanel(); }
    if (name === 'static') { s.settings.static=!s.settings.static; renderPanel(); }
    if (name === 'speed') { speed=speed===1?2:1; dialog.querySelector('[data-action=speed]').textContent=speed+'×'; }
    if (name === 'zoom-in' || name === 'zoom-out') zoom=clamp(zoom*(name==='zoom-in'?1.25:.8),.7,3);
    if (name === 'center') { zoom=1; pan={x:0,y:0}; follow=null; }
    if (name === 'cancel') { setTool(null); message('Vyber mravca alebo komoru. Potiahnutím prázdnej plochy posunieš pohľad.'); }
    if (name === 'paths') { s.settings.paths=!s.settings.paths; if(s.settings.paths) s.tasks.paths=true; renderPanel(); }
    if (name === 'guide') { setTool('guide'); message('Nakresli krátku stopu po lúke. Mravce ju budú 25 sekúnd uprednostňovať.'); }
    if (name === 'guide-short') result(game.setGuide([{x:600,y:160},{x:550,y:160},{x:500,y:160}]),'Stopa pri vstupe je pripravená na 25 sekúnd.');
    if (name === 'place-food' && tool?.startsWith('food:')) {
      const type=tool.split(':')[1]; let error;
      for (const x of [550,650,490,880,230,100,1080,300,700]) { error=game.addFood(type,x); if(!error) break; }
      result(error,'Porcia je na lúke. Sleduj prieskumníkov.');
    }
    if (name === 'place-room' && tool?.startsWith('build:')) result(game.build(tool.split(':')[1],Number($('slot').value)),'Stavebný plán je pripravený.');
    if (name === 'remove-food' && selected?.kind==='food') { game.removeFood(selected.id); selected=null; renderDetail(); renderPanel(); }
    if (name === 'rename' && selected?.kind==='ant') { const a=s.ants.find(a=>a.id===selected.id), value=$('name').value.trim(); if(a&&value) { a.name=value.slice(0,32); s.tasks.named=true; renderPanel(); renderDetail(); message('Meno je uložené.'); } }
    if (name === 'favorite' && selected?.kind==='ant') { const a=s.ants.find(a=>a.id===selected.id); if(a) a.favorite=!a.favorite; renderDetail(); }
    if (name === 'follow' && selected?.kind==='ant') { follow=selected.id; zoom=1.6; }
    if (name === 'follow-off') follow=null;
    const r=selected?.kind==='room'&&s.rooms.find(r=>r.id===selected.id);
    if (name === 'pause-room' && r) { r.paused=!r.paused; renderDetail(); }
    if (name === 'cancel-room' && r) { game.cancelBuild(r.id); selected=null; renderDetail(); renderPanel(); }
    if (name === 'upgrade-room' && r) result(game.upgradeRoom(r.id),'Komora je vylepšená.');
    if (name === 'sound') { s.settings.sound=!s.settings.sound; if(s.settings.sound) playSound(); renderPanel(); }
    if (name === 'rock') { s.rock=s.rock===390?440:390; message('Kameň je presunutý. Nové výpravy si nájdu cestu okolo.'); }
    if (name === 'bridge') { s.bridge=!s.bridge; message(s.bridge ? 'Listový most skracuje cestu cez mláčku.' : 'List je odstránený. Mravce mláčku obídu.'); }
    if (name === 'reset') { $('panel').innerHTML='<h3>Začať odznova?</h3><p>Vymažeš miestny postup, mená mravcov aj stavby. Objednávka zostane zachovaná.</p>'+button('confirm-reset','Áno, vymazať kolóniu','class="ant-wide ant-danger"')+button('cancel-reset','Ponechať kolóniu','class="ant-wide"'); return; }
    if (name === 'cancel-reset') renderPanel();
    if (name === 'confirm-reset') { game=new Game(); selected=null; follow=null; tool=null; renderPanel(); renderDetail(); message('Nová kolónia je pripravená.'); }
    updateStats(); persist(); draw();
  }
  for (const container of [dock,dialog]) container.addEventListener('click', e => {
    const b=e.target.closest('button'); if(!b || b.disabled) return;
    if(b.dataset.tab) { tab=b.dataset.tab; renderPanel(); return; }
    if(b.dataset.action) action(b.dataset.action);
  });
  dialog.addEventListener('change', e => {
    const kind={ 'ant-ant-select':'ant','ant-room-select':'room','ant-food-select':'food' }[e.target.id];
    if(kind && e.target.value!=='') { selected={kind,id:Number(e.target.value)}; tool=null; renderDetail(); draw(); }
  });
  function playSound() {
    if(!game.s.settings.sound || !dialog.open || performance.now()-lastSound<200) return;
    try { audio ||= new (window.AudioContext||window.webkitAudioContext)(); audio.resume().catch(()=>{}); const o=audio.createOscillator(),g=audio.createGain(); o.type='sine';o.frequency.setValueAtTime(460,audio.currentTime);o.frequency.exponentialRampToValueAtTime(700,audio.currentTime+.1);g.gain.setValueAtTime(.025,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.14);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.15);lastSound=performance.now(); } catch(_) { /* Optional sound. */ }
  }
  function coordinates(e) { const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left-transform.x)/transform.scale,y:(e.clientY-r.top-transform.y)/transform.scale}; }
  canvas.addEventListener('pointerdown', e => {
    if(e.button!==0) return; canvas.focus(); canvas.setPointerCapture(e.pointerId);
    const p=coordinates(e); drag={x:e.clientX,y:e.clientY,pan:{...pan},moved:false,point:p,rock:!tool&&dist(p,{x:game.s.rock,y:160})<30};
    if(tool==='guide') guidePoints=[p];
  });
  canvas.addEventListener('pointermove', e => {
    hover=coordinates(e);
    if(drag) {
      if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5) drag.moved=true;
      if(tool==='guide') { if(!guidePoints.length||dist(hover,guidePoints.at(-1))>8) guidePoints.push(hover); }
      else if(drag.rock && drag.moved) game.s.rock=clamp(hover.x,320,450);
      else if(!tool && drag.moved) { follow=null;pan={x:drag.pan.x+e.clientX-drag.x,y:drag.pan.y+e.clientY-drag.y}; }
    }
    draw();
  });
  canvas.addEventListener('pointerleave',()=>{if(!drag){hover=null;draw();}});
  canvas.addEventListener('pointercancel',()=>{drag=null;guidePoints=[];});
  canvas.addEventListener('pointerup', e => {
    if(!drag) return;const p=coordinates(e),moved=drag.moved,rock=drag.rock;drag=null;
    if(rock&&moved){persist();message('Kameň je na novom mieste. Ďalšie výpravy ho obídu.');return;}
    if(tool==='guide') { result(game.setGuide(guidePoints),'Feromónová stopa je pripravená.'); guidePoints=[];return; }
    if(moved) return;
    if(tool?.startsWith('food:')) { result(p.y>=100&&p.y<=205 ? game.addFood(tool.split(':')[1],p.x) : 'Potravu polož na zelený povrch nad zemou.','Porcia je pripravená pre prieskumníkov.'); return; }
    if(tool?.startsWith('build:')) { const slot=SLOTS.findIndex((v,i)=>i>=4&&dist(p,v)<80);result(game.build(tool.split(':')[1],slot),'Stavba je naplánovaná.');return; }
    const ant=game.s.ants.slice().reverse().find(a=>dist(p,a)<19/Math.max(.6,zoom));
    const food=game.s.foods.find(f=>dist(p,{x:f.x,y:155})<28),room=game.s.rooms.find(r=>dist(p,SLOTS[r.slot])<75);
    if(ant) selected={kind:'ant',id:ant.id};
    else if(food) selected={kind:'food',id:food.id};
    else if(room) selected={kind:'room',id:room.id};
    else if(dist(p,{x:600,y:175})<35) selected={kind:'entrance'};
    else if(dist(p,{x:game.s.rock,y:157})<30) action('rock');
    else if(dist(p,{x:770,y:170})<50) action('bridge');
    else selected=null;
    renderDetail();draw();
  });
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=clamp(zoom*(e.deltaY<0?1.1:.9),.7,3);draw();},{passive:false});
  canvas.addEventListener('keydown',e=>{
    const keys={ArrowLeft:[35,0],ArrowRight:[-35,0],ArrowUp:[0,35],ArrowDown:[0,-35]};
    if(keys[e.key]) {e.preventDefault();follow=null;pan.x+=keys[e.key][0];pan.y+=keys[e.key][1];draw();}
    if(e.key==='+'||e.key==='=') {e.preventDefault();action('zoom-in');}
    if(e.key==='-') {e.preventDefault();action('zoom-out');}
  });
  function fit(c) {const r=c.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(c.width!==Math.round(r.width*dpr)||c.height!==Math.round(r.height*dpr)){c.width=Math.round(r.width*dpr);c.height=Math.round(r.height*dpr);}return {w:r.width,h:r.height,dpr};}
  function resize(){fit(bg);if(dialog.open)fit(canvas);draw();}
  const observer=new ResizeObserver(resize);observer.observe(dialog.querySelector('.ant-world'));window.addEventListener('resize',resize);
  function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
  function line(c,points,color,width,dash=[]){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.setLineDash(dash);c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();c.setLineDash([]);}
  function label(c,text,x,y,color='#e8d4ad',size=12){c.fillStyle=color;c.font=`${size}px "Segoe UI",sans-serif`;c.textAlign='center';c.fillText(text,x,y);}
  function antShape(c,a,time,queen=false){
    c.save();c.translate(a.x,a.y);c.rotate(a.angle||0);if(!queen)c.translate(0,(a.id%3-1)*3);const sc=queen?2.1:1;c.scale(sc,sc);
    const step=Math.sin(time*17+a.id)*2.5,body=a.favorite?'#845c25':'#382b20';
    for(let side of [-1,1])for(let i=0;i<3;i++)line(c,[{x:i*4-5,y:side*2},{x:i*4-8+step*(i%2?1:-1),y:side*6},{x:i*5-7+step,y:side*10}],'#3a2b1c',1.2);
    ellipse(c,-7,0,6,4.2,body);ellipse(c,0,0,3.7,2.8,body);ellipse(c,6,0,3.8,3.4,body);
    line(c,[{x:8,y:-2},{x:12,y:-6},{x:15,y:-5}],'#382b20',1);line(c,[{x:8,y:2},{x:12,y:6},{x:15,y:5}],'#382b20',1);
    ellipse(c,7,-1,1,.8,'#f4d49a');
    if(a.cargo){c.rotate(-(a.angle||0));label(c,FOODS[a.cargo.type].icon,0,-10,'#fff',15);}
    if(a.state==='dirt')ellipse(c,12,0,4,3,'#a78355');c.restore();
  }
  function drawScene(c,w,h,isBackground){
    const s=game.s,base=Math.min(w/1200,h/800),scale=base*(isBackground?Math.max(1,w/1200/base):zoom);
    let tx=(w-1200*scale)/2+(isBackground?0:pan.x),ty=(h-800*scale)/2+(isBackground?0:pan.y);
    if(!isBackground&&follow!==null){const a=s.ants.find(a=>a.id===follow);if(a){tx=w/2-a.x*scale;ty=h/2-a.y*scale;}}
    if(!isBackground)transform={x:tx,y:ty,scale};
    c.clearRect(0,0,w,h);c.fillStyle='#6e5138';c.fillRect(0,0,w,h);c.save();c.translate(tx,ty);c.scale(scale,scale);
    const sky=c.createLinearGradient(0,0,0,210);sky.addColorStop(0,'#e4e5b8');sky.addColorStop(1,'#9dac6d');c.fillStyle=sky;c.fillRect(-2000,-2000,5200,2200);
    const soil=c.createLinearGradient(0,195,0,850);soil.addColorStop(0,'#8a6848');soil.addColorStop(.3,'#785639');soil.addColorStop(1,'#493c2e');c.fillStyle=soil;c.fillRect(-2000,195,5200,2600);
    line(c,[point(0,197),point(250,195),point(490,200),point(700,193),point(1200,198)],'#627749',11);
    // Deterministic texture avoids visual noise and random work per animation frame.
    for(let i=0;i<190;i++){const x=(i*137.3)%1200,y=218+(i*91.7)%590;ellipse(c,x,y,1+(i%4),1+(i%2),i%2?'#c29d6728':'#2c251c27');}
    for(let i=0;i<47;i++){const x=i*27+4;line(c,[point(x,193),point(x-5,181-i%9),point(x+1,186)],'#4e683d',2);}
    for(let i=0;i<9;i++){const x=i*143+22;line(c,[point(x,203),point(x+13,232),point(x+8,265),point(x+30,300)],'#4d402e',2);line(c,[point(x+12,238),point(x-9,250)],'#4d402e',1.5);}
    const paths=[[point(600,179),point(600,690)]];
    for(const r of s.rooms){const p=SLOTS[r.slot];if(r.progress===100)paths.push([point(600,p.y),p]);else{line(c,[point(600,p.y),p],'#c6a87866',17,[5,10]);paths.push([point(600,p.y),point(600+(p.x-600)*r.progress/100,p.y)]);}}
    for(const path of paths){line(c,path,'#4c3d2c',31);line(c,path,'#c6a878',23);line(c,path,'#ddbd8844',13);}
    for(const r of s.rooms){
      const p=SLOTS[r.slot],built=r.progress===100;
      if(r.type==='tunnel'){line(c,[point(200,p.y),point(1040,p.y)],built?'#c6a878':'#ba9e7377',built?24:12,built?[]:[8,10]);}
      ellipse(c,p.x,p.y,87,57,'#493c2d');ellipse(c,p.x,p.y,82,52,built?'#d4b782':'#90704b');
      ellipse(c,p.x,p.y+15,74,32,built?'#c2a16c':'#806242');
      if(selected?.kind==='room'&&selected.id===r.id&&!isBackground){c.strokeStyle='#f8dc82';c.lineWidth=3;c.beginPath();c.ellipse(p.x,p.y,90,60,0,0,Math.PI*2);c.stroke();}
      if(!built){label(c,Math.floor(r.progress)+' %',p.x,p.y+5,'#fff3d5',18);label(c,r.paused?'Pozastavené':'Kopeme…',p.x,p.y+24,'#f2d9a9',11);}
      else if(r.type==='store'){for(let i=0;i<Math.min(22,Math.ceil(s.food/4));i++)ellipse(c,p.x-40+(i%7)*12,p.y+18-Math.floor(i/7)*9,5,4,['#b57538','#e1b34f','#8b7141'][i%3]);}
      else if(r.type==='nursery'){for(let i=0;i<8;i++)ellipse(c,p.x-24+(i%4)*15,p.y+7-Math.floor(i/4)*10,5,8,'#f5e9c4');}
      else if(r.type==='queen')antShape(c,{x:p.x,y:p.y,id:0,angle:-.3},s.time,true);
      else if(r.type==='rest'){for(let i=0;i<5;i++)ellipse(c,p.x-40+i*20,p.y+13,12,5,'#829256');}
      else if(r.type==='water'){ellipse(c,p.x,p.y+10,50,16,'#679ba3');ellipse(c,p.x-10,p.y+6,26,5,'#b2d0c0');}
      label(c,(ROOMS[r.type]?.name||'Kráľovná').toUpperCase(),p.x,p.y+77,'#e8d9b8',10);
      if(r.level>1)label(c,'✦'.repeat(r.level),p.x,p.y-35,'#fff0a2',12);
      if(s.tasks.pizza){ellipse(c,p.x-70,p.y-12,4,7,'#ffda7d');ellipse(c,p.x+70,p.y-12,4,7,'#ffda7d');}
    }
    ellipse(c,600,181,38,12,'#7e6742');ellipse(c,600,181,20,8,'#302e23');
    ellipse(c,s.rock,166,26,14,'#768071');ellipse(c,s.rock-5,160,18,9,'#a4ac91');
    ellipse(c,770,176,49,10,'#8eb5b0');line(c,[point(743,174),point(776,174)],'#c9dacc',2);
    if(s.bridge){ellipse(c,770,163,56,9,'#6a8443');line(c,[point(720,163),point(820,163)],'#c1c982',2);}
    if(s.event?.type==='branch')line(c,[point(900,165),point(960,181)],'#665036',9);
    if(s.event?.type==='rain')for(let i=0;i<30;i++){const x=(i*43)%1200,y=(s.time*120+i*29)%180;line(c,[point(x,y),point(x-4,y+12)],'#e0efe088',1.5);}
    if(s.tasks.delivered){line(c,[point(115,178),point(115,157)],'#ecd3a0',5);ellipse(c,115,155,17,8,'#b75f37');ellipse(c,110,152,3,2,'#fae6b7');ellipse(c,121,153,3,2,'#fae6b7');}
    if(s.tasks.built)for(let i=0;i<6;i++){const x=1010+i*15;line(c,[point(x,190),point(x,175)],'#506e3e',2);ellipse(c,x,173,4,4,i%2?'#e2ad69':'#e5d1a6');}
    if(s.upgrades.storage)for(let i=0;i<s.upgrades.storage;i++)label(c,'▣',SLOTS[0].x-50+i*15,SLOTS[0].y+30,'#80522c',17);
    if(s.upgrades.speed)line(c,[point(90,189),point(1120,189)],'#b9bb86',s.upgrades.speed+1,[3,9]);
    if(!isBackground&&s.settings.paths){for(const f of s.foods)if(f.trail>.03)line(c,[point(600,350),point(600,170),...game.surfaceRoute(point(600,170),f)],`rgba(243,213,107,${f.trail*.75})`,2+s.upgrades.traffic,[4,7]);}
    if(!isBackground&&s.guide)line(c,s.guide.points,`rgba(186,238,153,${s.guide.life/25})`,4,[4,6]);
    for(const f of s.foods){label(c,FOODS[f.type].icon,f.x,158,'#fff',25);if(!isBackground){label(c,String(f.amount),f.x,119,'#344b30',10);if(selected?.kind==='food'&&selected.id===f.id)ellipse(c,f.x,185,17,3,'#f6da78');}}
    for(const a of s.ants){if(selected?.kind==='ant'&&selected.id===a.id&&!isBackground){c.strokeStyle='#f8dd79';c.lineWidth=2;c.beginPath();c.arc(a.x,a.y,15,0,Math.PI*2);c.stroke();}antShape(c,a,a.route.length?s.time:0);}
    if(!isBackground&&tool?.startsWith('build:'))for(let i=4;i<SLOTS.length;i++)if(!s.rooms.some(r=>r.slot===i)){const p=SLOTS[i];c.strokeStyle=hover&&dist(hover,p)<80?'#fff0a4':'#dbd1a388';c.lineWidth=2;c.setLineDash([6,7]);c.beginPath();c.ellipse(p.x,p.y,80,50,0,0,Math.PI*2);c.stroke();c.setLineDash([]);label(c,'+ MIESTO '+(i-3),p.x,p.y+5,'#fff1c8',12);}
    if(!isBackground&&hover&&tool?.startsWith('food:')){const type=tool.split(':')[1],error=hover.y<100||hover.y>205?'Polož na povrch':game.foodError(type,hover.x);c.globalAlpha=.75;ellipse(c,hover.x,hover.y+6,22,7,error?'#a84936':'#547a36');label(c,FOODS[type].icon,hover.x,hover.y,'#fff',30);label(c,error?'Sem nie — vyber voľné miesto':'✓ Položiť porciu',hover.x,hover.y+28,error?'#ffd9ba':'#f3f8d4',12);c.globalAlpha=1;}
    if(guidePoints.length)line(c,guidePoints,'#d2f3a4',4,[3,4]);
    c.restore();
  }
  function point(x,y){return {x,y};}
  function draw(){if(!active)return;if(dialog.open){const {w,h,dpr}=fit(canvas);ctx.setTransform(dpr,0,0,dpr,0,0);if(w&&h)drawScene(ctx,w,h,false);}else if(!game.s.settings.hidden){const {w,h,dpr}=fit(bg);bgctx.setTransform(dpr,0,0,dpr,0,0);if(w&&h)drawScene(bgctx,w,h,true);}}
  function shouldRun(){return active&&!document.hidden&&!game.s.settings.paused&&(dialog.open||(!game.s.settings.hidden&&!game.s.settings.static&&!reduced.matches));}
  function frame(now){raf=0;if(!active||document.hidden)return;const dt=last?Math.min((now-last)/1000,.08):0;last=now;if(shouldRun()){const total=dt*speed;game.tick(total);saveTime+=dt;uiTime+=dt;if(saveTime>5){persist();saveTime=0;}if(uiTime>.5){updateStats();uiTime=0;}const events=game.events.splice(0);if(events.length){const event=events.find(e=>!e.message.startsWith('Náklad'))||events.at(-1);if(dialog.open)message(event.message);if(events.some(e=>e.sound))playSound();}}draw();if(shouldRun())raf=requestAnimationFrame(frame);}
  function start(){if(raf)cancelAnimationFrame(raf);raf=0;last=0;if(shouldRun())raf=requestAnimationFrame(frame);else draw();}
  function sync(){const was=active;active=root.classList.contains('theme-anthill');bg.hidden=!active||game.s.settings.hidden;dock.hidden=!active||dialog.open;if(!active){if(dialog.open)close();if(raf)cancelAnimationFrame(raf);raf=0;if(was)persist();if(audio)audio.suspend().catch(()=>{});}else{updateStats();resize();start();}}
  new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();start();});
  window.addEventListener('pagehide',persist);reduced.addEventListener('change',sync);
  renderPanel();sync();
})();
