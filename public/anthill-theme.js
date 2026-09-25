(function () {
  'use strict';
  if (!window.Anthill) return;
  const { Game, FOODS, ROOMS, SLOTS } = window.Anthill;
  const KEY = 'fob_anthill_v1', root = document.documentElement;
  let saved; try { saved = localStorage.getItem(KEY); } catch (_) {}
  const game = new Game(saved);
  if (game.s.settings.static) { game.s.settings.paused = true; game.s.settings.static = false; }
  if (!saved) game.s.ants.forEach((a, i) => Object.assign(a, SLOTS[i % 4]));
  let active = false, raf = 0, last = 0, lastDraw = 0, saveTime = 0, uiTime = 0;
  let zoom = 1, pan = { x: 0, y: 0 }, transform = { x: 0, y: 0, scale: 1 }, drag = null;
  const selected = null, tool = null, hover = null, guidePoints = [], follow = null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const bg = document.createElement('canvas'); bg.id = 'ant-background'; bg.setAttribute('aria-hidden', 'true'); bg.hidden = true;
  const dock = document.createElement('details'); dock.id = 'ant-dock';
  dock.innerHTML = '<summary>🐜 Živé pozadie</summary><p>Kolónia sa stará sama o seba.</p><span id="ant-dock-stats"></span><div class="ant-dock-actions"><button type="button" data-action="open">Pozorovať zblízka</button><button type="button" data-action="pause">Pauza</button><button type="button" data-action="hide">Skryť</button></div>';
  const dialog = document.createElement('dialog'); dialog.id = 'ant-game'; dialog.className = 'ant-observer'; dialog.setAttribute('aria-labelledby', 'ant-title');
  dialog.innerHTML = '<div class="ant-top"><div><div class="ant-eyebrow">Kolónia žije vlastným životom</div><h2 id="ant-title">Život pod povrchom</h2></div><button type="button" data-action="close" autofocus>Späť na stránku ✕</button></div><div id="ant-metrics" class="ant-metrics"></div><div class="ant-world"><div class="ant-scene-label">STAČÍ SA POZERAŤ</div><canvas id="ant-canvas" tabindex="0" aria-label="Autonómne mravenisko" aria-describedby="ant-help"></canvas><div class="ant-camera"><button type="button" data-action="zoom-out" aria-label="Oddialiť">−</button><button type="button" data-action="zoom-in" aria-label="Priblížiť">+</button><button type="button" data-action="center">Vycentrovať</button><button type="button" data-action="pause">Pauza</button></div></div><div class="ant-bottom"><p id="ant-help">Mravce samy hľadajú jedlo, rozširujú hniezdo a starajú sa o potomstvo. Pohľad posunieš potiahnutím alebo šípkami.</p></div>';
  document.body.append(bg, dock, dialog);
  const $ = id => document.getElementById('ant-' + id), canvas = $('canvas'), ctx = canvas.getContext('2d'), bgctx = bg.getContext('2d');
  if (!ctx || !bgctx) { dock.remove(); dialog.remove(); bg.remove(); return; }
  let originFocus = null;
  function persist() { try { localStorage.setItem(KEY, game.serialize()); } catch (_) {} }
  function updateStats() {
    const s = game.s, building = s.rooms.find(r => r.progress < 100);
    $('dock-stats').textContent = s.ants.length + ' mravcov · ' + s.rooms.filter(r => r.progress === 100).length + ' komôr' + (building ? ' · stavia sa ' + ROOMS[building.type].name.toLowerCase() : ' · kolónia si žije');
    $('metrics').textContent = s.ants.length + ' mravcov  ·  ' + Math.floor(s.food) + ' zásob jedla  ·  ' + Math.floor(s.water) + ' zásob vody' + (building ? '  ·  nová komora ' + Math.floor(building.progress) + ' %' : '');
    for (const b of document.querySelectorAll('#ant-game [data-action=pause], #ant-dock [data-action=pause]')) { b.textContent = s.settings.paused ? 'Pokračovať' : 'Pauza'; b.setAttribute('aria-pressed', String(s.settings.paused)); }
    dock.querySelector('[data-action=hide]').textContent = s.settings.hidden ? 'Zobraziť' : 'Skryť';
  }
  function action(name) {
    if (name === 'open' && !dialog.open) { originFocus = document.activeElement; dialog.showModal(); dock.open = false; dock.hidden = true; resize(); start(); }
    if (name === 'close') dialog.close();
    if (name === 'pause') { game.s.settings.paused = !game.s.settings.paused; start(); }
    if (name === 'hide') { game.s.settings.hidden = !game.s.settings.hidden; sync(); }
    if (name === 'zoom-in') zoom = Math.min(3, zoom * 1.25);
    if (name === 'zoom-out') zoom = Math.max(.7, zoom / 1.25);
    if (name === 'center') { zoom = 1; pan = { x: 0, y: 0 }; }
    updateStats(); persist(); draw();
  }
  for (const container of [dock, dialog]) container.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (b) action(b.dataset.action); });
  dialog.addEventListener('close', () => { persist(); sync(); if (originFocus?.isConnected) originFocus.focus(); });
  canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; canvas.focus(); canvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, pan: { ...pan } }; });
  canvas.addEventListener('pointermove', e => { if (!drag) return; pan = { x: drag.pan.x + e.clientX - drag.x, y: drag.pan.y + e.clientY - drag.y }; draw(); });
  for (const event of ['pointerup', 'pointercancel']) canvas.addEventListener(event, () => { drag = null; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); action(e.deltaY < 0 ? 'zoom-in' : 'zoom-out'); }, { passive: false });
  canvas.addEventListener('keydown', e => {
    const move = { ArrowLeft: [35, 0], ArrowRight: [-35, 0], ArrowUp: [0, 35], ArrowDown: [0, -35] }[e.key];
    if (move) { e.preventDefault(); pan.x += move[0]; pan.y += move[1]; draw(); }
    if (['+', '=', '-'].includes(e.key)) { e.preventDefault(); action(e.key === '-' ? 'zoom-out' : 'zoom-in'); }
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
  function drawAmbient(c,w,h) {
    const s=game.s, gutter=Math.max(34,(w-Math.min(1100,w-32))/2), sy=Math.max(.7,h/800);
    const left=gutter*.5, right=w-left;
    const mapX=x=>x<560?left+(x-350)*gutter/650:x>640?right+(x-850)*gutter/650:left+(560-350)*gutter/650+(x-560)/80*(right+(640-850)*gutter/650-left-(560-350)*gutter/650);
    const map=p=>({x:mapX(p.x),y:p.y*sy});
    const soil=c.createLinearGradient(0,0,0,h);soil.addColorStop(0,'#bbc398');soil.addColorStop(.23,'#ae9974');soil.addColorStop(1,'#6f5c43');c.fillStyle=soil;c.fillRect(0,0,w,h);
    for(let i=0;i<100;i++)ellipse(c,(i*173)%w,200*sy+(i*97)%(Math.max(1,h-200*sy)),1+i%3,1,'#4c3c2520');
    line(c,[{x:0,y:196*sy},{x:w,y:196*sy}],'#7d8d56',8);
    for(let i=0;i<w/22;i++){const x=i*22;line(c,[{x,y:193*sy},{x:x-4,y:181*sy},{x:x+2,y:188*sy}],'#697b4b',1.5);}
    const tunnels=[[{x:600,y:179},{x:600,y:690}]];
    for(const r of s.rooms)tunnels.push([{x:600,y:SLOTS[r.slot].y},SLOTS[r.slot]]);
    for(const path of tunnels){line(c,path.map(map),'#6b573d',22);line(c,path.map(map),'#ccb68b',15);}
    const radius=Math.min(65,Math.max(22,gutter*.36));
    for(const r of s.rooms){const p=map(SLOTS[r.slot]);
      ellipse(c,p.x,p.y,radius+3,37,'#766044');ellipse(c,p.x,p.y,radius,33,r.progress===100?'#d5bd8c':'#a78d64');
      if(r.progress<100){for(let i=0;i<8;i++)ellipse(c,p.x-radius+8+i*radius/5,p.y+15,3,2,'#70573a');}
      else if(r.type==='store')for(let i=0;i<Math.min(14,Math.ceil(s.food/6));i++)ellipse(c,p.x-20+i%5*9,p.y+12-Math.floor(i/5)*7,3,3,['#b08645','#c99e52','#978250'][i%3]);
      else if(r.type==='nursery')for(let i=0;i<5;i++)ellipse(c,p.x-14+i*7,p.y+5,3,6,'#f2e5bc');
      else if(r.type==='water')ellipse(c,p.x,p.y+9,radius*.65,9,'#8fb6af');
      else if(r.type==='rest')for(let i=0;i<4;i++)ellipse(c,p.x-18+i*12,p.y+10,8,4,'#96a16d');
      else if(r.type==='queen'){c.save();c.translate(p.x,p.y);c.scale(.7,.7);antShape(c,{x:0,y:0,angle:0,id:0},s.time,true);c.restore();}
    }
    for(const f of s.foods){const p=map(f);label(c,FOODS[f.type].icon,p.x,p.y-9,'#fff',17);}
    for(const a of s.ants){const p=map(a);const dx=mapX(a.x+Math.cos(a.angle))-mapX(a.x),dy=Math.sin(a.angle)*sy;
      c.save();c.translate(p.x,p.y);c.scale(.68,.68);antShape(c,{...a,x:0,y:0,angle:Math.atan2(dy,dx)},a.route.length?s.time:0);c.restore();}
    if(s.event?.type==='rain')for(let i=0;i<22;i++){const x=i*w/22,y=(s.time*75+i*37)%(196*sy);line(c,[{x,y},{x:x-2,y:y+7}],'#dce6d177',1);}
  }
  function draw(){if(!active)return;if(dialog.open){const {w,h,dpr}=fit(canvas);ctx.setTransform(dpr,0,0,dpr,0,0);if(w&&h)drawScene(ctx,w,h,false);}else if(!game.s.settings.hidden){const {w,h,dpr}=fit(bg);bgctx.setTransform(dpr,0,0,dpr,0,0);if(w&&h)drawAmbient(bgctx,w,h);}}

  function shouldRun() { return active && !document.hidden && !game.s.settings.paused && (dialog.open || (!game.s.settings.hidden && !game.s.settings.static && !reduced.matches)); }
  function frame(now) {
    raf = 0; if (!active || document.hidden) return;
    const dt = last ? Math.min((now - last) / 1000, .1) : 0; last = now;
    if (shouldRun()) {
      game.tick(dt, true); saveTime += dt; uiTime += dt;
      if (saveTime >= 5) { persist(); saveTime = 0; }
      if (uiTime >= 1) { updateStats(); uiTime = 0; }
      game.events.length = 0;
    }
    if (now - lastDraw >= 1000 / 30) { draw(); lastDraw = now; }
    if (shouldRun()) raf = requestAnimationFrame(frame);
  }
  function start() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; if (shouldRun()) raf = requestAnimationFrame(frame); else draw(); }
  function sync() {
    const was = active; active = root.classList.contains('theme-anthill');
    bg.hidden = !active || game.s.settings.hidden; dock.hidden = !active || dialog.open;
    if (!active) { if (dialog.open) dialog.close(); if (raf) cancelAnimationFrame(raf); raf = 0; if (was) persist(); }
    else { updateStats(); resize(); start(); }
  }
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); start(); });
  window.addEventListener('pagehide', persist); reduced.addEventListener('change', sync);
  sync();
})();
