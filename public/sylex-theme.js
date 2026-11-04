(function(){
'use strict';
// Sylex Tower Defence: page integration, HUD and input. The simulation lives in
// sylex-engine.js; rendering in sylex-3d*.js (WebGL) or sylex-renderer.js (2D).
const {Game,slots,types,enemyTypes,targeting,wavePlan,portalCount,routeNames,upgradeCost,specCost,sellValue,TOTAL_WAVES,DRONES}=window.SylexTD;
const Score=window.SylexScore;
// One file for the company logo: replace it to update the HUD, 3D signs and 2D map.
const LOGO='/assets/sylex/logo.svg';
const SHORT={rapid:'Optické konektory',slow:'Kryo, −40 % rýchlosť',pulse:'Mínomet, plošný zásah',laser:'Vláknový laser',radar:'Dosah, odhalí maskovaných'};
const TYPE_KEYS=Object.keys(types);
const KIND_COLOR={walker:'#9fbf6a',runner:'#c96a4a',armored:'#d9e03a',swarm:'#8d8a80',cloaked:'#3a4250',crawler:'#5a5045',spore:'#e0b46a',leader:'#5a3c32',boss:'#7d878a',brute:'#7d878a'};
let game=new Game({automatic:true}),selected=0,type='rapid',paused=false,speed=1,last=0,raf=0,accumulator=0,steps=0,actions=[];
let runId=null,starting=false,submitting=false,submitted=false,finished=false,contest=null;
const root=document.documentElement;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ---- Page landing: launcher, contest badge and leaderboard ----
const world=document.createElement('div');world.id='sylex-world';world.hidden=true;
const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;canvas.setAttribute('aria-label','Areál Sylex');canvas.setAttribute('role','img');world.append(canvas);const ctx=canvas.getContext('2d');
const intro=document.createElement('div');intro.id='sylex-intro';
intro.innerHTML=`<div class="sx-intro-copy"><strong>SYLEX</strong><span>Tower Defence</span><p>Postav obranu. Zastav zombíkov. Ochráň Sylex.</p></div>
<div class="sx-intro-actions"><button id="sylex-launch" type="button"><img src="${LOGO}" alt="" width="40" height="25">Tower Defence</button><p class="sx-prize-badge" data-sylex-prize hidden></p>
<details id="sylex-board"><summary>Rebríček obrany</summary><div data-sylex-scores></div><button type="button" data-refresh>Obnoviť výsledky</button></details></div>`;
const dock=intro.querySelector('#sylex-launch'),board=intro.querySelector('#sylex-board');
document.querySelector('#main-content').before(intro);

// ---- Game dialog (layout from design B2) ----
const dialog=document.createElement('dialog');dialog.id='sylex-game';dialog.setAttribute('aria-labelledby','sylex-title');
dialog.innerHTML=`
<section class="sx-card sx-sylex" aria-label="Stav Sylexu">
 <div class="sx-sylex-head"><img src="${LOGO}" alt="sylex" class="sx-logo" width="64" height="40"><h2 id="sylex-title">Tower Defence</h2></div>
 <div class="sx-hp" role="meter" aria-label="Životy Sylexu" aria-valuemin="0"><i></i><b></b></div>
 <div class="sx-purse"><span class="sx-coins" title="Kredity"></span><span class="sx-score" title="Skóre"></span></div>
</section>
<div class="sx-ribbon" aria-label="Vlna">
 <div><small>Vlna</small><b class="sx-wave"></b></div>
 <div class="sx-clock" aria-hidden="true"><span></span></div>
 <div><small class="sx-left-label">Do vlny</small><b class="sx-left"></b></div>
</div>
<section class="sx-card sx-intel" aria-label="Nasledujúca vlna"><h3 class="sx-intel-title"></h3><div class="sx-chips"></div></section>
<p class="sx-status" role="status" aria-live="polite"></p>
<section class="sx-card sx-tower-panel" aria-label="Vybrané miesto" hidden></section>
<nav class="sx-dock" aria-label="Veže"></nav>
<div class="sx-abilities">
 <button type="button" data-action="drone" class="sx-drone"><span class="sx-drone-face"><img alt="" width="54" height="32"><b>DRONY</b></span><small></small></button>
 <button type="button" data-action="call" class="sx-call"></button>
</div>
<div class="sx-corner">
 <button type="button" data-action="pause" class="sx-square"></button>
 <button type="button" data-action="speed" class="sx-square">1×</button>
 <button type="button" data-action="menu" class="sx-square" aria-expanded="false" aria-controls="sx-menu">Menu</button>
</div>
<section id="sx-menu" class="sx-card sx-menu" hidden aria-label="Menu hry">
 <div class="sx-menu-head"><h3>Menu</h3><button type="button" data-action="menu" aria-label="Zavrieť menu">✕</button></div>
 <p class="sx-prize" data-sylex-prize hidden></p>
 <details open><summary>Spoločný rebríček</summary><div data-sylex-scores></div><button type="button" data-action="refresh">Obnoviť výsledky</button></details>
 <details><summary>Stavebné miesta</summary><div class="sx-slots"></div></details>
 <details><summary>Kamera</summary><p id="sx-render-state" role="status">Pripravujem 3D scénu…</p><div class="sx-camera"><button type="button" data-camera="out" disabled aria-label="Oddialiť kameru">−</button><button type="button" data-camera="in" disabled aria-label="Priblížiť kameru">+</button><button type="button" data-camera="detail" disabled>Detail</button><button type="button" data-camera="reset" disabled>Celý areál</button></div></details>
 <details><summary>Ako brániť Sylex</summary>
  <p>Sylex má 300 životov. Každý zombík, ktorý prenikne k bráne, uberie životy podľa svojho typu. Obrana má ${TOTAL_WAVES} vĺn; po poslednej vyhrávaš a dostaneš bonus. Zombíci vychádzajú zo štyroch portálov a vopred nevieš, z ktorého. S každou druhou vlnou sa otvorí ďalší. Každú vlnu uzatvára Vodca hordy, každú piatu Kolos.</p>
  <p>Klikni na podstavec v areáli a potom na vežu v spodnej lište (klávesy 1–5). Klik na postavenú vežu otvorí jej panel: vylepšenie až na úroveň 3, potom špecializácia, cielenie a predaj za 70 % investície.</p>
  <p>Obrnených chráni pancier; laser a Prierazná veža ho ignorujú. Maskovaných zasiahneš len v dosahu Radarovej veže. Plazivca kryo nespomalí a Výtrusník pri smrti vylieči zombíkov okolo seba.</p>
  <p>Drony vyšleš počas vlny za ${DRONES.cost} kreditov (kláves D): tri drony ${DRONES.time} sekúnd útočia a potom sa ${DRONES.cooldown} sekúnd nabíjajú. Privolanie vlny skôr prinesie 2 kredity a 1 bod za každú ušetrenú sekundu. Kredity majú strop 1 500.</p>
  <p>Body dostaneš za každého zastaveného zombíka a 100 bodov za ubránenú vlnu. Medzerník pozastaví hru, Escape ťa vráti k obedom. Rebríček uchováva najlepší výsledok každého hráča v tomto prehliadači; meno je verejná prezývka.</p>
  <p class="sx-credit">Textúry: <a href="https://polyhaven.com" target="_blank" rel="noopener noreferrer">Poly Haven</a> · CC0</p>
 </details>
 <p class="sx-save-status" role="status"></p>
 <div class="sx-menu-actions"><button type="button" data-action="finish">Ukončiť a zapísať skóre</button><button type="button" data-action="reset">Nová hra</button><button type="button" data-action="close">Späť k obedom</button></div>
</section>
<section class="sx-card sx-start" aria-labelledby="sx-start-title">
 <img src="${LOGO}" alt="sylex" width="120" height="75">
 <h2 id="sx-start-title">Tower Defence</h2>
 <p>Postav obranu, zastav ${TOTAL_WAVES} vĺn zombíkov a ochráň Sylex.</p>
 <p class="sx-prize" data-sylex-prize hidden></p>
 <label for="sx-player">Prezývka v rebríčku</label>
 <input id="sx-player" maxlength="30" autocomplete="nickname" placeholder="Tvoje meno">
 <button type="button" data-action="wave" class="sx-go">Začať obranu</button>
 <button type="button" data-action="close" class="sx-link">Späť k obedom</button>
</section>`;
document.body.append(world,dialog);
const $=s=>dialog.querySelector(s);
try{$('#sx-player').value=localStorage.getItem('sylex_name')||localStorage.getItem('fantozzi_user')||'';}catch{}
$('.sx-drone-face img').src=window.SylexRenderer.droneIcon?.()||'';
$('.sx-dock').innerHTML=TYPE_KEYS.map((key,i)=>`<button type="button" data-type="${key}" aria-pressed="${key===type}" aria-keyshortcuts="${i+1}"><kbd>${i+1}</kbd><img src="${window.SylexRenderer.icon(key)}" alt="" width="64" height="64"><b>${types[key].name}</b><small>${SHORT[key]}</small><span class="sx-cost">${types[key].cost}</span></button>`).join('');
$('.sx-slots').innerHTML=slots.map((_,i)=>`<button type="button" data-slot="${i}">${i+1}</button>`).join('');

// Rounded display face for the HUD; loaded only while the theme is active.
function fonts(){if(document.getElementById('sylex-fonts'))return;const l=document.createElement('link');l.id='sylex-fonts';l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800;900&display=swap';document.head.append(l);}

let scene3d=null,sceneLoading=false,lastActive=null,uiSignature='',boardLoading=false;
function paint(playing=dialog.open){if(scene3d)scene3d.render(game,selected,type,playing);else window.SylexRenderer.paint(ctx,game,selected,type,playing);}
function fallback3D(reason){if(scene3d){scene3d.canvas.remove();scene3d.dispose();scene3d=null;}canvas.hidden=false;$('#sx-render-state').textContent=reason==='slow'?'2D zobrazenie · 3D bolo na tomto zariadení pomalé':'Záložné 2D zobrazenie';dialog.querySelectorAll('[data-camera]').forEach(b=>b.disabled=true);paint();}
async function load3D(){if(sceneLoading||scene3d)return;sceneLoading=true;try{const module=await import('/sylex-3d.js');scene3d=await module.createSylex3D({onPick:i=>{if(dialog.open)choose(i);},onFailure:fallback3D,logo:LOGO});canvas.hidden=true;world.append(scene3d.canvas);$('#sx-render-state').textContent='3D · potiahni pre otočenie';dialog.querySelectorAll('[data-camera]').forEach(b=>b.disabled=false);paint();}catch(error){console.warn('Sylex 3D unavailable:',error);fallback3D();}}
let toastTimer=0;
function message(text){const el=$('.sx-status');el.textContent=text;el.classList.add('sx-show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('sx-show'),4200);}
async function request(url,body){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);try{const r=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:controller.signal});const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'Server je nedostupný.');return data;}catch(e){if(e.name==='AbortError')throw Error('Server neodpovedá. Skús znova.');throw e;}finally{clearTimeout(timeout);}}

// ---- Leaderboard and contest ----
const dateFmt=new Intl.DateTimeFormat('sk-SK',{day:'numeric',month:'numeric',year:'numeric',timeZone:'Europe/Bratislava'});
function prizeText(){if(!contest)return '';const end=new Date(contest.endsAt);
 if(contest.ended)return contest.winner?`Súťaž skončila ${dateFmt.format(end)}. Víťaz: ${contest.winner.name} (${contest.winner.score} bodov) získava: ${contest.prize}.`:`Súťaž skončila ${dateFmt.format(end)} bez výsledkov.`;
 const days=Math.max(0,Math.ceil((end-Date.now())/86400000));
 return `Výhra pre prvého v rebríčku: ${contest.prize}. Vyhodnotenie ${dateFmt.format(end)}${days?` (o ${days} ${days===1?'deň':days<5?'dni':'dní'})`:''}.`;}
function showPrize(){const text=prizeText();document.querySelectorAll('[data-sylex-prize]').forEach(el=>{el.hidden=!text;el.textContent=text;});}
function boardText(text){document.querySelectorAll('[data-sylex-scores]').forEach(el=>{el.replaceChildren();const p=document.createElement('p');p.textContent=text;el.append(p);});}
async function refreshBoard(){if(boardLoading)return;boardLoading=true;boardText('Načítavam výsledky…');try{const data=await request('/api/sylex');contest=data.contest||null;showPrize();document.querySelectorAll('[data-sylex-scores]').forEach(el=>{el.replaceChildren();if(!data.rows.length){const p=document.createElement('p');p.textContent='Zatiaľ bez výsledkov. Buď prvý obranca.';el.append(p);return;}const table=document.createElement('table');table.innerHTML=`<caption>${contest?.ended?'Konečné poradie súťaže':'Najlepší výsledok každého hráča'}</caption><thead><tr><th scope="col">#</th><th scope="col">Hráč</th><th scope="col">Body</th><th scope="col">Vlny</th></tr></thead>`;const tbody=document.createElement('tbody');for(const row of data.rows){const tr=document.createElement('tr');if(row.isMe)tr.className='sx-me';if(row.rank===1)tr.classList.add('sx-first');for(const value of [row.rank,row.name+(row.isMe?' (ty)':''),row.score,row.waves]){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}tbody.append(tr);}table.append(tbody);el.append(table);});}catch(e){boardText(e.message);}finally{boardLoading=false;}}

// ---- Actions ----
function record(a){if(!runId||paused||finished||starting||submitting||actions.length>=Score.MAX_ACTIONS){message(paused?'Hra je pozastavená.':'Táto obrana je uzavretá. Zapíš skóre a začni novú hru.');return false;}const ok=game.apply(a);if(ok)actions.push({t:steps,...a});return ok;}
function pickType(key){type=key;const t=game.tower(selected);
 if(runId&&!t&&!finished){if(game.credits<types[key].cost){message(`${types[key].name}: chýba ${types[key].cost-game.credits} kreditov.`);}else message(record({action:'build',slot:selected,type:key})?`${types[key].name} postavená na mieste ${selected+1}.`:'Stavba nie je dostupná.');}
 else if(!runId)message(`Vybraná ${types[key].name}. Najprv začni obranu.`);
 else if(t)message(`Miesto ${selected+1} je obsadené. Vyber voľný podstavec.`);
 sync();}
let panelKey='';
// Rebuilt only when what it shows changes, so a click is never lost to a re-render mid-press.
function panel(){const el=$('.sx-tower-panel'),t=game.tower(selected),blocked=finished||starting||submitting||paused||!runId||game.health<=0;
 const key=t?[t.slot,t.type,t.level,t.spec,t.target,blocked,game.credits>=specCost(t),game.credits>=(upgradeCost(t)??1e9),sellValue(t),Math.round(game.stats(t).range),game.stats(t).damage].join('|'):'empty|'+selected+'|'+runId;
 if(key===panelKey)return;panelKey=key;
 const focus=el.contains(document.activeElement)?['target','spec','action'].map(k=>document.activeElement.dataset[k]&&`[data-${k}="${document.activeElement.dataset[k]}"]`).find(Boolean):null;
 if(!t){el.hidden=!runId;el.classList.add('sx-empty');el.innerHTML=`<p><b>Miesto ${selected+1}</b> je voľné. Vyber vežu v spodnej lište.</p>`;return;}
 el.classList.remove('sx-empty');el.hidden=false;
 const s=types[t.type],st=game.stats(t),cost=upgradeCost(t);
 const stat=s.support?`Dosah ${Math.round(st.range)}`:t.type==='laser'?`Dosah ${Math.round(st.range)} · lúč ${Math.round(s.dps*st.damage)}–${Math.round(s.maxDps*(t.spec==='focus'?1.5:1)*st.damage)}/s`:`Dosah ${Math.round(st.range)} · zásah ${Math.round(s.damage*st.damage)}`;
 const html=[`<div class="sx-panel-head"><h3>${s.name}</h3><span class="sx-stars" role="img" aria-label="Úroveň ${t.level} z 3">${[1,2,3].map(i=>`<span${i>t.level?' class="sx-off"':''}>★</span>`).join('')}</span></div>${t.spec?`<p class="sx-spec-tag">${s.specs[t.spec].name}</p>`:''}<p class="sx-stat">${stat}</p>`];
 if(cost)html.push(`<button type="button" data-action="upgrade" class="sx-up"${blocked||game.credits<cost?' disabled':''}>Vylepšiť <span class="sx-cost">${cost}</span></button>`);
 if(t.level>=3&&!t.spec)html.push(`<div class="sx-specs">${Object.entries(s.specs).map(([k,v])=>`<button type="button" data-spec="${k}"${blocked||game.credits<specCost(t)?' disabled':''}><b>${v.name} <span class="sx-cost">${specCost(t)}</span></b><small>${v.desc}</small></button>`).join('')}</div>`);
 if(!s.support)html.push(`<div class="sx-target" role="group" aria-label="Cielenie">${Object.entries(targeting).map(([k,n])=>`<button type="button" data-target="${k}" aria-pressed="${t.target===k}"${blocked?' disabled':''}>${n}</button>`).join('')}</div>`);
 html.push(`<button type="button" data-action="sell" class="sx-sell"${blocked?' disabled':''}>Predať · +${sellValue(t)}</button>`);
 el.innerHTML=html.join('');if(focus)(el.querySelector(focus+':not(:disabled)')||el.querySelector('button:not(:disabled)'))?.focus();}
// Keep the tower panel next to the selected pad on wide screens.
function placePanel(){const el=$('.sx-tower-panel');if(el.hidden||innerWidth<=850){el.style.left=el.style.top='';return;}
 let p;if(scene3d?.projectSlot)p=scene3d.projectSlot(selected);else p={x:slots[selected][0]/960,y:slots[selected][1]/540};
 const r=world.getBoundingClientRect(),w=el.offsetWidth,h=el.offsetHeight;let x=r.left+p.x*r.width+50,y=r.top+p.y*r.height-h/2;
 if(x+w>innerWidth-16)x=r.left+p.x*r.width-w-50;x=Math.max(16,Math.min(innerWidth-w-16,x));y=Math.max(150,Math.min(innerHeight-h-190,y));
 el.style.left=Math.round(x)+'px';el.style.top=Math.round(y)+'px';}
async function startWave(){if(starting||finished||runId)return;paused=false;const name=$('#sx-player').value.trim();if(!name){message('Zadaj prezývku pre spoločný rebríček.');$('#sx-player').focus();return;}starting=true;sync();message('Pripravujem bodovanú obranu…');try{const data=await request('/api/sylex/runs',{name});runId=data.id;game=new Game({automatic:true,seed:data.seed>>>0});try{localStorage.setItem('sylex_name',name);}catch{}}catch(e){message(e.message);return;}finally{starting=false;sync();}message('Máš 30 sekúnd na prípravu. Klikni na podstavec a vyber vežu.');sync();$('.sx-dock button')?.focus();}
async function finishRun(){if(!runId||submitting||submitted||!game.wave)return;paused=true;finished=true;submitting=true;$('.sx-save-status').textContent='Overujem a ukladám výsledok…';sync();try{const data=await request('/api/sylex/runs/'+runId+'/finish',{actions,steps});submitted=true;const text=`Zapísané: ${data.result.score} bodov · ${data.result.waves} ubránených vĺn.`;$('.sx-save-status').textContent=text;message(text);await refreshBoard();}catch(e){$('.sx-save-status').textContent=e.message+' Výsledok môžeš odoslať znova.';}finally{submitting=false;sync();}}
function toggleMenu(force){const m=$('#sx-menu'),open=force??m.hidden,was=!m.hidden;m.hidden=!open;dialog.querySelectorAll('[data-action="menu"]').forEach(b=>b.setAttribute('aria-expanded',String(open)));if(open){refreshBoard();m.querySelector('button')?.focus();}else if(was&&dialog.open)$('.sx-corner [data-action="menu"]').focus();}
function reset(){game=new Game({automatic:true});steps=0;actions=[];accumulator=0;runId=null;submitted=finished=false;paused=false;speed=1;$('.sx-save-status').textContent='';toggleMenu(false);message('Nová zmena, nový rozpočet.');sync();$('#sx-player').focus();}

// ---- HUD sync: one signature check per frame, DOM writes only on change ----
const plural=(n,one,few,many)=>n===1?one:n>1&&n<5?few:many;
function sync(){
 const signature=[Math.ceil(game.droneCooldown),game.drones.length,game.pending+game.enemies.length,game.health,game.credits,game.wave,game.kills,game.points,game.state,Math.ceil(game.countdown),selected,type,paused,speed,starting,submitting,submitted,finished,runId,...game.towers.map(t=>t.slot+':'+t.type+':'+t.level+':'+t.spec+':'+t.target)].join('|');
 if(signature===uiSignature)return;uiSignature=signature;
 const blocked=finished||starting||submitting,hp=Math.max(0,game.health/game.maxHealth),left=game.pending+game.enemies.length;
 dialog.classList.toggle('sx-pre',!runId);
 const meter=$('.sx-hp');meter.setAttribute('aria-valuemax',game.maxHealth);meter.setAttribute('aria-valuenow',game.health);meter.style.setProperty('--hp',(hp*100).toFixed(1)+'%');meter.dataset.level=hp>.5?'ok':hp>.25?'warn':'bad';meter.querySelector('b').textContent=`${game.health} / ${game.maxHealth}`;
 $('.sx-coins').textContent=game.credits;$('.sx-score').textContent=Score.result(game).score.toLocaleString('sk-SK');
 const shownWave=game.state==='ready'&&runId?Math.min(TOTAL_WAVES,game.wave+1):Math.max(1,game.wave);$('.sx-wave').textContent=`${shownWave}/${TOTAL_WAVES}`;
 const clock=$('.sx-clock');const waiting=game.state==='ready'&&runId;const total=game.wave?15:30;clock.style.setProperty('--p',waiting?(1-game.countdown/total).toFixed(3):'1');
 clock.querySelector('span').textContent=!runId?'–':game.state==='won'?'✓':finished||game.state==='over'?'✕':waiting?Math.ceil(game.countdown)+' s':'▶';
 $('.sx-left-label').textContent=game.state==='wave'?'Zostáva':'Zabitých';$('.sx-left').textContent=game.state==='wave'?left:game.kills;
 // Intel: composition of the coming or running wave; portals stay unknown until it starts.
 const n=game.state==='wave'?game.wave:Math.min(TOTAL_WAVES,game.wave+1),plan=wavePlan(n,game.seed),count={},gates=new Set();for(const g of plan){count[g.kind]=(count[g.kind]||0)+g.count;gates.add(routeNames[g.route]);}
 $('.sx-intel').hidden=game.state==='over'||game.state==='won';
 $('.sx-intel-title').innerHTML=game.state==='wave'?`Vlna ${n} · portály: ${[...gates].join(', ')}`:`Ďalej vlna ${n} <span class="sx-portal">portál ? · ${portalCount(n)} ${plural(portalCount(n),'otvorený','otvorené','otvorených')}</span>`;
 $('.sx-chips').innerHTML=Object.entries(count).map(([k,c])=>`<span class="sx-chip${k==='leader'||k==='boss'?' sx-boss':''}"><i style="background:${KIND_COLOR[k]||'#999'}"></i>${k==='leader'||k==='boss'?'':c+'× '}${enemyTypes[k].name}</span>`).join('');
 // Dock: affordability and selection.
 const occupied=!!game.tower(selected);
 dialog.querySelectorAll('[data-type]').forEach(b=>{const k=b.dataset.type;b.setAttribute('aria-pressed',String(k===type));b.classList.toggle('sx-poor',game.credits<types[k].cost);b.setAttribute('aria-label',`${types[k].name}, ${types[k].cost} kreditov${occupied?'':', postaviť na mieste '+(selected+1)}`);});
 panel();
 const drone=$('[data-action="drone"]'),canDrone=!!runId&&!blocked&&!paused&&game.state==='wave'&&game.droneCooldown<=0&&game.credits>=DRONES.cost;
 drone.disabled=!canDrone;drone.style.setProperty('--cd',game.droneCooldown>0?(1-game.droneCooldown/DRONES.cooldown).toFixed(3):'1');
 drone.querySelector('small').textContent=game.drones.length?'útočia':game.droneCooldown>0?Math.ceil(game.droneCooldown)+' s':`${DRONES.cost} · D`;
 drone.setAttribute('aria-label',game.drones.length?'Drony útočia':game.droneCooldown>0?`Drony sa nabíjajú, ${Math.ceil(game.droneCooldown)} sekúnd`:`Vyslať drony za ${DRONES.cost} kreditov, kláves D`+(game.state==='wave'?'':', iba počas vlny'));
 const call=$('[data-action="call"]'),canCall=!!runId&&!blocked&&!paused&&game.state==='ready'&&game.health>0;call.disabled=!canCall;call.textContent=canCall?`Privolať vlnu +${Math.floor(game.countdown)*2}`:'Privolať vlnu';
 const pause=$('[data-action="pause"]');pause.disabled=blocked||!runId||game.state==='over'||game.state==='won';pause.textContent=paused?'▶':'❚❚';pause.setAttribute('aria-label',paused?'Pokračovať':'Pozastaviť');
 const sp=$('[data-action="speed"]');sp.textContent=speed+'×';sp.setAttribute('aria-label',`Rýchlosť ${speed}×`);
 $('[data-action="wave"]').disabled=blocked||!!runId;$('[data-action="wave"]').textContent=starting?'Pripravujem…':'Začať obranu';
 $('[data-action="finish"]').disabled=!runId||!game.wave||submitting||submitted;$('[data-action="finish"]').textContent=submitted?'Skóre zapísané':finished?'Skúsiť uložiť znova':'Ukončiť a zapísať skóre';$('[data-action="reset"]').disabled=starting||submitting;$('#sx-player').disabled=!!runId||starting;
 dialog.querySelectorAll('[data-slot]').forEach(b=>{const i=Number(b.dataset.slot),t=game.tower(i);b.setAttribute('aria-pressed',String(i===selected));b.setAttribute('aria-label',`Miesto ${i+1}: ${t?types[t.type].name+', úroveň '+t.level:'voľné'}`);});
}

function frame(now){raf=0;if(!dialog.open||document.hidden)return;const dt=Math.min(.1,(now-last)/1000||0);last=now;const before=game.state;
 if(!paused&&!finished&&!starting&&runId){accumulator+=dt*speed;while(accumulator>=Score.STEP&&steps<Score.MAX_STEPS){game.tick(Score.STEP);steps++;accumulator-=Score.STEP;if(game.state==='over')break;}if(steps>=Score.MAX_STEPS){message('Obrana dosiahla časový limit. Zapisujem skóre.');finishRun();}}
 if(before!==game.state){message(game.state==='won'?`Sylex ubránený! Zvládol si všetkých ${TOTAL_WAVES} vĺn.`:game.state==='over'?'Sylex padol. Zapisujem výsledok.':game.state==='wave'?(wavePlan(game.wave,game.seed).some(g=>g.kind==='boss')?`Vlna ${game.wave}: pozor, prichádza Kolos!`:`Vlna ${game.wave}: zombíci prichádzajú!`):'Sylex drží! Ďalšia vlna za 15 sekúnd.');if(game.state==='over'||game.state==='won')finishRun();}
 sync();paint(true);placePanel();raf=requestAnimationFrame(frame);}
function startLoop(){if(!raf){last=performance.now();raf=requestAnimationFrame(frame);}}
const inertStates=new Map();
function open(){fonts();dialog.show();dialog.setAttribute('aria-modal','true');root.classList.add('sylex-playing');for(const el of document.body.children){if([dialog,world].includes(el))continue;inertStates.set(el,el.inert);el.inert=true;}uiSignature='';sync();refreshBoard();if(runId)message(paused?'Hra je pozastavená. Stlač ▶.':'Vyber podstavec a vežu.');startLoop();(runId?$('[data-action="pause"]'):$('#sx-player')).focus();}
function close(){paused=true;toggleMenu(false);dialog.close();root.classList.remove('sylex-playing');for(const [el,value]of inertStates)el.inert=value;inertStates.clear();cancelAnimationFrame(raf);raf=0;paint(false);if(!dock.hidden)dock.focus();}
function choose(i){selected=i;sync();const t=game.tower(i);if(t)message(`${types[t.type].name}, úroveň ${t.level}${t.spec?', '+types[t.type].specs[t.spec].name:''}.`);else if(runId)message(`Miesto ${i+1}: vyber vežu v spodnej lište.`);}
canvas.addEventListener('click',e=>{if(!dialog.open)return;const b=canvas.getBoundingClientRect(),x=(e.clientX-b.left)*960/b.width,y=(e.clientY-b.top)*540/b.height;const i=slots.findIndex(p=>Math.abs(p[0]-x)<28&&Math.abs(p[1]-y)<25);if(i>=0)choose(i);});
dialog.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.camera){scene3d?.cameraAction(b.dataset.camera);return;}
 if(b.dataset.type){pickType(b.dataset.type);return;}
 if(b.dataset.target)message(record({action:'target',slot:selected,mode:b.dataset.target})?`Cielenie: ${targeting[b.dataset.target]}.`:'Cielenie nie je dostupné.');
 if(b.dataset.spec){const t=game.tower(selected);message(record({action:'specialize',slot:selected,spec:b.dataset.spec})?`Špecializácia: ${types[t.type].specs[b.dataset.spec].name}.`:'Špecializácia nie je dostupná.');}
 if(b.dataset.slot!==undefined)choose(Number(b.dataset.slot));
 switch(b.dataset.action){
  case 'close':close();break;
  case 'menu':toggleMenu();break;
  case 'upgrade':message(record({action:'upgrade',slot:selected})?'Veža vylepšená.':'Vylepšenie nie je dostupné.');break;
  case 'sell':{const sold=game.tower(selected),value=sold&&sellValue(sold);message(record({action:'sell',slot:selected})?`Veža predaná za ${value} kreditov.`:'Predaj nie je dostupný.');break;}
  case 'drone':message(record({action:'drone'})?'Drony vzlietli z dátového centra.':'Drony teraz nemožno vyslať.');break;
  case 'call':message(record({action:'call'})?`Vlna ${game.wave} privolaná skôr.`:'Vlnu teraz nemožno privolať.');break;
  case 'wave':startWave();break;
  case 'pause':paused=!paused;accumulator=0;message(paused?'Obrana pozastavená.':'Obrana pokračuje.');break;
  case 'speed':speed=speed===1?2:1;break;
  case 'finish':if(!finished&&game.state!=='over'&&!confirm('Ukončiť túto obranu a zapísať aktuálne skóre?'))break;finishRun();break;
  case 'refresh':refreshBoard();break;
  case 'reset':if(runId&&!submitted&&!confirm('Začať novú hru bez uloženia aktuálneho skóre?'))break;reset();break;}
 sync();});
dialog.addEventListener('cancel',e=>{e.preventDefault();if(!$('#sx-menu').hidden){toggleMenu(false);return;}close();});
document.addEventListener('keydown',e=>{
 if(!dialog.open)return;
 if(e.key==='Escape'){e.preventDefault();if(!$('#sx-menu').hidden)toggleMenu(false);else close();return;}
 const typing=e.target.matches('input,textarea');
 if(!typing&&/^[1-5]$/.test(e.key)&&TYPE_KEYS[Number(e.key)-1]){pickType(TYPE_KEYS[Number(e.key)-1]);e.preventDefault();}
 if(!typing&&(e.key==='d'||e.key==='D')){const b=$('[data-action="drone"]');if(!b.disabled)b.click();e.preventDefault();}
 if(!typing&&e.key===' '&&!e.target.closest('button,summary,a')){const b=$('[data-action="pause"]');if(!b.disabled)b.click();e.preventDefault();}
 if(e.key==='Enter'&&e.target.id==='sx-player'){startWave();e.preventDefault();}
 if(e.key==='Tab'&&dialog.contains(e.target)){const focusable=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),summary,a[href]')].filter(el=>el.getClientRects().length);const first=focusable[0],lastEl=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){lastEl.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===lastEl){first.focus();e.preventDefault();}}});
dock.addEventListener('click',open);board.querySelector('[data-refresh]').addEventListener('click',refreshBoard);board.addEventListener('toggle',()=>{if(board.open)refreshBoard();});
function theme(){const active=root.classList.contains('theme-sylex');if(active===lastActive)return;lastActive=active;world.hidden=intro.hidden=!active;if(!active&&dialog.open)close();if(active){fonts();paint(false);load3D();refreshBoard();}}
new MutationObserver(theme).observe(root,{attributes:true,attributeFilter:['class']});
addEventListener('resize',()=>{if(lastActive){paint();placePanel();}});document.addEventListener('visibilitychange',()=>{if(document.hidden){paused=true;accumulator=0;cancelAnimationFrame(raf);raf=0;}else if(dialog.open){message('Obrana pozastavená. Stlač ▶.');startLoop();}});theme();
})();
